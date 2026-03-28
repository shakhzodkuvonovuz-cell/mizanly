// Package handler implements HTTP handlers for the E2E key server.
//
// All handlers follow the same pattern:
// 1. Extract authenticated userId from context
// 2. Parse and validate request body
// 3. Call store methods
// 4. Return JSON response
package handler

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/mizanly/e2e-server/internal/middleware"
	"github.com/mizanly/e2e-server/internal/model"
	"github.com/mizanly/e2e-server/internal/store"
)

// Handler holds dependencies for all HTTP handlers.
type Handler struct {
	store       *store.Store
	rdb         *redis.Client
	rateLimiter *middleware.RateLimiter
	logger      *slog.Logger
}

// New creates a new Handler.
func New(s *store.Store, rdb *redis.Client, rl *middleware.RateLimiter, logger *slog.Logger) *Handler {
	return &Handler{store: s, rdb: rdb, rateLimiter: rl, logger: logger}
}

// --- Health ---

// HandleHealth returns 200 if the service is healthy.
func (h *Handler) HandleHealth(w http.ResponseWriter, r *http.Request) {
	// Minimal health response — don't reveal WHAT is unhealthy (DB vs Redis vs other)
	if err := h.store.Health(r.Context()); err != nil {
		writeError(w, http.StatusServiceUnavailable, "unhealthy")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// --- Identity Keys ---

// HandleRegisterIdentity handles PUT /keys/identity.
func (h *Handler) HandleRegisterIdentity(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req model.IdentityKeyRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if req.DeviceID < 1 || req.DeviceID > 10 {
		req.DeviceID = 1 // Default to 1 if out of range (max 10 devices per user)
	}

	// Rate limit identity key changes: max 2 per 24 hours per user.
	// This prevents a stolen session token from rapidly cycling keys.
	if h.rdb != nil {
		identityRLKey := fmt.Sprintf("e2e:rl:identity:%s", userID)
		count, rlErr := h.rdb.Incr(r.Context(), identityRLKey).Result()
		if rlErr != nil {
			// F12 FIX: Fail CLOSED on Redis error. Previously fail-open — Redis outage
			// allowed unlimited identity key changes (rapid key cycling for MITM).
			writeError(w, http.StatusTooManyRequests, "rate limiting unavailable — try again later")
			return
		}
		if count == 1 {
			h.rdb.Expire(r.Context(), identityRLKey, 24*time.Hour)
		}
		if count > 2 { // Allow 2 per day (initial registration + one rotation)
			writeError(w, http.StatusTooManyRequests, "identity key can only be changed twice per 24 hours")
			return
		}
	}

	changed, oldFP, err := h.store.UpsertIdentityKey(r.Context(), userID, req.DeviceID, req.PublicKey, req.RegistrationID)
	if err != nil {
		h.logger.Error("register identity key", "error", err) // Log real error server-side
		writeError(w, http.StatusBadRequest, "invalid identity key request") // Generic to client
		return
	}

	// If key changed, notify NestJS to create SYSTEM message
	if changed {
		go h.notifyIdentityChanged(userID, oldFP, req.PublicKey)
	}

	writeJSON(w, http.StatusOK, model.IdentityKeyResponse{
		Success:    true,
		Changed:    changed,
		Commitment: nil, // Future: key transparency Merkle proof
	})
}

// --- Signed Pre-Keys ---

// HandleUploadSignedPreKey handles PUT /keys/signed-prekey.
func (h *Handler) HandleUploadSignedPreKey(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req model.SignedPreKeyRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if req.DeviceID < 1 || req.DeviceID > 10 {
		req.DeviceID = 1 // Default to 1 if out of range (max 10 devices per user)
	}

	if err := h.store.UpsertSignedPreKey(r.Context(), userID, req.DeviceID, req.KeyID, req.PublicKey, req.Signature); err != nil {
		h.logger.Error("upload signed pre-key", "error", err, "userId", hashUserID(userID))
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// --- One-Time Pre-Keys ---

// HandleUploadOneTimePreKeys handles POST /keys/one-time-prekeys.
func (h *Handler) HandleUploadOneTimePreKeys(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req model.OneTimePreKeysRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if req.DeviceID < 1 || req.DeviceID > 10 {
		req.DeviceID = 1 // Default to 1 if out of range (max 10 devices per user)
	}

	keys := make([]struct {
		KeyID     int
		PublicKey string
	}, len(req.PreKeys))
	for i, k := range req.PreKeys {
		keys[i] = struct {
			KeyID     int
			PublicKey string
		}{KeyID: k.KeyID, PublicKey: k.PublicKey}
	}

	if err := h.store.InsertOneTimePreKeys(r.Context(), userID, req.DeviceID, keys); err != nil {
		h.logger.Error("upload one-time pre-keys", "error", err, "userId", hashUserID(userID), "count", len(keys))
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"success": true,
		"count":   len(keys),
	})
}

// --- Pre-Key Bundle ---

// HandleGetBundle handles GET /keys/bundle/{userId}.
func (h *Handler) HandleGetBundle(w http.ResponseWriter, r *http.Request) {
	targetUserID := extractPathParam(r, "/api/v1/e2e/keys/bundle/")
	if err := validatePathParam(targetUserID); err != nil {
		writeError(w, http.StatusBadRequest, "invalid userId")
		return
	}

	deviceID := 1 // Single-device for now

	bundle, err := h.store.GetPreKeyBundle(r.Context(), targetUserID, deviceID)
	if err != nil {
		h.logger.Error("get bundle", "error", err, "targetUserId", targetUserID)
		writeError(w, http.StatusNotFound, "pre-key bundle not found")
		return
	}

	writeJSON(w, http.StatusOK, bundle)
}

// HandleGetBundlesBatch handles POST /keys/bundles/batch.
func (h *Handler) HandleGetBundlesBatch(w http.ResponseWriter, r *http.Request) {
	requesterID := middleware.UserIDFromContext(r.Context())
	if requesterID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req model.BatchBundleRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if len(req.UserIDs) > 100 {
		writeError(w, http.StatusBadRequest, "max 100 users per batch")
		return
	}

	// V4-F16: Rate limit the batch endpoint itself (max 10 calls per hour per requester).
	// Uses atomic Lua script (INCR+EXPIRE in one call) — no crash-between-commands risk.
	if h.rateLimiter != nil {
		batchRLKey := fmt.Sprintf("e2e:rl:batch:%s", requesterID)
		if _, err := h.rateLimiter.CheckRateLimit(r.Context(), batchRLKey, 10, 3600); err != nil {
			writeError(w, http.StatusTooManyRequests, "max 10 batch bundle requests per hour")
			return
		}
	}

	// Deduplicate user IDs — prevent consuming multiple OTPs for the same user
	seen := make(map[string]bool, len(req.UserIDs))
	deduped := make([]string, 0, len(req.UserIDs))
	for _, uid := range req.UserIDs {
		if !seen[uid] {
			seen[uid] = true
			deduped = append(deduped, uid)
		}
	}
	req.UserIDs = deduped

	// Rate limit each target in the batch — prevents OTP pool draining attacks
	if h.rateLimiter != nil {
		for _, uid := range req.UserIDs {
			if err := h.rateLimiter.CheckBundleFetch(r.Context(), requesterID, uid); err != nil {
				writeError(w, http.StatusTooManyRequests, err.Error())
				return
			}
		}
	}

	bundles := make(map[string]model.BundleResponse, len(req.UserIDs))
	for _, uid := range req.UserIDs {
		bundle, err := h.store.GetPreKeyBundle(r.Context(), uid, 1)
		if err != nil {
			continue // Skip users without keys
		}
		bundles[uid] = *bundle
	}

	writeJSON(w, http.StatusOK, model.BatchBundleResponse{Bundles: bundles})
}

// --- Pre-Key Count ---

// HandleGetPreKeyCount handles GET /keys/count.
func (h *Handler) HandleGetPreKeyCount(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	count, err := h.store.CountOneTimePreKeys(r.Context(), userID, 1)
	if err != nil {
		h.logger.Error("count pre-keys", "error", err, "userId", hashUserID(userID))
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeJSON(w, http.StatusOK, model.PreKeyCountResponse{Count: count})
}

// --- Sender Keys ---

// HandleStoreSenderKey handles POST /sender-keys.
func (h *Handler) HandleStoreSenderKey(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req model.StoreSenderKeyRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}

	// Verify sender is a member of the group (prevents injection into foreign groups)
	isMember, err := h.store.VerifyGroupMembership(r.Context(), req.GroupID, userID)
	if err != nil || !isMember {
		writeError(w, http.StatusForbidden, "not a member of this group")
		return
	}

	if err := h.store.UpsertSenderKey(r.Context(), req.GroupID, userID, req.RecipientUserID, req.EncryptedKey, req.ChainID, req.Generation); err != nil {
		h.logger.Error("store sender key", "error", err, "userId", hashUserID(userID))
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// HandleGetSenderKeys handles GET /sender-keys/{groupId}.
func (h *Handler) HandleGetSenderKeys(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	groupID := extractPathParam(r, "/api/v1/e2e/sender-keys/")
	if err := validatePathParam(groupID); err != nil {
		writeError(w, http.StatusBadRequest, "invalid groupId")
		return
	}

	keys, err := h.store.GetSenderKeys(r.Context(), groupID, userID)
	if err != nil {
		h.logger.Error("get sender keys", "error", err, "userId", userID, "groupId", groupID)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeJSON(w, http.StatusOK, model.SenderKeysResponse{
		GroupID:    groupID,
		SenderKeys: keys,
	})
}

// --- Multi-device (C4) ---

// HandleGetDevices returns all registered deviceIds for a user.
func (h *Handler) HandleGetDevices(w http.ResponseWriter, r *http.Request) {
	targetUserID := extractPathParam(r, "/api/v1/e2e/keys/devices/")
	if err := validatePathParam(targetUserID); err != nil {
		writeError(w, http.StatusBadRequest, "invalid userId")
		return
	}

	deviceIDs, err := h.store.GetDeviceIDs(r.Context(), targetUserID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"userId":    targetUserID,
		"deviceIds": deviceIDs,
	})
}

// --- Key Transparency (C6) ---

// HandleGetTransparencyProof returns a Merkle inclusion proof for a user's identity key.
func (h *Handler) HandleGetTransparencyProof(w http.ResponseWriter, r *http.Request) {
	targetUserID := extractPathParam(r, "/api/v1/e2e/transparency/")
	if err := validatePathParam(targetUserID); err != nil {
		writeError(w, http.StatusBadRequest, "invalid userId")
		return
	}

	proof, err := h.store.GetTransparencyProof(r.Context(), targetUserID)
	if err != nil {
		writeError(w, http.StatusNotFound, "transparency proof not available")
		return
	}

	writeJSON(w, http.StatusOK, proof)
}

// HandleVerifyDeviceLink verifies a device linking code with server-side rate limiting.
// V4-F20: Max 5 attempts per linking session. After 5 failures, the session is invalidated.
// This prevents brute-force of the 6-digit code (20 bits entropy, 1M combinations).
func (h *Handler) HandleVerifyDeviceLink(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req struct {
		LinkSessionID string `json:"linkSessionId"` // Unique per code generation
		Code          string `json:"code"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}

	if len(req.Code) != 6 || req.LinkSessionID == "" {
		writeError(w, http.StatusBadRequest, "code must be 6 digits")
		return
	}

	// Rate limit: max 5 attempts per link session, 10-minute window (fail-closed).
	// Uses atomic Lua script — no crash-between-commands risk.
	if h.rateLimiter != nil {
		rlKey := fmt.Sprintf("e2e:rl:link:%s:%s", userID, req.LinkSessionID)
		if _, err := h.rateLimiter.CheckRateLimit(r.Context(), rlKey, 5, 600); err != nil {
			writeError(w, http.StatusTooManyRequests, "too many attempts — generate a new code")
			return
		}
	}

	// TODO: Actual code verification logic (compare against stored code for this session)
	// For now, return 501 — endpoint is ready for integration when device linking is built.
	writeError(w, http.StatusNotImplemented, "device linking not yet implemented")
}

// HandleGetTransparencyRoot returns the current Merkle tree root + signature.
func (h *Handler) HandleGetTransparencyRoot(w http.ResponseWriter, r *http.Request) {
	root, err := h.store.GetTransparencyRoot(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeJSON(w, http.StatusOK, root)
}

// --- Internal webhook ---

// notifyIdentityChanged sends a webhook to NestJS when an identity key changes.
func (h *Handler) notifyIdentityChanged(userID, oldFingerprint, newPublicKeyB64 string) {
	webhookURL := os.Getenv("NESTJS_INTERNAL_URL")
	secret := os.Getenv("INTERNAL_WEBHOOK_SECRET")
	if webhookURL == "" || secret == "" {
		h.logger.Warn("identity key changed but NESTJS_INTERNAL_URL or INTERNAL_WEBHOOK_SECRET not configured", "userId", hashUserID(userID))
		return
	}

	// Compute new fingerprint
	newPubBytes, err := base64.StdEncoding.DecodeString(newPublicKeyB64)
	if err != nil {
		return
	}
	newFP := sha256.Sum256(newPubBytes)

	payload := model.IdentityChangedWebhook{
		UserID:         userID,
		OldFingerprint: oldFingerprint,
		NewFingerprint: base64.StdEncoding.EncodeToString(newFP[:]),
	}

	body, err := json.Marshal(payload)
	if err != nil {
		h.logger.Error("marshal webhook payload", "error", err)
		return
	}

	// Compute HMAC-SHA256 signature (NestJS verifies with constant-time comparison)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	signature := fmt.Sprintf("%x", mac.Sum(nil))

	req, err := http.NewRequest("POST", webhookURL+"/api/v1/internal/e2e/identity-changed", bytes.NewReader(body))
	if err != nil {
		h.logger.Error("create webhook request", "error", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Webhook-Signature", signature)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	req = req.WithContext(ctx)

	// Retry up to 3 times with exponential backoff
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			time.Sleep(time.Duration(attempt*attempt) * time.Second) // 1s, 4s backoff
			// Re-create request (body may have been consumed)
			req, _ = http.NewRequest("POST", webhookURL+"/api/v1/internal/e2e/identity-changed", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("X-Webhook-Signature", signature)
			rCtx, rCancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer rCancel()
			req = req.WithContext(rCtx)
		}

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		resp.Body.Close()
		if resp.StatusCode < 400 {
			return // Success
		}
		lastErr = fmt.Errorf("status %d", resp.StatusCode)
	}
	h.logger.Error("notify identity changed: all retries failed", "error", lastErr)
}

// --- Helpers ---

// hashUserID produces a truncated SHA-256 hash for log statements.
// 16 hex chars is enough for debugging but cannot identify the user.
// Deterministic: same userId always produces the same hash.
func hashUserID(userID string) string {
	h := sha256.Sum256([]byte(userID))
	return fmt.Sprintf("%x", h[:8])
}

func readJSON(r *http.Request, v interface{}) error {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20)) // 1MB max
	if err != nil {
		return fmt.Errorf("read body: %w", err)
	}
	return json.Unmarshal(body, v)
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, model.ErrorResponse{Error: http.StatusText(status), Message: msg})
}

func extractPathParam(r *http.Request, prefix string) string {
	path := r.URL.Path
	if strings.HasPrefix(path, prefix) {
		param := strings.TrimPrefix(path, prefix)
		// Remove trailing slash
		param = strings.TrimRight(param, "/")
		return param
	}
	return ""
}

func concat(slices ...[]byte) []byte {
	total := 0
	for _, s := range slices {
		total += len(s)
	}
	result := make([]byte, 0, total)
	for _, s := range slices {
		result = append(result, s...)
	}
	return result
}

// ExtractBundleTargetID extracts the target userId from a bundle request path.
// Used by rate limit middleware.
func ExtractBundleTargetID(r *http.Request) string {
	return extractPathParam(r, "/api/v1/e2e/keys/bundle/")
}

// validatePathParam checks a path-extracted parameter for safety.
// Prevents DoS via oversized strings, log injection via control chars,
// and Redis key pollution via special characters.
func validatePathParam(param string) error {
	if len(param) == 0 {
		return fmt.Errorf("parameter is empty")
	}
	if len(param) > 64 {
		return fmt.Errorf("parameter too long (max 64 chars)")
	}
	for _, c := range param {
		if c < 0x20 || c == 0x7f { // Control characters
			return fmt.Errorf("parameter contains invalid characters")
		}
	}
	return nil
}
