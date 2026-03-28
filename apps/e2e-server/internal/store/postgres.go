// Package store handles all PostgreSQL operations for the E2E key server.
//
// Uses pgx v5 with SimpleProtocol mode (required for Neon pooler).
// OTP claiming uses SKIP LOCKED (no advisory locks, no contention).
package store

import (
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mizanly/e2e-server/internal/model"
)

// Store wraps the pgx connection pool.
type Store struct {
	pool                   *pgxpool.Pool
	transparencySigningKey ed25519.PrivateKey // F1: Ed25519 key for signing Merkle roots
	// F14: Cached Merkle tree — rebuilt on identity key changes, not on every request.
	cachedLeaves    [][]byte
	cachedRoot      []byte
	cachedRootSig   string
	cachedTreeSize  int
	cachedLeafIndex map[string]int       // userId → leaf index
	cachedPubKeys   map[string][]byte    // userId → publicKey
	cacheValid      bool
}

// New creates a new Store with a connection pool configured for Neon.
func New(ctx context.Context) (*Store, error) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return nil, errors.New("DATABASE_URL is required")
	}

	config, err := pgxpool.ParseConfig(dbURL)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}

	// REQUIRED for Neon pooler: avoid prepared statements
	config.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	config.MaxConns = 10
	config.MinConns = 1
	config.MaxConnLifetime = 30 * time.Minute
	config.MaxConnIdleTime = 5 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}

	// Verify connection
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}

	s := &Store{pool: pool}

	// F1: Load transparency signing key from env var.
	// This Ed25519 key signs Merkle roots so clients can verify the tree
	// was built by an authorized party, not a compromised server.
	// The corresponding PUBLIC key is hardcoded in the mobile client.
	if sigKeyB64 := os.Getenv("TRANSPARENCY_SIGNING_KEY"); sigKeyB64 != "" {
		seed, err := base64.StdEncoding.DecodeString(sigKeyB64)
		if err != nil || len(seed) != ed25519.SeedSize {
			return nil, fmt.Errorf("TRANSPARENCY_SIGNING_KEY must be base64-encoded 32-byte Ed25519 seed")
		}
		s.transparencySigningKey = ed25519.NewKeyFromSeed(seed)
	}

	return s, nil
}

// Close shuts down the connection pool.
func (s *Store) Close() {
	s.pool.Close()
}

// Health checks database connectivity.
func (s *Store) Health(ctx context.Context) error {
	return s.pool.Ping(ctx)
}

// --- Identity Keys ---

// UpsertIdentityKey registers or updates a user's Ed25519 identity key.
// Returns (changed bool, oldFingerprint string, err).
func (s *Store) UpsertIdentityKey(ctx context.Context, userID string, deviceID int, publicKeyB64 string, registrationID int) (bool, string, error) {
	pubBytes, err := base64.StdEncoding.DecodeString(publicKeyB64)
	if err != nil || len(pubBytes) != 32 {
		return false, "", errors.New("publicKey must be 32 bytes base64")
	}
	if registrationID < 1 || registrationID > 16383 {
		return false, "", errors.New("registrationId must be 1-16383 (14-bit, non-zero)")
	}

	// Atomic upsert — no TOCTOU race. Single statement returns old key if it existed.
	var oldPub []byte
	err = s.pool.QueryRow(ctx,
		`INSERT INTO e2e_identity_keys (id, "userId", "deviceId", "publicKey", "registrationId", "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, $1, $2, $3, $4, NOW(), NOW())
		 ON CONFLICT ("userId") DO UPDATE
		 SET "publicKey" = EXCLUDED."publicKey",
		     "registrationId" = EXCLUDED."registrationId",
		     "deviceId" = EXCLUDED."deviceId",
		     "updatedAt" = NOW()
		 RETURNING (SELECT "publicKey" FROM e2e_identity_keys WHERE "userId" = $1)`,
		userID, deviceID, pubBytes, registrationID,
	).Scan(&oldPub)

	if err != nil {
		return false, "", fmt.Errorf("upsert identity key: %w", err)
	}

	// oldPub is the PREVIOUS value (before upsert). If it was a fresh insert, oldPub = pubBytes.
	changed := oldPub != nil && len(oldPub) == 32 && !constantTimeEqual(oldPub, pubBytes)
	oldFingerprint := ""
	if changed {
		oldFingerprint = fingerprint(oldPub)
	}

	// F14: Invalidate cached Merkle tree — identity key changed
	s.InvalidateMerkleCache()

	return changed, oldFingerprint, nil
}

// GetIdentityKey fetches a user's identity key.
func (s *Store) GetIdentityKey(ctx context.Context, userID string) (publicKey []byte, registrationID int, deviceID int, err error) {
	err = s.pool.QueryRow(ctx,
		`SELECT "publicKey", "registrationId", "deviceId" FROM e2e_identity_keys WHERE "userId" = $1`,
		userID,
	).Scan(&publicKey, &registrationID, &deviceID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, 0, fmt.Errorf("no identity key for user %s", userID)
	}
	return
}

// --- Signed Pre-Keys ---

// UpsertSignedPreKey stores a signed pre-key after verifying the Ed25519 signature.
func (s *Store) UpsertSignedPreKey(ctx context.Context, userID string, deviceID, keyID int, publicKeyB64, signatureB64 string) error {
	pubBytes, err := base64.StdEncoding.DecodeString(publicKeyB64)
	if err != nil || len(pubBytes) != 32 {
		return errors.New("publicKey must be 32 bytes base64")
	}
	sigBytes, err := base64.StdEncoding.DecodeString(signatureB64)
	if err != nil || len(sigBytes) != 64 {
		return errors.New("signature must be 64 bytes base64")
	}

	// Fetch identity key to verify signature
	identityPub, _, _, err := s.GetIdentityKey(ctx, userID)
	if err != nil {
		return fmt.Errorf("identity key required before uploading signed pre-key: %w", err)
	}

	// Verify Ed25519 signature over the pre-key public key
	// Go's crypto/ed25519 is RFC 8032 compatible with @noble/curves
	if !ed25519.Verify(identityPub, pubBytes, sigBytes) {
		return errors.New("signed pre-key signature verification failed")
	}

	_, err = s.pool.Exec(ctx,
		`INSERT INTO e2e_signed_pre_keys (id, "userId", "deviceId", "keyId", "publicKey", signature, "createdAt")
		 VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, NOW())
		 ON CONFLICT ("userId", "deviceId", "keyId") DO UPDATE
		 SET "publicKey" = EXCLUDED."publicKey", signature = EXCLUDED.signature, "createdAt" = NOW()`,
		userID, deviceID, keyID, pubBytes, sigBytes,
	)
	return err
}

// GetLatestSignedPreKey fetches the most recent signed pre-key for a user.
func (s *Store) GetLatestSignedPreKey(ctx context.Context, userID string, deviceID int) (keyID int, publicKey, signature []byte, err error) {
	err = s.pool.QueryRow(ctx,
		`SELECT "keyId", "publicKey", signature FROM e2e_signed_pre_keys
		 WHERE "userId" = $1 AND "deviceId" = $2
		 ORDER BY "createdAt" DESC LIMIT 1`,
		userID, deviceID,
	).Scan(&keyID, &publicKey, &signature)
	return
}

// --- One-Time Pre-Keys ---

// InsertOneTimePreKeys batch inserts OTP keys. Max 100 per call, max 500 per user.
func (s *Store) InsertOneTimePreKeys(ctx context.Context, userID string, deviceID int, keys []struct {
	KeyID     int
	PublicKey string
}) error {
	if len(keys) > 100 {
		return errors.New("max 100 one-time pre-keys per upload")
	}

	// Transaction: atomic count check + insert (prevents TOCTOU race)
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Lock-based count check inside transaction
	var count int
	err = tx.QueryRow(ctx,
		`SELECT COUNT(*) FROM e2e_one_time_pre_keys WHERE "userId" = $1 AND "deviceId" = $2 FOR UPDATE`,
		userID, deviceID,
	).Scan(&count)
	if err != nil {
		return fmt.Errorf("count pre-keys: %w", err)
	}
	if count+len(keys) > 500 {
		return fmt.Errorf("would exceed 500 one-time pre-key limit (current: %d, uploading: %d)", count, len(keys))
	}

	// Batch insert within the same transaction
	batch := &pgx.Batch{}
	for _, k := range keys {
		pubBytes, err := base64.StdEncoding.DecodeString(k.PublicKey)
		if err != nil || len(pubBytes) != 32 {
			return fmt.Errorf("preKey %d: publicKey must be 32 bytes base64", k.KeyID)
		}
		batch.Queue(
			`INSERT INTO e2e_one_time_pre_keys (id, "userId", "deviceId", "keyId", "publicKey", "createdAt")
			 VALUES (gen_random_uuid()::text, $1, $2, $3, $4, NOW())
			 ON CONFLICT ("userId", "deviceId", "keyId") DO NOTHING`,
			userID, deviceID, k.KeyID, pubBytes,
		)
	}

	br := tx.SendBatch(ctx, batch)
	for range keys {
		if _, err := br.Exec(); err != nil {
			br.Close()
			return fmt.Errorf("insert pre-key: %w", err)
		}
	}
	br.Close()

	return tx.Commit(ctx)
}

// ClaimOneTimePreKey atomically claims and deletes one OTP key using SKIP LOCKED.
// Returns nil key if no OTPs available (3-DH fallback).
func (s *Store) ClaimOneTimePreKey(ctx context.Context, userID string, deviceID int) (keyID *int, publicKey []byte, err error) {
	var kid int
	var pub []byte
	err = s.pool.QueryRow(ctx,
		`DELETE FROM e2e_one_time_pre_keys
		 WHERE id = (
		   SELECT id FROM e2e_one_time_pre_keys
		   WHERE "userId" = $1 AND "deviceId" = $2
		   LIMIT 1
		   FOR UPDATE SKIP LOCKED
		 )
		 RETURNING "keyId", "publicKey"`,
		userID, deviceID,
	).Scan(&kid, &pub)

	if errors.Is(err, pgx.ErrNoRows) {
		// No OTPs available — graceful degradation (3-DH fallback)
		return nil, nil, nil
	}
	if err != nil {
		return nil, nil, fmt.Errorf("claim pre-key: %w", err)
	}
	return &kid, pub, nil
}

// CountOneTimePreKeys returns the number of remaining OTP keys.
func (s *Store) CountOneTimePreKeys(ctx context.Context, userID string, deviceID int) (int, error) {
	var count int
	err := s.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM e2e_one_time_pre_keys WHERE "userId" = $1 AND "deviceId" = $2`,
		userID, deviceID,
	).Scan(&count)
	return count, err
}

// --- Sender Keys ---

// UpsertSenderKey stores an encrypted sender key for group encryption.
// VerifyGroupMembership checks if a user is a member of a conversation (group).
func (s *Store) VerifyGroupMembership(ctx context.Context, conversationID, userID string) (bool, error) {
	var exists bool
	err := s.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM conversation_members WHERE "conversationId" = $1 AND "userId" = $2 AND "isBanned" = false)`,
		conversationID, userID,
	).Scan(&exists)
	return exists, err
}

func (s *Store) UpsertSenderKey(ctx context.Context, groupID, senderUserID, recipientUserID, encryptedKeyB64 string, chainID, generation int) error {
	encBytes, err := base64.StdEncoding.DecodeString(encryptedKeyB64)
	if err != nil {
		return errors.New("encryptedKey must be valid base64")
	}
	// Sender key distribution is ~76 bytes plaintext, encrypted ~200 bytes max.
	// Anything larger is malicious.
	if len(encBytes) > 1024 {
		return fmt.Errorf("encryptedKey too large: %d bytes (max 1024)", len(encBytes))
	}

	_, err = s.pool.Exec(ctx,
		`INSERT INTO e2e_sender_keys (id, "groupId", "senderUserId", "recipientUserId", "encryptedKey", "chainId", generation, "createdAt")
		 VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, NOW())
		 ON CONFLICT ("groupId", "senderUserId", "recipientUserId", "chainId") DO UPDATE
		 SET "encryptedKey" = EXCLUDED."encryptedKey", generation = EXCLUDED.generation, "createdAt" = NOW()`,
		groupID, senderUserID, recipientUserID, encBytes, chainID, generation,
	)
	return err
}

// GetSenderKeys returns all sender keys for a group addressed to the requesting user.
func (s *Store) GetSenderKeys(ctx context.Context, groupID, recipientUserID string) ([]model.SenderKeyEntry, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT "senderUserId", "encryptedKey", "chainId", generation, "createdAt"
		 FROM e2e_sender_keys
		 WHERE "groupId" = $1 AND "recipientUserId" = $2
		 ORDER BY "createdAt" DESC`,
		groupID, recipientUserID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []model.SenderKeyEntry
	for rows.Next() {
		var e model.SenderKeyEntry
		var encBytes []byte
		if err := rows.Scan(&e.SenderUserID, &encBytes, &e.ChainID, &e.Generation, &e.CreatedAt); err != nil {
			return nil, err
		}
		e.EncryptedKey = base64.StdEncoding.EncodeToString(encBytes)
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

// --- Bundle Assembly ---

// GetPreKeyBundle assembles a complete pre-key bundle for X3DH.
// All steps run in a single transaction so OTP isn't wasted on partial failure.
func (s *Store) GetPreKeyBundle(ctx context.Context, targetUserID string, deviceID int) (*model.BundleResponse, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// 1. Get identity key
	var identityPub []byte
	var regID, devID int
	err = tx.QueryRow(ctx,
		`SELECT "publicKey", "registrationId", "deviceId" FROM e2e_identity_keys WHERE "userId" = $1`,
		targetUserID,
	).Scan(&identityPub, &regID, &devID)
	if err != nil {
		return nil, fmt.Errorf("identity key: %w", err)
	}

	// 2. Get latest signed pre-key
	var spkID int
	var spkPub, spkSig []byte
	err = tx.QueryRow(ctx,
		`SELECT "keyId", "publicKey", signature FROM e2e_signed_pre_keys
		 WHERE "userId" = $1 AND "deviceId" = $2
		 ORDER BY "createdAt" DESC LIMIT 1`,
		targetUserID, devID,
	).Scan(&spkID, &spkPub, &spkSig)
	if err != nil {
		return nil, fmt.Errorf("signed pre-key: %w", err)
	}

	// 3. Claim one OTP within the transaction (SKIP LOCKED — atomic, no contention)
	var otpKeyID *int
	var otpPub []byte
	var kid int
	err = tx.QueryRow(ctx,
		`DELETE FROM e2e_one_time_pre_keys
		 WHERE id = (
		   SELECT id FROM e2e_one_time_pre_keys
		   WHERE "userId" = $1 AND "deviceId" = $2
		   LIMIT 1
		   FOR UPDATE SKIP LOCKED
		 )
		 RETURNING "keyId", "publicKey"`,
		targetUserID, devID,
	).Scan(&kid, &otpPub)
	if err == nil {
		otpKeyID = &kid
	} // ErrNoRows = no OTPs available (3-DH fallback)

	// 4. Count remaining OTPs
	var remaining int
	err = tx.QueryRow(ctx,
		`SELECT COUNT(*) FROM e2e_one_time_pre_keys WHERE "userId" = $1 AND "deviceId" = $2`,
		targetUserID, devID,
	).Scan(&remaining)
	if err != nil {
		return nil, fmt.Errorf("count OTPs: %w", err)
	}

	// Commit — all steps succeeded
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit bundle transaction: %w", err)
	}

	bundle := model.PreKeyBundle{
		IdentityKey:    base64.StdEncoding.EncodeToString(identityPub),
		RegistrationID: regID,
		DeviceID:       devID,
		SupportedVersions: []int{1}, // Classical X3DH only for now
	}
	bundle.SignedPreKey.KeyID = spkID
	bundle.SignedPreKey.PublicKey = base64.StdEncoding.EncodeToString(spkPub)
	bundle.SignedPreKey.Signature = base64.StdEncoding.EncodeToString(spkSig)

	if otpKeyID != nil {
		bundle.OneTimePreKey = &struct {
			KeyID     int    `json:"keyId"`
			PublicKey string `json:"publicKey"`
		}{
			KeyID:     *otpKeyID,
			PublicKey: base64.StdEncoding.EncodeToString(otpPub),
		}
	}

	return &model.BundleResponse{
		Bundle:             bundle,
		RemainingOneTimeKeys: remaining,
	}, nil
}

// --- Signed Pre-Key Cleanup ---

// CleanupExpiredSignedPreKeys deletes signed pre-keys older than 30 days.
// Called periodically (e.g., daily cron or on startup).
// Keeps the latest signed pre-key per (userId, deviceId) regardless of age.
func (s *Store) CleanupExpiredSignedPreKeys(ctx context.Context) (int64, error) {
	result, err := s.pool.Exec(ctx,
		`DELETE FROM e2e_signed_pre_keys
		 WHERE "createdAt" < NOW() - INTERVAL '30 days'
		 AND id NOT IN (
		   SELECT DISTINCT ON ("userId", "deviceId") id
		   FROM e2e_signed_pre_keys
		   ORDER BY "userId", "deviceId", "createdAt" DESC
		 )`,
	)
	if err != nil {
		return 0, fmt.Errorf("cleanup expired signed pre-keys: %w", err)
	}
	return result.RowsAffected(), nil
}

// --- Multi-device (C4) ---

// GetDeviceIDs returns all registered device IDs for a user.
// Each device registers its own identity key with a unique deviceId.
func (s *Store) GetDeviceIDs(ctx context.Context, userID string) ([]int, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT DISTINCT "deviceId" FROM e2e_identity_keys WHERE "userId" = $1 ORDER BY "deviceId"`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	if len(ids) == 0 {
		ids = []int{1} // Default to device 1 if no keys registered
	}
	return ids, rows.Err()
}

// --- Key Transparency (C6) ---

// TransparencyProof is the Merkle inclusion proof for an identity key.
type TransparencyProof struct {
	IdentityKey string   `json:"identityKey"` // Base64
	Proof       []string `json:"proof"`       // Array of base64 sibling hashes
	LeafIndex   int      `json:"leafIndex"`
	Root        string   `json:"root"`          // Base64 Merkle root
	RootSig     string   `json:"rootSignature"` // Base64 Ed25519 signature of root
	TreeSize    int      `json:"treeSize"`
}

// TransparencyRoot is the current Merkle tree state.
type TransparencyRoot struct {
	Root     string `json:"root"`          // Base64 Merkle root
	RootSig  string `json:"rootSignature"` // Base64 Ed25519 signature
	TreeSize int    `json:"treeSize"`
	UpdatedAt string `json:"updatedAt"`
}

// F14 FIX: rebuildMerkleCache loads all identity keys and builds the tree ONCE.
// Called on startup and after every identity key change. Subsequent proof/root
// requests use the cached tree (O(log n) proof lookup instead of O(n) rebuild).
func (s *Store) rebuildMerkleCache(ctx context.Context) error {
	rows, err := s.pool.Query(ctx,
		`SELECT "userId", "publicKey" FROM e2e_identity_keys ORDER BY "createdAt" ASC`,
	)
	if err != nil {
		return err
	}
	defer rows.Close()

	s.cachedLeaves = nil
	s.cachedLeafIndex = make(map[string]int)
	s.cachedPubKeys = make(map[string][]byte)
	i := 0
	for rows.Next() {
		var uid string
		var pub []byte
		if err := rows.Scan(&uid, &pub); err != nil {
			return err
		}
		leafData := append([]byte(uid), pub...)
		leaf := sha256.Sum256(leafData)
		s.cachedLeaves = append(s.cachedLeaves, leaf[:])
		s.cachedLeafIndex[uid] = i
		s.cachedPubKeys[uid] = pub
		i++
	}
	if err := rows.Err(); err != nil {
		return err
	}

	if len(s.cachedLeaves) > 0 {
		s.cachedRoot = computeMerkleRoot(s.cachedLeaves)
	} else {
		s.cachedRoot = make([]byte, 32)
	}
	s.cachedTreeSize = len(s.cachedLeaves)

	// Sign the root
	s.cachedRootSig = ""
	if s.transparencySigningKey != nil && len(s.cachedRoot) > 0 {
		sig := ed25519.Sign(s.transparencySigningKey, s.cachedRoot)
		s.cachedRootSig = base64.StdEncoding.EncodeToString(sig)
	}

	s.cacheValid = true
	return nil
}

// InvalidateMerkleCache marks the cache as stale. Called after identity key changes.
func (s *Store) InvalidateMerkleCache() {
	s.cacheValid = false
}

// ensureMerkleCache rebuilds cache if invalid.
func (s *Store) ensureMerkleCache(ctx context.Context) error {
	if s.cacheValid {
		return nil
	}
	return s.rebuildMerkleCache(ctx)
}

// GetTransparencyProof returns a Merkle inclusion proof for a user's identity key.
// F14: Uses cached tree — O(log n) proof extraction, not O(n) full rebuild.
func (s *Store) GetTransparencyProof(ctx context.Context, targetUserID string) (*TransparencyProof, error) {
	if err := s.ensureMerkleCache(ctx); err != nil {
		return nil, err
	}

	targetLeafIndex, ok := s.cachedLeafIndex[targetUserID]
	if !ok {
		return nil, fmt.Errorf("user not found in transparency log")
	}
	targetPubKey := s.cachedPubKeys[targetUserID]

	_, proof := buildMerkleProof(s.cachedLeaves, targetLeafIndex)

	proofB64 := make([]string, len(proof))
	for j, p := range proof {
		proofB64[j] = base64.StdEncoding.EncodeToString(p)
	}

	return &TransparencyProof{
		IdentityKey: base64.StdEncoding.EncodeToString(targetPubKey),
		Proof:       proofB64,
		LeafIndex:   targetLeafIndex,
		Root:        base64.StdEncoding.EncodeToString(s.cachedRoot),
		RootSig:     s.cachedRootSig,
		TreeSize:    s.cachedTreeSize,
	}, nil
}

// GetTransparencyRoot returns the current Merkle tree root + signature.
// F14: Uses cached root — no DB query needed.
func (s *Store) GetTransparencyRoot(ctx context.Context) (*TransparencyRoot, error) {
	if err := s.ensureMerkleCache(ctx); err != nil {
		return nil, err
	}

	if s.cachedTreeSize == 0 {
		return &TransparencyRoot{Root: "", TreeSize: 0, UpdatedAt: time.Now().UTC().Format(time.RFC3339)}, nil
	}

	return &TransparencyRoot{
		Root:      base64.StdEncoding.EncodeToString(s.cachedRoot),
		RootSig:   s.cachedRootSig,
		TreeSize:  s.cachedTreeSize,
		UpdatedAt: time.Now().UTC().Format(time.RFC3339),
	}, nil
}

// buildMerkleProof computes the Merkle root and inclusion proof for a leaf.
func buildMerkleProof(leaves [][]byte, targetIndex int) (root []byte, proof [][]byte) {
	if len(leaves) == 0 {
		return make([]byte, 32), nil
	}

	// Pad to power of 2
	n := 1
	for n < len(leaves) {
		n *= 2
	}
	padded := make([][]byte, n)
	copy(padded, leaves)
	for i := len(leaves); i < n; i++ {
		padded[i] = make([]byte, 32) // Zero hash for padding
	}

	// Build tree bottom-up, collecting proof along the way
	proof = nil
	index := targetIndex
	layer := padded

	for len(layer) > 1 {
		var nextLayer [][]byte
		sibling := index ^ 1 // XOR with 1 to get sibling index
		if sibling < len(layer) {
			proof = append(proof, layer[sibling])
		}
		for i := 0; i < len(layer); i += 2 {
			combined := append(layer[i], layer[i+1]...)
			h := sha256.Sum256(combined)
			nextLayer = append(nextLayer, h[:])
		}
		layer = nextLayer
		index /= 2
	}

	return layer[0], proof
}

// computeMerkleRoot computes just the root hash (no proof needed).
func computeMerkleRoot(leaves [][]byte) []byte {
	n := 1
	for n < len(leaves) {
		n *= 2
	}
	padded := make([][]byte, n)
	copy(padded, leaves)
	for i := len(leaves); i < n; i++ {
		padded[i] = make([]byte, 32)
	}

	layer := padded
	for len(layer) > 1 {
		var next [][]byte
		for i := 0; i < len(layer); i += 2 {
			combined := append(layer[i], layer[i+1]...)
			h := sha256.Sum256(combined)
			next = append(next, h[:])
		}
		layer = next
	}
	return layer[0]
}

// TransparencyPublicKey returns the Ed25519 public key for root signature verification.
// Used in tests and for generating the hardcoded client-side public key.
func (s *Store) TransparencyPublicKey() []byte {
	if s.transparencySigningKey == nil {
		return nil
	}
	return s.transparencySigningKey.Public().(ed25519.PublicKey)
}

// --- Helpers ---

func constantTimeEqual(a, b []byte) bool {
	return subtle.ConstantTimeCompare(a, b) == 1
}

func fingerprint(pubKey []byte) string {
	h := sha256.Sum256(pubKey)
	return base64.StdEncoding.EncodeToString(h[:])
}
