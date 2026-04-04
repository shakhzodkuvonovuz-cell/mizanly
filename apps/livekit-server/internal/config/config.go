// Package config loads and validates environment configuration.
package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
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

	// Tunable operational parameters (env var overrides with sane defaults)
	DBMaxConns           int32         // DB_MAX_CONNS — max pool connections (default 10)
	TokenTTL             time.Duration // TOKEN_TTL_SECONDS — LiveKit token lifetime (default 7200 = 2h)
	MaxGroupParticipants int           // MAX_GROUP_PARTICIPANTS — group call cap (default 100)
	MaxBroadcastViewers  int           // MAX_BROADCAST_VIEWERS — broadcast cap (default 10000)
	RoomEmptyTimeout     uint32        // ROOM_EMPTY_TIMEOUT_SECONDS — LiveKit room auto-close (default 300)
	CleanupIntervalSecs  int           // CLEANUP_INTERVAL_SECONDS — stale ringing check interval (default 30)
	StaleRingTimeoutSecs int           // STALE_RING_TIMEOUT_SECONDS — ringing→MISSED after N seconds (default 60)
	LogLevel             string        // LOG_LEVEL — slog level: debug, info, warn, error (default "info")
	NodeEnv              string        // NODE_ENV — environment name for Sentry/CORS (default "development")
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

		// Defaults for tunable parameters
		DBMaxConns:           int32(envOrDefaultInt("DB_MAX_CONNS", 10)),
		TokenTTL:             time.Duration(envOrDefaultInt("TOKEN_TTL_SECONDS", 7200)) * time.Second,
		MaxGroupParticipants: envOrDefaultInt("MAX_GROUP_PARTICIPANTS", 100),
		MaxBroadcastViewers:  envOrDefaultInt("MAX_BROADCAST_VIEWERS", 10000),
		RoomEmptyTimeout:     uint32(envOrDefaultInt("ROOM_EMPTY_TIMEOUT_SECONDS", 300)),
		CleanupIntervalSecs:  envOrDefaultInt("CLEANUP_INTERVAL_SECONDS", 30),
		StaleRingTimeoutSecs: envOrDefaultInt("STALE_RING_TIMEOUT_SECONDS", 60),
		LogLevel:             envOrDefault("LOG_LEVEL", "info"),
		NodeEnv:              envOrDefault("NODE_ENV", "development"),
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

	// Validate log level
	switch strings.ToLower(cfg.LogLevel) {
	case "debug", "info", "warn", "error":
		cfg.LogLevel = strings.ToLower(cfg.LogLevel)
	default:
		return nil, fmt.Errorf("LOG_LEVEL must be one of: debug, info, warn, error — got %q", cfg.LogLevel)
	}

	// Validate tunable parameters
	if cfg.DBMaxConns < 1 || cfg.DBMaxConns > 1000 {
		return nil, fmt.Errorf("DB_MAX_CONNS must be between 1 and 1000, got %d", cfg.DBMaxConns)
	}
	if cfg.TokenTTL < 1*time.Minute || cfg.TokenTTL > 24*time.Hour {
		return nil, fmt.Errorf("TOKEN_TTL_SECONDS must be between 60 and 86400, got %v", cfg.TokenTTL)
	}
	if cfg.MaxGroupParticipants < 2 || cfg.MaxGroupParticipants > 10000 {
		return nil, fmt.Errorf("MAX_GROUP_PARTICIPANTS must be between 2 and 10000, got %d", cfg.MaxGroupParticipants)
	}
	if cfg.MaxBroadcastViewers < 2 || cfg.MaxBroadcastViewers > 1000000 {
		return nil, fmt.Errorf("MAX_BROADCAST_VIEWERS must be between 2 and 1000000, got %d", cfg.MaxBroadcastViewers)
	}
	if cfg.CleanupIntervalSecs < 5 || cfg.CleanupIntervalSecs > 600 {
		return nil, fmt.Errorf("CLEANUP_INTERVAL_SECONDS must be between 5 and 600, got %d", cfg.CleanupIntervalSecs)
	}
	if cfg.StaleRingTimeoutSecs < 10 || cfg.StaleRingTimeoutSecs > 600 {
		return nil, fmt.Errorf("STALE_RING_TIMEOUT_SECONDS must be between 10 and 600, got %d", cfg.StaleRingTimeoutSecs)
	}

	return cfg, nil
}

// ParseLogLevel converts a validated log level string to slog.Level.
func ParseLogLevel(level string) int {
	switch level {
	case "debug":
		return -4 // slog.LevelDebug
	case "warn":
		return 4 // slog.LevelWarn
	case "error":
		return 8 // slog.LevelError
	default:
		return 0 // slog.LevelInfo
	}
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// envOrDefaultInt reads an env var as int, returning def if unset or unparseable.
func envOrDefaultInt(key string, def int) int {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}
