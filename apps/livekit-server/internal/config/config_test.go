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
		"DB_MAX_CONNS", "TOKEN_TTL_SECONDS", "MAX_GROUP_PARTICIPANTS",
		"MAX_BROADCAST_VIEWERS", "ROOM_EMPTY_TIMEOUT_SECONDS",
		"CLEANUP_INTERVAL_SECONDS", "STALE_RING_TIMEOUT_SECONDS",
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

// [G06-#16 fix] Port validation tests
func TestLoad_InvalidPort_NotNumeric(t *testing.T) {
	clearEnv()
	setRequiredEnv()
	os.Setenv("PORT", "abc")
	defer clearEnv()

	_, err := Load()
	if err == nil {
		t.Fatal("expected error for non-numeric port")
	}
}

func TestLoad_InvalidPort_Zero(t *testing.T) {
	clearEnv()
	setRequiredEnv()
	os.Setenv("PORT", "0")
	defer clearEnv()

	_, err := Load()
	if err == nil {
		t.Fatal("expected error for port 0")
	}
}

func TestLoad_InvalidPort_TooHigh(t *testing.T) {
	clearEnv()
	setRequiredEnv()
	os.Setenv("PORT", "70000")
	defer clearEnv()

	_, err := Load()
	if err == nil {
		t.Fatal("expected error for port > 65535")
	}
}

func TestLoad_InvalidPort_Negative(t *testing.T) {
	clearEnv()
	setRequiredEnv()
	os.Setenv("PORT", "-1")
	defer clearEnv()

	_, err := Load()
	if err == nil {
		t.Fatal("expected error for negative port")
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
			clearEnv()
			setRequiredEnv()
			os.Setenv("PORT", tt.port)
			defer clearEnv()

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

// --- Tunable parameter tests ---

func TestLoad_TunableDefaults(t *testing.T) {
	clearEnv()
	setRequiredEnv()
	defer clearEnv()

	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.DBMaxConns != 10 {
		t.Errorf("expected default DBMaxConns=10, got %d", cfg.DBMaxConns)
	}
	if cfg.TokenTTL.Seconds() != 7200 {
		t.Errorf("expected default TokenTTL=7200s, got %v", cfg.TokenTTL)
	}
	if cfg.MaxGroupParticipants != 100 {
		t.Errorf("expected default MaxGroupParticipants=100, got %d", cfg.MaxGroupParticipants)
	}
	if cfg.MaxBroadcastViewers != 10000 {
		t.Errorf("expected default MaxBroadcastViewers=10000, got %d", cfg.MaxBroadcastViewers)
	}
	if cfg.RoomEmptyTimeout != 300 {
		t.Errorf("expected default RoomEmptyTimeout=300, got %d", cfg.RoomEmptyTimeout)
	}
	if cfg.CleanupIntervalSecs != 30 {
		t.Errorf("expected default CleanupIntervalSecs=30, got %d", cfg.CleanupIntervalSecs)
	}
	if cfg.StaleRingTimeoutSecs != 60 {
		t.Errorf("expected default StaleRingTimeoutSecs=60, got %d", cfg.StaleRingTimeoutSecs)
	}
}

func TestLoad_TunableCustom(t *testing.T) {
	clearEnv()
	setRequiredEnv()
	os.Setenv("DB_MAX_CONNS", "25")
	os.Setenv("TOKEN_TTL_SECONDS", "3600")
	os.Setenv("MAX_GROUP_PARTICIPANTS", "50")
	os.Setenv("MAX_BROADCAST_VIEWERS", "5000")
	os.Setenv("ROOM_EMPTY_TIMEOUT_SECONDS", "600")
	os.Setenv("CLEANUP_INTERVAL_SECONDS", "60")
	os.Setenv("STALE_RING_TIMEOUT_SECONDS", "120")
	defer clearEnv()

	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.DBMaxConns != 25 {
		t.Errorf("expected DBMaxConns=25, got %d", cfg.DBMaxConns)
	}
	if cfg.TokenTTL.Seconds() != 3600 {
		t.Errorf("expected TokenTTL=3600s, got %v", cfg.TokenTTL)
	}
	if cfg.MaxGroupParticipants != 50 {
		t.Errorf("expected MaxGroupParticipants=50, got %d", cfg.MaxGroupParticipants)
	}
	if cfg.MaxBroadcastViewers != 5000 {
		t.Errorf("expected MaxBroadcastViewers=5000, got %d", cfg.MaxBroadcastViewers)
	}
	if cfg.RoomEmptyTimeout != 600 {
		t.Errorf("expected RoomEmptyTimeout=600, got %d", cfg.RoomEmptyTimeout)
	}
	if cfg.CleanupIntervalSecs != 60 {
		t.Errorf("expected CleanupIntervalSecs=60, got %d", cfg.CleanupIntervalSecs)
	}
	if cfg.StaleRingTimeoutSecs != 120 {
		t.Errorf("expected StaleRingTimeoutSecs=120, got %d", cfg.StaleRingTimeoutSecs)
	}
}

func TestLoad_DBMaxConns_Invalid(t *testing.T) {
	clearEnv()
	setRequiredEnv()
	os.Setenv("DB_MAX_CONNS", "0")
	defer clearEnv()

	_, err := Load()
	if err == nil {
		t.Fatal("expected error for DB_MAX_CONNS=0")
	}
}

func TestLoad_TokenTTL_TooLow(t *testing.T) {
	clearEnv()
	setRequiredEnv()
	os.Setenv("TOKEN_TTL_SECONDS", "30")
	defer clearEnv()

	_, err := Load()
	if err == nil {
		t.Fatal("expected error for TOKEN_TTL_SECONDS=30 (below 60)")
	}
}

func TestLoad_CleanupInterval_TooLow(t *testing.T) {
	clearEnv()
	setRequiredEnv()
	os.Setenv("CLEANUP_INTERVAL_SECONDS", "2")
	defer clearEnv()

	_, err := Load()
	if err == nil {
		t.Fatal("expected error for CLEANUP_INTERVAL_SECONDS=2 (below 5)")
	}
}
