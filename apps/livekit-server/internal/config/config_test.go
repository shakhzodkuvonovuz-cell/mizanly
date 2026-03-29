package config

import (
	"os"
	"testing"
)

func clearEnv() {
	for _, key := range []string{
		"LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "LIVEKIT_HOST",
		"DATABASE_URL", "CLERK_SECRET_KEY", "REDIS_URL", "INTERNAL_SERVICE_KEY",
		"R2_ACCESS_KEY", "R2_SECRET_KEY", "R2_BUCKET", "R2_ENDPOINT",
		"SENTRY_DSN", "PORT",
	} {
		os.Unsetenv(key)
	}
}

func setRequiredEnv() {
	os.Setenv("LIVEKIT_API_KEY", "devkey")
	os.Setenv("LIVEKIT_API_SECRET", "devsecret")
	os.Setenv("LIVEKIT_HOST", "wss://test.livekit.cloud")
	os.Setenv("DATABASE_URL", "postgres://localhost/test")
	os.Setenv("CLERK_SECRET_KEY", "sk_test_xxx")
	os.Setenv("REDIS_URL", "redis://localhost:6379")
	os.Setenv("INTERNAL_SERVICE_KEY", "test-internal-key")
}

func TestLoad_MissingRequired(t *testing.T) {
	clearEnv()
	defer clearEnv()

	_, err := Load()
	if err == nil {
		t.Fatal("expected error for missing required env vars")
	}
}

func TestLoad_MissingEach(t *testing.T) {
	required := []string{
		"LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "LIVEKIT_HOST",
		"DATABASE_URL", "CLERK_SECRET_KEY", "REDIS_URL", "INTERNAL_SERVICE_KEY",
	}
	for _, key := range required {
		t.Run(key, func(t *testing.T) {
			clearEnv()
			setRequiredEnv()
			os.Unsetenv(key)
			defer clearEnv()

			_, err := Load()
			if err == nil {
				t.Fatalf("expected error when %s is missing", key)
			}
		})
	}
}

func TestLoad_AllPresent(t *testing.T) {
	clearEnv()
	setRequiredEnv()
	defer clearEnv()

	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.LiveKitAPIKey != "devkey" {
		t.Errorf("expected devkey, got %s", cfg.LiveKitAPIKey)
	}
	if cfg.Port != "8081" {
		t.Errorf("expected default port 8081, got %s", cfg.Port)
	}
	if cfg.R2Bucket != "mizanly-media" {
		t.Errorf("expected default bucket mizanly-media, got %s", cfg.R2Bucket)
	}
}

func TestLoad_CustomPort(t *testing.T) {
	clearEnv()
	setRequiredEnv()
	os.Setenv("PORT", "9090")
	defer clearEnv()

	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.Port != "9090" {
		t.Errorf("expected 9090, got %s", cfg.Port)
	}
}
