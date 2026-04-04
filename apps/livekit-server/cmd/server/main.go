// LiveKit Call Server for Mizanly.
//
// Standalone Go microservice handling call room management, token generation,
// webhooks, egress (recording), and ingress (broadcast). Replaces the custom
// P2P WebRTC signaling that was in NestJS.
//
// The server NEVER sees call media — LiveKit Cloud handles all media routing.
// This server manages call lifecycle, permissions, and DB state.
package main

import (
	"context"
	"crypto/tls"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
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
	// Bootstrap logger at INFO for config loading; reconfigured after config.Load().
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

	cfg, err := config.Load()
	if err != nil {
		logger.Error("config load failed", "error", err)
		os.Exit(1)
	}

	// Reconfigure logger with LOG_LEVEL from config.
	logger = slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.Level(config.ParseLogLevel(cfg.LogLevel)),
	}))
	slog.SetDefault(logger)

	// Sentry
	// SampleRate: 1.0 = capture 100% of errors (critical for call server).
	// TracesSampleRate: 0.1 = sample 10% of transactions for performance tracing.
	if cfg.SentryDSN != "" {
		if err := sentry.Init(sentry.ClientOptions{
			Dsn:              cfg.SentryDSN,
			SampleRate:       1.0,
			TracesSampleRate: 0.1,
			Environment:      cfg.NodeEnv,
		}); err != nil {
			logger.Error("sentry init failed", "error", err)
		}
		defer sentry.Flush(2 * time.Second)
	}

	// Clerk
	clerk.SetKey(cfg.ClerkSecretKey)

	// PostgreSQL
	ctx := context.Background()
	db, err := store.New(ctx, cfg.DatabaseURL, cfg.DBMaxConns)
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
	// [G06-#1 fix] Only force TLS for rediss:// URLs — plain redis:// (localhost) must not get TLS.
	if strings.HasPrefix(cfg.RedisURL, "rediss://") && redisOpt.TLSConfig == nil {
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
	// [#521 fix] Pass a cancellable context so handler goroutines (sendCallPush,
	// sendMissedCallPush) are cancelled during graceful shutdown instead of running
	// with unbounded context.Background().
	handlerCtx, handlerCancel := context.WithCancel(context.Background())
	defer handlerCancel()
	rl := middleware.NewRateLimiter(rdb)
	h := handler.NewWithContext(handlerCtx, db, rdb, rl, cfg, logger)
	sentryHandler := sentryhttp.New(sentryhttp.Options{Repanic: true})

	// Security headers [M4 fix] includes Cache-Control: no-store for all API responses
	securityHeaders := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("X-Content-Type-Options", "nosniff")
			w.Header().Set("X-Frame-Options", "DENY")
			w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
			w.Header().Set("Cache-Control", "no-store")
			// G03-#6: Defense-in-depth headers — prevent resource loading if response is rendered in browser
			w.Header().Set("Content-Security-Policy", "default-src 'none'")
			w.Header().Set("Referrer-Policy", "no-referrer")
			w.Header().Set("Permissions-Policy", "")
			next.ServeHTTP(w, r)
		})
	}

	// [H5 fix] CORS restricted to known origins
	allowedOrigins := map[string]bool{
		"https://mizanly.app":     true,
		"https://www.mizanly.app": true,
		"https://api.mizanly.app": true,
	}
	// Allow localhost in development
	if cfg.NodeEnv != "production" {
		allowedOrigins["http://localhost:8081"] = true
		allowedOrigins["http://localhost:3000"] = true
		allowedOrigins["http://localhost:19006"] = true
	}
	cors := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if allowedOrigins[origin] {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
				w.Header().Set("Access-Control-Max-Age", "86400") // [G06-#11 fix] Cache preflight for 24h
				w.Header().Set("Vary", "Origin")
			}
			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}

	// Routes
	mux := http.NewServeMux()
	auth := middleware.RequireAuth()

	// Health (no auth)
	mux.HandleFunc("/health", h.HandleHealth)

	// Token
	mux.Handle("POST /api/v1/calls/token", auth(sentryHandler.Handle(http.HandlerFunc(h.HandleCreateToken))))

	// Rooms
	mux.Handle("POST /api/v1/calls/rooms", auth(sentryHandler.Handle(http.HandlerFunc(h.HandleCreateRoom))))
	mux.Handle("DELETE /api/v1/calls/rooms/{id}", auth(sentryHandler.Handle(http.HandlerFunc(h.HandleDeleteRoom))))
	mux.Handle("POST /api/v1/calls/rooms/{id}/leave", auth(sentryHandler.Handle(http.HandlerFunc(h.HandleLeaveRoom)))) // [F7] leave without destroying
	mux.Handle("GET /api/v1/calls/rooms/{id}/participants", auth(sentryHandler.Handle(http.HandlerFunc(h.HandleListParticipants))))
	mux.Handle("DELETE /api/v1/calls/rooms/{roomId}/participants/{participantId}", auth(sentryHandler.Handle(http.HandlerFunc(h.HandleKickParticipant))))
	mux.Handle("POST /api/v1/calls/rooms/{id}/mute", auth(sentryHandler.Handle(http.HandlerFunc(h.HandleMuteParticipant))))

	// Call history + lookup
	mux.Handle("GET /api/v1/calls/history", auth(sentryHandler.Handle(http.HandlerFunc(h.HandleGetHistory))))
	mux.Handle("GET /api/v1/calls/active", auth(sentryHandler.Handle(http.HandlerFunc(h.HandleGetActiveCall))))
	mux.Handle("GET /api/v1/calls/sessions/{id}", auth(sentryHandler.Handle(http.HandlerFunc(h.HandleGetSession)))) // [F16]

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
		Handler:           middleware.RequestID(cors(securityHeaders(mux))),
		ReadTimeout:       10 * time.Second,
		ReadHeaderTimeout: 5 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    1 << 16,
		ErrorLog:          slog.NewLogLogger(logger.Handler(), slog.LevelError),
	}

	// [H7 fix] Ringing timeout ticker — mark stale RINGING sessions as MISSED
	cleanupCtx, cleanupCancel := context.WithCancel(context.Background())
	go func() {
		ticker := time.NewTicker(time.Duration(cfg.CleanupIntervalSecs) * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				if count, err := db.CleanupStaleRingingSessions(cleanupCtx, cfg.StaleRingTimeoutSecs); err != nil {
					logger.Error("ringing cleanup failed", "error", err)
				} else if count > 0 {
					logger.Info("cleaned up stale ringing sessions", "count", count)
				}
			case <-cleanupCtx.Done():
				return
			}
		}
	}()

	// [G06-#5 fix] Signal main goroutine instead of calling os.Exit(1) in background goroutine.
	// os.Exit bypasses deferred cleanup (db.Close, rdb.Close, sentry.Flush).
	errCh := make(chan error, 1)
	go func() {
		logger.Info("livekit call server listening", "port", cfg.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- err
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err := <-errCh:
		logger.Error("server error", "error", err)
	case <-quit:
	}
	logger.Info("shutting down...")
	cleanupCancel()
	handlerCancel() // [#521] Cancel handler goroutines (sendCallPush, sendMissedCallPush)

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("shutdown error", "error", err)
	}
	logger.Info("server stopped")
}
