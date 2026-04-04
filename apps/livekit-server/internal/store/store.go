// Package store handles all PostgreSQL operations for the LiveKit call server.
//
// Uses pgx v5 with SimpleProtocol mode (required for Neon pooler).
package store

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mizanly/livekit-server/internal/model"
)

var _ Querier = (*Store)(nil)

type Store struct {
	pool *pgxpool.Pool
}

// New creates a store with the given maxConns pool size.
// Pass 0 to use the default (10).
func New(ctx context.Context, databaseURL string, maxConns int32) (*Store, error) {
	if databaseURL == "" {
		return nil, errors.New("DATABASE_URL is required")
	}
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}
	cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	if maxConns > 0 {
		cfg.MaxConns = maxConns
	} else {
		cfg.MaxConns = 10
	}
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

// --- Checks ---

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

// CheckBlockedAny returns true if ANY pair in the given user list has a block.
// [C6 fix] Explicitly excludes self-blocks (blockerId ≠ blockedId).
func (s *Store) CheckBlockedAny(ctx context.Context, userIDs []string) (bool, error) {
	if len(userIDs) < 2 {
		return false, nil
	}
	var exists bool
	err := s.pool.QueryRow(ctx,
		`SELECT EXISTS(
			SELECT 1 FROM blocks
			WHERE "blockerId" = ANY($1) AND "blockedId" = ANY($1)
			AND "blockerId" != "blockedId"
		)`, userIDs,
	).Scan(&exists)
	return exists, err
}

// G06-#23: Exclude banned users — a banned user should not be callable.
func (s *Store) UserExists(ctx context.Context, userID string) (bool, error) {
	var exists bool
	err := s.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM users WHERE id = $1 AND ("isBanned" IS NULL OR "isBanned" = false))`, userID,
	).Scan(&exists)
	return exists, err
}

// --- Session CRUD ---

// CreateCallSession atomically checks no active call + creates session + inserts participants.
// [C1] Generates a random 32-byte E2EE key per session (forward secrecy).
// [C2/H1 fix] Advisory locks sorted by user ID to prevent AB-BA deadlock.
func (s *Store) CreateCallSession(ctx context.Context, callType model.CallType, livekitRoomName, callerID string, participantIDs []string, maxParticipants int) (*model.CallSession, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// [H1 fix] Sort IDs before locking to prevent deadlock.
	// If A calls B and B calls A simultaneously, both transactions lock in the same
	// order (alphabetical) instead of A→B vs B→A. No deadlock possible.
	sorted := make([]string, len(participantIDs))
	copy(sorted, participantIDs)
	sort.Strings(sorted)

	for _, pid := range sorted {
		_, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, pid)
		if err != nil {
			return nil, fmt.Errorf("acquire advisory lock: %w", err)
		}

		var activeCount int
		err = tx.QueryRow(ctx,
			`SELECT COUNT(*) FROM call_participants cp
			 JOIN call_sessions cs ON cs.id = cp."sessionId"
			 WHERE cp."userId" = $1 AND cp."leftAt" IS NULL
			 AND cs.status IN ('RINGING', 'ACTIVE')`,
			pid,
		).Scan(&activeCount)
		if err != nil {
			return nil, fmt.Errorf("check active call: %w", err)
		}
		if activeCount > 0 {
			return nil, &ErrUserInCall{UserID: pid}
		}
	}

	// [C1 fix] Random per-session E2EE key
	e2eeKey := make([]byte, 32)
	if _, err := rand.Read(e2eeKey); err != nil {
		return nil, fmt.Errorf("generate e2ee key: %w", err)
	}

	// [F1 fix] Random per-session ratchet salt — prevents cross-session key derivation overlap.
	// Each session gets a unique salt so even if keys were reused (they aren't), the
	// ratcheted frame keys would differ. 16 bytes = 128-bit domain separation.
	e2eeSalt := make([]byte, 16)
	if _, err := rand.Read(e2eeSalt); err != nil {
		return nil, fmt.Errorf("generate e2ee salt: %w", err)
	}

	// [H2 fix] Cryptographically random room name suffix
	roomSuffix := make([]byte, 8)
	rand.Read(roomSuffix)
	roomName := fmt.Sprintf("call_%s_%s", livekitRoomName, hex.EncodeToString(roomSuffix))

	var session model.CallSession
	err = tx.QueryRow(ctx,
		`INSERT INTO call_sessions (id, "callType", status, "maxParticipants", "livekitRoomName", "e2eeKey", "e2eeSalt", "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, $1, 'RINGING', $2, $3, $4, $5, NOW(), NOW())
		 RETURNING id, "callType", status, "maxParticipants", "livekitRoomName", "createdAt", "updatedAt"`,
		callType, maxParticipants, roomName, e2eeKey, e2eeSalt,
	).Scan(&session.ID, &session.CallType, &session.Status, &session.MaxParticipants,
		&session.LivekitRoomName, &session.CreatedAt, &session.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("insert call session: %w", err)
	}

	_, err = tx.Exec(ctx,
		`INSERT INTO call_participants ("sessionId", "userId", role, "joinedAt")
		 VALUES ($1, $2, 'caller', NOW())`,
		session.ID, callerID,
	)
	if err != nil {
		return nil, fmt.Errorf("insert caller: %w", err)
	}

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

// [G06-#4 fix] Valid session statuses — reject unknown values.
// [B12-#2 fix] Valid transitions — prevent overwriting terminal states.
var validStatuses = map[string]bool{
	"RINGING": true, "ACTIVE": true, "ENDED": true, "MISSED": true, "DECLINED": true,
}

// validTransitions defines which source statuses can transition to each target status.
// Terminal states (ENDED, MISSED, DECLINED) cannot transition to anything.
var validTransitions = map[string][]string{
	"RINGING":  {"ACTIVE", "MISSED", "ENDED", "DECLINED"},
	"ACTIVE":   {"ENDED"},
	"MISSED":   {},
	"ENDED":    {},
	"DECLINED": {},
}

func (s *Store) UpdateSessionStatus(ctx context.Context, sessionID, newStatus string) error {
	// [G06-#4 fix] Reject unknown statuses
	if !validStatuses[newStatus] {
		return fmt.Errorf("invalid status: %s", newStatus)
	}

	// [B12-#2 fix] Compute allowed source statuses for this transition
	allowedFrom := make([]string, 0)
	for fromStatus, targets := range validTransitions {
		for _, t := range targets {
			if t == newStatus {
				allowedFrom = append(allowedFrom, fromStatus)
			}
		}
	}
	if len(allowedFrom) == 0 {
		return fmt.Errorf("no valid transition to status: %s", newStatus)
	}

	now := time.Now()
	var query string
	switch newStatus {
	case "ACTIVE":
		query = `UPDATE call_sessions SET status = $2, "startedAt" = $3, "updatedAt" = $3 WHERE id = $1 AND status = ANY($4)`
	case "ENDED", "MISSED", "DECLINED":
		query = `UPDATE call_sessions SET status = $2, "endedAt" = $3, "updatedAt" = $3 WHERE id = $1 AND status = ANY($4)`
	default:
		query = `UPDATE call_sessions SET status = $2, "updatedAt" = $3 WHERE id = $1 AND status = ANY($4)`
	}
	result, err := s.pool.Exec(ctx, query, sessionID, newStatus, now, allowedFrom)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("session %s not updated: either not found or invalid transition to %s", sessionID, newStatus)
	}
	return nil
}

func (s *Store) UpdateSessionDuration(ctx context.Context, sessionID string, duration int) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE call_sessions SET duration = $2, status = 'ENDED', "endedAt" = NOW(), "updatedAt" = NOW() WHERE id = $1`,
		sessionID, duration,
	)
	return err
}

func (s *Store) UpdateSessionLivekitSid(ctx context.Context, roomName, roomSid string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE call_sessions SET "livekitRoomSid" = $2, "updatedAt" = NOW() WHERE "livekitRoomName" = $1`,
		roomName, roomSid,
	)
	return err
}

func (s *Store) UpdateSessionRecordingURL(ctx context.Context, roomName, recordingURL string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE call_sessions SET "recordingUrl" = $2, "updatedAt" = NOW() WHERE "livekitRoomName" = $1`,
		roomName, recordingURL,
	)
	return err
}

// [C1 fix] WipeE2EEKey zeroes the key and salt in DB after the call ends.
// [G06-#13 fix] Check RowsAffected — log if session not found.
func (s *Store) WipeE2EEKey(ctx context.Context, sessionID string) error {
	result, err := s.pool.Exec(ctx,
		`UPDATE call_sessions SET "e2eeKey" = NULL, "e2eeSalt" = NULL, "updatedAt" = NOW() WHERE id = $1`,
		sessionID,
	)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("E2EE key wipe: session %s not found", sessionID)
	}
	return nil
}

// [B12-#8 fix] EndCallSession atomically updates status, marks all participants left, and wipes E2EE key.
// Uses a CTE to ensure all three operations happen in a single round-trip, preventing
// partial cleanup if the server crashes between steps.
func (s *Store) EndCallSession(ctx context.Context, sessionID, newStatus string) error {
	if !validStatuses[newStatus] {
		return fmt.Errorf("invalid status: %s", newStatus)
	}
	result, err := s.pool.Exec(ctx,
		`WITH update_session AS (
			UPDATE call_sessions
			SET status = $2, "endedAt" = NOW(), "updatedAt" = NOW(), "e2eeKey" = NULL, "e2eeSalt" = NULL
			WHERE id = $1 AND status IN ('RINGING', 'ACTIVE')
		)
		UPDATE call_participants SET "leftAt" = NOW()
		WHERE "sessionId" = $1 AND "leftAt" IS NULL`,
		sessionID, newStatus,
	)
	if err != nil {
		return fmt.Errorf("end call session: %w", err)
	}
	_ = result // CTE returns participant rows affected, session update is implicit
	return nil
}

// --- Participants ---

// [B12-#3 fix] Check RowsAffected — return error if participant not found or already left.
func (s *Store) MarkParticipantLeft(ctx context.Context, sessionID, userID string) error {
	result, err := s.pool.Exec(ctx,
		`UPDATE call_participants SET "leftAt" = NOW() WHERE "sessionId" = $1 AND "userId" = $2 AND "leftAt" IS NULL`,
		sessionID, userID,
	)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("participant %s not found in session %s or already left", userID, sessionID)
	}
	return nil
}

func (s *Store) MarkAllParticipantsLeft(ctx context.Context, sessionID string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE call_participants SET "leftAt" = NOW() WHERE "sessionId" = $1 AND "leftAt" IS NULL`,
		sessionID,
	)
	return err
}

func (s *Store) GetActiveParticipantCount(ctx context.Context, roomName string) (int, error) {
	var count int
	err := s.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM call_participants cp
		 JOIN call_sessions cs ON cs.id = cp."sessionId"
		 WHERE cs."livekitRoomName" = $1 AND cp."leftAt" IS NULL
		 AND cp."livekitJoinedAt" IS NOT NULL`,
		roomName,
	).Scan(&count)
	return count, err
}

func (s *Store) MarkParticipantLivekitJoined(ctx context.Context, roomName, userID string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE call_participants SET "livekitJoinedAt" = NOW()
		 WHERE "sessionId" = (SELECT id FROM call_sessions WHERE "livekitRoomName" = $1)
		 AND "userId" = $2 AND "livekitJoinedAt" IS NULL`,
		roomName, userID,
	)
	return err
}

// --- Lookups ---

func (s *Store) GetSessionByRoomName(ctx context.Context, roomName string) (*model.CallSession, error) {
	var session model.CallSession
	err := s.pool.QueryRow(ctx,
		`SELECT id, "callType", status, "startedAt", "endedAt", duration, "maxParticipants",
		        "livekitRoomName", "livekitRoomSid", "recordingUrl", "createdAt", "updatedAt"
		 FROM call_sessions WHERE "livekitRoomName" = $1`,
		roomName,
	).Scan(&session.ID, &session.CallType, &session.Status, &session.StartedAt,
		&session.EndedAt, &session.Duration, &session.MaxParticipants,
		&session.LivekitRoomName, &session.LivekitRoomSid, &session.RecordingURL,
		&session.CreatedAt, &session.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &session, err
}

func (s *Store) GetSessionWithParticipantsByRoomName(ctx context.Context, roomName string) (*model.CallSession, error) {
	session, err := s.GetSessionByRoomName(ctx, roomName)
	if err != nil || session == nil {
		return nil, err
	}
	participants, err := s.getActiveParticipantsLight(ctx, session.ID)
	if err != nil {
		return nil, err
	}
	session.Participants = participants
	return session, nil
}

// G06-#22: Scan livekitJoinedAt — consistent with getParticipants and getParticipantsBatch.
// Previously omitted, leaving LivekitJoinedAt as zero value which could confuse callers.
func (s *Store) getActiveParticipantsLight(ctx context.Context, sessionID string) ([]model.CallParticipant, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT "sessionId", "userId", role, "joinedAt", "leftAt", "livekitJoinedAt"
		 FROM call_participants WHERE "sessionId" = $1 AND "leftAt" IS NULL`,
		sessionID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var participants []model.CallParticipant
	for rows.Next() {
		var p model.CallParticipant
		if err := rows.Scan(&p.SessionID, &p.UserID, &p.Role, &p.JoinedAt, &p.LeftAt, &p.LivekitJoinedAt); err != nil {
			return nil, err
		}
		participants = append(participants, p)
	}
	return participants, rows.Err()
}

func (s *Store) GetSessionByID(ctx context.Context, sessionID string) (*model.CallSession, error) {
	var session model.CallSession
	err := s.pool.QueryRow(ctx,
		`SELECT id, "callType", status, "startedAt", "endedAt", duration, "maxParticipants",
		        "livekitRoomName", "livekitRoomSid", "recordingUrl", "createdAt", "updatedAt"
		 FROM call_sessions WHERE id = $1`,
		sessionID,
	).Scan(&session.ID, &session.CallType, &session.Status, &session.StartedAt,
		&session.EndedAt, &session.Duration, &session.MaxParticipants,
		&session.LivekitRoomName, &session.LivekitRoomSid, &session.RecordingURL,
		&session.CreatedAt, &session.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	participants, err := s.getParticipants(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	session.Participants = participants
	return &session, nil
}

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

// [F20 fix] Pagination uses (createdAt, id) composite cursor instead of CUID string comparison.
// CUIDs have a timestamp prefix but are NOT monotonically sortable — two CUIDs created in
// the same millisecond can have any relative order. Using createdAt as the primary sort key
// with id as a tiebreaker gives deterministic, time-ordered pagination.
// The cursor format is "createdAt|id" (ISO timestamp + pipe + CUID).
func (s *Store) GetHistory(ctx context.Context, userID string, cursor *string, limit int) (*model.PaginatedResult, error) {
	var query string
	var args []interface{}

	if cursor != nil && *cursor != "" {
		// Parse composite cursor: "2026-03-29T12:00:00Z|cuid_xxx"
		parts := SplitCursor(*cursor)
		if parts == nil {
			return nil, fmt.Errorf("invalid cursor format")
		}
		cursorTime, cursorID := parts[0], parts[1]
		query = `SELECT DISTINCT ON (cs."createdAt", cs.id)
		                cs.id, cs."callType", cs.status, cs."startedAt", cs."endedAt",
		                cs.duration, cs."maxParticipants", cs."livekitRoomName", cs."livekitRoomSid",
		                cs."recordingUrl", cs."createdAt", cs."updatedAt"
		         FROM call_sessions cs
		         JOIN call_participants cp ON cp."sessionId" = cs.id
		         WHERE cp."userId" = $1
		           AND (cs."createdAt", cs.id) < ($2::timestamptz, $3)
		         ORDER BY cs."createdAt" DESC, cs.id DESC
		         LIMIT $4`
		args = []interface{}{userID, cursorTime, cursorID, limit + 1}
	} else {
		query = `SELECT DISTINCT ON (cs."createdAt", cs.id)
		                cs.id, cs."callType", cs.status, cs."startedAt", cs."endedAt",
		                cs.duration, cs."maxParticipants", cs."livekitRoomName", cs."livekitRoomSid",
		                cs."recordingUrl", cs."createdAt", cs."updatedAt"
		         FROM call_sessions cs
		         JOIN call_participants cp ON cp."sessionId" = cs.id
		         WHERE cp."userId" = $1
		         ORDER BY cs."createdAt" DESC, cs.id DESC
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
		var sess model.CallSession
		if err := rows.Scan(&sess.ID, &sess.CallType, &sess.Status, &sess.StartedAt, &sess.EndedAt,
			&sess.Duration, &sess.MaxParticipants, &sess.LivekitRoomName, &sess.LivekitRoomSid,
			&sess.RecordingURL, &sess.CreatedAt, &sess.UpdatedAt); err != nil {
			return nil, err
		}
		sessions = append(sessions, sess)
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
		last := sessions[len(sessions)-1]
		c := BuildCursor(last.CreatedAt, last.ID)
		cursorPtr = &c
	}

	if len(sessions) > 0 {
		sessionIDs := make([]string, len(sessions))
		for i, ss := range sessions {
			sessionIDs[i] = ss.ID
		}
		bySession, err := s.getParticipantsBatch(ctx, sessionIDs)
		if err != nil {
			return nil, err
		}
		for i := range sessions {
			sessions[i].Participants = bySession[sessions[i].ID]
		}
	}

	return &model.PaginatedResult{
		Data: sessions,
		Meta: model.PaginationMeta{Cursor: cursorPtr, HasMore: hasMore},
	}, nil
}

// GetSessionE2EEMaterial returns the per-session encryption key and ratchet salt.
// [C2 fix] Only returns material if session is RINGING or ACTIVE.
// [F1 fix] Returns both key (32 bytes) and salt (16 bytes) — salt is unique per session.
func (s *Store) GetSessionE2EEMaterial(ctx context.Context, roomName string) (*model.E2EEMaterial, error) {
	var key, salt []byte
	err := s.pool.QueryRow(ctx,
		`SELECT "e2eeKey", "e2eeSalt" FROM call_sessions
		 WHERE "livekitRoomName" = $1 AND status IN ('RINGING', 'ACTIVE')`,
		roomName,
	).Scan(&key, &salt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &model.E2EEMaterial{Key: key, Salt: salt}, nil
}

// GetUserDisplayName returns the display name for a user ID.
func (s *Store) GetUserDisplayName(ctx context.Context, userID string) (string, error) {
	var name string
	err := s.pool.QueryRow(ctx,
		`SELECT COALESCE("displayName", username, '') FROM users WHERE id = $1`, userID,
	).Scan(&name)
	return name, err
}

// --- Cleanup ---

// CleanupStaleRingingSessions marks RINGING sessions older than staleAfterSecs as MISSED
// and marks their participants as left. [H4 fix] Atomic via CTE.
func (s *Store) CleanupStaleRingingSessions(ctx context.Context, staleAfterSecs int) (int64, error) {
	if staleAfterSecs <= 0 {
		staleAfterSecs = 60
	}
	interval := fmt.Sprintf("%d seconds", staleAfterSecs)
	// G06-#18: The updated_participants CTE result is intentionally unreferenced.
	// PostgreSQL still executes it as a side-effect (CTEs are optimization fences).
	// The RowsAffected() below reports the final UPDATE (session rows), not participant rows.
	result, err := s.pool.Exec(ctx,
		`WITH stale AS (
			SELECT id FROM call_sessions
			WHERE status = 'RINGING' AND "createdAt" < NOW() - CAST($1 AS INTERVAL)
		), mark_left AS (
			UPDATE call_participants SET "leftAt" = NOW()
			WHERE "leftAt" IS NULL AND "sessionId" IN (SELECT id FROM stale)
		)
		UPDATE call_sessions
		SET status = 'MISSED', "endedAt" = NOW(), "updatedAt" = NOW(), "e2eeKey" = NULL, "e2eeSalt" = NULL
		WHERE id IN (SELECT id FROM stale)`,
		interval,
	)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected(), nil
}

// --- Internal helpers ---

// [M6 fix] Include livekitJoinedAt in participant scans
func (s *Store) getParticipantsBatch(ctx context.Context, sessionIDs []string) (map[string][]model.CallParticipant, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT cp."sessionId", cp."userId", cp.role, cp."joinedAt", cp."leftAt", cp."livekitJoinedAt",
		        u.id, u.username, u."displayName", u."avatarUrl"
		 FROM call_participants cp
		 JOIN users u ON u.id = cp."userId"
		 WHERE cp."sessionId" = ANY($1)`,
		sessionIDs,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string][]model.CallParticipant, len(sessionIDs))
	for rows.Next() {
		var p model.CallParticipant
		var user model.UserBrief
		if err := rows.Scan(&p.SessionID, &p.UserID, &p.Role, &p.JoinedAt, &p.LeftAt, &p.LivekitJoinedAt,
			&user.ID, &user.Username, &user.DisplayName, &user.AvatarURL); err != nil {
			return nil, err
		}
		p.User = &user
		result[p.SessionID] = append(result[p.SessionID], p)
	}
	return result, rows.Err()
}

func (s *Store) getParticipants(ctx context.Context, sessionID string) ([]model.CallParticipant, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT cp."sessionId", cp."userId", cp.role, cp."joinedAt", cp."leftAt", cp."livekitJoinedAt",
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

	var participants []model.CallParticipant
	for rows.Next() {
		var p model.CallParticipant
		var user model.UserBrief
		if err := rows.Scan(&p.SessionID, &p.UserID, &p.Role, &p.JoinedAt, &p.LeftAt, &p.LivekitJoinedAt,
			&user.ID, &user.Username, &user.DisplayName, &user.AvatarURL); err != nil {
			return nil, err
		}
		p.User = &user
		participants = append(participants, p)
	}
	return participants, rows.Err()
}

// --- Cursor helpers [F20 fix] ---

// BuildCursor creates a composite cursor string: "2026-03-29T12:00:00.123Z|cuid_xxx"
func BuildCursor(createdAt time.Time, id string) string {
	return createdAt.Format(time.RFC3339Nano) + "|" + id
}

// SplitCursor parses a composite cursor into [timestamp, id]. Returns nil on invalid format.
// [G06-#10 fix] Validates the timestamp portion parses as RFC3339Nano.
func SplitCursor(cursor string) []string {
	idx := -1
	for i := len(cursor) - 1; i >= 0; i-- {
		if cursor[i] == '|' {
			idx = i
			break
		}
	}
	if idx <= 0 || idx >= len(cursor)-1 {
		return nil
	}
	ts := cursor[:idx]
	if _, err := time.Parse(time.RFC3339Nano, ts); err != nil {
		return nil // invalid timestamp
	}
	return []string{ts, cursor[idx+1:]}
}

// --- Structured Errors [H3 fix] ---

// ErrUserInCall is returned when a user is already in an active call.
type ErrUserInCall struct {
	UserID string
}

// G02-L5: Include UserID in error message for debugging.
func (e *ErrUserInCall) Error() string {
	return fmt.Sprintf("user %s is already in a call", e.UserID)
}
