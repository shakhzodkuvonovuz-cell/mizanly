# LiveKit Calling System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace custom P2P WebRTC with LiveKit SFU. Build Telegram-level calling: 1:1, group (30 video + unlimited audio), E2EE, CallKit, noise suppression, screen sharing, PiP, recording, broadcast.

**Architecture:** Go microservice (`apps/livekit-server/`) handles tokens, rooms, webhooks, egress, ingress. Mobile uses `@livekit/react-native`. LiveKit Cloud is the SFU. All call state in existing Neon PostgreSQL via pgx.

**Tech Stack:** Go 1.26 + chi + pgx + livekit-server-sdk-go | React Native + @livekit/react-native + react-native-callkeep | LiveKit Cloud | Neon PostgreSQL | Cloudflare R2

---

## Phase 1: Complete Calling Product

### Task 1: Prisma Schema — Add LiveKit Fields

**Files:**
- Modify: `apps/api/prisma/schema.prisma:2418-2437` (CallSession model)

**Step 1: Add LiveKit fields to CallSession**

Add these fields after `screenShareUser` relation (line 2428):

```prisma
model CallSession {
  id                String            @id @default(cuid())
  callType          CallType
  status            CallStatus        @default(RINGING)
  startedAt         DateTime?
  endedAt           DateTime?
  duration          Int?
  maxParticipants   Int               @default(2)
  isScreenSharing   Boolean           @default(false)
  screenShareUserId String?
  screenShareUser   User?             @relation("callScreenShare", fields: [screenShareUserId], references: [id], onDelete: SetNull)
  livekitRoomName   String?
  livekitRoomSid    String?
  recordingUrl      String?
  broadcastType     String?           @db.VarChar(10)
  ingressId         String?
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt
  participants      CallParticipant[]

  @@index([status])
  @@index([createdAt])
  @@index([endedAt])
  @@index([livekitRoomName])
  @@map("call_sessions")
}
```

Also add `BROADCAST` to CallType enum:

```prisma
enum CallType {
  VOICE
  VIDEO
  BROADCAST
}
```

**Step 2: Generate and apply migration**

```bash
cd apps/api && npx prisma migrate dev --name add-livekit-fields
```

Expected: Migration applies, Prisma client regenerated.

**Step 3: Verify API still compiles**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: 0 errors.

**Step 4: Commit**

```bash
git add apps/api/prisma/
git commit -m "schema: add LiveKit fields to CallSession + BROADCAST call type"
```

---

### Task 2: Go Service — Project Scaffold

**Files:**
- Create: `apps/livekit-server/go.mod`
- Create: `apps/livekit-server/cmd/server/main.go`
- Create: `apps/livekit-server/internal/config/config.go`
- Create: `apps/livekit-server/internal/config/config_test.go`

**Step 1: Write config test**

```go
// apps/livekit-server/internal/config/config_test.go
package config

import (
	"os"
	"testing"
)

func TestLoadConfig_MissingRequired(t *testing.T) {
	os.Clearenv()
	_, err := Load()
	if err == nil {
		t.Fatal("expected error for missing required env vars")
	}
}

func TestLoadConfig_AllPresent(t *testing.T) {
	os.Setenv("LIVEKIT_API_KEY", "devkey")
	os.Setenv("LIVEKIT_API_SECRET", "devsecret")
	os.Setenv("LIVEKIT_HOST", "wss://test.livekit.cloud")
	os.Setenv("DATABASE_URL", "postgres://localhost/test")
	os.Setenv("CLERK_SECRET_KEY", "sk_test_xxx")
	os.Setenv("REDIS_URL", "redis://localhost:6379")
	defer os.Clearenv()

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
}
```

**Step 2: Run test to verify it fails**

```bash
cd apps/livekit-server && go test ./internal/config/ -v
```

Expected: FAIL (package does not exist yet)

**Step 3: Initialize module and write config**

```bash
cd apps/livekit-server && go mod init github.com/mizanly/livekit-server
```

```go
// apps/livekit-server/internal/config/config.go
package config

import (
	"errors"
	"os"
)

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
	SentryDSN        string
	Port             string
}

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
		R2Bucket:         os.Getenv("R2_BUCKET"),
		R2Endpoint:       os.Getenv("R2_ENDPOINT"),
		SentryDSN:        os.Getenv("SENTRY_DSN"),
		Port:             envOrDefault("PORT", "8081"),
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
	return cfg, nil
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/livekit-server && go test ./internal/config/ -v
```

Expected: PASS (2 tests)

**Step 5: Write main.go scaffold**

```go
// apps/livekit-server/cmd/server/main.go
package main

import (
	"context"
	"crypto/tls"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/clerk/clerk-sdk-go/v2"
	"github.com/getsentry/sentry-go"
	sentryhttp "github.com/getsentry/sentry-go/http"
	"github.com/redis/go-redis/v9"

	"github.com/mizanly/livekit-server/internal/config"
	"github.com/mizanly/livekit-server/internal/handler"
	"github.com/mizanly/livekit-server/internal/middleware"
	"github.com/mizanly/livekit-server/internal/store"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

	cfg, err := config.Load()
	if err != nil {
		logger.Error("config load failed", "error", err)
		os.Exit(1)
	}

	// Sentry
	if cfg.SentryDSN != "" {
		if err := sentry.Init(sentry.ClientOptions{
			Dsn:              cfg.SentryDSN,
			TracesSampleRate: 0.1,
		}); err != nil {
			logger.Error("sentry init failed", "error", err)
		}
		defer sentry.Flush(2 * time.Second)
	}

	// Clerk
	clerk.SetKey(cfg.ClerkSecretKey)

	// PostgreSQL
	ctx := context.Background()
	db, err := store.New(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("database connection failed", "error", err)
		os.Exit(1)
	}
	defer db.Close()
	logger.Info("connected to PostgreSQL")

	// Redis
	redisOpt, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		logger.Error("parse REDIS_URL failed", "error", err)
		os.Exit(1)
	}
	if redisOpt.TLSConfig == nil {
		redisOpt.TLSConfig = &tls.Config{MinVersion: tls.VersionTLS12}
	}
	rdb := redis.NewClient(redisOpt)
	if err := rdb.Ping(ctx).Err(); err != nil {
		logger.Error("redis connection failed", "error", err)
		os.Exit(1)
	}
	defer rdb.Close()
	logger.Info("connected to Redis")

	// Handlers
	rl := middleware.NewRateLimiter(rdb)
	h := handler.New(db, rdb, rl, cfg, logger)
	sentryHandler := sentryhttp.New(sentryhttp.Options{Repanic: true})

	// Security headers
	securityHeaders := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("X-Content-Type-Options", "nosniff")
			w.Header().Set("X-Frame-Options", "DENY")
			w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
			next.ServeHTTP(w, r)
		})
	}

	// Routes
	mux := http.NewServeMux()
	auth := middleware.RequireAuth()

	// Health
	mux.HandleFunc("/health", h.HandleHealth)

	// Token
	mux.Handle("POST /api/v1/calls/token", auth(sentryHandler.Handle(http.HandlerFunc(h.HandleCreateToken))))

	// Rooms
	mux.Handle("POST /api/v1/calls/rooms", auth(sentryHandler.Handle(http.HandlerFunc(h.HandleCreateRoom))))
	mux.Handle("DELETE /api/v1/calls/rooms/{id}", auth(sentryHandler.Handle(http.HandlerFunc(h.HandleDeleteRoom))))
	mux.Handle("GET /api/v1/calls/rooms/{id}/participants", auth(sentryHandler.Handle(http.HandlerFunc(h.HandleListParticipants))))
	mux.Handle("DELETE /api/v1/calls/rooms/{roomId}/participants/{participantId}", auth(sentryHandler.Handle(http.HandlerFunc(h.HandleKickParticipant))))
	mux.Handle("POST /api/v1/calls/rooms/{id}/mute", auth(sentryHandler.Handle(http.HandlerFunc(h.HandleMuteParticipant))))

	// Call history
	mux.Handle("GET /api/v1/calls/history", auth(sentryHandler.Handle(http.HandlerFunc(h.HandleGetHistory))))
	mux.Handle("GET /api/v1/calls/active", auth(sentryHandler.Handle(http.HandlerFunc(h.HandleGetActiveCall))))

	// Egress (recording)
	mux.Handle("POST /api/v1/calls/egress/start", auth(sentryHandler.Handle(http.HandlerFunc(h.HandleStartEgress))))
	mux.Handle("POST /api/v1/calls/egress/stop", auth(sentryHandler.Handle(http.HandlerFunc(h.HandleStopEgress))))

	// Ingress (broadcast)
	mux.Handle("POST /api/v1/calls/ingress/create", auth(sentryHandler.Handle(http.HandlerFunc(h.HandleCreateIngress))))
	mux.Handle("DELETE /api/v1/calls/ingress/{id}", auth(sentryHandler.Handle(http.HandlerFunc(h.HandleDeleteIngress))))

	// Webhooks (no auth — validated via HMAC)
	mux.Handle("POST /api/v1/webhooks/livekit", sentryHandler.Handle(http.HandlerFunc(h.HandleWebhook)))

	// Server
	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           securityHeaders(mux),
		ReadTimeout:       10 * time.Second,
		ReadHeaderTimeout: 5 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    1 << 16,
	}

	go func() {
		logger.Info("livekit server listening", "port", cfg.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	logger.Info("shutting down...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("shutdown error", "error", err)
	}
	logger.Info("server stopped")
}
```

**Step 6: Add dependencies**

```bash
cd apps/livekit-server && go get github.com/livekit/server-sdk-go/v2 github.com/livekit/protocol github.com/jackc/pgx/v5 github.com/redis/go-redis/v9 github.com/clerk/clerk-sdk-go/v2 github.com/getsentry/sentry-go
```

**Step 7: Commit**

```bash
git add apps/livekit-server/
git commit -m "feat(livekit): scaffold Go service — config, main, dependencies"
```

---

### Task 3: Go Service — Database Store

**Files:**
- Create: `apps/livekit-server/internal/store/store.go`
- Create: `apps/livekit-server/internal/store/store_test.go`
- Create: `apps/livekit-server/internal/model/types.go`

**Step 1: Write model types**

```go
// apps/livekit-server/internal/model/types.go
package model

import "time"

type CallSession struct {
	ID                string     `json:"id"`
	CallType          string     `json:"callType"`
	Status            string     `json:"status"`
	StartedAt         *time.Time `json:"startedAt"`
	EndedAt           *time.Time `json:"endedAt"`
	Duration          *int       `json:"duration"`
	MaxParticipants   int        `json:"maxParticipants"`
	IsScreenSharing   bool       `json:"isScreenSharing"`
	ScreenShareUserId *string    `json:"screenShareUserId"`
	LivekitRoomName   *string    `json:"livekitRoomName"`
	LivekitRoomSid    *string    `json:"livekitRoomSid"`
	RecordingUrl      *string    `json:"recordingUrl"`
	BroadcastType     *string    `json:"broadcastType"`
	IngressId         *string    `json:"ingressId"`
	CreatedAt         time.Time  `json:"createdAt"`
	UpdatedAt         time.Time  `json:"updatedAt"`
	Participants      []CallParticipant `json:"participants"`
}

type CallParticipant struct {
	SessionID string     `json:"sessionId"`
	UserID    string     `json:"userId"`
	Role      string     `json:"role"`
	JoinedAt  time.Time  `json:"joinedAt"`
	LeftAt    *time.Time `json:"leftAt"`
	User      *UserBrief `json:"user,omitempty"`
}

type UserBrief struct {
	ID          string  `json:"id"`
	Username    *string `json:"username"`
	DisplayName *string `json:"displayName"`
	AvatarUrl   *string `json:"avatarUrl"`
}

type CreateRoomRequest struct {
	TargetUserID   string   `json:"targetUserId"`
	ParticipantIDs []string `json:"participantIds"`
	CallType       string   `json:"callType"`
	ConversationID string   `json:"conversationId"`
}

type TokenRequest struct {
	RoomName string `json:"roomName"`
	SessionID string `json:"sessionId"`
}

type EgressRequest struct {
	SessionID string `json:"sessionId"`
	RoomName  string `json:"roomName"`
}

type IngressRequest struct {
	SessionID    string `json:"sessionId"`
	RoomName     string `json:"roomName"`
	InputType    string `json:"inputType"` // "rtmp" or "whip"
	BroadcasterID string `json:"broadcasterId"`
}

type PaginatedResult struct {
	Data    []CallSession `json:"data"`
	Meta    PaginationMeta `json:"meta"`
}

type PaginationMeta struct {
	Cursor  *string `json:"cursor"`
	HasMore bool    `json:"hasMore"`
}
```

**Step 2: Write store with tests**

```go
// apps/livekit-server/internal/store/store.go
package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mizanly/livekit-server/internal/model"
)

type Store struct {
	pool *pgxpool.Pool
}

func New(ctx context.Context, databaseURL string) (*Store, error) {
	if databaseURL == "" {
		return nil, errors.New("DATABASE_URL is required")
	}
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}
	cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	cfg.MaxConns = 10
	cfg.MinConns = 1
	cfg.MaxConnLifetime = 30 * time.Minute
	cfg.MaxConnIdleTime = 5 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}
	return &Store{pool: pool}, nil
}

func (s *Store) Close() { s.pool.Close() }

func (s *Store) Health(ctx context.Context) error { return s.pool.Ping(ctx) }

// CheckBlocked returns true if either user has blocked the other.
func (s *Store) CheckBlocked(ctx context.Context, userA, userB string) (bool, error) {
	var exists bool
	err := s.pool.QueryRow(ctx,
		`SELECT EXISTS(
			SELECT 1 FROM blocks
			WHERE ("blockerId" = $1 AND "blockedId" = $2)
			   OR ("blockerId" = $2 AND "blockedId" = $1)
		)`, userA, userB,
	).Scan(&exists)
	return exists, err
}

// CheckUserInActiveCall returns true if user is in RINGING or ACTIVE call.
func (s *Store) CheckUserInActiveCall(ctx context.Context, userID string) (bool, error) {
	var exists bool
	err := s.pool.QueryRow(ctx,
		`SELECT EXISTS(
			SELECT 1 FROM call_participants cp
			JOIN call_sessions cs ON cs.id = cp."sessionId"
			WHERE cp."userId" = $1 AND cp."leftAt" IS NULL
			AND cs.status IN ('RINGING', 'ACTIVE')
		)`, userID,
	).Scan(&exists)
	return exists, err
}

// CreateCallSession creates a call session with participants and LiveKit room info.
func (s *Store) CreateCallSession(ctx context.Context, callType, livekitRoomName string, callerID string, participantIDs []string, maxParticipants int) (*model.CallSession, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	var session model.CallSession
	err = tx.QueryRow(ctx,
		`INSERT INTO call_sessions (id, "callType", status, "maxParticipants", "livekitRoomName", "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, $1, 'RINGING', $2, $3, NOW(), NOW())
		 RETURNING id, "callType", status, "maxParticipants", "livekitRoomName", "createdAt", "updatedAt"`,
		callType, maxParticipants, livekitRoomName,
	).Scan(&session.ID, &session.CallType, &session.Status, &session.MaxParticipants,
		&session.LivekitRoomName, &session.CreatedAt, &session.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("insert call session: %w", err)
	}

	// Insert caller
	_, err = tx.Exec(ctx,
		`INSERT INTO call_participants ("sessionId", "userId", role, "joinedAt")
		 VALUES ($1, $2, 'caller', NOW())`,
		session.ID, callerID,
	)
	if err != nil {
		return nil, fmt.Errorf("insert caller: %w", err)
	}

	// Insert other participants
	for _, pid := range participantIDs {
		if pid == callerID {
			continue
		}
		_, err = tx.Exec(ctx,
			`INSERT INTO call_participants ("sessionId", "userId", role, "joinedAt")
			 VALUES ($1, $2, 'callee', NOW())`,
			session.ID, pid,
		)
		if err != nil {
			return nil, fmt.Errorf("insert participant %s: %w", pid, err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return &session, nil
}

// UpdateSessionStatus updates a call session's status.
func (s *Store) UpdateSessionStatus(ctx context.Context, sessionID, status string) error {
	now := time.Now()
	var query string
	switch status {
	case "ACTIVE":
		query = `UPDATE call_sessions SET status = $2, "startedAt" = $3, "updatedAt" = $3 WHERE id = $1`
	case "ENDED", "MISSED", "DECLINED":
		query = `UPDATE call_sessions SET status = $2, "endedAt" = $3, "updatedAt" = $3 WHERE id = $1`
	default:
		query = `UPDATE call_sessions SET status = $2, "updatedAt" = $3 WHERE id = $1`
	}
	_, err := s.pool.Exec(ctx, query, sessionID, status, now)
	return err
}

// UpdateSessionDuration sets the duration (in seconds) and ends the session.
func (s *Store) UpdateSessionDuration(ctx context.Context, sessionID string, duration int) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE call_sessions SET duration = $2, status = 'ENDED', "endedAt" = NOW(), "updatedAt" = NOW() WHERE id = $1`,
		sessionID, duration,
	)
	return err
}

// UpdateSessionLivekitSid sets the LiveKit room SID (from webhook).
func (s *Store) UpdateSessionLivekitSid(ctx context.Context, roomName, roomSid string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE call_sessions SET "livekitRoomSid" = $2, "updatedAt" = NOW() WHERE "livekitRoomName" = $1`,
		roomName, roomSid,
	)
	return err
}

// UpdateSessionRecordingUrl sets the recording URL after egress completes.
func (s *Store) UpdateSessionRecordingUrl(ctx context.Context, roomName, recordingUrl string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE call_sessions SET "recordingUrl" = $2, "updatedAt" = NOW() WHERE "livekitRoomName" = $1`,
		roomName, recordingUrl,
	)
	return err
}

// MarkParticipantLeft sets leftAt for a participant.
func (s *Store) MarkParticipantLeft(ctx context.Context, sessionID, userID string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE call_participants SET "leftAt" = NOW() WHERE "sessionId" = $1 AND "userId" = $2 AND "leftAt" IS NULL`,
		sessionID, userID,
	)
	return err
}

// MarkAllParticipantsLeft marks all participants as left.
func (s *Store) MarkAllParticipantsLeft(ctx context.Context, sessionID string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE call_participants SET "leftAt" = NOW() WHERE "sessionId" = $1 AND "leftAt" IS NULL`,
		sessionID,
	)
	return err
}

// GetSessionByRoomName finds a session by LiveKit room name.
func (s *Store) GetSessionByRoomName(ctx context.Context, roomName string) (*model.CallSession, error) {
	var session model.CallSession
	err := s.pool.QueryRow(ctx,
		`SELECT id, "callType", status, "startedAt", "endedAt", duration, "maxParticipants",
		        "livekitRoomName", "livekitRoomSid", "recordingUrl", "createdAt", "updatedAt"
		 FROM call_sessions WHERE "livekitRoomName" = $1`,
		roomName,
	).Scan(&session.ID, &session.CallType, &session.Status, &session.StartedAt,
		&session.EndedAt, &session.Duration, &session.MaxParticipants,
		&session.LivekitRoomName, &session.LivekitRoomSid, &session.RecordingUrl,
		&session.CreatedAt, &session.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &session, err
}

// GetSessionByID fetches a session with participants.
func (s *Store) GetSessionByID(ctx context.Context, sessionID string) (*model.CallSession, error) {
	var session model.CallSession
	err := s.pool.QueryRow(ctx,
		`SELECT id, "callType", status, "startedAt", "endedAt", duration, "maxParticipants",
		        "livekitRoomName", "livekitRoomSid", "recordingUrl", "createdAt", "updatedAt"
		 FROM call_sessions WHERE id = $1`,
		sessionID,
	).Scan(&session.ID, &session.CallType, &session.Status, &session.StartedAt,
		&session.EndedAt, &session.Duration, &session.MaxParticipants,
		&session.LivekitRoomName, &session.LivekitRoomSid, &session.RecordingUrl,
		&session.CreatedAt, &session.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	// Fetch participants with user info
	rows, err := s.pool.Query(ctx,
		`SELECT cp."sessionId", cp."userId", cp.role, cp."joinedAt", cp."leftAt",
		        u.id, u.username, u."displayName", u."avatarUrl"
		 FROM call_participants cp
		 JOIN users u ON u.id = cp."userId"
		 WHERE cp."sessionId" = $1`,
		sessionID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var p model.CallParticipant
		var user model.UserBrief
		if err := rows.Scan(&p.SessionID, &p.UserID, &p.Role, &p.JoinedAt, &p.LeftAt,
			&user.ID, &user.Username, &user.DisplayName, &user.AvatarUrl); err != nil {
			return nil, err
		}
		p.User = &user
		session.Participants = append(session.Participants, p)
	}
	return &session, rows.Err()
}

// GetActiveCall returns the user's current RINGING or ACTIVE call.
func (s *Store) GetActiveCall(ctx context.Context, userID string) (*model.CallSession, error) {
	var sessionID string
	err := s.pool.QueryRow(ctx,
		`SELECT cp."sessionId" FROM call_participants cp
		 JOIN call_sessions cs ON cs.id = cp."sessionId"
		 WHERE cp."userId" = $1 AND cp."leftAt" IS NULL
		 AND cs.status IN ('RINGING', 'ACTIVE')
		 LIMIT 1`,
		userID,
	).Scan(&sessionID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return s.GetSessionByID(ctx, sessionID)
}

// GetHistory returns paginated call history for a user.
func (s *Store) GetHistory(ctx context.Context, userID string, cursor *string, limit int) (*model.PaginatedResult, error) {
	var query string
	var args []interface{}

	if cursor != nil {
		query = `SELECT DISTINCT cs.id, cs."callType", cs.status, cs."startedAt", cs."endedAt",
		                cs.duration, cs."maxParticipants", cs."livekitRoomName", cs."livekitRoomSid",
		                cs."recordingUrl", cs."createdAt", cs."updatedAt"
		         FROM call_sessions cs
		         JOIN call_participants cp ON cp."sessionId" = cs.id
		         WHERE cp."userId" = $1 AND cs.id < $2
		         ORDER BY cs."createdAt" DESC
		         LIMIT $3`
		args = []interface{}{userID, *cursor, limit + 1}
	} else {
		query = `SELECT DISTINCT cs.id, cs."callType", cs.status, cs."startedAt", cs."endedAt",
		                cs.duration, cs."maxParticipants", cs."livekitRoomName", cs."livekitRoomSid",
		                cs."recordingUrl", cs."createdAt", cs."updatedAt"
		         FROM call_sessions cs
		         JOIN call_participants cp ON cp."sessionId" = cs.id
		         WHERE cp."userId" = $1
		         ORDER BY cs."createdAt" DESC
		         LIMIT $2`
		args = []interface{}{userID, limit + 1}
	}

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []model.CallSession
	for rows.Next() {
		var s model.CallSession
		if err := rows.Scan(&s.ID, &s.CallType, &s.Status, &s.StartedAt, &s.EndedAt,
			&s.Duration, &s.MaxParticipants, &s.LivekitRoomName, &s.LivekitRoomSid,
			&s.RecordingUrl, &s.CreatedAt, &s.UpdatedAt); err != nil {
			return nil, err
		}
		sessions = append(sessions, s)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	hasMore := len(sessions) > limit
	if hasMore {
		sessions = sessions[:limit]
	}

	var cursorPtr *string
	if len(sessions) > 0 {
		last := sessions[len(sessions)-1].ID
		cursorPtr = &last
	}

	// Fetch participants for each session
	for i := range sessions {
		pRows, err := s.pool.Query(ctx,
			`SELECT cp."sessionId", cp."userId", cp.role, cp."joinedAt", cp."leftAt",
			        u.id, u.username, u."displayName", u."avatarUrl"
			 FROM call_participants cp
			 JOIN users u ON u.id = cp."userId"
			 WHERE cp."sessionId" = $1`,
			sessions[i].ID,
		)
		if err != nil {
			return nil, err
		}
		for pRows.Next() {
			var p model.CallParticipant
			var user model.UserBrief
			if err := pRows.Scan(&p.SessionID, &p.UserID, &p.Role, &p.JoinedAt, &p.LeftAt,
				&user.ID, &user.Username, &user.DisplayName, &user.AvatarUrl); err != nil {
				pRows.Close()
				return nil, err
			}
			p.User = &user
			sessions[i].Participants = append(sessions[i].Participants, p)
		}
		pRows.Close()
	}

	return &model.PaginatedResult{
		Data: sessions,
		Meta: model.PaginationMeta{Cursor: cursorPtr, HasMore: hasMore},
	}, nil
}
```

**Step 3: Verify it compiles**

```bash
cd apps/livekit-server && go build ./...
```

Expected: Compiles (handler package will be stubbed next).

**Step 4: Commit**

```bash
git add apps/livekit-server/
git commit -m "feat(livekit): database store — sessions, participants, history, block checks"
```

---

### Task 4: Go Service — Middleware (Auth + Rate Limit)

**Files:**
- Create: `apps/livekit-server/internal/middleware/auth.go`
- Create: `apps/livekit-server/internal/middleware/ratelimit.go`
- Create: `apps/livekit-server/internal/middleware/auth_test.go`

Copy the exact patterns from `apps/e2e-server/internal/middleware/` — same Clerk SDK, same Redis rate limiter. The auth middleware is identical. The rate limiter uses the same Lua scripts.

**Step 1: Write auth middleware** (same as e2e-server)

```go
// apps/livekit-server/internal/middleware/auth.go
// Identical to apps/e2e-server/internal/middleware/auth.go
```

**Step 2: Write rate limiter** (same as e2e-server but with call-specific limits)

```go
// apps/livekit-server/internal/middleware/ratelimit.go
// Same base as e2e-server, add:
// - CreateRoom: 10 per minute
// - Token: 30 per minute
// - Webhook: no limit (validated by HMAC)
```

**Step 3: Write auth test**

```go
// apps/livekit-server/internal/middleware/auth_test.go
// Test that RequireAuth rejects missing/invalid tokens
// Test that UserIDFromContext returns correct ID
```

**Step 4: Run tests**

```bash
cd apps/livekit-server && go test ./internal/middleware/ -v
```

**Step 5: Commit**

```bash
git add apps/livekit-server/internal/middleware/
git commit -m "feat(livekit): auth + rate limit middleware (Clerk + Redis)"
```

---

### Task 5: Go Service — Handler (Token + Room + Webhook)

**Files:**
- Create: `apps/livekit-server/internal/handler/handler.go`
- Create: `apps/livekit-server/internal/handler/handler_test.go`

This is the core task. The handler uses:
- `github.com/livekit/protocol/auth` for token generation
- `github.com/livekit/server-sdk-go/v2` for room management
- `github.com/livekit/protocol/webhook` for webhook validation

**Step 1: Write handler**

```go
// apps/livekit-server/internal/handler/handler.go
package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	lksdk "github.com/livekit/server-sdk-go/v2"
	lkauth "github.com/livekit/protocol/auth"
	"github.com/livekit/protocol/livekit"
	"github.com/livekit/protocol/webhook"
	"github.com/redis/go-redis/v9"

	"github.com/mizanly/livekit-server/internal/config"
	"github.com/mizanly/livekit-server/internal/middleware"
	"github.com/mizanly/livekit-server/internal/model"
	"github.com/mizanly/livekit-server/internal/store"
)

type Handler struct {
	db           *store.Store
	rdb          *redis.Client
	rl           *middleware.RateLimiter
	cfg          *config.Config
	logger       *slog.Logger
	roomClient   *lksdk.RoomServiceClient
	egressClient *lksdk.EgressClient
	ingressClient *lksdk.IngressClient
	authProvider *lkauth.SimpleKeyProvider
}

func New(db *store.Store, rdb *redis.Client, rl *middleware.RateLimiter, cfg *config.Config, logger *slog.Logger) *Handler {
	return &Handler{
		db:            db,
		rdb:           rdb,
		rl:            rl,
		cfg:           cfg,
		logger:        logger,
		roomClient:    lksdk.NewRoomServiceClient(cfg.LiveKitHost, cfg.LiveKitAPIKey, cfg.LiveKitAPISecret),
		egressClient:  lksdk.NewEgressClient(cfg.LiveKitHost, cfg.LiveKitAPIKey, cfg.LiveKitAPISecret),
		ingressClient: lksdk.NewIngressClient(cfg.LiveKitHost, cfg.LiveKitAPIKey, cfg.LiveKitAPISecret),
		authProvider:  lkauth.NewSimpleKeyProvider(cfg.LiveKitAPIKey, cfg.LiveKitAPISecret),
	}
}

func (h *Handler) HandleHealth(w http.ResponseWriter, r *http.Request) {
	if err := h.db.Health(r.Context()); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "unhealthy"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "healthy"})
}

// HandleCreateRoom creates a LiveKit room + DB session.
func (h *Handler) HandleCreateRoom(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	var req model.CreateRoomRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Validate call type
	if req.CallType != "VOICE" && req.CallType != "VIDEO" && req.CallType != "BROADCAST" {
		writeError(w, http.StatusBadRequest, "callType must be VOICE, VIDEO, or BROADCAST")
		return
	}

	// Determine participants
	var allParticipants []string
	if req.CallType == "BROADCAST" {
		allParticipants = []string{userID}
	} else if len(req.ParticipantIDs) > 0 {
		// Group call
		allParticipants = append([]string{userID}, req.ParticipantIDs...)
	} else if req.TargetUserID != "" {
		// 1:1 call
		allParticipants = []string{userID, req.TargetUserID}
	} else {
		writeError(w, http.StatusBadRequest, "targetUserId or participantIds required")
		return
	}

	// Block check for 1:1
	if req.TargetUserID != "" {
		blocked, err := h.db.CheckBlocked(r.Context(), userID, req.TargetUserID)
		if err != nil {
			h.logger.Error("block check failed", "error", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		if blocked {
			writeError(w, http.StatusForbidden, "cannot call this user")
			return
		}
	}

	// Check active call for all participants
	for _, pid := range allParticipants {
		inCall, err := h.db.CheckUserInActiveCall(r.Context(), pid)
		if err != nil {
			h.logger.Error("active call check failed", "error", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		if inCall {
			writeError(w, http.StatusConflict, fmt.Sprintf("user %s is already in a call", pid))
			return
		}
	}

	// Create LiveKit room
	roomName := fmt.Sprintf("call_%s_%d", userID[:8], time.Now().UnixMilli())
	maxParticipants := uint32(len(allParticipants))
	if req.CallType == "BROADCAST" {
		maxParticipants = 10000 // Broadcasts allow unlimited viewers
	}

	room, err := h.roomClient.CreateRoom(r.Context(), &livekit.CreateRoomRequest{
		Name:            roomName,
		EmptyTimeout:    5 * 60, // 5 min empty timeout
		MaxParticipants: maxParticipants,
	})
	if err != nil {
		h.logger.Error("create livekit room failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create room")
		return
	}

	// Create DB session
	session, err := h.db.CreateCallSession(r.Context(), req.CallType, roomName, userID, allParticipants, int(maxParticipants))
	if err != nil {
		h.logger.Error("create call session failed", "error", err)
		// Clean up LiveKit room
		h.roomClient.DeleteRoom(r.Context(), &livekit.DeleteRoomRequest{Room: roomName})
		writeError(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	// Generate token for caller
	token, err := h.createToken(roomName, userID, true)
	if err != nil {
		h.logger.Error("create token failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create token")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"data":    session,
		"token":   token,
		"room":    room,
		"success": true,
	})
}

// HandleCreateToken generates a LiveKit token for joining a room.
func (h *Handler) HandleCreateToken(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	var req model.TokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.RoomName == "" {
		writeError(w, http.StatusBadRequest, "roomName required")
		return
	}

	// Verify user is participant in this session
	session, err := h.db.GetSessionByRoomName(r.Context(), req.RoomName)
	if err != nil || session == nil {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}

	// For broadcasts, anyone can join as viewer
	isBroadcast := session.CallType == "BROADCAST"
	canPublish := !isBroadcast // viewers can't publish in broadcasts

	// For non-broadcasts, check participant
	if !isBroadcast {
		fullSession, err := h.db.GetSessionByID(r.Context(), session.ID)
		if err != nil || fullSession == nil {
			writeError(w, http.StatusNotFound, "session not found")
			return
		}
		isParticipant := false
		for _, p := range fullSession.Participants {
			if p.UserID == userID {
				isParticipant = true
				break
			}
		}
		if !isParticipant {
			writeError(w, http.StatusForbidden, "not a participant in this call")
			return
		}
	}

	token, err := h.createToken(req.RoomName, userID, canPublish)
	if err != nil {
		h.logger.Error("create token failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create token")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"token":   token,
		"success": true,
	})
}

// HandleDeleteRoom force-closes a room.
func (h *Handler) HandleDeleteRoom(w http.ResponseWriter, r *http.Request) {
	roomID := r.PathValue("id")
	session, err := h.db.GetSessionByRoomName(r.Context(), roomID)
	if err != nil || session == nil {
		writeError(w, http.StatusNotFound, "room not found")
		return
	}

	h.roomClient.DeleteRoom(r.Context(), &livekit.DeleteRoomRequest{Room: roomID})
	h.db.UpdateSessionStatus(r.Context(), session.ID, "ENDED")
	h.db.MarkAllParticipantsLeft(r.Context(), session.ID)

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

// HandleListParticipants lists participants in a room.
func (h *Handler) HandleListParticipants(w http.ResponseWriter, r *http.Request) {
	roomID := r.PathValue("id")
	res, err := h.roomClient.ListParticipants(r.Context(), &livekit.ListParticipantsRequest{Room: roomID})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list participants")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"data": res.Participants, "success": true})
}

// HandleKickParticipant removes a participant from a room.
func (h *Handler) HandleKickParticipant(w http.ResponseWriter, r *http.Request) {
	roomID := r.PathValue("roomId")
	participantID := r.PathValue("participantId")
	_, err := h.roomClient.RemoveParticipant(r.Context(), &livekit.RoomParticipantIdentity{
		Room:     roomID,
		Identity: participantID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to kick participant")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

// HandleMuteParticipant server-side mutes a track.
func (h *Handler) HandleMuteParticipant(w http.ResponseWriter, r *http.Request) {
	roomID := r.PathValue("id")
	var req struct {
		Identity string `json:"identity"`
		TrackSid string `json:"trackSid"`
		Muted    bool   `json:"muted"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	_, err := h.roomClient.MutePublishedTrack(r.Context(), &livekit.MuteRoomTrackRequest{
		Room:     roomID,
		Identity: req.Identity,
		TrackSid: req.TrackSid,
		Muted:    req.Muted,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to mute")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

// HandleGetHistory returns paginated call history.
func (h *Handler) HandleGetHistory(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	cursor := r.URL.Query().Get("cursor")
	var cursorPtr *string
	if cursor != "" {
		cursorPtr = &cursor
	}
	result, err := h.db.GetHistory(r.Context(), userID, cursorPtr, 20)
	if err != nil {
		h.logger.Error("get history failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"data": result.Data, "meta": result.Meta, "success": true})
}

// HandleGetActiveCall returns the user's current active call.
func (h *Handler) HandleGetActiveCall(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	session, err := h.db.GetActiveCall(r.Context(), userID)
	if err != nil {
		h.logger.Error("get active call failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"data": session, "success": true})
}

// HandleStartEgress starts recording a call to R2.
func (h *Handler) HandleStartEgress(w http.ResponseWriter, r *http.Request) {
	var req model.EgressRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	filepath := fmt.Sprintf("recordings/%s/{time}.mp4", req.RoomName)
	info, err := h.egressClient.StartRoomCompositeEgress(r.Context(), &livekit.RoomCompositeEgressRequest{
		RoomName: req.RoomName,
		Layout:   "speaker-light",
		Output: &livekit.RoomCompositeEgressRequest_File{
			File: &livekit.EncodedFileOutput{
				FileType: livekit.EncodedFileType_MP4,
				Filepath: filepath,
				Output: &livekit.EncodedFileOutput_S3{
					S3: &livekit.S3Upload{
						AccessKey:      h.cfg.R2AccessKey,
						Secret:         h.cfg.R2SecretKey,
						Bucket:         h.cfg.R2Bucket,
						Region:         "auto",
						Endpoint:       h.cfg.R2Endpoint,
						ForcePathStyle: true,
					},
				},
			},
		},
	})
	if err != nil {
		h.logger.Error("start egress failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to start recording")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"egressId": info.EgressId,
		"success":  true,
	})
}

// HandleStopEgress stops a recording.
func (h *Handler) HandleStopEgress(w http.ResponseWriter, r *http.Request) {
	var req struct {
		EgressID string `json:"egressId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	_, err := h.egressClient.StopEgress(r.Context(), &livekit.StopEgressRequest{
		EgressId: req.EgressID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to stop recording")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

// HandleCreateIngress creates an RTMP/WHIP ingress for broadcasting.
func (h *Handler) HandleCreateIngress(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	var req model.IngressRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	inputType := livekit.IngressInput_RTMP_INPUT
	if req.InputType == "whip" {
		inputType = livekit.IngressInput_WHIP_INPUT
	}
	enableTranscoding := true

	info, err := h.ingressClient.CreateIngress(r.Context(), &livekit.CreateIngressRequest{
		InputType:           inputType,
		Name:                fmt.Sprintf("broadcast-%s", req.RoomName),
		RoomName:            req.RoomName,
		ParticipantIdentity: userID,
		ParticipantName:     "Broadcaster",
		EnableTranscoding:   &enableTranscoding,
	})
	if err != nil {
		h.logger.Error("create ingress failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create ingress")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"ingressId": info.IngressId,
		"url":       info.Url,
		"streamKey": info.StreamKey,
		"success":   true,
	})
}

// HandleDeleteIngress ends a broadcast ingress.
func (h *Handler) HandleDeleteIngress(w http.ResponseWriter, r *http.Request) {
	ingressID := r.PathValue("id")
	_, err := h.ingressClient.DeleteIngress(r.Context(), &livekit.DeleteIngressRequest{
		IngressId: ingressID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete ingress")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

// HandleWebhook processes LiveKit webhook events.
func (h *Handler) HandleWebhook(w http.ResponseWriter, r *http.Request) {
	event, err := webhook.ReceiveWebhookEvent(r, h.authProvider)
	if err != nil {
		h.logger.Error("invalid webhook", "error", err)
		http.Error(w, "invalid webhook", http.StatusUnauthorized)
		return
	}

	ctx := r.Context()
	h.logger.Info("livekit webhook", "event", event.Event, "room", event.Room.GetName())

	switch event.GetEvent() {
	case "room_started":
		if event.Room != nil {
			h.db.UpdateSessionLivekitSid(ctx, event.Room.Name, event.Room.Sid)
		}

	case "room_finished":
		if event.Room != nil {
			session, err := h.db.GetSessionByRoomName(ctx, event.Room.Name)
			if err == nil && session != nil && session.Status != "ENDED" {
				// Calculate duration
				if session.StartedAt != nil {
					duration := int(time.Since(*session.StartedAt).Seconds())
					h.db.UpdateSessionDuration(ctx, session.ID, duration)
				} else {
					h.db.UpdateSessionStatus(ctx, session.ID, "MISSED")
				}
				h.db.MarkAllParticipantsLeft(ctx, session.ID)
			}
		}

	case "participant_joined":
		if event.Room != nil && event.Participant != nil {
			session, err := h.db.GetSessionByRoomName(ctx, event.Room.Name)
			if err == nil && session != nil {
				// If second participant joins a RINGING call, mark ACTIVE
				if session.Status == "RINGING" {
					h.db.UpdateSessionStatus(ctx, session.ID, "ACTIVE")
				}
			}
		}

	case "participant_left":
		if event.Room != nil && event.Participant != nil {
			session, err := h.db.GetSessionByRoomName(ctx, event.Room.Name)
			if err == nil && session != nil {
				h.db.MarkParticipantLeft(ctx, session.ID, event.Participant.Identity)
			}
		}

	case "egress_ended":
		if event.EgressInfo != nil && event.EgressInfo.RoomName != "" {
			// Extract recording URL from file results
			for _, result := range event.EgressInfo.FileResults {
				if result.Filename != "" {
					recordingUrl := fmt.Sprintf("https://%s.r2.cloudflarestorage.com/%s", h.cfg.R2Bucket, result.Filename)
					h.db.UpdateSessionRecordingUrl(ctx, event.EgressInfo.RoomName, recordingUrl)
					break
				}
			}
		}
	}

	w.WriteHeader(http.StatusOK)
}

// createToken generates a LiveKit access token.
func (h *Handler) createToken(roomName, identity string, canPublish bool) (string, error) {
	at := lkauth.NewAccessToken(h.cfg.LiveKitAPIKey, h.cfg.LiveKitAPISecret)
	grant := &lkauth.VideoGrant{
		RoomJoin:     true,
		Room:         roomName,
		CanPublish:   &canPublish,
		CanSubscribe: true,
	}
	at.SetVideoGrant(grant).
		SetIdentity(identity).
		SetValidFor(24 * time.Hour)

	return at.ToJWT()
}

// --- Helpers ---

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]interface{}{
		"error":   message,
		"success": false,
	})
}
```

**Step 2: Write handler tests**

```go
// apps/livekit-server/internal/handler/handler_test.go
// Test: HandleHealth returns 200
// Test: HandleCreateToken rejects empty roomName
// Test: HandleCreateRoom rejects missing targetUserId
// Test: HandleWebhook rejects invalid HMAC
// Test: Token generation produces valid JWT
```

**Step 3: Run tests**

```bash
cd apps/livekit-server && go test ./internal/... -v -count=1
```

**Step 4: Verify compilation**

```bash
cd apps/livekit-server && go build ./cmd/server/
```

**Step 5: Commit**

```bash
git add apps/livekit-server/
git commit -m "feat(livekit): handler — token, rooms, webhooks, egress, ingress"
```

---

### Task 6: Go Service — Dockerfile + Railway Config

**Files:**
- Create: `apps/livekit-server/Dockerfile`
- Create: `apps/livekit-server/railway.toml`

**Step 1: Write Dockerfile**

```dockerfile
# apps/livekit-server/Dockerfile
FROM golang:1.26-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /server ./cmd/server/

FROM alpine:3.19
RUN apk --no-cache add ca-certificates
COPY --from=builder /server /server
EXPOSE 8081
CMD ["/server"]
```

**Step 2: Write railway.toml**

```toml
# apps/livekit-server/railway.toml
[build]
builder = "dockerfile"
dockerfilePath = "Dockerfile"

[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

**Step 3: Commit**

```bash
git add apps/livekit-server/Dockerfile apps/livekit-server/railway.toml
git commit -m "feat(livekit): Dockerfile + Railway config"
```

---

### Task 7: Remove NestJS Calls Module + WebSocket Signaling

**Files:**
- Delete: `apps/api/src/modules/calls/calls.service.ts`
- Delete: `apps/api/src/modules/calls/calls.controller.ts`
- Delete: `apps/api/src/modules/calls/calls.module.ts`
- Delete: `apps/api/src/modules/calls/dto/`
- Modify: `apps/api/src/gateways/chat.gateway.ts` (remove lines 741-873)
- Modify: `apps/api/src/app.module.ts` (remove CallsModule import)

**Step 1: Remove call signaling from chat.gateway.ts**

Remove the 6 call-related `@SubscribeMessage` handlers:
- `call_initiate` (741-770)
- `call_answer` (772-797)
- `call_reject` (799-824)
- `call_end` (826-840)
- `call_signal` (842-873)

And their DTO imports from `chat-events.dto.ts`.

**Step 2: Remove CallsModule from app.module.ts**

Remove the import and the module from the `imports` array.

**Step 3: Delete calls module directory**

```bash
rm -rf apps/api/src/modules/calls/
```

**Step 4: Verify API compiles**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: 0 errors.

**Step 5: Run API tests**

```bash
cd apps/api && pnpm test
```

Expected: All passing (calls tests will be gone, other tests unaffected).

**Step 6: Commit**

```bash
git add apps/api/
git commit -m "refactor: remove NestJS calls module + WebSocket signaling (moved to Go)"
```

---

### Task 8: Remove useWebRTC Hook

**Files:**
- Delete: `apps/mobile/src/hooks/useWebRTC.ts`
- Modify: any files importing useWebRTC

**Step 1: Find all imports**

```bash
grep -r "useWebRTC" apps/mobile/src/ --include="*.ts" --include="*.tsx"
```

**Step 2: Remove hook file and update imports**

The call screen (`call/[id].tsx`) will be rewritten in Task 10 to use LiveKit. For now, remove the import and stub the hook usage.

**Step 3: Verify mobile compiles**

```bash
cd apps/mobile && npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add apps/mobile/
git commit -m "refactor: remove useWebRTC hook (replaced by LiveKit SDK)"
```

---

### Task 9: Mobile — Install LiveKit SDK + Configure Expo

**Files:**
- Modify: `apps/mobile/package.json`
- Modify: `apps/mobile/app.json` or `app.config.js`
- Create: `apps/mobile/src/services/livekit.ts` (API client)

**Step 1: Install packages**

```bash
cd apps/mobile && npx expo install @livekit/react-native @livekit/react-native-expo-plugin @livekit/react-native-webrtc @config-plugins/react-native-webrtc livekit-client react-native-callkeep @livekit/react-native-krisp-noise-filter
```

Note: `react-native-webrtc` (old) can be removed since `@livekit/react-native-webrtc` replaces it.

**Step 2: Add Expo plugin**

In `app.json` plugins array:
```json
["@livekit/react-native-expo-plugin"]
```

**Step 3: Add registerGlobals to app entry**

In `apps/mobile/app/_layout.tsx` (or earliest entry point):
```tsx
import { registerGlobals } from '@livekit/react-native';
registerGlobals();
```

**Step 4: Write LiveKit API service**

```typescript
// apps/mobile/src/services/livekit.ts
import { apiClient } from './api';

const LIVEKIT_SERVER_URL = process.env.EXPO_PUBLIC_LIVEKIT_URL || 'https://livekit.mizanly.app/api/v1';

export const livekitApi = {
  createRoom: (data: {
    targetUserId?: string;
    participantIds?: string[];
    callType: 'VOICE' | 'VIDEO' | 'BROADCAST';
    conversationId?: string;
  }) => apiClient.post(`${LIVEKIT_SERVER_URL}/calls/rooms`, data),

  getToken: (roomName: string, sessionId: string) =>
    apiClient.post(`${LIVEKIT_SERVER_URL}/calls/token`, { roomName, sessionId }),

  deleteRoom: (roomId: string) =>
    apiClient.delete(`${LIVEKIT_SERVER_URL}/calls/rooms/${roomId}`),

  getHistory: (cursor?: string) =>
    apiClient.get(`${LIVEKIT_SERVER_URL}/calls/history`, { params: { cursor } }),

  getActiveCall: () =>
    apiClient.get(`${LIVEKIT_SERVER_URL}/calls/active`),

  startRecording: (roomName: string, sessionId: string) =>
    apiClient.post(`${LIVEKIT_SERVER_URL}/calls/egress/start`, { roomName, sessionId }),

  stopRecording: (egressId: string) =>
    apiClient.post(`${LIVEKIT_SERVER_URL}/calls/egress/stop`, { egressId }),

  createIngress: (data: {
    roomName: string;
    sessionId: string;
    inputType: 'rtmp' | 'whip';
  }) => apiClient.post(`${LIVEKIT_SERVER_URL}/calls/ingress/create`, data),

  deleteIngress: (ingressId: string) =>
    apiClient.delete(`${LIVEKIT_SERVER_URL}/calls/ingress/${ingressId}`),
};
```

**Step 5: Verify mobile compiles**

```bash
cd apps/mobile && npx tsc --noEmit
```

**Step 6: Commit**

```bash
git add apps/mobile/
git commit -m "feat(livekit): install LiveKit SDK + Expo plugin + API client"
```

---

### Task 10: Mobile — Rewrite Call Screen with LiveKit

**Files:**
- Modify: `apps/mobile/app/(screens)/call/[id].tsx`
- Create: `apps/mobile/src/hooks/useLiveKitCall.ts`

This is the biggest mobile task. The call screen needs to use `<LiveKitRoom>`, `useTracks`, `VideoTrack`, and manage audio sessions.

**Step 1: Write useLiveKitCall hook**

```typescript
// apps/mobile/src/hooks/useLiveKitCall.ts
// Wraps LiveKit room connection with:
// - AudioSession management
// - E2EE setup (useRNE2EEManager)
// - Connection state tracking
// - Media controls (mute, video toggle, camera flip)
// - Screen sharing
// - Data channel for raise hand / reactions
// - Krisp noise filter
```

**Step 2: Rewrite call screen**

Replace RTCView with LiveKit `<VideoTrack>` components. Use `useTracks` for track management. Keep existing UI (buttons, animations, timer) — just swap the media layer.

**Step 3: Verify mobile compiles**

```bash
cd apps/mobile && npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add apps/mobile/
git commit -m "feat(livekit): rewrite call screen with LiveKit SDK"
```

---

### Task 11: Mobile — CallKit + Push Notifications

**Files:**
- Create: `apps/mobile/src/services/callkit.ts`
- Modify: `apps/mobile/app/_layout.tsx`

**Step 1: Setup react-native-callkeep**

```typescript
// apps/mobile/src/services/callkit.ts
// - Register with CallKit (iOS) / ConnectionService (Android)
// - Handle incoming call display
// - Handle answer/decline from native UI
// - Audio session activation/deactivation
// - Background call handling
```

**Step 2: Integrate with push notifications**

- iOS: PushKit VoIP push → show CallKit UI → connect to LiveKit on answer
- Android: FCM data message → foreground service → show incoming call UI

**Step 3: Commit**

```bash
git add apps/mobile/
git commit -m "feat(livekit): CallKit + ConnectionService + VoIP push"
```

---

### Task 12: Mobile — E2EE + Emoji Verification

**Files:**
- Create: `apps/mobile/src/services/call-e2ee.ts`

**Step 1: Setup SFrame E2EE**

```typescript
// Use useRNE2EEManager from @livekit/react-native
// Derive shared key per room (from Go service)
// Enable ratcheting for forward secrecy
```

**Step 2: Emoji verification UI**

```typescript
// Derive SAS from shared key material
// Display as emoji grid (both parties compare)
// Show verification status in call UI
```

**Step 3: Commit**

```bash
git add apps/mobile/
git commit -m "feat(livekit): SFrame E2EE + emoji verification"
```

---

### Task 13: Go Service — Tests

**Files:**
- Modify: `apps/livekit-server/internal/handler/handler_test.go`
- Create: `apps/livekit-server/internal/store/store_test.go`

**Step 1: Write comprehensive tests**

- Config: validation of required env vars
- Store: all CRUD operations (mock DB or use test helpers)
- Handler: HTTP handler tests (httptest.NewRecorder)
- Webhook: HMAC validation, event processing
- Token: JWT generation and validation

**Step 2: Run all tests**

```bash
cd apps/livekit-server && go test ./internal/... -v -count=1
```

Expected: All passing.

**Step 3: Commit**

```bash
git add apps/livekit-server/
git commit -m "test(livekit): comprehensive Go service tests"
```

---

## Phase 2: Broadcast + Recording (Tasks 14-18)

### Task 14: Broadcast Room UI
- Create broadcast/livestream screen
- Viewer count display
- Chat overlay (data channel)
- Go live button with ingress setup

### Task 15: Recording UI
- Start/stop recording controls in call screen
- Recording indicator
- Playback screen for saved recordings
- R2 download integration

### Task 16: Scheduled Calls
- DB: add scheduledAt field to CallSession
- Go endpoint: create scheduled call
- Push notification at scheduled time
- Calendar integration UI

### Task 17: Broadcast Viewer Experience
- View-only mode (no publish permission)
- Viewer count via room metadata
- Raise hand to speak (data channel → moderator approves → grant publish)

### Task 18: OBS/External Broadcasting
- RTMP ingress setup UI
- Stream key display
- Connection status monitoring

## Phase 3: Chat-Integrated Media (Tasks 19-20)

### Task 19: Video Messages (Round Bubbles)
- Record short video via LiveKit local track capture
- Upload to R2
- Embed in chat message with round bubble UI
- Playback with tap-to-expand

### Task 20: Ringtone Customization
- Default ringtone set
- Per-contact ringtone selection
- Custom ringtone upload
- Audio playback for preview

---

## Execution Order

Phase 1 (Tasks 1-13) is the critical path. Tasks within Phase 1:

**Sequential dependencies:**
1. Task 1 (schema) → must be first
2. Task 2 (scaffold) → depends on schema existing
3. Task 3 (store) → depends on scaffold
4. Task 4 (middleware) → depends on scaffold
5. Task 5 (handler) → depends on store + middleware
6. Task 6 (Dockerfile) → depends on handler compiling
7. Task 7 (remove NestJS calls) → can happen any time after Task 5
8. Task 8 (remove useWebRTC) → before Task 10
9. Task 9 (install LiveKit SDK) → before Task 10
10. Task 10 (call screen) → depends on Tasks 8, 9
11. Task 11 (CallKit) → depends on Task 10
12. Task 12 (E2EE) → depends on Task 10
13. Task 13 (tests) → after all Go code written

**Parallelizable:**
- Tasks 2-6 (Go service) can run in parallel with Tasks 7-9 (cleanup + SDK install)
- Task 7 and Task 8 are independent
- Tasks 11 and 12 are independent of each other
