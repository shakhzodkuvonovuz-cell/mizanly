// Package config loads and validates environment configuration.
package config

import (
	"errors"
	"os"
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

	return cfg, nil
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
