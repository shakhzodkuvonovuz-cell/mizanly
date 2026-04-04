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
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
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
	maxBodySize     = 64 * 1024
	sdkTimeout      = 10 * time.Second
	webhookDedupTTL = 5 * time.Minute // [C5] dedup window for webhook events
)

// [G05-#7 fix] Dedicated HTTP client for internal push — no redirects, 10s timeout
var pushClient = &http.Client{
	Timeout: 10 * time.Second,
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		return http.ErrUseLastResponse
	},
}

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
	// [#521 fix] shutdownCtx is cancelled on server shutdown — goroutines spawned by
	// handlers (sendCallPush, sendMissedCallPush) derive their contexts from this so
	// they respect graceful shutdown instead of using unbounded context.Background().
	shutdownCtx context.Context
}

func New(db store.Querier, rdb *redis.Client, rl *middleware.RateLimiter, cfg *config.Config, logger *slog.Logger) *Handler {
	return NewWithContext(context.Background(), db, rdb, rl, cfg, logger)
}

// NewWithContext creates a handler with an explicit shutdown context.
// When ctx is cancelled (server shutdown), in-flight goroutines will be cancelled.
func NewWithContext(ctx context.Context, db store.Querier, rdb *redis.Client, rl *middleware.RateLimiter, cfg *config.Config, logger *slog.Logger) *Handler {
	return &Handler{
		db: db, rdb: rdb, rl: rl, cfg: cfg, logger: logger,
		shutdownCtx:   ctx,
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
	// G04-#12: Defense-in-depth — reject empty userID even if auth middleware missed it.
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
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

	if !req.CallType.Valid() {
		writeError(w, http.StatusBadRequest, "callType must be VOICE, VIDEO, or BROADCAST")
		return
	}

	var allParticipants []string
	switch {
	case req.CallType == model.CallTypeBroadcast:
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

	// Room name: hash userID to avoid leaking raw user IDs [G04-#4]
	// [#521 fix] Use 16 bytes (128 bits) of SHA-256 instead of 4 bytes (32 bits).
	// 4 bytes is brute-forceable against a known user ID list — an attacker with 1M user IDs
	// could precompute all 4-byte prefixes and reverse the mapping. 16 bytes makes this infeasible.
	idHash := sha256.Sum256([]byte(userID))
	roomNameBase := fmt.Sprintf("%x_%d", idHash[:16], time.Now().UnixMilli())
	maxParticipants := uint32(len(allParticipants))
	if req.CallType == model.CallTypeBroadcast {
		maxParticipants = uint32(h.cfg.MaxBroadcastViewers)
	} else if len(allParticipants) > 2 {
		maxParticipants = uint32(h.cfg.MaxGroupParticipants)
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
	// G04-#15: Guard against empty room name (schema allows NULL).
	if actualRoomName == "" {
		h.logger.Error("session created with empty room name", "sessionID", session.ID)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
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
			EmptyTimeout:    h.cfg.RoomEmptyTimeout,
			MaxParticipants: maxParticipants,
		})
		if err2 != nil {
			h.logger.Error("create livekit room failed", "error", err2, "requestId", reqID)
			// [B12-#8 fix] Atomic cleanup on LiveKit SDK failure
			if err := h.db.EndCallSession(r.Context(), session.ID, "ENDED"); err != nil {
				h.logger.Error("failed to end call session", "sessionID", session.ID, "error", err)
			}
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

	// [G04-#1 fix] E2EE material is mandatory — call MUST NOT proceed without encryption keys
	e2eeMaterial, e2eeErr := h.db.GetSessionE2EEMaterial(r.Context(), actualRoomName)
	if e2eeErr != nil || e2eeMaterial == nil {
		h.logger.Error("failed to get E2EE material", "room", actualRoomName, "error", e2eeErr)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	var e2eeKey, e2eeSalt string
	if len(e2eeMaterial.Key) > 0 {
		e2eeKey = base64.StdEncoding.EncodeToString(e2eeMaterial.Key)
	}
	if len(e2eeMaterial.Salt) > 0 {
		e2eeSalt = base64.StdEncoding.EncodeToString(e2eeMaterial.Salt)
	}

	calleeIDs := make([]string, 0, len(allParticipants)-1)
	for _, pid := range allParticipants {
		if pid != userID {
			calleeIDs = append(calleeIDs, pid)
		}
	}

	// [H5] Log call creation metric
	// SECURITY: Never log e2eeKey, e2eeSalt, or token — only operational metadata.
	h.logger.Info("call_created",
		"requestId", reqID, "callType", req.CallType,
		"roomName", actualRoomName, "participantCount", len(allParticipants),
		"callerUserId", userID)

	// Server-side push: notify callees via NestJS push service (non-blocking)
	if len(calleeIDs) > 0 && h.cfg.NestJSBaseURL != "" {
		go h.sendCallPush(calleeIDs, actualRoomName, session.ID, req.CallType, userID)
	}

	// SECURITY [#521]: Response contains E2EE key material — Cache-Control: no-store prevents
	// intermediate proxies/CDNs from caching. Never add response-body logging middleware.
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

	isBroadcast := session.CallType == model.CallTypeBroadcast
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
	// [G04-#1 fix] E2EE material is mandatory — call MUST NOT proceed without encryption keys
	e2eeMaterial, e2eeErr := h.db.GetSessionE2EEMaterial(r.Context(), req.RoomName)
	if e2eeErr != nil || e2eeMaterial == nil {
		h.logger.Error("failed to get E2EE material", "room", req.RoomName, "error", e2eeErr)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	var e2eeKey, e2eeSalt string
	if len(e2eeMaterial.Key) > 0 {
		e2eeKey = base64.StdEncoding.EncodeToString(e2eeMaterial.Key)
	}
	if len(e2eeMaterial.Salt) > 0 {
		e2eeSalt = base64.StdEncoding.EncodeToString(e2eeMaterial.Salt)
	}

	// SECURITY [#521]: Response contains E2EE key material — no-store, no response-body logging.
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
	if roomID == "" || len(roomID) > 128 {
		writeError(w, http.StatusBadRequest, "invalid room ID")
		return
	}

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
	// In 1:1 calls (2 or fewer active participants), either party can end.
	// G04-#13: Note — if participants leave a group call reducing it to 2, a non-caller can then end it.
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
	// [B12-#8 fix] Atomic cleanup: status + participants + E2EE key in single CTE
	if err := h.db.EndCallSession(r.Context(), session.ID, "ENDED"); err != nil {
		h.logger.Error("failed to end call session", "sessionID", session.ID, "error", err)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

// HandleLeaveRoom — [F7 fix] participant leaves without destroying the room.
// For 1:1 calls this also ends the call (only 1 participant remains).
// For group calls, the call continues for remaining participants.
func (h *Handler) HandleLeaveRoom(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	roomID := r.PathValue("id")
	if roomID == "" || len(roomID) > 128 {
		writeError(w, http.StatusBadRequest, "invalid room ID")
		return
	}

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

	// [G04-#5 fix] Mark this participant as left — check error
	if err := h.db.MarkParticipantLeft(r.Context(), session.ID, userID); err != nil {
		h.logger.Error("failed to mark participant left", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

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
			// [B12-#8 fix] Atomic cleanup
			if err := h.db.EndCallSession(r.Context(), session.ID, "DECLINED"); err != nil {
				h.logger.Error("failed to end call session", "sessionID", session.ID, "error", err)
			}
			if h.roomClient != nil {
				h.roomClient.DeleteRoom(sdkCtx, &livekit.DeleteRoomRequest{Room: roomID})
			}
		}
	} else if session.Status == "ACTIVE" {
		// Active call — end if only 0 or 1 participant remains
		if totalRemaining <= 1 {
			// [B12-#8 fix] Atomic cleanup
			if err := h.db.EndCallSession(r.Context(), session.ID, "ENDED"); err != nil {
				h.logger.Error("failed to end call session", "sessionID", session.ID, "error", err)
			}
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
	if roomID == "" || len(roomID) > 128 {
		writeError(w, http.StatusBadRequest, "invalid room ID")
		return
	}

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
	// [G04-#6 fix] Mark the kicked participant as left in DB — check error
	if err := h.db.MarkParticipantLeft(r.Context(), session.ID, participantID); err != nil {
		h.logger.Error("failed to mark participant left", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *Handler) HandleMuteParticipant(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	roomID := r.PathValue("id")
	if roomID == "" || len(roomID) > 128 {
		writeError(w, http.StatusBadRequest, "invalid room ID")
		return
	}

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
	// [G04-#7 fix] Validate identity and trackSid
	if req.Identity == "" || len(req.Identity) > 256 {
		writeError(w, http.StatusBadRequest, "invalid identity")
		return
	}
	if req.TrackSid == "" || len(req.TrackSid) > 256 {
		writeError(w, http.StatusBadRequest, "invalid trackSid")
		return
	}
	// [N2 fix] Validate the mute target is a participant (consistent with F11 kick validation)
	if !isCallerOrParticipant(session, req.Identity) {
		writeError(w, http.StatusBadRequest, "target is not a participant in this call")
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
	// G05-#12: Limit cursor length — query params bypass maxBodySize; prevent memory DoS.
	if len(cursor) > 256 {
		writeError(w, http.StatusBadRequest, "invalid cursor")
		return
	}
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
	// [G05-#1 fix] Only the caller can stop recording — consistent with start recording
	if !isCaller(session, userID) {
		writeError(w, http.StatusForbidden, "only the call creator can stop recording")
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
	// [G05-#2 fix] Only allow ingress creation for active sessions
	if session.Status != "ACTIVE" {
		writeError(w, http.StatusBadRequest, "session is not active")
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

	// [G05-#3 fix] All webhook DB operations log errors instead of swallowing them
	switch eventName {
	case "room_started":
		if event.GetRoom() != nil {
			if err := h.db.UpdateSessionLivekitSid(ctx, event.GetRoom().GetName(), event.GetRoom().GetSid()); err != nil {
				h.logger.Error("webhook: failed to update livekit SID", "room", event.GetRoom().GetName(), "error", err)
			}
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
					// G05-#17: Log negative duration — indicates clock skew between LiveKit and DB.
					if callDuration < 0 {
						h.logger.Warn("negative call duration clamped to 0 — clock skew between LiveKit and DB",
							"sessionID", session.ID, "computedDuration", callDuration)
						callDuration = 0
					}
					if err := h.db.UpdateSessionDuration(ctx, session.ID, callDuration); err != nil {
						h.logger.Error("webhook: failed to update session duration", "sessionID", session.ID, "error", err)
					}
				} else {
					// Call was never answered — notify callees about missed call
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
				// [B12-#8 fix] Atomic cleanup: determine final status based on whether call was answered
				endStatus := "ENDED"
				if session.StartedAt == nil {
					endStatus = "MISSED"
				}
				if err := h.db.EndCallSession(ctx, session.ID, endStatus); err != nil {
					h.logger.Error("webhook: failed to end call session", "sessionID", session.ID, "error", err)
				}

				h.logger.Info("call_finished", // [H5]
					"sessionId", session.ID, "roomName", event.GetRoom().GetName(),
					"callType", session.CallType, "duration", callDuration)
			}
		}

	case "participant_joined":
		if event.GetRoom() != nil && event.GetParticipant() != nil {
			rn := event.GetRoom().GetName()
			pid := event.GetParticipant().GetIdentity()
			if err := h.db.MarkParticipantLivekitJoined(ctx, rn, pid); err != nil {
				h.logger.Error("webhook: failed to mark participant joined", "room", rn, "participant", pid, "error", err)
			}

			session, err := h.db.GetSessionByRoomName(ctx, rn)
			if err == nil && session != nil && session.Status == "RINGING" {
				count, err := h.db.GetActiveParticipantCount(ctx, rn)
				if err == nil && count >= 2 {
					if err := h.db.UpdateSessionStatus(ctx, session.ID, "ACTIVE"); err != nil {
						h.logger.Error("webhook: failed to update session to ACTIVE", "sessionID", session.ID, "error", err)
					}
					h.logger.Info("call_active", "sessionId", session.ID, "roomName", rn) // [H5]
				}
			}
		}

	case "participant_left":
		if event.GetRoom() != nil && event.GetParticipant() != nil {
			rn := event.GetRoom().GetName()
			pid := event.GetParticipant().GetIdentity()
			session, err := h.db.GetSessionByRoomName(ctx, rn)
			if err == nil && session != nil && session.Status != "ENDED" && session.Status != "MISSED" && session.Status != "DECLINED" {
				if err := h.db.MarkParticipantLeft(ctx, session.ID, pid); err != nil {
					h.logger.Error("webhook: failed to mark participant left", "sessionID", session.ID, "participant", pid, "error", err)
				}
				// [B12-#16 fix] Check if this was the last participant — if so, end the call
				remaining, countErr := h.db.GetActiveParticipantCount(ctx, rn)
				if countErr == nil && remaining == 0 {
					if err := h.db.EndCallSession(ctx, session.ID, "ENDED"); err != nil {
						h.logger.Error("webhook: failed to end call after last participant left", "sessionID", session.ID, "error", err)
					}
					h.logger.Info("call_ended_last_participant", "sessionId", session.ID, "roomName", rn)
				}
			}
		}

	case "egress_ended":
		if event.GetEgressInfo() != nil && event.GetEgressInfo().GetRoomName() != "" {
			for _, result := range event.GetEgressInfo().GetFileResults() {
				if result.GetFilename() != "" {
					if err := h.db.UpdateSessionRecordingURL(ctx, event.GetEgressInfo().GetRoomName(), result.GetFilename()); err != nil {
						h.logger.Error("webhook: failed to update recording URL", "room", event.GetEgressInfo().GetRoomName(), "error", err)
					}
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
	at.SetVideoGrant(grant).SetIdentity(identity).SetValidFor(h.cfg.TokenTTL)
	return at.ToJWT()
}

// sendCallPush sends push notifications to callees via the NestJS API (server-to-server).
// Runs in a goroutine — errors are logged, not returned to the caller.
func (h *Handler) sendCallPush(calleeIDs []string, roomName, sessionID string, callType model.CallType, callerUserID string) {
	// [G04-#3 fix] Recover from panics in goroutine
	defer func() {
		if r := recover(); r != nil {
			h.logger.Error("panic in sendCallPush", "panic", r)
		}
	}()

	// [#521 fix] Use shutdownCtx instead of context.Background() — goroutine respects server shutdown.
	// 10s timeout bounds the DB call; shutdownCtx cancellation aborts if server is terminating.
	dbCtx, dbCancel := context.WithTimeout(h.shutdownCtx, 10*time.Second)
	defer dbCancel()

	// [F6] Look up caller display name from DB
	callerName := callerUserID
	if name, err := h.db.GetUserDisplayName(dbCtx, callerUserID); err == nil && name != "" {
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
			"callType":   string(callType),
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
func (h *Handler) sendMissedCallPush(calleeIDs []string, sessionID string, callType model.CallType) {
	// [G04-#3 fix] Recover from panics in goroutine
	defer func() {
		if r := recover(); r != nil {
			h.logger.Error("panic in sendMissedCallPush", "panic", r)
		}
	}()

	pushBody := map[string]interface{}{
		"userIds": calleeIDs,
		"title":   "Missed Call",
		"body":    "You missed a call",
		"data": map[string]string{
			"type":      "missed_call",
			"sessionId": sessionID,
			"callType":  string(callType),
		},
	}
	bodyBytes, err := json.Marshal(pushBody)
	if err != nil {
		// [G05-#6 fix] Log marshal error instead of silently returning
		h.logger.Error("marshal missed call push body failed", "error", err)
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
	// G05-#18: Use strings.TrimRight to avoid double-slash if NestJSBaseURL has trailing slash
	base := strings.TrimRight(h.cfg.NestJSBaseURL, "/")
	url := base + "/internal/push-to-users"

	for attempt := 0; attempt < 2; attempt++ {
		if attempt > 0 {
			time.Sleep(500 * time.Millisecond)
		}

		pushCtx, cancel := context.WithTimeout(h.shutdownCtx, 5*time.Second)
		req, err := http.NewRequestWithContext(pushCtx, "POST", url, bytes.NewReader(bodyBytes))
		if err != nil {
			cancel()
			return fmt.Errorf("create request: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Internal-Key", h.cfg.InternalServiceKey)

		resp, err := pushClient.Do(req)
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

// G05-#13: Reject bodies with trailing JSON content — catches client bugs sooner.
func decodeBody(r *http.Request, v interface{}) error {
	dec := json.NewDecoder(io.LimitReader(r.Body, maxBodySize))
	if err := dec.Decode(v); err != nil {
		return err
	}
	// Reject trailing content after the first JSON value
	if dec.More() {
		return fmt.Errorf("unexpected trailing content after JSON body")
	}
	return nil
}

func filterAndDedup(ids []string) []string {
	seen := make(map[string]bool, len(ids))
	result := make([]string, 0, len(ids))
	for _, id := range ids {
		// [G04-#10 fix] Skip empty and overly long IDs
		if id != "" && len(id) <= 64 && !seen[id] {
			seen[id] = true
			result = append(result, id)
		}
	}
	return result
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	// [G05-#14 fix] Log encode errors instead of silently swallowing
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("writeJSON encode failed", "error", err, "status", status)
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]interface{}{"error": message, "success": false})
}
