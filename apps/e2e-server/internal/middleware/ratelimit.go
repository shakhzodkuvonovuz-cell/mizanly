package middleware

import (
	"context"
	"fmt"
	"net/http"

	"github.com/redis/go-redis/v9"
)

// RateLimiter provides per-target rate limiting using Redis.
type RateLimiter struct {
	rdb *redis.Client
}

// NewRateLimiter creates a rate limiter backed by Redis.
func NewRateLimiter(rdb *redis.Client) *RateLimiter {
	return &RateLimiter{rdb: rdb}
}

// Lua script for atomic INCR + EXPIRE (prevents TTL-less keys on crash between INCR and EXPIRE)
var incrWithExpireScript = redis.NewScript(`
	local count = redis.call('INCR', KEYS[1])
	if count == 1 then
		redis.call('EXPIRE', KEYS[1], ARGV[1])
	end
	return count
`)

// Lua script for atomic SADD + EXPIRE + SCARD
var saddCountScript = redis.NewScript(`
	redis.call('SADD', KEYS[1], ARGV[1])
	if redis.call('TTL', KEYS[1]) == -1 then
		redis.call('EXPIRE', KEYS[1], ARGV[2])
	end
	return redis.call('SCARD', KEYS[1])
`)

// CheckBundleFetch enforces per-requester-per-target rate limit on bundle fetches.
// 5 fetches per target per hour. 200 unique targets per hour globally.
// All Redis operations are atomic via Lua scripts (no crash-between-commands risk).
func (rl *RateLimiter) CheckBundleFetch(ctx context.Context, requesterID, targetID string) error {
	// Per-target limit: 5 per hour (atomic INCR + EXPIRE)
	perTargetKey := fmt.Sprintf("e2e:rl:%s:%s", requesterID, targetID)
	count, err := incrWithExpireScript.Run(ctx, rl.rdb, []string{perTargetKey}, 3600).Int64()
	if err != nil {
		// Fail CLOSED — reject requests when Redis is down.
	// Without rate limiting, an attacker can drain every user's OTP pool.
	return fmt.Errorf("rate limiting unavailable — try again later")
	}
	if count > 5 {
		return fmt.Errorf("rate limit exceeded: max 5 bundle fetches per target per hour")
	}

	// Global unique-target limit: 200 per hour (atomic SADD + EXPIRE + SCARD)
	globalKey := fmt.Sprintf("e2e:rl:global:%s", requesterID)
	globalCount, err := saddCountScript.Run(ctx, rl.rdb, []string{globalKey}, targetID, 3600).Int64()
	if err != nil {
		// Fail CLOSED — without rate limiting, an attacker can drain every user's OTP pool.
		return fmt.Errorf("rate limiting unavailable — try again later")
	}
	if globalCount > 50 {
		return fmt.Errorf("rate limit exceeded: max 50 unique targets per hour")
	}

	return nil
}

// RateLimitMiddleware wraps a handler with rate limit checking.
// targetIDFunc extracts the target user ID from the request.
func (rl *RateLimiter) RateLimitMiddleware(targetIDFunc func(*http.Request) string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			requesterID := UserIDFromContext(r.Context())
			targetID := targetIDFunc(r)
			if requesterID == "" || targetID == "" {
				next.ServeHTTP(w, r)
				return
			}
			if err := rl.CheckBundleFetch(r.Context(), requesterID, targetID); err != nil {
				http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusTooManyRequests)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
