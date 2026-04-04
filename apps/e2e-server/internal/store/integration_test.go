//go:build integration

// Package store_test contains integration tests that run against a real PostgreSQL database.
//
// These tests are excluded from normal builds. Run with:
//
//	TEST_DATABASE_URL=postgres://... go test -tags=integration ./internal/store/... -v -count=1
//
// CI runs these automatically with a provisioned Neon branch.
// Locally, use a test database — NEVER run against production.
package store_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/mizanly/e2e-server/internal/store"
)

func getTestDB(t *testing.T) string {
	t.Helper()
	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL == "" {
		t.Skip("TEST_DATABASE_URL not set — skipping integration test")
	}
	return dbURL
}

// TestIntegrationStoreConnect verifies we can connect to the real database
// and that the pool configuration (SimpleProtocol for Neon) works.
func TestIntegrationStoreConnect(t *testing.T) {
	dbURL := getTestDB(t)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// e2e-server store.New requires (ctx, dbURL, transparencySigningKeyB64)
	s, err := store.New(ctx, dbURL, "")
	if err != nil {
		t.Fatalf("Failed to connect to test DB: %v", err)
	}
	defer s.Close()

	t.Log("Successfully connected to test database")
}

// TestIntegrationStoreHealth verifies the Health endpoint against a real database.
func TestIntegrationStoreHealth(t *testing.T) {
	dbURL := getTestDB(t)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	s, err := store.New(ctx, dbURL, "")
	if err != nil {
		t.Fatalf("Failed to connect to test DB: %v", err)
	}
	defer s.Close()

	if err := s.Health(ctx); err != nil {
		t.Fatalf("Health check failed: %v", err)
	}

	t.Log("Health check passed against real database")
}

// TestIntegrationStoreRejectsBadURL verifies that invalid URLs produce
// meaningful errors rather than panicking.
func TestIntegrationStoreRejectsBadURL(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := store.New(ctx, "postgres://invalid:5432/nonexistent", "")
	if err == nil {
		t.Fatal("Expected error for invalid database URL, got nil")
	}

	t.Logf("Got expected error: %v", err)
}
