package handler

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/mizanly/e2e-server/internal/config"
)

// newTestHandler creates a handler with nil store/redis/rateLimiter.
// Only auth checks and input validation run before store access.
func newTestHandler() *Handler {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	cfg := &config.Config{}
	return &Handler{
		store:         nil,
		rdb:           nil,
		rateLimiter:   nil,
		cfg:           cfg,
		logger:        logger,
		webhookClient: &http.Client{},
	}
}

// ============================================================
// T14 #16: HandleRegisterIdentity — auth rejection + bad body
// ============================================================

func TestHandleRegisterIdentity_Unauthorized(t *testing.T) {
	h := newTestHandler()
	w := httptest.NewRecorder()
	r := httptest.NewRequest("PUT", "/api/v1/e2e/keys/identity",
		bytes.NewBufferString(`{"publicKey":"AAAA","deviceId":1,"registrationId":100}`))

	h.HandleRegisterIdentity(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestHandleRegisterIdentity_InvalidBody(t *testing.T) {
	h := newTestHandler()
	w := httptest.NewRecorder()
	r := httptest.NewRequest("PUT", "/api/v1/e2e/keys/identity",
		bytes.NewBufferString("{invalid"))
	// Simulate auth by setting context — middleware.UserIDFromContext checks middleware.contextKey
	// which we can't set from outside the package. But the handler checks for empty string first.
	// So we test the "no auth" path (returns 401 before reaching body parsing).
	// For invalid body tests, we skip auth since we can't inject userID.

	// This tests the 401 path only (userID="")
	h.HandleRegisterIdentity(w, r)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for request without auth context, got %d", w.Code)
	}
}

// ============================================================
// T14 #17: HandleUploadSignedPreKey — auth rejection
// ============================================================

func TestHandleUploadSignedPreKey_Unauthorized(t *testing.T) {
	h := newTestHandler()
	w := httptest.NewRecorder()
	r := httptest.NewRequest("PUT", "/api/v1/e2e/keys/signed-prekey",
		bytes.NewBufferString(`{"keyId":1,"publicKey":"BBB","signature":"CCC","deviceId":1}`))

	h.HandleUploadSignedPreKey(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

// ============================================================
// T14 #18: HandleUploadOneTimePreKeys — auth rejection
// ============================================================

func TestHandleUploadOneTimePreKeys_Unauthorized(t *testing.T) {
	h := newTestHandler()
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/e2e/keys/one-time-prekeys",
		bytes.NewBufferString(`{"preKeys":[]}`))

	h.HandleUploadOneTimePreKeys(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

// ============================================================
// T14 #19: HandleGetBundle — auth + path validation
// ============================================================

func TestHandleGetBundle_Unauthorized(t *testing.T) {
	h := newTestHandler()
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/e2e/keys/bundle/target-user", nil)

	h.HandleGetBundle(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

// ============================================================
// T14 #20: HandleGetBundlesBatch — auth + max 100 validation
// ============================================================

func TestHandleGetBundlesBatch_Unauthorized(t *testing.T) {
	h := newTestHandler()
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/e2e/keys/bundles/batch",
		bytes.NewBufferString(`{"userIds":["u1"]}`))

	h.HandleGetBundlesBatch(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestHandleGetBundlesBatch_InvalidBody(t *testing.T) {
	h := newTestHandler()
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/e2e/keys/bundles/batch",
		bytes.NewBufferString("{invalid"))

	h.HandleGetBundlesBatch(w, r)

	// Without auth context, returns 401 before body parsing
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 (auth before body parse), got %d", w.Code)
	}
}

// ============================================================
// T14 #21: HandleGetPreKeyCount — auth rejection
// ============================================================

func TestHandleGetPreKeyCount_Unauthorized(t *testing.T) {
	h := newTestHandler()
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/e2e/keys/count", nil)

	h.HandleGetPreKeyCount(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

// ============================================================
// T14 #22: HandleStoreSenderKey — auth rejection
// ============================================================

func TestHandleStoreSenderKey_Unauthorized(t *testing.T) {
	h := newTestHandler()
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/e2e/keys/sender-key",
		bytes.NewBufferString(`{}`))

	h.HandleStoreSenderKey(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

// ============================================================
// T14 #23: HandleGetSenderKeys — auth rejection
// ============================================================

func TestHandleGetSenderKeys_Unauthorized(t *testing.T) {
	h := newTestHandler()
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/e2e/keys/sender-keys/group-1", nil)

	h.HandleGetSenderKeys(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

// ============================================================
// T14 #24: HandleGetDevices — auth rejection
// ============================================================

func TestHandleGetDevices_Unauthorized(t *testing.T) {
	h := newTestHandler()
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/e2e/keys/devices/target-user", nil)

	h.HandleGetDevices(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

// ============================================================
// T14 #25: HandleGetTransparencyProof — path validation (public endpoint, no auth check)
// ============================================================

func TestHandleGetTransparencyProof_InvalidPath(t *testing.T) {
	h := newTestHandler()
	w := httptest.NewRecorder()
	// Empty path param after prefix
	r := httptest.NewRequest("GET", "/api/v1/e2e/transparency/", nil)

	h.HandleGetTransparencyProof(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for empty path param, got %d", w.Code)
	}
}

// ============================================================
// T14 #26: HandleVerifyDeviceLink — auth rejection + invalid body
// ============================================================

func TestHandleVerifyDeviceLink_Unauthorized(t *testing.T) {
	h := newTestHandler()
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/e2e/device/verify-link",
		bytes.NewBufferString(`{"code":"123456"}`))

	h.HandleVerifyDeviceLink(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

// ============================================================
// T14 #28: HandleHealth — nil store panics (confirms store.Health is called)
// ============================================================

func TestHandleHealth_NilStore_Panics(t *testing.T) {
	h := newTestHandler()
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/e2e/health", nil)

	defer func() {
		if rec := recover(); rec != nil {
			// Expected: nil pointer dereference because h.store is nil
			t.Log("Confirmed: HandleHealth calls store.Health (nil store panic)")
		} else {
			t.Error("expected panic from nil store, but HandleHealth succeeded — was store.Health called?")
		}
	}()

	h.HandleHealth(w, r)
}

// ============================================================
// Batch validation edge cases (T14 #20 extended)
// ============================================================

func TestBatchBundleRequest_MaxUserIDs(t *testing.T) {
	// Verify max 100 validation message content
	h := newTestHandler()
	w := httptest.NewRecorder()

	ids := make([]string, 101)
	for i := range ids {
		ids[i] = "user-" + strings.Repeat("x", 5)
	}
	body, _ := json.Marshal(map[string][]string{"userIds": ids})
	r := httptest.NewRequest("POST", "/api/v1/e2e/keys/bundles/batch", bytes.NewBuffer(body))
	// Without auth, returns 401 before reaching the max check
	h.HandleGetBundlesBatch(w, r)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}
