package middleware

import (
	"context"
	"testing"
)

func TestUserIDFromContext_Empty(t *testing.T) {
	ctx := context.Background()
	id := UserIDFromContext(ctx)
	if id != "" {
		t.Errorf("expected empty string, got %s", id)
	}
}

func TestUserIDFromContext_WithValue(t *testing.T) {
	ctx := context.WithValue(context.Background(), userIDKey, "user-123")
	id := UserIDFromContext(ctx)
	if id != "user-123" {
		t.Errorf("expected user-123, got %s", id)
	}
}

func TestUserIDFromContext_WrongType(t *testing.T) {
	ctx := context.WithValue(context.Background(), userIDKey, 12345)
	id := UserIDFromContext(ctx)
	if id != "" {
		t.Errorf("expected empty string for wrong type, got %s", id)
	}
}
