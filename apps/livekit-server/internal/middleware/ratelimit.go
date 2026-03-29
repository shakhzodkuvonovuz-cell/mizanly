package middleware

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/v9"
)

// RateLimiter provides per-user rate limiting using Redis.
type RateLimiter struct {
	rdb *redis.Client
}

// NewRateLimiter creates a rate limiter backed by Redis.
func NewRateLimiter(rdb *redis.Client) *RateLimiter {
	return &RateLimiter{rdb: rdb}
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

// CheckCreateRoom enforces room creation rate limit: 10 per minute per user.
func (rl *RateLimiter) CheckCreateRoom(ctx context.Context, userID string) error {
	if rl.rdb == nil {
		return nil // No Redis in test mode
	}
	key := fmt.Sprintf("lk:rl:room:%s", userID)
	_, err := rl.CheckRateLimit(ctx, key, 10, 60)
	return err
}

// CheckTokenRequest enforces token request rate limit: 30 per minute per user.
func (rl *RateLimiter) CheckTokenRequest(ctx context.Context, userID string) error {
	if rl.rdb == nil {
		return nil // No Redis in test mode
	}
	key := fmt.Sprintf("lk:rl:token:%s", userID)
	_, err := rl.CheckRateLimit(ctx, key, 30, 60)
	return err
}
