// Package config loads and validates environment configuration.
package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
)

// Config holds all required and optional environment variables.
type Config struct {
	LiveKitAPIKey    string
	LiveKitAPISecret string
	LiveKitHost      string
	DatabaseURL      string
	ClerkSecretKey   string
	RedisURL         string
	R2AccessKey      string
	R2SecretKey      string
	R2Bucket         string
	R2Endpoint       string
	SentryDSN          string
	NestJSBaseURL      string // NestJS API URL for server-to-server push notifications
	InternalServiceKey string // Shared key for Go → NestJS internal auth
	Port               string
}

// Load reads config from environment variables and validates required fields.
func Load() (*Config, error) {
	cfg := &Config{
		LiveKitAPIKey:    os.Getenv("LIVEKIT_API_KEY"),
		LiveKitAPISecret: os.Getenv("LIVEKIT_API_SECRET"),
		LiveKitHost:      os.Getenv("LIVEKIT_HOST"),
		DatabaseURL:      os.Getenv("DATABASE_URL"),
		ClerkSecretKey:   os.Getenv("CLERK_SECRET_KEY"),
		RedisURL:         os.Getenv("REDIS_URL"),
		R2AccessKey:      os.Getenv("R2_ACCESS_KEY"),
		R2SecretKey:      os.Getenv("R2_SECRET_KEY"),
		R2Bucket:         envOrDefault("R2_BUCKET", "mizanly-media"),
		R2Endpoint:       os.Getenv("R2_ENDPOINT"),
		SentryDSN:        os.Getenv("SENTRY_DSN"),
		NestJSBaseURL:      envOrDefault("NESTJS_BASE_URL", "http://localhost:3000/api/v1"),
		InternalServiceKey: os.Getenv("INTERNAL_SERVICE_KEY"),
		Port:               envOrDefault("PORT", "8081"),
	}

	if cfg.LiveKitAPIKey == "" {
		return nil, errors.New("LIVEKIT_API_KEY is required")
	}
	if cfg.LiveKitAPISecret == "" {
		return nil, errors.New("LIVEKIT_API_SECRET is required")
	}
	if cfg.LiveKitHost == "" {
		return nil, errors.New("LIVEKIT_HOST is required")
	}
	if cfg.DatabaseURL == "" {
		return nil, errors.New("DATABASE_URL is required")
	}
	if cfg.ClerkSecretKey == "" {
		return nil, errors.New("CLERK_SECRET_KEY is required")
	}
	if cfg.RedisURL == "" {
		return nil, errors.New("REDIS_URL is required")
	}
	// [F19 fix] Validate InternalServiceKey is set — without it, push notifications
	// to NestJS will silently fail (401 Unauthorized). Fail loud at startup.
	if cfg.InternalServiceKey == "" {
		return nil, errors.New("INTERNAL_SERVICE_KEY is required")
	}

	// [G06-#16 fix] Validate port is numeric and in valid range 1-65535
	portNum, err := strconv.Atoi(cfg.Port)
	if err != nil {
		return nil, fmt.Errorf("PORT must be numeric: %w", err)
	}
	if portNum < 1 || portNum > 65535 {
		return nil, fmt.Errorf("PORT must be between 1 and 65535, got %d", portNum)
	}

	return cfg, nil
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
