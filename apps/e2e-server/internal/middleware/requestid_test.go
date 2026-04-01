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
	handler := RequestID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := RequestIDFromContext(r.Context())
		if id != "existing-id-123" {
			t.Errorf("expected preserved ID 'existing-id-123', got %q", id)
		}
	}))

	r := httptest.NewRequest("GET", "/", nil)
	r.Header.Set("X-Request-ID", "existing-id-123")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)

	if got := w.Header().Get("X-Request-ID"); got != "existing-id-123" {
		t.Errorf("expected X-Request-ID 'existing-id-123', got %q", got)
	}
}

func TestRequestIDFromContext_EmptyContext(t *testing.T) {
	result := RequestIDFromContext(context.Background())
	if result != "" {
		t.Errorf("expected empty string for empty context, got %q", result)
	}
}
