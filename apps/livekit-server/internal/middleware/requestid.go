package middleware

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"regexp"
)

const requestIDKey contextKey = "requestId"

// [G06-#12 fix] Only allow hex/UUID characters, max 64 chars.
// Prevents injection of arbitrary strings via X-Request-ID header.
var validRequestIDRe = regexp.MustCompile(`^[0-9a-fA-F\-]{1,64}$`)

// isValidRequestID checks that a client-supplied request ID is safe (hex/UUID only, max 64 chars).
func isValidRequestID(id string) bool {
	return validRequestIDRe.MatchString(id)
}

// RequestID generates a unique ID per request and stores it in context + response header.
func RequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-ID")
		// [G06-#12 fix] Validate format — reject injection attempts
		if id == "" || !isValidRequestID(id) {
			b := make([]byte, 8)
			rand.Read(b)
			id = hex.EncodeToString(b)
		}
		w.Header().Set("X-Request-ID", id)
		ctx := context.WithValue(r.Context(), requestIDKey, id)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequestIDFromContext extracts the request ID.
func RequestIDFromContext(ctx context.Context) string {
	v, _ := ctx.Value(requestIDKey).(string)
	return v
}
