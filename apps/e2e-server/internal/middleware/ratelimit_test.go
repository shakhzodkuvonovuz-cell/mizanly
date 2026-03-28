package middleware

import (
	"context"
	"testing"

	"github.com/redis/go-redis/v9"
)

// TestCheckBundleFetch_FailsClosedOnRedisError verifies that when Redis
// is unavailable, the rate limiter REJECTS requests (fails closed).
// Without this, an attacker could drain every user's OTP pool during
// a Redis outage.
func TestCheckBundleFetch_FailsClosedOnRedisError(t *testing.T) {
	// Create client pointing to unreachable Redis
	rdb := redis.NewClient(&redis.Options{Addr: "localhost:1", DialTimeout: 1})
	rl := NewRateLimiter(rdb)
	err := rl.CheckBundleFetch(context.Background(), "user1", "target1")
	if err == nil {
		t.Fatal("expected error when Redis is unavailable, got nil (fail-open is a security vulnerability)")
	}
}
