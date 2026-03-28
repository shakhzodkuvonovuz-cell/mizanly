/**
 * Signal Protocol type definitions.
 *
 * These types mirror the Signal Protocol specification:
 * - X3DH: https://signal.org/docs/specifications/x3dh/
 * - Double Ratchet: https://signal.org/docs/specifications/doubleratchet/
 *
 * All byte arrays are Uint8Array. All keys are 32 bytes unless noted.
 * Private keys NEVER leave the device. Server only stores public keys.
 */

// ============================================================
// KEY TYPES
// ============================================================

/** Ed25519 key pair — used for identity keys and signing */
export interface Ed25519KeyPair {
  publicKey: Uint8Array; // 32 bytes
  privateKey: Uint8Array; // 32 bytes (seed) — @noble/curves uses seed form, not expanded
}

/** X25519 key pair — used for DH key exchange */
export interface X25519KeyPair {
  publicKey: Uint8Array; // 32 bytes
  privateKey: Uint8Array; // 32 bytes
}

/** Signed pre-key: X25519 key pair + Ed25519 signature from identity key */
export interface SignedPreKey {
  keyId: number;
  keyPair: X25519KeyPair;
  signature: Uint8Array; // 64 bytes Ed25519 signature over publicKey
  createdAt: number; // Unix ms — retained 30 days after rotation
}

/** One-time pre-key: single-use X25519 key for forward secrecy on first message */
export interface OneTimePreKey {
  keyId: number;
  keyPair: X25519KeyPair;
}

// ============================================================
// PRE-KEY BUNDLE (fetched from server for session establishment)
// ============================================================

/** Public bundle served by the server for X3DH initiation */
export interface PreKeyBundle {
  identityKey: Uint8Array; // 32 bytes Ed25519 public key
  registrationId: number; // 14-bit unsigned (0-16383)
  deviceId: number; // Default 1, multi-device ready
  signedPreKey: {
    keyId: number;
    publicKey: Uint8Array; // 32 bytes X25519
    signature: Uint8Array; // 64 bytes Ed25519 signature
  };
  oneTimePreKey?: {
    // Optional — X3DH works without (3-DH fallback)
    keyId: number;
    publicKey: Uint8Array; // 32 bytes X25519
  };
  supportedVersions: number[]; // [1] initially, [1, 2] when PQ added
}

// ============================================================
// SIGNAL MESSAGES (wire format — sent inside socket emit)
// ============================================================

/** Header included with every encrypted message */
export interface MessageHeader {
  senderRatchetKey: Uint8Array; // 32 bytes: sender's current DH public key
  counter: number; // Message number in current sending chain
  previousCounter: number; // Messages sent in previous chain before DH step
}

/** Standard encrypted message (after session is established) */
export interface SignalMessage {
  header: MessageHeader;
  ciphertext: Uint8Array; // XChaCha20-Poly1305 encrypted content
}

/** First message in a session — includes X3DH material for session establishment */
export interface PreKeySignalMessage {
  registrationId: number;
  deviceId: number;
  preKeyId?: number; // OTP key ID used (omitted if no OTP available)
  signedPreKeyId: number;
  identityKey: Uint8Array; // 32 bytes: sender's Ed25519 public key
  ephemeralKey: Uint8Array; // 32 bytes: sender's ephemeral X25519 public key
  message: SignalMessage; // The actual encrypted message
}

// ============================================================
// DOUBLE RATCHET SESSION STATE
// ============================================================

/** State of a single sending or receiving chain */
export interface ChainState {
  chainKey: Uint8Array; // 32 bytes — advances per message via HMAC
  counter: number; // Next message number in this chain
}

/** A skipped message key — stored for out-of-order decryption */
export interface SkippedKey {
  ratchetKey: Uint8Array; // 32 bytes: the DH ratchet public key for this chain
  counter: number;
  messageKey: Uint8Array; // 32 bytes: derived from chain key at this counter
  createdAt: number; // Unix ms — keys older than 7 days are expired
}

/** Complete Double Ratchet session state — persisted in encrypted MMKV */
export interface SessionState {
  version: number; // Serialization version (1 = initial, 2 = PQ, 3 = sealed)
  protocolVersion: number; // E2E protocol version (1 = X3DH, 2 = PQXDH future)

  // DH ratchet state
  rootKey: Uint8Array; // 32 bytes — current root key
  sendingChain: ChainState;
  receivingChain: ChainState | null; // null before first received message
  senderRatchetKeyPair: X25519KeyPair; // Our current DH ratchet key pair
  receiverRatchetKey: Uint8Array | null; // Their current DH ratchet public key

  // Skipped message keys (max 2000 per Signal spec)
  skippedKeys: SkippedKey[];

  // Previous sending chain counter (for PN header field)
  previousSendingCounter: number;

  // Session metadata
  remoteIdentityKey: Uint8Array; // 32 bytes: their Ed25519 public key
  localRegistrationId: number;
  remoteRegistrationId: number;
  sessionEstablished: boolean; // true after first successful decrypt + persist

  // Identity trust status at session establishment time
  // Persists across app restarts so UI can show "[Security code changed]"
  identityTrust: 'trusted' | 'new' | 'changed';

  // Future compatibility
  sealedSender: boolean; // Always false initially
}

/** Multiple sessions per recipient (for simultaneous initiation) */
export interface SessionRecord {
  activeSession: SessionState;
  previousSessions: SessionState[]; // Kept for in-flight stragglers
}

// ============================================================
// SENDER KEYS (group encryption)
// ============================================================

/** Sender Key state for a specific group */
export interface SenderKeyState {
  chainId: number;
  generation: number; // Incremented on member removal rotation
  chainKey: Uint8Array; // 32 bytes — symmetric ratchet
  counter: number;
  signingKeyPair: Ed25519KeyPair; // For message authentication
  /** Skipped message keys for out-of-order delivery (max 200 per sender) */
  skippedKeys?: Array<{ counter: number; messageKey: Uint8Array }>;
}

/** Encrypted group message using Sender Keys */
export interface SenderKeyMessage {
  groupId: string;
  chainId: number;
  generation: number;
  counter: number;
  ciphertext: Uint8Array;
  signature: Uint8Array; // Ed25519 signature over (counter || ciphertext)
}

// ============================================================
// MEDIA ENCRYPTION
// ============================================================

/** Header prepended to encrypted media files (31 bytes, unencrypted) */
export interface MediaFileHeader {
  version: number; // 1 byte: protocol version
  chunkSize: number; // 4 bytes: bytes per plaintext chunk (default 1MB)
  totalChunks: number; // 4 bytes: total number of chunks
}

/** Media encryption result — keys travel inside the E2E message */
export interface EncryptedMediaInfo {
  mediaUrl: string; // R2 URL of encrypted blob
  mediaKey: Uint8Array; // 32 bytes: random per-file key
  mediaSha256: Uint8Array; // 32 bytes: SHA-256 of entire encrypted file
  totalChunks: number;
  fileSize: number; // Original file size in bytes
  mimeType: string;
  thumbnail?: string; // Base64 blurhash (~2KB) for instant preview
  // Media-type-specific metadata
  width?: number;
  height?: number;
  duration?: number; // Seconds, for audio/video
  fileName?: string;
}

/** Media message payload — this entire object is encrypted by Double Ratchet */
export interface MediaMessagePayload {
  type: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'VOICE' | 'FILE';
  mediaUrl: string;
  mediaKey: string; // Base64 of 32-byte key
  mediaSha256: string; // Base64 of 32-byte hash
  totalChunks: number;
  fileSize: number;
  mimeType: string;
  thumbnail?: string; // Base64 blurhash
  width?: number;
  height?: number;
  duration?: number;
  fileName?: string;
}

// ============================================================
// OFFLINE QUEUE & CACHE
// ============================================================

/** Pending message in the persistent MMKV offline queue */
export interface QueuedMessage {
  id: string; // Client-generated UUID (used for idempotent dedup)
  conversationId: string;
  isGroup: boolean;
  encryptedPayload: SignalMessage | PreKeySignalMessage | SenderKeyMessage;
  e2eVersion: number;
  e2eSenderDeviceId: number;
  status: 'pending' | 'sent' | 'failed';
  createdAt: number; // Unix ms
  retryCount: number;
  // NOTE: No plaintextForRetry field. Storing unencrypted plaintext in the
  // offline queue exposes content if MMKV encryption is compromised.
  // On retry after session reset, the application layer must re-provide
  // the plaintext for re-encryption. The queue only stores encrypted payloads.
}

/** Cached decrypted message in encrypted MMKV */
export interface CachedMessage {
  messageId: string;
  conversationId: string;
  senderId: string;
  content: string;
  messageType: string;
  createdAt: number;
  expiresAt?: number; // For disappearing messages — delete from cache when reached
}

// ============================================================
// SEARCH INDEX
// ============================================================

/** Inverted index entry for client-side message search */
export interface SearchIndexEntry {
  messageId: string;
  conversationId: string;
  timestamp: number;
}

// ============================================================
// API TYPES (server communication)
// ============================================================

/** Response from PUT /e2e/keys/identity */
export interface IdentityKeyResponse {
  success: boolean;
  commitment: string | null; // Future: Merkle proof for key transparency
}

/** Response from GET /e2e/keys/bundle/:userId */
export interface BundleResponse {
  bundle: PreKeyBundle;
  remainingOneTimeKeys: number;
}

/** Response from GET /e2e/keys/count */
export interface PreKeyCountResponse {
  count: number;
}

/** Request body for POST /e2e/keys/one-time-prekeys */
export interface UploadOneTimePreKeysRequest {
  deviceId: number;
  preKeys: Array<{
    keyId: number;
    publicKey: string; // Base64
  }>;
}

/** Request body for PUT /e2e/keys/signed-prekey */
export interface UploadSignedPreKeyRequest {
  deviceId: number;
  keyId: number;
  publicKey: string; // Base64
  signature: string; // Base64
}

/** Socket emit payload for encrypted messages */
export interface EncryptedMessagePayload {
  conversationId: string;
  clientMessageId: string; // UUID for idempotent dedup
  encryptedContent: string; // Base64 of ciphertext
  e2eVersion: number;
  e2eSenderDeviceId: number;
  e2eSenderRatchetKey: string; // Base64 of 32-byte DH public key
  e2eCounter: number;
  e2ePreviousCounter: number;
  e2eSenderKeyId?: number; // For group messages only
  encryptedLastMessagePreview?: string; // Base64 — client-encrypted preview
  messageType: string;
  mediaUrl?: string;
  replyToId?: string;
  isSpoiler?: boolean;
  isViewOnce?: boolean;
}
