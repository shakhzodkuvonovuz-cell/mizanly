package middleware

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/v9"
)

// RateLimiter provides per-user rate limiting using Redis.
type RateLimiter struct {
	rdb      *redis.Client
	testMode bool // [G06-#8] when true, nil Redis is allowed (test-only)
}

// NewRateLimiter creates a rate limiter backed by Redis.
func NewRateLimiter(rdb *redis.Client, opts ...RateLimiterOption) *RateLimiter {
	rl := &RateLimiter{rdb: rdb}
	for _, opt := range opts {
		opt(rl)
	}
	return rl
}

// Lua script for atomic INCR + EXPIRE (prevents TTL-less keys on crash between INCR and EXPIRE).
var incrWithExpireScript = redis.NewScript(`
	local count = redis.call('INCR', KEYS[1])
	if count == 1 then
		redis.call('EXPIRE', KEYS[1], ARGV[1])
	end
	return count
`)

// CheckRateLimit is an atomic rate limiter. Returns the current count. Fails closed on Redis error.
func (rl *RateLimiter) CheckRateLimit(ctx context.Context, key string, maxCount int64, windowSeconds int) (int64, error) {
	count, err := incrWithExpireScript.Run(ctx, rl.rdb, []string{key}, windowSeconds).Int64()
	if err != nil {
		return 0, fmt.Errorf("rate limiting unavailable — try again later")
	}
	if count > maxCount {
		return count, fmt.Errorf("rate limit exceeded")
	}
	return count, nil
}

// [G06-#8 fix] testMode flag — when true, nil Redis is allowed (test-only).
// In production, nil Redis means rate limiter is misconfigured and must fail closed.
type RateLimiterOption func(*RateLimiter)

// WithTestMode allows nil Redis for unit tests.
func WithTestMode() RateLimiterOption {
	return func(rl *RateLimiter) { rl.testMode = true }
}

// CheckCreateRoom enforces room creation rate limit: 10 per minute per user.
func (rl *RateLimiter) CheckCreateRoom(ctx context.Context, userID string) error {
	// Defense-in-depth: reject empty userID even though auth middleware should block it.
	// Without this, all unauthenticated requests share one rate limit bucket ("lk:rl:room:").
	if userID == "" {
		return fmt.Errorf("rate limit check requires non-empty userID")
	}
	if rl.rdb == nil {
		if rl.testMode {
			return nil
		}
		return fmt.Errorf("rate limiter not configured")
	}
	key := fmt.Sprintf("lk:rl:room:%s", userID)
	_, err := rl.CheckRateLimit(ctx, key, 10, 60)
	return err
}

// CheckTokenRequest enforces token request rate limit: 30 per minute per user.
func (rl *RateLimiter) CheckTokenRequest(ctx context.Context, userID string) error {
	// Defense-in-depth: reject empty userID even though auth middleware should block it.
	if userID == "" {
		return fmt.Errorf("rate limit check requires non-empty userID")
	}
	if rl.rdb == nil {
		if rl.testMode {
			return nil
		}
		return fmt.Errorf("rate limiter not configured")
	}
	key := fmt.Sprintf("lk:rl:token:%s", userID)
	_, err := rl.CheckRateLimit(ctx, key, 30, 60)
	return err
}
