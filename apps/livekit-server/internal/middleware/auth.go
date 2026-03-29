// Package middleware provides HTTP middleware for the LiveKit call server.
package middleware

import (
	"context"
	"net/http"

	"github.com/clerk/clerk-sdk-go/v2"
	clerkhttp "github.com/clerk/clerk-sdk-go/v2/http"
)

type contextKey string

const userIDKey contextKey = "userId"

// RequireAuth returns middleware that verifies Clerk JWT tokens.
// Extracts userId from claims and stores in request context.
func RequireAuth() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return clerkhttp.RequireHeaderAuthorization()(
			http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				claims, ok := clerk.SessionClaimsFromContext(r.Context())
				if !ok || claims.Subject == "" {
					http.Error(w, `{"error":"unauthorized","success":false}`, http.StatusUnauthorized)
					return
				}
				ctx := context.WithValue(r.Context(), userIDKey, claims.Subject)
				next.ServeHTTP(w, r.WithContext(ctx))
			}),
		)
	}
}

// UserIDFromContext extracts the authenticated user ID from the request context.
func UserIDFromContext(ctx context.Context) string {
	v, _ := ctx.Value(userIDKey).(string)
	return v
}

// TestUserIDKey returns the context key for testing purposes.
// Tests use this to inject a userId into the context without going through Clerk.
func TestUserIDKey() contextKey {
	return userIDKey
}
