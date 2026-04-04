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

// --- Port validation tests ---

func TestLoad_InvalidPort_NotNumeric(t *testing.T) {
	os.Setenv("DATABASE_URL", "postgres://localhost")
	os.Setenv("CLERK_SECRET_KEY", "sk_test")
	os.Setenv("REDIS_URL", "redis://localhost")
	os.Setenv("PORT", "abc")
	defer func() {
		os.Unsetenv("DATABASE_URL")
		os.Unsetenv("CLERK_SECRET_KEY")
		os.Unsetenv("REDIS_URL")
		os.Unsetenv("PORT")
	}()

	_, err := Load()
	if err == nil {
		t.Fatal("expected error for non-numeric port")
	}
}

func TestLoad_InvalidPort_Zero(t *testing.T) {
	os.Setenv("DATABASE_URL", "postgres://localhost")
	os.Setenv("CLERK_SECRET_KEY", "sk_test")
	os.Setenv("REDIS_URL", "redis://localhost")
	os.Setenv("PORT", "0")
	defer func() {
		os.Unsetenv("DATABASE_URL")
		os.Unsetenv("CLERK_SECRET_KEY")
		os.Unsetenv("REDIS_URL")
		os.Unsetenv("PORT")
	}()

	_, err := Load()
	if err == nil {
		t.Fatal("expected error for port 0")
	}
}

func TestLoad_InvalidPort_TooHigh(t *testing.T) {
	os.Setenv("DATABASE_URL", "postgres://localhost")
	os.Setenv("CLERK_SECRET_KEY", "sk_test")
	os.Setenv("REDIS_URL", "redis://localhost")
	os.Setenv("PORT", "70000")
	defer func() {
		os.Unsetenv("DATABASE_URL")
		os.Unsetenv("CLERK_SECRET_KEY")
		os.Unsetenv("REDIS_URL")
		os.Unsetenv("PORT")
	}()

	_, err := Load()
	if err == nil {
		t.Fatal("expected error for port > 65535")
	}
}

func TestLoad_ValidPort_Boundaries(t *testing.T) {
	tests := []struct {
		name string
		port string
	}{
		{"min port", "1"},
		{"max port", "65535"},
		{"common https", "443"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			os.Setenv("DATABASE_URL", "postgres://localhost")
			os.Setenv("CLERK_SECRET_KEY", "sk_test")
			os.Setenv("REDIS_URL", "redis://localhost")
			os.Setenv("PORT", tt.port)
			defer func() {
				os.Unsetenv("DATABASE_URL")
				os.Unsetenv("CLERK_SECRET_KEY")
				os.Unsetenv("REDIS_URL")
				os.Unsetenv("PORT")
			}()

			cfg, err := Load()
			if err != nil {
				t.Fatalf("unexpected error for port %s: %v", tt.port, err)
			}
			if cfg.Port != tt.port {
				t.Errorf("expected %s, got %s", tt.port, cfg.Port)
			}
		})
	}
}

// --- DB_MAX_CONNS tests ---

func TestLoad_DBMaxConns_Default(t *testing.T) {
	os.Setenv("DATABASE_URL", "postgres://localhost")
	os.Setenv("CLERK_SECRET_KEY", "sk_test")
	os.Setenv("REDIS_URL", "redis://localhost")
	os.Unsetenv("DB_MAX_CONNS")
	defer func() {
		os.Unsetenv("DATABASE_URL")
		os.Unsetenv("CLERK_SECRET_KEY")
		os.Unsetenv("REDIS_URL")
	}()

	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.DBMaxConns != 10 {
		t.Errorf("expected default DB_MAX_CONNS=10, got %d", cfg.DBMaxConns)
	}
}

func TestLoad_DBMaxConns_Custom(t *testing.T) {
	os.Setenv("DATABASE_URL", "postgres://localhost")
	os.Setenv("CLERK_SECRET_KEY", "sk_test")
	os.Setenv("REDIS_URL", "redis://localhost")
	os.Setenv("DB_MAX_CONNS", "25")
	defer func() {
		os.Unsetenv("DATABASE_URL")
		os.Unsetenv("CLERK_SECRET_KEY")
		os.Unsetenv("REDIS_URL")
		os.Unsetenv("DB_MAX_CONNS")
	}()

	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.DBMaxConns != 25 {
		t.Errorf("expected DB_MAX_CONNS=25, got %d", cfg.DBMaxConns)
	}
}

func TestLoad_DBMaxConns_Invalid(t *testing.T) {
	os.Setenv("DATABASE_URL", "postgres://localhost")
	os.Setenv("CLERK_SECRET_KEY", "sk_test")
	os.Setenv("REDIS_URL", "redis://localhost")
	os.Setenv("DB_MAX_CONNS", "0")
	defer func() {
		os.Unsetenv("DATABASE_URL")
		os.Unsetenv("CLERK_SECRET_KEY")
		os.Unsetenv("REDIS_URL")
		os.Unsetenv("DB_MAX_CONNS")
	}()

	_, err := Load()
	if err == nil {
		t.Fatal("expected error for DB_MAX_CONNS=0")
	}
}
