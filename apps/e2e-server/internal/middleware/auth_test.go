package middleware

import (
	"context"
	"testing"
)

func TestUserIDFromContext_EmptyContext(t *testing.T) {
	ctx := context.Background()
	result := UserIDFromContext(ctx)
	if result != "" {
		t.Errorf("expected empty string for empty context, got %q", result)
	}
}

func TestUserIDFromContext_WithValue(t *testing.T) {
	ctx := context.WithValue(context.Background(), userIDKey, "user_abc123")
	result := UserIDFromContext(ctx)
	if result != "user_abc123" {
		t.Errorf("expected 'user_abc123', got %q", result)
	}
}

func TestUserIDFromContext_WrongType(t *testing.T) {
	// Store an int instead of string — type assertion should fail gracefully
	ctx := context.WithValue(context.Background(), userIDKey, 12345)
	result := UserIDFromContext(ctx)
	if result != "" {
		t.Errorf("expected empty string for wrong type, got %q", result)
	}
}

func TestUserIDFromContext_WrongKey(t *testing.T) {
	// Use a different key — should not match
	ctx := context.WithValue(context.Background(), contextKey("otherKey"), "user_abc")
	result := UserIDFromContext(ctx)
	if result != "" {
		t.Errorf("expected empty string for wrong key, got %q", result)
	}
}
