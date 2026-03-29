// Package handler provides HTTP handlers for the LiveKit call server.
//
// [F2 TRUST MODEL] Encryption is SERVER-MEDIATED, not true end-to-end.
// The server generates a random 32-byte key per session (crypto/rand) and distributes
// it to all participants over HTTPS. SFrame (IETF RFC 9605) encrypts media frames
// client-side, so the LiveKit SFU never sees plaintext media. However, this server
// generates and briefly holds the key material.
//
// Threat model:
//   - PROTECTED: passive network observers, LiveKit Cloud, CDN/proxy MITM
//   - NOT PROTECTED: compromised Mizanly server (has key), DB breach (key is wiped after call)
//   - MITIGATED: DB breach of ended calls (e2eeKey + e2eeSalt set to NULL on call end)
//
// For true E2EE, clients would need ECDH key agreement (like Signal's X3DH for calls).
package handler

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"

	lkauth "github.com/livekit/protocol/auth"
	"github.com/livekit/protocol/livekit"
	"github.com/livekit/protocol/webhook"
	lksdk "github.com/livekit/server-sdk-go/v2"

	"github.com/mizanly/livekit-server/internal/config"
	"github.com/mizanly/livekit-server/internal/middleware"
	"github.com/mizanly/livekit-server/internal/model"
	"github.com/mizanly/livekit-server/internal/store"
)

const (
	maxBodySize = 64 * 1024
	tokenTTL    = 2 * time.Hour
	sdkTimeout  = 10 * time.Second
	webhookDedupTTL = 5 * time.Minute // [C5] dedup window for webhook events
)

type Handler struct {
	db            store.Querier
	rdb           *redis.Client
	rl            *middleware.RateLimiter
	cfg           *config.Config
	logger        *slog.Logger
	roomClient    *lksdk.RoomServiceClient
	egressClient  *lksdk.EgressClient
	ingressClient *lksdk.IngressClient
	authProvider  *lkauth.SimpleKeyProvider
}

func New(db store.Querier, rdb *redis.Client, rl *middleware.RateLimiter, cfg *config.Config, logger *slog.Logger) *Handler {
	return &Handler{
		db: db, rdb: rdb, rl: rl, cfg: cfg, logger: logger,
		roomClient:    lksdk.NewRoomServiceClient(cfg.LiveKitHost, cfg.LiveKitAPIKey, cfg.LiveKitAPISecret),
		egressClient:  lksdk.NewEgressClient(cfg.LiveKitHost, cfg.LiveKitAPIKey, cfg.LiveKitAPISecret),
		ingressClient: lksdk.NewIngressClient(cfg.LiveKitHost, cfg.LiveKitAPIKey, cfg.LiveKitAPISecret),
		authProvider:  lkauth.NewSimpleKeyProvider(cfg.LiveKitAPIKey, cfg.LiveKitAPISecret),
	}
}

func (h *Handler) HandleHealth(w http.ResponseWriter, r *http.Request) {
	if err := h.db.Health(r.Context()); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "unhealthy"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "healthy"})
}

// HandleCreateRoom creates a LiveKit room + DB session.
func (h *Handler) HandleCreateRoom(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	reqID := middleware.RequestIDFromContext(r.Context()) // [H6]
	if err := h.rl.CheckCreateRoom(r.Context(), userID); err != nil {
		writeError(w, http.StatusTooManyRequests, "rate limit exceeded")
		return
	}

	var req model.CreateRoomRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.CallType != "VOICE" && req.CallType != "VIDEO" && req.CallType != "BROADCAST" {
		writeError(w, http.StatusBadRequest, "callType must be VOICE, VIDEO, or BROADCAST")
		return
	}

	var allParticipants []string
	switch {
	case req.CallType == "BROADCAST":
		allParticipants = []string{userID}
	case len(req.ParticipantIDs) > 0:
		allParticipants = filterAndDedup(append([]string{userID}, req.ParticipantIDs...))
		if len(allParticipants) > 31 {
			writeError(w, http.StatusBadRequest, "max 30 participants for group calls")
			return
		}
	case req.TargetUserID != "":
		if req.TargetUserID == userID {
			writeError(w, http.StatusBadRequest, "cannot call yourself")
			return
		}
		allParticipants = []string{userID, req.TargetUserID}
	default:
		writeError(w, http.StatusBadRequest, "targetUserId or participantIds required")
		return
	}

	for _, pid := range allParticipants {
		exists, err := h.db.UserExists(r.Context(), pid)
		if err != nil {
			h.logger.Error("user exists check failed", "error", err, "requestId", reqID)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		if !exists {
			writeError(w, http.StatusBadRequest, "one or more users not found")
			return
		}
	}

	blocked, err := h.db.CheckBlockedAny(r.Context(), allParticipants)
	if err != nil {
		h.logger.Error("block check failed", "error", err, "requestId", reqID)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if blocked {
		writeError(w, http.StatusForbidden, "cannot call one or more users")
		return
	}

	// Room name: the store generates the crypto-random suffix internally now [H2]
	roomNameBase := fmt.Sprintf("%s_%d", userID[:min(8, len(userID))], time.Now().UnixMilli())
	maxParticipants := uint32(len(allParticipants))
	if req.CallType == "BROADCAST" {
		maxParticipants = 10000
	} else if len(allParticipants) > 2 {
		maxParticipants = 100
	}

	// CreateCallSession generates the final room name with crypto suffix
	session, err := h.db.CreateCallSession(r.Context(), req.CallType, roomNameBase, userID, allParticipants, int(maxParticipants))
	if err != nil {
		// [H3 fix] Check error type for proper status code
		var errInCall *store.ErrUserInCall
		if errors.As(err, &errInCall) {
			writeError(w, http.StatusConflict, "one or more participants are already in a call")
			return
		}
		h.logger.Error("create call session failed", "error", err, "requestId", reqID)
		writeError(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	// Create LiveKit room using the DB-generated room name
	actualRoomName := ""
	if session.LivekitRoomName != nil {
		actualRoomName = *session.LivekitRoomName
	}

	// [F31 fix] Nil-guard the LiveKit SDK call so the handler can be tested without
	// a running LiveKit server. In tests, roomClient is nil — we skip the SDK call
	// and return a synthetic room response.
	var room *livekit.Room
	if h.roomClient != nil {
		sdkCtx, sdkCancel := context.WithTimeout(r.Context(), sdkTimeout)
		defer sdkCancel()
		var err2 error
		room, err2 = h.roomClient.CreateRoom(sdkCtx, &livekit.CreateRoomRequest{
			Name:            actualRoomName,
			EmptyTimeout:    5 * 60,
			MaxParticipants: maxParticipants,
		})
		if err2 != nil {
			h.logger.Error("create livekit room failed", "error", err2, "requestId", reqID)
			h.db.UpdateSessionStatus(r.Context(), session.ID, "ENDED")
			h.db.MarkAllParticipantsLeft(r.Context(), session.ID)
			h.db.WipeE2EEKey(r.Context(), session.ID)
			writeError(w, http.StatusInternalServerError, "failed to create room")
			return
		}
	} else {
		// Test mode — no LiveKit SDK available
		room = &livekit.Room{Name: actualRoomName, Sid: "test-sid"}
	}

	token, err := h.createToken(actualRoomName, userID, true)
	if err != nil {
		h.logger.Error("create token failed", "error", err, "requestId", reqID)
		writeError(w, http.StatusInternalServerError, "failed to create token")
		return
	}

	// [F1 fix] Return both key and per-session salt
	e2eeMaterial, _ := h.db.GetSessionE2EEMaterial(r.Context(), actualRoomName)
	var e2eeKey, e2eeSalt string
	if e2eeMaterial != nil {
		if len(e2eeMaterial.Key) > 0 {
			e2eeKey = base64.StdEncoding.EncodeToString(e2eeMaterial.Key)
		}
		if len(e2eeMaterial.Salt) > 0 {
			e2eeSalt = base64.StdEncoding.EncodeToString(e2eeMaterial.Salt)
		}
	}

	calleeIDs := make([]string, 0, len(allParticipants)-1)
	for _, pid := range allParticipants {
		if pid != userID {
			calleeIDs = append(calleeIDs, pid)
		}
	}

	// [H5] Log call creation metric
	h.logger.Info("call_created",
		"requestId", reqID, "callType", req.CallType,
		"roomName", actualRoomName, "participantCount", len(allParticipants),
		"callerUserId", userID)

	// Server-side push: notify callees via NestJS push service (non-blocking)
	if len(calleeIDs) > 0 && h.cfg.NestJSBaseURL != "" {
		go h.sendCallPush(calleeIDs, actualRoomName, session.ID, req.CallType, userID)
	}

	w.Header().Set("Cache-Control", "no-store") // [M4]
	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"data": session, "token": token, "room": room,
		"calleeIds": calleeIDs, "e2eeKey": e2eeKey, "e2eeSalt": e2eeSalt, "success": true,
	})
}

// HandleCreateToken generates a LiveKit token for joining a room.
func (h *Handler) HandleCreateToken(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	if err := h.rl.CheckTokenRequest(r.Context(), userID); err != nil {
		writeError(w, http.StatusTooManyRequests, "rate limit exceeded")
		return
	}

	var req model.TokenRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.RoomName == "" {
		writeError(w, http.StatusBadRequest, "roomName required")
		return
	}

	session, err := h.db.GetSessionWithParticipantsByRoomName(r.Context(), req.RoomName)
	if err != nil || session == nil {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}

	// [C3 fix] Only allow token generation for active sessions
	if session.Status != "RINGING" && session.Status != "ACTIVE" {
		writeError(w, http.StatusGone, "call has ended")
		return
	}

	isBroadcast := session.CallType == "BROADCAST"
	canPublish := true

	if isBroadcast {
		canPublish = isCaller(session, userID)
	} else {
		if !isCallerOrParticipant(session, userID) {
			writeError(w, http.StatusForbidden, "not a participant in this call")
			return
		}
	}

	token, err := h.createToken(req.RoomName, userID, canPublish)
	if err != nil {
		h.logger.Error("create token failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create token")
		return
	}

	// [C2 fix] Material only returned for RINGING/ACTIVE sessions (enforced by store query)
	// [F1 fix] Return both key and per-session salt
	e2eeMaterial, _ := h.db.GetSessionE2EEMaterial(r.Context(), req.RoomName)
	var e2eeKey, e2eeSalt string
	if e2eeMaterial != nil {
		if len(e2eeMaterial.Key) > 0 {
			e2eeKey = base64.StdEncoding.EncodeToString(e2eeMaterial.Key)
		}
		if len(e2eeMaterial.Salt) > 0 {
			e2eeSalt = base64.StdEncoding.EncodeToString(e2eeMaterial.Salt)
		}
	}

	w.Header().Set("Cache-Control", "no-store") // [M4]
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"token": token, "e2eeKey": e2eeKey, "e2eeSalt": e2eeSalt, "success": true,
	})
}

// HandleDeleteRoom — [F8 fix] only the CALLER can end the room for everyone.
// Non-callers should use HandleLeaveRoom to leave without destroying the call.
func (h *Handler) HandleDeleteRoom(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	roomID := r.PathValue("id")

	session, err := h.db.GetSessionWithParticipantsByRoomName(r.Context(), roomID)
	if err != nil || session == nil {
		writeError(w, http.StatusNotFound, "room not found")
		return
	}
	// [F8 fix] First: must be a participant at all
	if !isCallerOrParticipant(session, userID) {
		writeError(w, http.StatusForbidden, "not a participant")
		return
	}
	// [F8 fix] Non-callers in group calls (3+ active participants) must use /leave.
	// In 1:1 calls (2 participants), either party can end.
	if !isCaller(session, userID) && len(session.Participants) > 2 {
		writeError(w, http.StatusForbidden, "only the call creator can end a group call — use /leave to leave")
		return
	}
	if session.Status != "RINGING" && session.Status != "ACTIVE" {
		writeError(w, http.StatusGone, "call already ended")
		return
	}

	sdkCtx, cancel := context.WithTimeout(r.Context(), sdkTimeout)
	defer cancel()
	if h.roomClient != nil {
		h.roomClient.DeleteRoom(sdkCtx, &livekit.DeleteRoomRequest{Room: roomID})
	}
	h.db.UpdateSessionStatus(r.Context(), session.ID, "ENDED")
	h.db.MarkAllParticipantsLeft(r.Context(), session.ID)
	h.db.WipeE2EEKey(r.Context(), session.ID)

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

// HandleLeaveRoom — [F7 fix] participant leaves without destroying the room.
// For 1:1 calls this also ends the call (only 1 participant remains).
// For group calls, the call continues for remaining participants.
func (h *Handler) HandleLeaveRoom(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	roomID := r.PathValue("id")

	session, err := h.db.GetSessionWithParticipantsByRoomName(r.Context(), roomID)
	if err != nil || session == nil {
		writeError(w, http.StatusNotFound, "room not found")
		return
	}
	if !isCallerOrParticipant(session, userID) {
		writeError(w, http.StatusForbidden, "not a participant")
		return
	}
	if session.Status != "RINGING" && session.Status != "ACTIVE" {
		writeError(w, http.StatusGone, "call already ended")
		return
	}

	// Mark this participant as left
	h.db.MarkParticipantLeft(r.Context(), session.ID, userID)

	// Remove from LiveKit room (best-effort — they may have already disconnected)
	sdkCtx, cancel := context.WithTimeout(r.Context(), sdkTimeout)
	defer cancel()
	if h.roomClient != nil {
		h.roomClient.RemoveParticipant(sdkCtx, &livekit.RoomParticipantIdentity{
			Room: roomID, Identity: userID,
		})
	}

	// Determine how many participants are still in the call.
	// session.Participants was fetched BEFORE MarkParticipantLeft, so we subtract 1
	// to account for the user who just left. This avoids a second DB query and the
	// TOCTOU race between MarkParticipantLeft and GetActiveParticipantCount.
	remainingCallees := 0
	totalRemaining := 0
	for _, p := range session.Participants {
		if p.UserID == userID {
			continue // the user who just left
		}
		totalRemaining++
		if p.Role != "caller" {
			remainingCallees++
		}
	}

	if session.Status == "RINGING" && !isCaller(session, userID) {
		// Callee declined during ringing.
		// Only end the session if ALL callees have now left (no remaining callees).
		// If other callees remain, the call keeps ringing for them.
		if remainingCallees == 0 {
			h.db.UpdateSessionStatus(r.Context(), session.ID, "DECLINED")
			h.db.MarkAllParticipantsLeft(r.Context(), session.ID)
			h.db.WipeE2EEKey(r.Context(), session.ID)
			if h.roomClient != nil {
				h.roomClient.DeleteRoom(sdkCtx, &livekit.DeleteRoomRequest{Room: roomID})
			}
		}
	} else if session.Status == "ACTIVE" {
		// Active call — end if only 0 or 1 participant remains
		if totalRemaining <= 1 {
			h.db.UpdateSessionStatus(r.Context(), session.ID, "ENDED")
			h.db.MarkAllParticipantsLeft(r.Context(), session.ID)
			h.db.WipeE2EEKey(r.Context(), session.ID)
			if h.roomClient != nil {
				h.roomClient.DeleteRoom(sdkCtx, &livekit.DeleteRoomRequest{Room: roomID})
			}
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *Handler) HandleListParticipants(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	roomID := r.PathValue("id")

	session, err := h.db.GetSessionWithParticipantsByRoomName(r.Context(), roomID)
	if err != nil || session == nil {
		writeError(w, http.StatusNotFound, "room not found")
		return
	}
	if !isCallerOrParticipant(session, userID) {
		writeError(w, http.StatusForbidden, "not a participant")
		return
	}

	if h.roomClient == nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{"data": []interface{}{}, "success": true})
		return
	}
	sdkCtx, cancel := context.WithTimeout(r.Context(), sdkTimeout)
	defer cancel()
	res, err := h.roomClient.ListParticipants(sdkCtx, &livekit.ListParticipantsRequest{Room: roomID})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list participants")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"data": res.Participants, "success": true})
}

func (h *Handler) HandleKickParticipant(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	roomID := r.PathValue("roomId")
	participantID := r.PathValue("participantId")

	session, err := h.db.GetSessionWithParticipantsByRoomName(r.Context(), roomID)
	if err != nil || session == nil {
		writeError(w, http.StatusNotFound, "room not found")
		return
	}
	if !isCaller(session, userID) {
		writeError(w, http.StatusForbidden, "only the call creator can kick")
		return
	}
	if session.Status != "ACTIVE" { // [C3]
		writeError(w, http.StatusGone, "call is not active")
		return
	}
	// [F11 fix] Verify the kick target is actually a participant in this call.
	// Without this, a caller could attempt to kick arbitrary LiveKit identities.
	if !isCallerOrParticipant(session, participantID) {
		writeError(w, http.StatusBadRequest, "target is not a participant in this call")
		return
	}
	// Cannot kick yourself — use /leave instead
	if participantID == userID {
		writeError(w, http.StatusBadRequest, "cannot kick yourself — use leave endpoint")
		return
	}

	if h.roomClient != nil {
		sdkCtx, cancel := context.WithTimeout(r.Context(), sdkTimeout)
		defer cancel()
		_, err = h.roomClient.RemoveParticipant(sdkCtx, &livekit.RoomParticipantIdentity{
			Room: roomID, Identity: participantID,
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to kick participant")
			return
		}
	}
	// Mark the kicked participant as left in DB
	h.db.MarkParticipantLeft(r.Context(), session.ID, participantID)
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *Handler) HandleMuteParticipant(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	roomID := r.PathValue("id")

	session, err := h.db.GetSessionWithParticipantsByRoomName(r.Context(), roomID)
	if err != nil || session == nil {
		writeError(w, http.StatusNotFound, "room not found")
		return
	}
	if !isCaller(session, userID) {
		writeError(w, http.StatusForbidden, "only the call creator can mute")
		return
	}
	if session.Status != "ACTIVE" { // [C3]
		writeError(w, http.StatusGone, "call is not active")
		return
	}

	var req struct {
		Identity string `json:"identity"`
		TrackSid string `json:"trackSid"`
		Muted    bool   `json:"muted"`
	}
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if h.roomClient == nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
		return
	}
	sdkCtx, cancel := context.WithTimeout(r.Context(), sdkTimeout)
	defer cancel()
	_, err = h.roomClient.MutePublishedTrack(sdkCtx, &livekit.MuteRoomTrackRequest{
		Room: roomID, Identity: req.Identity, TrackSid: req.TrackSid, Muted: req.Muted,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to mute")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *Handler) HandleGetHistory(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	cursor := r.URL.Query().Get("cursor")
	var cursorPtr *string
	if cursor != "" {
		cursorPtr = &cursor
	}
	result, err := h.db.GetHistory(r.Context(), userID, cursorPtr, 20)
	if err != nil {
		h.logger.Error("get history failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"data": result.Data, "meta": result.Meta, "success": true})
}

func (h *Handler) HandleGetActiveCall(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	session, err := h.db.GetActiveCall(r.Context(), userID)
	if err != nil {
		h.logger.Error("get active call failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"data": session, "success": true})
}

// HandleGetSession — [F16 fix] returns a specific session by ID.
// Used by the callee-side poll to check the status of a specific call,
// not just "any active call for this user" (which could return a different session).
func (h *Handler) HandleGetSession(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	sessionID := r.PathValue("id")

	session, err := h.db.GetSessionByID(r.Context(), sessionID)
	if err != nil {
		h.logger.Error("get session failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if session == nil {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}
	// Verify the requesting user is a participant (authorization)
	if !isCallerOrParticipant(session, userID) {
		writeError(w, http.StatusForbidden, "not a participant")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"data": session, "success": true})
}

// HandleStartEgress — participants only, ACTIVE calls only. [C3, C4 fix]
func (h *Handler) HandleStartEgress(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	var req model.EgressRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.RoomName == "" {
		writeError(w, http.StatusBadRequest, "roomName required")
		return
	}

	session, err := h.db.GetSessionWithParticipantsByRoomName(r.Context(), req.RoomName)
	if err != nil || session == nil {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}
	// [F9 fix] Only the caller can start recording — prevents covert recording by other participants.
	if !isCaller(session, userID) {
		writeError(w, http.StatusForbidden, "only the call creator can start recording")
		return
	}
	if session.Status != "ACTIVE" { // [C3]
		writeError(w, http.StatusBadRequest, "can only record active calls")
		return
	}

	if h.egressClient == nil {
		writeError(w, http.StatusServiceUnavailable, "recording not available")
		return
	}
	filepath := fmt.Sprintf("recordings/%s/{time}.mp4", req.RoomName)
	sdkCtx, cancel := context.WithTimeout(r.Context(), sdkTimeout)
	defer cancel()
	info, err := h.egressClient.StartRoomCompositeEgress(sdkCtx, &livekit.RoomCompositeEgressRequest{
		RoomName: req.RoomName,
		Layout:   "speaker-light",
		Output: &livekit.RoomCompositeEgressRequest_File{
			File: &livekit.EncodedFileOutput{
				FileType: livekit.EncodedFileType_MP4,
				Filepath: filepath,
				Output: &livekit.EncodedFileOutput_S3{
					S3: &livekit.S3Upload{
						AccessKey: h.cfg.R2AccessKey, Secret: h.cfg.R2SecretKey,
						Bucket: h.cfg.R2Bucket, Region: "auto",
						Endpoint: h.cfg.R2Endpoint, ForcePathStyle: true,
					},
				},
			},
		},
	})
	if err != nil {
		h.logger.Error("start egress failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to start recording")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"egressId": info.EgressId, "success": true})
}

func (h *Handler) HandleStopEgress(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	var req struct {
		EgressID string `json:"egressId"`
		RoomName string `json:"roomName"`
	}
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.EgressID == "" || req.RoomName == "" {
		writeError(w, http.StatusBadRequest, "egressId and roomName required")
		return
	}

	session, err := h.db.GetSessionWithParticipantsByRoomName(r.Context(), req.RoomName)
	if err != nil || session == nil {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}
	if !isCallerOrParticipant(session, userID) {
		writeError(w, http.StatusForbidden, "not a participant")
		return
	}

	if h.egressClient == nil {
		writeError(w, http.StatusServiceUnavailable, "recording not available")
		return
	}
	sdkCtx, cancel := context.WithTimeout(r.Context(), sdkTimeout)
	defer cancel()
	_, err = h.egressClient.StopEgress(sdkCtx, &livekit.StopEgressRequest{EgressId: req.EgressID})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to stop recording")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *Handler) HandleCreateIngress(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	var req model.IngressRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.RoomName == "" {
		writeError(w, http.StatusBadRequest, "roomName required")
		return
	}

	session, err := h.db.GetSessionWithParticipantsByRoomName(r.Context(), req.RoomName)
	if err != nil || session == nil {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}
	if !isCaller(session, userID) {
		writeError(w, http.StatusForbidden, "only the broadcaster can create ingress")
		return
	}

	if h.ingressClient == nil {
		writeError(w, http.StatusServiceUnavailable, "broadcast not available")
		return
	}
	inputType := livekit.IngressInput_RTMP_INPUT
	if req.InputType == "whip" {
		inputType = livekit.IngressInput_WHIP_INPUT
	}
	enableTranscoding := true

	sdkCtx, cancel := context.WithTimeout(r.Context(), sdkTimeout)
	defer cancel()
	info, err := h.ingressClient.CreateIngress(sdkCtx, &livekit.CreateIngressRequest{
		InputType: inputType, Name: fmt.Sprintf("broadcast-%s", req.RoomName),
		RoomName: req.RoomName, ParticipantIdentity: userID,
		ParticipantName: "Broadcaster", EnableTranscoding: &enableTranscoding,
	})
	if err != nil {
		h.logger.Error("create ingress failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create ingress")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"ingressId": info.IngressId, "url": info.Url, "streamKey": info.StreamKey, "success": true,
	})
}

func (h *Handler) HandleDeleteIngress(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	ingressID := r.PathValue("id")
	roomName := r.URL.Query().Get("roomName")
	if roomName == "" {
		writeError(w, http.StatusBadRequest, "roomName query parameter required")
		return
	}

	session, err := h.db.GetSessionWithParticipantsByRoomName(r.Context(), roomName)
	if err != nil || session == nil {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}
	if !isCaller(session, userID) {
		writeError(w, http.StatusForbidden, "only the broadcaster can delete ingress")
		return
	}

	if h.ingressClient == nil {
		writeError(w, http.StatusServiceUnavailable, "broadcast not available")
		return
	}
	sdkCtx, cancel := context.WithTimeout(r.Context(), sdkTimeout)
	defer cancel()
	_, err = h.ingressClient.DeleteIngress(sdkCtx, &livekit.DeleteIngressRequest{IngressId: ingressID})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete ingress")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

// HandleWebhook processes LiveKit webhook events with deduplication.
func (h *Handler) HandleWebhook(w http.ResponseWriter, r *http.Request) {
	event, err := webhook.ReceiveWebhookEvent(r, h.authProvider)
	if err != nil {
		h.logger.Error("invalid webhook", "error", err)
		http.Error(w, "invalid webhook", http.StatusUnauthorized)
		return
	}

	ctx := r.Context()
	eventName := event.GetEvent()
	eventID := event.GetId()
	roomName := ""
	if event.GetRoom() != nil {
		roomName = event.GetRoom().GetName()
	}

	// [C5 fix] Webhook deduplication via Redis SET NX
	if eventID != "" && h.rdb != nil {
		dedupKey := fmt.Sprintf("lk:webhook:%s", eventID)
		set, err := h.rdb.SetNX(ctx, dedupKey, "1", webhookDedupTTL).Result()
		if err == nil && !set {
			// Already processed this event
			h.logger.Info("webhook dedup skip", "eventId", eventID, "event", eventName)
			w.WriteHeader(http.StatusOK)
			return
		}
	}

	h.logger.Info("livekit webhook", "event", eventName, "room", roomName, "eventId", eventID)

	switch eventName {
	case "room_started":
		if event.GetRoom() != nil {
			h.db.UpdateSessionLivekitSid(ctx, event.GetRoom().GetName(), event.GetRoom().GetSid())
		}

	case "room_finished":
		if event.GetRoom() != nil {
			session, err := h.db.GetSessionWithParticipantsByRoomName(ctx, event.GetRoom().GetName())
			// [F16] Also skip DECLINED sessions
			if err == nil && session != nil && session.Status != "ENDED" && session.Status != "MISSED" && session.Status != "DECLINED" {
				eventTime := time.Unix(event.GetCreatedAt(), 0)
				callDuration := 0
				if session.StartedAt != nil {
					callDuration = int(eventTime.Sub(*session.StartedAt).Seconds())
					if callDuration < 0 {
						callDuration = 0
					}
					h.db.UpdateSessionDuration(ctx, session.ID, callDuration)
				} else {
					// Call was never answered — mark as MISSED and notify callees
					h.db.UpdateSessionStatus(ctx, session.ID, "MISSED")
					// Send missed call notification to non-caller participants
					if h.cfg.NestJSBaseURL != "" {
						var calleeIDs []string
						for _, p := range session.Participants {
							if p.Role != "caller" {
								calleeIDs = append(calleeIDs, p.UserID)
							}
						}
						if len(calleeIDs) > 0 {
							go h.sendMissedCallPush(calleeIDs, session.ID, session.CallType)
						}
					}
				}
				h.db.MarkAllParticipantsLeft(ctx, session.ID)
				h.db.WipeE2EEKey(ctx, session.ID) // [C1] destroy key when call ends

				h.logger.Info("call_finished", // [H5]
					"sessionId", session.ID, "roomName", event.GetRoom().GetName(),
					"callType", session.CallType, "duration", callDuration)
			}
		}

	case "participant_joined":
		if event.GetRoom() != nil && event.GetParticipant() != nil {
			rn := event.GetRoom().GetName()
			pid := event.GetParticipant().GetIdentity()
			h.db.MarkParticipantLivekitJoined(ctx, rn, pid)

			session, err := h.db.GetSessionByRoomName(ctx, rn)
			if err == nil && session != nil && session.Status == "RINGING" {
				count, err := h.db.GetActiveParticipantCount(ctx, rn)
				if err == nil && count >= 2 {
					h.db.UpdateSessionStatus(ctx, session.ID, "ACTIVE")
					h.logger.Info("call_active", "sessionId", session.ID, "roomName", rn) // [H5]
				}
			}
		}

	case "participant_left":
		if event.GetRoom() != nil && event.GetParticipant() != nil {
			session, err := h.db.GetSessionByRoomName(ctx, event.GetRoom().GetName())
			if err == nil && session != nil {
				h.db.MarkParticipantLeft(ctx, session.ID, event.GetParticipant().GetIdentity())
			}
		}

	case "egress_ended":
		if event.GetEgressInfo() != nil && event.GetEgressInfo().GetRoomName() != "" {
			for _, result := range event.GetEgressInfo().GetFileResults() {
				if result.GetFilename() != "" {
					h.db.UpdateSessionRecordingURL(ctx, event.GetEgressInfo().GetRoomName(), result.GetFilename())
					break
				}
			}
		}
	}

	w.WriteHeader(http.StatusOK)
}

func (h *Handler) createToken(roomName, identity string, canPublish bool) (string, error) {
	at := lkauth.NewAccessToken(h.cfg.LiveKitAPIKey, h.cfg.LiveKitAPISecret)
	canSub := true
	grant := &lkauth.VideoGrant{
		RoomJoin: true, Room: roomName, CanPublish: &canPublish, CanSubscribe: &canSub,
	}
	at.SetVideoGrant(grant).SetIdentity(identity).SetValidFor(tokenTTL)
	return at.ToJWT()
}

// sendCallPush sends push notifications to callees via the NestJS API (server-to-server).
// Runs in a goroutine — errors are logged, not returned to the caller.
func (h *Handler) sendCallPush(calleeIDs []string, roomName, sessionID, callType, callerUserID string) {
	// [F6] Look up caller display name from DB
	callerName := callerUserID
	if name, err := h.db.GetUserDisplayName(context.Background(), callerUserID); err == nil && name != "" {
		callerName = name
	}

	// [F17 fix] Push payload minimized — no user IDs in push data.
	// callerHandle (Clerk user ID) was PII leaked through APNs/FCM/Expo push infrastructure.
	// The callee only needs roomName + sessionId + callType to join. callerName is display-only.
	// Per standing E2E rules: "Push notifications: generic body for ALL messages."
	pushBody := map[string]interface{}{
		"userIds": calleeIDs,
		"title":   "Incoming Call",
		"body":    "You have an incoming call",
		"data": map[string]string{
			"type":       "incoming_call",
			"roomName":   roomName,
			"sessionId":  sessionID,
			"callType":   callType,
			"callerName": callerName,
		},
	}
	bodyBytes, err := json.Marshal(pushBody)
	if err != nil {
		h.logger.Error("marshal push body failed", "error", err)
		return
	}

	if err := h.postInternalPush(bodyBytes); err != nil {
		h.logger.Error("push notification failed", "error", err, "calleeCount", len(calleeIDs), "roomName", roomName)
	} else {
		h.logger.Info("push_sent", "calleeCount", len(calleeIDs), "roomName", roomName)
	}
}

// sendMissedCallPush notifies callees about a missed call.
func (h *Handler) sendMissedCallPush(calleeIDs []string, sessionID, callType string) {
	pushBody := map[string]interface{}{
		"userIds": calleeIDs,
		"title":   "Missed Call",
		"body":    "You missed a call",
		"data": map[string]string{
			"type":      "missed_call",
			"sessionId": sessionID,
			"callType":  callType,
		},
	}
	bodyBytes, err := json.Marshal(pushBody)
	if err != nil {
		return
	}

	if err := h.postInternalPush(bodyBytes); err != nil {
		h.logger.Error("missed call push failed", "error", err, "calleeCount", len(calleeIDs))
	} else {
		h.logger.Info("missed_call_push_sent", "calleeCount", len(calleeIDs), "sessionId", sessionID)
	}
}

// [F18 fix] postInternalPush sends a push request to NestJS with one retry.
// First attempt: 5s timeout. If it fails, wait 500ms and retry with a fresh 5s timeout.
// Two attempts total — covers transient network blips and NestJS cold starts.
func (h *Handler) postInternalPush(bodyBytes []byte) error {
	url := h.cfg.NestJSBaseURL + "/internal/push-to-users"

	for attempt := 0; attempt < 2; attempt++ {
		if attempt > 0 {
			time.Sleep(500 * time.Millisecond)
		}

		pushCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		req, err := http.NewRequestWithContext(pushCtx, "POST", url, bytes.NewReader(bodyBytes))
		if err != nil {
			cancel()
			return fmt.Errorf("create request: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Internal-Key", h.cfg.InternalServiceKey)

		resp, err := http.DefaultClient.Do(req)
		cancel()
		if err != nil {
			h.logger.Warn("push attempt failed", "attempt", attempt+1, "error", err)
			continue // retry
		}
		resp.Body.Close()

		if resp.StatusCode < 400 {
			return nil // success
		}

		h.logger.Warn("push attempt returned error", "attempt", attempt+1, "status", resp.StatusCode)
		// 4xx = client error, don't retry (e.g., 401 = wrong key, retrying won't help)
		if resp.StatusCode < 500 {
			return fmt.Errorf("push returned %d", resp.StatusCode)
		}
		// 5xx = server error, retry
	}

	return fmt.Errorf("push failed after 2 attempts")
}

// --- Authorization helpers ---

func isCaller(session *model.CallSession, userID string) bool {
	for _, p := range session.Participants {
		if p.UserID == userID && p.Role == "caller" {
			return true
		}
	}
	return false
}

func isCallerOrParticipant(session *model.CallSession, userID string) bool {
	for _, p := range session.Participants {
		if p.UserID == userID {
			return true
		}
	}
	return false
}

// --- Helpers ---

func decodeBody(r *http.Request, v interface{}) error {
	return json.NewDecoder(io.LimitReader(r.Body, maxBodySize)).Decode(v)
}

func filterAndDedup(ids []string) []string {
	seen := make(map[string]bool, len(ids))
	result := make([]string, 0, len(ids))
	for _, id := range ids {
		if id != "" && !seen[id] {
			seen[id] = true
			result = append(result, id)
		}
	}
	return result
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]interface{}{"error": message, "success": false})
}
