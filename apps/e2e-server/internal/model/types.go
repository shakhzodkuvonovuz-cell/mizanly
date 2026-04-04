// Package model defines request/response types for the E2E key server.
package model

import "time"

// IdentityKeyRequest is the body for PUT /keys/identity.
type IdentityKeyRequest struct {
	DeviceID       int    `json:"deviceId"`
	PublicKey      string `json:"publicKey"`      // Base64, 32 bytes Ed25519
	RegistrationID int    `json:"registrationId"` // 14-bit unsigned (0-16383)
}

// IdentityKeyResponse is returned from PUT /keys/identity.
type IdentityKeyResponse struct {
	Success    bool    `json:"success"`
	Changed    bool    `json:"changed"`              // true if key was different from stored
	Commitment *string `json:"commitment,omitempty"` // Future: Merkle proof for key transparency
}

// SignedPreKeyRequest is the body for PUT /keys/signed-prekey.
type SignedPreKeyRequest struct {
	DeviceID  int    `json:"deviceId"`
	KeyID     int    `json:"keyId"`
	PublicKey string `json:"publicKey"` // Base64, 32 bytes X25519
	Signature string `json:"signature"` // Base64, 64 bytes Ed25519 signature
}

// OneTimePreKeysRequest is the body for POST /keys/one-time-prekeys.
type OneTimePreKeysRequest struct {
	DeviceID int `json:"deviceId"`
	PreKeys  []struct {
		KeyID     int    `json:"keyId"`
		PublicKey string `json:"publicKey"` // Base64, 32 bytes X25519
	} `json:"preKeys"`
}

// PreKeyBundle is a user's public key bundle for X3DH session establishment.
type PreKeyBundle struct {
	IdentityKey    string `json:"identityKey"` // Base64, 32 bytes Ed25519
	RegistrationID int32  `json:"registrationId"` // G03-#18: 14-bit unsigned (0-16383), int32 enforces narrow range
	DeviceID     int    `json:"deviceId"`
	SignedPreKey struct {
		KeyID     int    `json:"keyId"`
		PublicKey string `json:"publicKey"` // Base64, 32 bytes X25519
		Signature string `json:"signature"` // Base64, 64 bytes Ed25519
		CreatedAt int64  `json:"createdAt"` // V7-F6: Unix ms — client validates SPK age
	} `json:"signedPreKey"`
	OneTimePreKey *struct {
		KeyID     int    `json:"keyId"`
		PublicKey string `json:"publicKey"` // Base64, 32 bytes X25519
	} `json:"oneTimePreKey,omitempty"` // nil if no OTPs available (3-DH fallback)
	SupportedVersions []int `json:"supportedVersions"` // [1] initially
}

// BundleResponse wraps a pre-key bundle with metadata.
type BundleResponse struct {
	Bundle             PreKeyBundle `json:"bundle"`
	RemainingOneTimeKeys int       `json:"remainingOneTimeKeys"`
}

// BatchBundleRequest is the body for POST /keys/bundles/batch.
type BatchBundleRequest struct {
	UserIDs []string `json:"userIds"` // Max 100
}

// BatchBundleResponse wraps multiple bundles.
type BatchBundleResponse struct {
	Bundles map[string]BundleResponse `json:"bundles"` // keyed by userId
}

// PreKeyCountResponse is returned from GET /keys/count.
type PreKeyCountResponse struct {
	Count int `json:"count"`
}

// StoreSenderKeyRequest is the body for POST /sender-keys.
type StoreSenderKeyRequest struct {
	GroupID         string `json:"groupId"`
	RecipientUserID string `json:"recipientUserId"`
	EncryptedKey    string `json:"encryptedKey"` // Base64
	ChainID         int    `json:"chainId"`
	Generation      int    `json:"generation"`
}

// SenderKeyEntry is a single sender key record.
type SenderKeyEntry struct {
	SenderUserID string    `json:"senderUserId"`
	EncryptedKey string    `json:"encryptedKey"` // Base64
	ChainID      int       `json:"chainId"`
	Generation   int       `json:"generation"`
	CreatedAt    time.Time `json:"createdAt"`
}

// SenderKeysResponse wraps sender keys for a group.
type SenderKeysResponse struct {
	GroupID    string           `json:"groupId"`
	SenderKeys []SenderKeyEntry `json:"senderKeys"`
}

// SafetyNumberResponse REMOVED — server-side safety number computation
// was a security risk (Finding 7/12). Client computes safety numbers locally.

// IdentityChangedWebhook is sent to NestJS when an identity key changes.
type IdentityChangedWebhook struct {
	UserID         string `json:"userId"`
	OldFingerprint string `json:"oldFingerprint,omitempty"`
	NewFingerprint string `json:"newFingerprint"`
}

// PreKeyItem represents a single pre-key with its ID and public key.
// Used by both handler and store to avoid anonymous struct repetition.
type PreKeyItem struct {
	KeyID     int    `json:"keyId"`
	PublicKey string `json:"publicKey"`
}

// ErrorResponse is the standard error format.
type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message,omitempty"`
}
