// Package config loads and validates environment configuration.
package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
)

// Config holds all required and optional environment variables.
type Config struct {
	DatabaseURL            string
	ClerkSecretKey         string
	RedisURL               string
	SentryDSN              string
	NodeEnv                string
	Port                   string
	NestJSInternalURL      string
	InternalWebhookSecret  string
	TransparencySigningKey string

	// Tunable operational parameters (env var overrides with sane defaults)
	DBMaxConns int32  // DB_MAX_CONNS — max pool connections (default 10)
	LogLevel   string // LOG_LEVEL — slog level: debug, info, warn, error (default "info")
}

// Load reads config from environment variables and validates required fields.
func Load() (*Config, error) {
	cfg := &Config{
		DatabaseURL:            os.Getenv("DATABASE_URL"),
		ClerkSecretKey:         os.Getenv("CLERK_SECRET_KEY"),
		RedisURL:               os.Getenv("REDIS_URL"),
		SentryDSN:              os.Getenv("SENTRY_DSN"),
		NodeEnv:                envOrDefault("NODE_ENV", "development"),
		Port:                   envOrDefault("PORT", "8080"),
		NestJSInternalURL:      os.Getenv("NESTJS_INTERNAL_URL"),
		InternalWebhookSecret:  os.Getenv("INTERNAL_WEBHOOK_SECRET"),
		TransparencySigningKey: os.Getenv("TRANSPARENCY_SIGNING_KEY"),

		DBMaxConns: int32(envOrDefaultInt("DB_MAX_CONNS", 10)),
		LogLevel:   envOrDefault("LOG_LEVEL", "info"),
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

	// Validate port is numeric and in valid range 1-65535
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
