# Multi-Device E2E Encryption Plan

> **Date:** 2026-03-27
> **Depends on:** Signal Protocol implementation (single-device) must be shipped and audited first
> **Timeline:** Post-launch + 1-3 months after single-device E2E is live

---

## The Problem

Device 1 (phone) has private key A. Device 2 (tablet) has private key B. When someone sends you an encrypted message, which key do they encrypt with? Both devices need to read it, but they have different keys.

---

## How Real Platforms Solve It

### Signal (pre-2021): Phone is king
- One primary device (phone), linked devices proxy through it
- Phone must be online for desktop/web to work
- Phone dies = nothing works anywhere
- Simple but terrible UX

### Signal (post-2021) + WhatsApp: Client fanout
- Each device has its own identity key + deviceId
- Server maps: `User Bob → [Phone, Tablet, Desktop]`
- When Alice sends to Bob:
  1. Fetch pre-key bundles for ALL of Bob's devices
  2. Create separate pairwise session with each device
  3. Encrypt the message 3 times (once per device)
  4. Send 3 encrypted copies to server
  5. Server routes each copy to the correct device
- Each device decrypts independently with its own private key

```
Alice types "hello"
  → encrypt("hello") with Bob-Phone session  → server → Bob's phone
  → encrypt("hello") with Bob-Tablet session → server → Bob's tablet
  → encrypt("hello") with Bob-Desktop session → server → Bob's desktop
```

### Matrix/Element: Megolm group ratchet
- Room keys shared to all devices via pairwise sessions
- New device gets room keys from existing devices ("key sharing request")
- Cross-signing: master key verifies device keys

---

## Cost of Multi-Device

**Message size multiplication:** Every message encrypted N times where N = recipient's device count. Group of 10 users × 3 devices = 30 encrypted copies per message.

**Session multiplication:** Alice (2 devices) talking to Bob (3 devices) = 6 pairwise sessions. Group of 10 users × 3 devices = 30 sessions per sender for Sender Key distribution.

**Bandwidth:** For text — negligible (3x a few KB). For media — encrypt file ONCE with random key, then only encrypt the 32-byte mediaKey N times. Media cost is minimal.

---

## Three Hard Sub-Problems

### 1. Message History on New Device

When you get a new phone, how do you read old messages?

| Approach | Who does it | Trade-off |
|----------|------------|-----------|
| **You don't** | Signal (until recently) | Simple but users hate it |
| **Primary device re-encrypts recent history** | WhatsApp | Primary must be online, only transfers recent messages |
| **Encrypted cloud backup** | WhatsApp (iCloud/GDrive) | User sets backup password, encrypted blob in cloud. Any device restores. |
| **Key escrow via PIN** | Signal SVR (Secure Value Recovery) | PIN-derived key on Intel SGX server. New device enters PIN → gets key. |

**Our choice: Encrypted cloud backup.**
- User sets a backup passphrase
- HKDF derives encryption key from passphrase + salt
- Message history + session states encrypted with XChaCha20-Poly1305
- Uploaded to Cloudflare R2 (already our storage provider)
- New device downloads and decrypts with passphrase
- No hardware dependency (unlike Signal's SGX)
- Server never has the passphrase or derived key

### 2. Device Verification

How do you know your second device is really yours and not an attacker?

| Approach | UX | Security |
|----------|-----|---------|
| **QR code scan between devices** | Both devices in hand | Best |
| **Numeric code on both** | Both devices accessible | Good |
| **Cross-signing with master key** | Transparent to user | Good (master key is single point of trust) |
| **Trust on first use (TOFU)** | Automatic | Weakest |

**Our choice: Cross-signing.**
- First E2E setup generates a master signing key (Ed25519)
- Master key stored in encrypted backup (passphrase-protected)
- Each device's identity key is signed by the master key
- Other users verify the master key via safety numbers (not individual device keys)
- Adding new device = master key signs new device's identity key
- If master key compromised = everything compromised (trade-off for usability)

### 3. Sender Key Redistribution for Groups

Groups use Sender Keys (encrypt once, all members decrypt). New device:
- Existing devices distribute their Sender Keys to new device via pairwise session
- OR: new device generates new Sender Keys, distributes to all group members
- Either way: pairwise sessions needed between new device and every group member's every device

**Our approach:** New device generates fresh Sender Keys on first group message send. Lazy distribution — only creates pairwise sessions when actually needed (first message to that device).

---

## Schema Changes

### Current (single-device)

```prisma
model E2EIdentityKey {
  id             String   @id @default(cuid())
  userId         String   @unique         // ← one key per user
  publicKey      Bytes
  registrationId Int
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

### Multi-device

```prisma
model E2EIdentityKey {
  id                  String   @id @default(cuid())
  userId              String
  deviceId            String                   // NEW: unique per device (cuid)
  deviceName          String?                  // "Shakhzod's iPhone 16", "Chrome on MacBook"
  publicKey           Bytes                    // 32 bytes Ed25519
  registrationId      Int
  masterKeySignature  Bytes?                   // NEW: master key's Ed25519 signature over this device's public key
  lastSeenAt          DateTime?                // NEW: track device activity for cleanup
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  @@unique([userId, deviceId])                 // CHANGED: from userId @unique
  @@index([userId])
  @@map("e2e_identity_keys")
}

model E2EMasterKey {
  id        String   @id @default(cuid())
  userId    String   @unique
  publicKey Bytes                              // 32 bytes Ed25519 master signing key (public only — private on device)
  createdAt DateTime @default(now())
  @@map("e2e_master_keys")
}

model E2EEncryptedBackup {
  id          String   @id @default(cuid())
  userId      String   @unique
  backupUrl   String                           // R2 URL of encrypted backup blob
  backupSalt  Bytes                            // Salt for HKDF(passphrase + salt → backup key)
  version     Int      @default(1)             // Backup format version
  sizeBytes   Int                              // For display ("Your backup is 12 MB")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@map("e2e_encrypted_backups")
}
```

Pre-key models also become per-device:

```prisma
model E2ESignedPreKey {
  // ... existing fields ...
  deviceId  String                             // NEW
  @@unique([userId, deviceId, keyId])          // CHANGED
}

model E2EOneTimePreKey {
  // ... existing fields ...
  deviceId  String                             // NEW
  @@unique([userId, deviceId, keyId])          // CHANGED
  @@index([userId, deviceId, used])            // CHANGED
}
```

---

## API Changes

### Modified endpoints

| Endpoint | Single-device | Multi-device |
|----------|--------------|-------------|
| `PUT /e2e/keys/identity` | One key per user | One key per (user, deviceId). Body includes `deviceId`, `deviceName`. |
| `GET /e2e/keys/bundle/:userId` | Returns one bundle | Returns array of bundles (one per device). Atomically claims one OTP per device. |
| `PUT /e2e/keys/signed-prekey` | One per user | One per (user, deviceId). Body includes `deviceId`. |
| `POST /e2e/keys/one-time-prekeys` | Batch per user | Batch per (user, deviceId). Body includes `deviceId`. |
| `GET /e2e/keys/count` | One count | Count per deviceId. Returns `{ devices: [{ deviceId, remaining }] }`. |

### New endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/e2e/devices` | GET | List all your registered devices (id, name, lastSeenAt, masterKeySigned) |
| `/e2e/devices/:deviceId` | DELETE | Remove a device (deletes identity key + pre-keys, invalidates sessions) |
| `/e2e/master-key` | PUT | Register/update master signing key |
| `/e2e/master-key` | GET | Get user's master public key (for cross-signing verification) |
| `/e2e/backup` | PUT | Upload encrypted backup blob to R2 |
| `/e2e/backup` | GET | Download encrypted backup (returns URL + salt) |
| `/e2e/backup` | DELETE | Delete backup |

### Message delivery changes

**Current (single-device):**
```
Client → server: one encrypted message
Server → recipient: delivers to conversation room
```

**Multi-device:**
```
Client → server: N encrypted copies, each tagged with recipientDeviceId
Server → recipient: delivers each copy to device-specific socket room

// Socket room scheme changes:
// Old: user:{userId}
// New: user:{userId}:{deviceId}  (each device joins its own room)
```

**Message storage:**
```prisma
model E2EMessageCopy {
  id                String   @id @default(cuid())
  messageId         String                    // FK to Message
  recipientUserId   String
  recipientDeviceId String
  encryptedContent  Bytes                     // Encrypted for this specific device
  e2eSenderRatchetKey Bytes?
  e2eCounter        Int?
  e2ePreviousCounter Int?
  delivered         Boolean  @default(false)
  createdAt         DateTime @default(now())

  @@index([recipientUserId, recipientDeviceId, delivered])
  @@index([messageId])
  @@map("e2e_message_copies")
}
```

The main `Message` record keeps metadata (senderId, conversationId, messageType, timestamps). The encrypted content moves to `E2EMessageCopy` — one row per recipient device.

---

## Mobile Changes

### Device registration on app open

```typescript
async function initializeDevice(): Promise<void> {
  // 1. Check if this device has an identity key
  let deviceId = await SecureStore.getItemAsync('e2e_device_id');

  if (!deviceId) {
    // New device
    deviceId = generateCUID();
    await SecureStore.setItemAsync('e2e_device_id', deviceId);

    // Generate identity key for this device
    const identityKeyPair = generateEd25519KeyPair();
    await saveIdentityKeyPair(identityKeyPair);

    // Register with server
    await e2eApi.registerIdentityKey({
      deviceId,
      deviceName: await getDeviceName(), // "iPhone 16" via expo-device
      publicKey: base64(identityKeyPair.publicKey),
      registrationId: generateRegistrationId(),
    });

    // If master key exists (not first device), sign this device
    const masterKey = await loadMasterKey();
    if (masterKey) {
      const signature = ed25519Sign(masterKey.privateKey, identityKeyPair.publicKey);
      await e2eApi.signDevice(deviceId, signature);
    }

    // If this is the FIRST device, generate master key
    if (!masterKey) {
      const masterKeyPair = generateEd25519KeyPair();
      await saveMasterKey(masterKeyPair);
      await e2eApi.registerMasterKey(base64(masterKeyPair.publicKey));
      // Self-sign this device
      const sig = ed25519Sign(masterKeyPair.privateKey, identityKeyPair.publicKey);
      await e2eApi.signDevice(deviceId, sig);
    }
  }

  // 2. Replenish pre-keys for this device
  await checkAndReplenishPreKeys(deviceId);
}
```

### Sending to multi-device recipient

```typescript
async function encryptForAllDevices(
  recipientId: string,
  plaintext: string,
): Promise<Array<{ deviceId: string; encrypted: SignalMessage }>> {
  // 1. Fetch all device bundles
  const bundles = await e2eApi.getPreKeyBundles(recipientId);
  // Returns: [{ deviceId: "abc", identityKey, signedPreKey, oneTimePreKey }, ...]

  const copies = [];
  for (const bundle of bundles) {
    // 2. Get or create session per device
    const session = await getOrCreateSession(recipientId, bundle.deviceId, bundle);

    // 3. Encrypt with that device's session
    const encrypted = await sessionEncrypt(session, plaintext);
    copies.push({ deviceId: bundle.deviceId, encrypted });
  }

  return copies;
}
```

### Sending own message to own other devices

When you send a message, your other devices also need to see it. Two approaches:

**Option A: Server-side copy** — Server duplicates the message to sender's other devices (but server can't read the content).

**Option B: Client fanout to self** — Sender also encrypts for their own other devices and sends copies. This is what Signal does.

**Our choice: Option B.** Sender encrypts for: all recipient devices + all of sender's OTHER devices. This way all your devices see your sent messages.

### Device management screen

New screen: `apps/mobile/app/(screens)/device-management.tsx`

```
Your Devices
─────────────────
📱 iPhone 16 Pro          ← This device
   Added Mar 27, 2026
   Last active: Now

💻 Chrome on MacBook Air
   Added Mar 28, 2026
   Last active: 2 hours ago
   [Remove Device]

📱 Old iPhone 14
   Added Mar 15, 2026
   Last active: 12 days ago
   [Remove Device]
```

Remove device → deletes identity key + pre-keys on server → invalidates all sessions for that device → other users' clients will see the device disappear from their session list.

---

## Encrypted Cloud Backup

### Backup creation

```typescript
async function createBackup(passphrase: string): Promise<void> {
  // 1. Derive backup key from passphrase
  const salt = generateRandomBytes(32);
  const backupKey = hkdf(sha256, new TextEncoder().encode(passphrase), salt, 'MizanlyBackup', 32);

  // 2. Collect all crypto state
  const backupData = {
    version: 1,
    masterKey: await loadMasterKey(),           // Master signing key pair
    identityKeys: await loadAllIdentityKeys(),  // All device identity keys
    sessions: await loadAllSessions(),          // All pairwise session states
    senderKeys: await loadAllSenderKeys(),      // Group sender keys
    preKeyCounters: await loadPreKeyCounters(), // Next pre-key IDs
  };

  // 3. Serialize and encrypt
  const plaintext = new TextEncoder().encode(JSON.stringify(backupData));
  const nonce = generateRandomBytes(24);
  const encrypted = xchacha20poly1305(backupKey, nonce).encrypt(plaintext);
  const blob = concat(nonce, encrypted);

  // 4. Upload to R2
  const { uploadUrl } = await e2eApi.getBackupUploadUrl();
  await fetch(uploadUrl, { method: 'PUT', body: blob });

  // 5. Store salt on server (NOT the passphrase or key)
  await e2eApi.saveBackupMeta({ salt: base64(salt), sizeBytes: blob.byteLength });
}
```

### Backup restore (new device)

```typescript
async function restoreBackup(passphrase: string): Promise<void> {
  // 1. Fetch backup metadata
  const { backupUrl, salt } = await e2eApi.getBackupMeta();

  // 2. Re-derive key
  const backupKey = hkdf(sha256, new TextEncoder().encode(passphrase), decode(salt), 'MizanlyBackup', 32);

  // 3. Download and decrypt
  const response = await fetch(backupUrl);
  const blob = new Uint8Array(await response.arrayBuffer());
  const nonce = blob.slice(0, 24);
  const ciphertext = blob.slice(24);
  const plaintext = xchacha20poly1305(backupKey, nonce).decrypt(ciphertext);

  // 4. Restore state
  const backupData = JSON.parse(new TextDecoder().decode(plaintext));
  await restoreMasterKey(backupData.masterKey);
  await restoreSessions(backupData.sessions);
  await restoreSenderKeys(backupData.senderKeys);
  // ... etc
}
```

---

## Implementation Phases

| Phase | When | What | Effort |
|-------|------|------|--------|
| **Phase 0** | Now | Single-device E2E (current plan) | 2 weeks |
| **Phase 0.5** | After audit | Ship single-device E2E | - |
| **Phase 1** | +1 month | Per-device identity keys + client fanout | 1-2 weeks |
| **Phase 2** | +2 months | Device management screen + remove device | 3-4 days |
| **Phase 3** | +2.5 months | Encrypted cloud backup (passphrase-based) | 1 week |
| **Phase 4** | +3 months | Cross-signing (master key signs device keys) | 1 week |
| **Phase 5** | +3.5 months | Second crypto audit for multi-device additions | $10-20K, 2-4 weeks |

---

## Why Single-Device First is the Right Call

- Signal operated single-device only from 2014 to 2021 (7 years)
- WhatsApp added multi-device in 2021 — 12 years after launch
- The single-device plan is designed to be multi-device compatible:
  - Adding `deviceId` to identity keys is additive (no breaking changes)
  - Pre-key bundles returning array instead of single is a minor API change
  - Session keys become `session:{recipientId}:{deviceId}` instead of `session:{recipientId}`
  - Sender Keys just need distribution to more devices
- Nothing gets torn down. Multi-device is an extension, not a rewrite.

---

## Risks Specific to Multi-Device

1. **O(devices) encryption per message** — 3 devices × 10 group members = 30 encryptions per group message. Mostly fast (symmetric), but initial X3DH for 30 device sessions is 30 API calls + 120 DH operations. Need lazy session creation + background distribution.

2. **Stale devices** — User's old phone still registered but never comes online. Server stores encrypted copies forever. Need: auto-remove devices inactive > 90 days, or cap at 5 devices per user.

3. **Backup passphrase forgotten** — User forgets passphrase = can't restore on new device = permanent loss of all sessions. No recovery possible (by design). Must be very clear in UX: "Write this down. We cannot recover it."

4. **Master key compromise** — If master key leaks, attacker can sign fake device keys. Mitigation: master key private stored ONLY in encrypted backup + device SecureStore. Never transmitted. Server only has public half.

5. **Race condition: two devices send simultaneously** — Each device has its own sending chain. Not a problem — Double Ratchet handles this. Each device's messages are on independent chains. Recipient processes them independently.
