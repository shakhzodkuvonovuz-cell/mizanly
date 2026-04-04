// E2E Key Server for Mizanly Signal Protocol.
//
// Standalone Go microservice handling pre-key management, identity keys,
// sender keys, and safety numbers. Scale-proof: 100K+ req/sec, 10MB RAM.
//
// The server NEVER sees plaintext messages or private keys.
// It stores public keys and encrypted sender key material only.
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

	"github.com/mizanly/e2e-server/internal/config"
	"github.com/mizanly/e2e-server/internal/handler"
	"github.com/mizanly/e2e-server/internal/middleware"
	"github.com/mizanly/e2e-server/internal/store"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

	// G03-#2: Load all config from centralized config package.
	cfg, err := config.Load()
	if err != nil {
		logger.Error("config load failed", "error", err)
		os.Exit(1)
	}

	// --- Sentry ---
	if cfg.SentryDSN != "" {
		if err := sentry.Init(sentry.ClientOptions{
			Dsn:              cfg.SentryDSN,
			TracesSampleRate: 0.1,
			Environment:      cfg.NodeEnv,
		}); err != nil {
			logger.Error("sentry init failed", "error", err)
		}
		defer sentry.Flush(2 * time.Second)
	}

	// --- Clerk ---
	clerk.SetKey(cfg.ClerkSecretKey)

	// --- PostgreSQL ---
	ctx := context.Background()
	db, err := store.New(ctx, cfg.DatabaseURL, cfg.TransparencySigningKey, cfg.DBMaxConns)
	if err != nil {
		logger.Error("database connection failed", "error", err)
		os.Exit(1)
	}
	defer db.Close()
	logger.Info("connected to PostgreSQL")

	// --- Redis ---
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

	// --- Handlers ---
	rl := middleware.NewRateLimiter(rdb)
	h := handler.New(db, rdb, rl, cfg, logger)

	// --- Sentry HTTP middleware ---
	sentryHandler := sentryhttp.New(sentryhttp.Options{Repanic: true})

	// --- Security middleware ---
	securityHeaders := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("X-Content-Type-Options", "nosniff")
			w.Header().Set("X-Frame-Options", "DENY")
			w.Header().Set("Cache-Control", "no-store") // Never cache key material responses
			w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
			// G03-#6: Missing security headers added.
			w.Header().Set("Content-Security-Policy", "default-src 'none'")
			w.Header().Set("Referrer-Policy", "no-referrer")
			w.Header().Set("Permissions-Policy", "")
			next.ServeHTTP(w, r)
		})
	}

	// G03-#1: CORS middleware — restrict to known origins.
	allowedOrigins := map[string]bool{
		"https://mizanly.app":     true,
		"https://www.mizanly.app": true,
		"https://api.mizanly.app": true,
	}
	if cfg.NodeEnv != "production" {
		allowedOrigins["http://localhost:8080"] = true
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
				w.Header().Set("Access-Control-Max-Age", "86400") // G06: cache preflight for 24h
				w.Header().Set("Vary", "Origin")
			}
			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}

	// --- Routes ---
	mux := http.NewServeMux()

	// Health (no auth)
	mux.HandleFunc("/health", h.HandleHealth)

	// Auth-protected routes
	auth := middleware.RequireAuth()

	// Identity keys
	mux.Handle("PUT /api/v1/e2e/keys/identity", auth(sentryHandler.Handle(http.HandlerFunc(h.HandleRegisterIdentity))))

	// Signed pre-keys
	mux.Handle("PUT /api/v1/e2e/keys/signed-prekey", auth(sentryHandler.Handle(http.HandlerFunc(h.HandleUploadSignedPreKey))))

	// One-time pre-keys
	mux.Handle("POST /api/v1/e2e/keys/one-time-prekeys", auth(sentryHandler.Handle(http.HandlerFunc(h.HandleUploadOneTimePreKeys))))

	// Pre-key bundle (rate limited)
	bundleHandler := rl.RateLimitMiddleware(func(r *http.Request) string {
		return handler.ExtractBundleTargetID(r)
	})(sentryHandler.Handle(http.HandlerFunc(h.HandleGetBundle)))
	mux.Handle("GET /api/v1/e2e/keys/bundle/", auth(bundleHandler))

	// Batch bundle
	mux.Handle("POST /api/v1/e2e/keys/bundles/batch", auth(sentryHandler.Handle(http.HandlerFunc(h.HandleGetBundlesBatch))))

	// Pre-key count
	mux.Handle("GET /api/v1/e2e/keys/count", auth(sentryHandler.Handle(http.HandlerFunc(h.HandleGetPreKeyCount))))

	// Sender keys
	mux.Handle("POST /api/v1/e2e/sender-keys", auth(sentryHandler.Handle(http.HandlerFunc(h.HandleStoreSenderKey))))
	mux.Handle("GET /api/v1/e2e/sender-keys/", auth(sentryHandler.Handle(http.HandlerFunc(h.HandleGetSenderKeys))))

	// Multi-device: list devices for a user (C4)
	mux.Handle("GET /api/v1/e2e/keys/devices/", auth(sentryHandler.Handle(http.HandlerFunc(h.HandleGetDevices))))

	// Key transparency: Merkle proof for identity key verification (C6)
	mux.Handle("GET /api/v1/e2e/transparency/", auth(sentryHandler.Handle(http.HandlerFunc(h.HandleGetTransparencyProof))))
	mux.Handle("GET /api/v1/e2e/transparency/root", auth(sentryHandler.Handle(http.HandlerFunc(h.HandleGetTransparencyRoot))))

	// Device linking: rate-limited code verification (V4-F20)
	mux.Handle("POST /api/v1/e2e/device-link/verify", auth(sentryHandler.Handle(http.HandlerFunc(h.HandleVerifyDeviceLink))))

	// --- Startup cleanup: expired signed pre-keys ---
	if deleted, err := db.CleanupExpiredSignedPreKeys(ctx); err != nil {
		logger.Error("signed pre-key cleanup failed", "error", err)
	} else if deleted > 0 {
		logger.Info("cleaned up expired signed pre-keys", "deleted", deleted)
	}

	// Daily cleanup ticker with cancellation
	cleanupCtx, cleanupCancel := context.WithCancel(context.Background())
	go func() {
		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				if deleted, err := db.CleanupExpiredSignedPreKeys(cleanupCtx); err != nil {
					logger.Error("daily signed pre-key cleanup failed", "error", err)
				} else if deleted > 0 {
					logger.Info("daily cleanup: expired signed pre-keys", "deleted", deleted)
				}
			case <-cleanupCtx.Done():
				return
			}
		}
	}()

	// --- Server ---
	// G03-#7: MaxBytesHandler wraps the entire mux with a 1MB body limit.
	// Individual handlers can use io.LimitReader for tighter limits.
	// G03-#5: RequestID middleware for request tracing.
	// G03-#1: CORS middleware.
	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           middleware.RequestID(cors(securityHeaders(http.MaxBytesHandler(mux, 1<<20)))),
		ReadTimeout:       10 * time.Second,
		ReadHeaderTimeout: 5 * time.Second, // Slowloris protection
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    1 << 16, // 64KB max headers
	}

	// --- Graceful shutdown ---
	go func() {
		logger.Info("e2e key server listening", "port", cfg.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	logger.Info("shutting down...")
	cleanupCancel() // Stop the daily cleanup goroutine

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("shutdown error", "error", err)
	}
	logger.Info("server stopped")
}

// G03-#9: Removed pointless init() function and envOrDefault (now in config package).
