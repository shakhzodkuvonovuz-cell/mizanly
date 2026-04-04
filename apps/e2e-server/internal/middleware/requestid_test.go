package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRequestID_GeneratesIfMissing(t *testing.T) {
	handler := RequestID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := RequestIDFromContext(r.Context())
		if id == "" {
			t.Error("expected request ID in context, got empty")
		}
		if len(id) != 16 { // 8 bytes hex = 16 chars
			t.Errorf("expected 16-char hex request ID, got %d chars: %q", len(id), id)
		}
	}))

	r := httptest.NewRequest("GET", "/", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)

	if w.Header().Get("X-Request-ID") == "" {
		t.Error("expected X-Request-ID response header")
	}
}

func TestRequestID_PreservesExisting(t *testing.T) {
	// G06-#12: Valid request IDs must be hex/UUID format (0-9, a-f, A-F, hyphens).
	validID := "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
	handler := RequestID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := RequestIDFromContext(r.Context())
		if id != validID {
			t.Errorf("expected preserved ID %q, got %q", validID, id)
		}
	}))

	r := httptest.NewRequest("GET", "/", nil)
	r.Header.Set("X-Request-ID", validID)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)

	if got := w.Header().Get("X-Request-ID"); got != validID {
		t.Errorf("expected X-Request-ID %q, got %q", validID, got)
	}
}

func TestRequestID_RejectsInvalidFormat(t *testing.T) {
	// Non-hex characters should be rejected, generating a new ID
	handler := RequestID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := RequestIDFromContext(r.Context())
		if id == "<script>alert(1)</script>" {
			t.Error("injection string was accepted as request ID")
		}
		if len(id) != 16 { // Should be a fresh 8-byte hex
			t.Errorf("expected generated 16-char hex ID, got %d chars: %q", len(id), id)
		}
	}))

	r := httptest.NewRequest("GET", "/", nil)
	r.Header.Set("X-Request-ID", "<script>alert(1)</script>")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
}

func TestRequestIDFromContext_EmptyContext(t *testing.T) {
	result := RequestIDFromContext(context.Background())
	if result != "" {
		t.Errorf("expected empty string for empty context, got %q", result)
	}
}
