package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRequestID_GeneratesWhenMissing(t *testing.T) {
	handler := RequestID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := RequestIDFromContext(r.Context())
		if id == "" {
			t.Error("expected non-empty request ID in context")
		}
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Header().Get("X-Request-ID") == "" {
		t.Error("expected X-Request-ID header in response")
	}
}

func TestRequestID_AcceptsValidUUID(t *testing.T) {
	handler := RequestID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := RequestIDFromContext(r.Context())
		if id != "550e8400-e29b-41d4-a716-446655440000" {
			t.Errorf("expected UUID to be preserved, got %s", id)
		}
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("X-Request-ID", "550e8400-e29b-41d4-a716-446655440000")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Header().Get("X-Request-ID") != "550e8400-e29b-41d4-a716-446655440000" {
		t.Errorf("expected UUID in response header, got %s", rec.Header().Get("X-Request-ID"))
	}
}

func TestRequestID_AcceptsValidHex(t *testing.T) {
	handler := RequestID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := RequestIDFromContext(r.Context())
		if id != "abcdef1234567890" {
			t.Errorf("expected hex ID to be preserved, got %s", id)
		}
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("X-Request-ID", "abcdef1234567890")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
}

// [G06-#12 fix] Reject injection attempts
func TestRequestID_RejectsInvalidCharacters(t *testing.T) {
	tests := []struct {
		name string
		id   string
	}{
		{"script injection", "<script>alert(1)</script>"},
		{"newline injection", "abc\ndef"},
		{"null byte", "abc\x00def"},
		{"spaces", "abc def ghi"},
		{"special chars", "abc;DROP TABLE users;--"},
		{"unicode", "abc\u202edef"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler := RequestID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				id := RequestIDFromContext(r.Context())
				if id == tt.id {
					t.Errorf("expected invalid ID %q to be rejected", tt.id)
				}
			}))

			req := httptest.NewRequest("GET", "/test", nil)
			req.Header.Set("X-Request-ID", tt.id)
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)

			responseID := rec.Header().Get("X-Request-ID")
			if responseID == tt.id {
				t.Errorf("response should not contain rejected ID %q", tt.id)
			}
		})
	}
}

// [G06-#12 fix] Reject overly long IDs
func TestRequestID_RejectsTooLong(t *testing.T) {
	longID := ""
	for i := 0; i < 65; i++ {
		longID += "a"
	}

	handler := RequestID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := RequestIDFromContext(r.Context())
		if id == longID {
			t.Error("expected long ID to be rejected")
		}
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("X-Request-ID", longID)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
}

func TestRequestID_Accepts64CharHex(t *testing.T) {
	id64 := "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"

	handler := RequestID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := RequestIDFromContext(r.Context())
		if id != id64 {
			t.Errorf("expected 64-char hex ID to be accepted, got %s", id)
		}
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("X-Request-ID", id64)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
}

func TestIsValidRequestID(t *testing.T) {
	tests := []struct {
		id    string
		valid bool
	}{
		{"abc123", true},
		{"550e8400-e29b-41d4-a716-446655440000", true},
		{"ABCDEF", true},
		{"", false},
		{"abc xyz", false},
		{"abc;def", false},
		{"abc\ndef", false},
	}
	for _, tt := range tests {
		t.Run(tt.id, func(t *testing.T) {
			if got := isValidRequestID(tt.id); got != tt.valid {
				t.Errorf("isValidRequestID(%q) = %v, want %v", tt.id, got, tt.valid)
			}
		})
	}
}
