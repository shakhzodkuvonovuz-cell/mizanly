package config

import (
	"os"
	"testing"
)

func TestLoad_MissingDatabaseURL(t *testing.T) {
	os.Setenv("DATABASE_URL", "")
	os.Setenv("CLERK_SECRET_KEY", "sk_test")
	os.Setenv("REDIS_URL", "redis://localhost")
	defer func() {
		os.Unsetenv("DATABASE_URL")
		os.Unsetenv("CLERK_SECRET_KEY")
		os.Unsetenv("REDIS_URL")
	}()

	_, err := Load()
	if err == nil {
		t.Fatal("expected error for missing DATABASE_URL")
	}
}

func TestLoad_MissingClerkKey(t *testing.T) {
	os.Setenv("DATABASE_URL", "postgres://localhost")
	os.Setenv("CLERK_SECRET_KEY", "")
	os.Setenv("REDIS_URL", "redis://localhost")
	defer func() {
		os.Unsetenv("DATABASE_URL")
		os.Unsetenv("CLERK_SECRET_KEY")
		os.Unsetenv("REDIS_URL")
	}()

	_, err := Load()
	if err == nil {
		t.Fatal("expected error for missing CLERK_SECRET_KEY")
	}
}

func TestLoad_MissingRedisURL(t *testing.T) {
	os.Setenv("DATABASE_URL", "postgres://localhost")
	os.Setenv("CLERK_SECRET_KEY", "sk_test")
	os.Setenv("REDIS_URL", "")
	defer func() {
		os.Unsetenv("DATABASE_URL")
		os.Unsetenv("CLERK_SECRET_KEY")
		os.Unsetenv("REDIS_URL")
	}()

	_, err := Load()
	if err == nil {
		t.Fatal("expected error for missing REDIS_URL")
	}
}

func TestLoad_AllRequired(t *testing.T) {
	os.Setenv("DATABASE_URL", "postgres://localhost")
	os.Setenv("CLERK_SECRET_KEY", "sk_test")
	os.Setenv("REDIS_URL", "redis://localhost")
	defer func() {
		os.Unsetenv("DATABASE_URL")
		os.Unsetenv("CLERK_SECRET_KEY")
		os.Unsetenv("REDIS_URL")
	}()

	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.DatabaseURL != "postgres://localhost" {
		t.Errorf("expected DATABASE_URL='postgres://localhost', got %q", cfg.DatabaseURL)
	}
	if cfg.ClerkSecretKey != "sk_test" {
		t.Errorf("expected CLERK_SECRET_KEY='sk_test', got %q", cfg.ClerkSecretKey)
	}
}

func TestLoad_Defaults(t *testing.T) {
	os.Setenv("DATABASE_URL", "postgres://localhost")
	os.Setenv("CLERK_SECRET_KEY", "sk_test")
	os.Setenv("REDIS_URL", "redis://localhost")
	os.Unsetenv("PORT")
	os.Unsetenv("NODE_ENV")
	defer func() {
		os.Unsetenv("DATABASE_URL")
		os.Unsetenv("CLERK_SECRET_KEY")
		os.Unsetenv("REDIS_URL")
	}()

	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.Port != "8080" {
		t.Errorf("expected default port '8080', got %q", cfg.Port)
	}
	if cfg.NodeEnv != "development" {
		t.Errorf("expected default NODE_ENV 'development', got %q", cfg.NodeEnv)
	}
}

func TestLoad_OptionalFields(t *testing.T) {
	os.Setenv("DATABASE_URL", "postgres://localhost")
	os.Setenv("CLERK_SECRET_KEY", "sk_test")
	os.Setenv("REDIS_URL", "redis://localhost")
	os.Setenv("NESTJS_INTERNAL_URL", "https://api.mizanly.app")
	os.Setenv("INTERNAL_WEBHOOK_SECRET", "secret123")
	os.Setenv("SENTRY_DSN", "https://sentry.io/123")
	defer func() {
		os.Unsetenv("DATABASE_URL")
		os.Unsetenv("CLERK_SECRET_KEY")
		os.Unsetenv("REDIS_URL")
		os.Unsetenv("NESTJS_INTERNAL_URL")
		os.Unsetenv("INTERNAL_WEBHOOK_SECRET")
		os.Unsetenv("SENTRY_DSN")
	}()

	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.NestJSInternalURL != "https://api.mizanly.app" {
		t.Errorf("expected NESTJS_INTERNAL_URL, got %q", cfg.NestJSInternalURL)
	}
	if cfg.InternalWebhookSecret != "secret123" {
		t.Errorf("expected INTERNAL_WEBHOOK_SECRET, got %q", cfg.InternalWebhookSecret)
	}
	if cfg.SentryDSN != "https://sentry.io/123" {
		t.Errorf("expected SENTRY_DSN, got %q", cfg.SentryDSN)
	}
}
