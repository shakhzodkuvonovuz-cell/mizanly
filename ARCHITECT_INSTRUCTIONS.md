# BATCH 40: Chat Parity — WhatsApp Feature Completeness — 14 Agents

**Date:** 2026-03-17
**Theme:** Tier 4 ship-blocking — complete Risalah (WhatsApp) parity. E2E encryption, disappearing messages, view-once media, group admin roles, pin messages, file/location/contact sharing, chat lock, chat wallpaper, chat export, storage management. Group video calls, screen sharing, and multi-device deferred (require SFU server infrastructure).

---

## GLOBAL RULES

1. Read `CLAUDE.md` first — mandatory rules
2. No `any` in non-test code. No `@ts-ignore`. No `@ts-expect-error`.
3. NEVER modify any file not explicitly listed in your agent task
4. All new screens: `useTranslation` + `t()`, `ScreenErrorBoundary`, `RefreshControl`
5. Use `radius.*` from theme, `<Icon name="..." />`, `<BottomSheet>` not Modal
6. After completing: `git add -A && git commit -m "feat: batch 40 agent N — <description>"`

---

## AGENT 1: Backend — E2E Encryption Infrastructure

**Modifies:**
- `apps/api/prisma/schema.prisma`

**Creates:**
- `apps/api/src/modules/encryption/encryption.module.ts`
- `apps/api/src/modules/encryption/encryption.controller.ts`
- `apps/api/src/modules/encryption/encryption.service.ts`

**Schema changes — add to schema.prisma:**
```prisma
model EncryptionKey {
  id               String   @id @default(cuid())
  userId           String   @unique
  publicKey        String   // X25519 public key (base64)
  keyFingerprint   String   // SHA-256 of public key (for verification)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  @@index([userId])
  @@map("encryption_keys")
}

model ConversationKeyEnvelope {
  id               String   @id @default(cuid())
  conversationId   String
  userId           String   // Recipient of the envelope
  encryptedKey     String   // Conversation key encrypted with recipient's public key (base64)
  nonce            String   // Nonce used for encryption (base64)
  version          Int      @default(1) // Key version (increments on rotation)
  createdAt        DateTime @default(now())
  @@unique([conversationId, userId, version])
  @@index([conversationId])
  @@index([userId])
  @@map("conversation_key_envelopes")
}
```

**Also add to Message model:**
```prisma
  isEncrypted  Boolean  @default(false)
  nonce        String?  // Encryption nonce for this message (base64)
```

**Endpoints (6):**
```
POST   /encryption/keys              — Register public key (auth, body: { publicKey })
GET    /encryption/keys/:userId      — Get user's public key (auth)
GET    /encryption/keys/bulk         — Get multiple users' keys (auth, query: userIds=id1,id2)
POST   /encryption/envelopes         — Store key envelope (auth, body: { conversationId, userId, encryptedKey, nonce })
GET    /encryption/envelopes/:convId — Get my envelope for conversation (auth)
POST   /encryption/rotate/:convId    — Rotate conversation key (auth, body: { envelopes: [{userId, encryptedKey, nonce}] })
```

**Service:**
```typescript
async registerKey(userId: string, publicKey: string)
  // Compute fingerprint: SHA-256 of publicKey bytes, take first 32 hex chars
  // Upsert EncryptionKey

async getPublicKey(userId: string)
  // Return publicKey + fingerprint

async getBulkKeys(userIds: string[])
  // Return array of {userId, publicKey, fingerprint}

async storeEnvelope(userId: string, data: { conversationId, userId: recipientId, encryptedKey, nonce })
  // Verify sender is member of conversation
  // Upsert envelope

async getEnvelope(conversationId: string, userId: string)
  // Return latest version envelope for this user+conversation

async rotateKey(conversationId: string, userId: string, envelopes: { userId: string, encryptedKey: string, nonce: string }[])
  // Verify sender is member
  // Increment version
  // Create new envelopes for all members
```

**~400 lines total**

---

## AGENT 2: Backend — Pin Messages + View-Once + Message Jobs

**Modifies:**
- `apps/api/prisma/schema.prisma` (add fields)
- `apps/api/src/modules/messages/messages.service.ts` (add methods)
- `apps/api/src/modules/messages/messages.controller.ts` (add endpoints)

**Schema changes:**
Add to Message model:
```prisma
  isPinned        Boolean  @default(false)
  pinnedAt        DateTime?
  pinnedById      String?
  isViewOnce      Boolean  @default(false)
  viewedAt        DateTime?  // When view-once was opened
```

Add LOCATION and CONTACT to MessageType enum:
```prisma
enum MessageType {
  TEXT
  IMAGE
  VOICE
  VIDEO
  STICKER
  FILE
  SYSTEM
  GIF
  STORY_REPLY
  LOCATION
  CONTACT
}
```

**New service methods in messages.service.ts:**
```typescript
async pinMessage(conversationId: string, messageId: string, userId: string)
  // Verify membership, max 3 pinned per conversation
  // Set isPinned=true, pinnedAt=now, pinnedById=userId

async unpinMessage(conversationId: string, messageId: string, userId: string)
  // Verify membership
  // Set isPinned=false, pinnedAt=null, pinnedById=null

async getPinnedMessages(conversationId: string, userId: string)
  // Verify membership
  // Return all pinned messages ordered by pinnedAt desc

async sendViewOnceMessage(conversationId: string, senderId: string, data: {...})
  // Same as sendMessage but with isViewOnce=true

async markViewOnceViewed(messageId: string, userId: string)
  // Verify membership, verify not sender
  // Set viewedAt=now, clear mediaUrl after viewing (or mark as expired)

async processExpiredMessages()
  // Find messages where expiresAt < now and isDeleted=false
  // Soft delete them (isDeleted=true, content=null, mediaUrl=null)
  // Find view-once messages where viewedAt is set and viewedAt < now - 30sec
  // Soft delete them too
```

**New controller endpoints:**
```
POST   /messages/:convId/:messageId/pin     — Pin message (auth)
DELETE /messages/:convId/:messageId/pin     — Unpin message (auth)
GET    /messages/:convId/pinned              — Get pinned messages (auth)
POST   /messages/:convId/view-once           — Send view-once message (auth)
POST   /messages/:messageId/view-once/viewed — Mark view-once as viewed (auth)
```

**~200 lines added across 2 files**

---

## AGENT 3: Backend — Group Admin Roles + Permissions

**Modifies:**
- `apps/api/prisma/schema.prisma`
- `apps/api/src/modules/messages/messages.service.ts`
- `apps/api/src/modules/messages/messages.controller.ts`

**Schema changes:**
Add to ConversationMember model:
```prisma
  role          String   @default("member") @db.VarChar(10)  // owner, admin, member
  isBanned      Boolean  @default(false)
  customTone    String?  // Notification tone identifier
  wallpaperUrl  String?  // Per-conversation wallpaper
```

**New service methods:**
```typescript
async promoteToAdmin(conversationId: string, userId: string, targetUserId: string)
  // Verify userId is owner or admin
  // Set target role to 'admin'

async demoteFromAdmin(conversationId: string, userId: string, targetUserId: string)
  // Verify userId is owner
  // Set target role to 'member'

async banMember(conversationId: string, userId: string, targetUserId: string)
  // Verify userId is owner or admin, target is not owner
  // Set isBanned=true, remove from conversation

async setGroupPermissions(conversationId: string, userId: string, data)
  // Only owner/admin: set who can send (all/admins), who can edit group info

async setConversationWallpaper(conversationId: string, userId: string, wallpaperUrl: string | null)
  // Update ConversationMember wallpaperUrl for this user

async setCustomTone(conversationId: string, userId: string, tone: string | null)
  // Update ConversationMember customTone for this user
```

**Update existing methods:**
- `addGroupMembers`: check if userId is owner or admin
- `removeGroupMember`: check if userId is owner or admin, can't remove owner
- `updateGroup`: check if userId is owner or admin

**New controller endpoints:**
```
POST   /messages/:convId/members/:userId/promote   — Promote to admin (auth)
POST   /messages/:convId/members/:userId/demote     — Demote to member (auth)
POST   /messages/:convId/members/:userId/ban        — Ban member (auth)
PATCH  /messages/:convId/wallpaper                  — Set wallpaper (auth, body: { wallpaperUrl })
PATCH  /messages/:convId/tone                       — Set notification tone (auth, body: { tone })
```

**~200 lines added**

---

## AGENT 4: Backend — Chat Export + Location/Contact Messages

**Creates:**
- `apps/api/src/modules/chat-export/chat-export.module.ts`
- `apps/api/src/modules/chat-export/chat-export.controller.ts`
- `apps/api/src/modules/chat-export/chat-export.service.ts`

**Chat export endpoints:**
```
POST  /chat-export/:convId          — Generate chat export (auth, body: { format: 'json'|'text', includeMedia?: boolean })
GET   /chat-export/:exportId/status — Check export status
GET   /chat-export/:exportId/download — Download export file
```

**Service:**
```typescript
async generateExport(conversationId: string, userId: string, format: 'json' | 'text', includeMedia: boolean)
  // Verify membership
  // Fetch all messages (paginated internally, batch process)
  // Format as JSON or plain text:
  //   Text format: "[2026-03-17 14:30] @username: message content"
  //   JSON format: array of message objects with sender info
  // If includeMedia: include mediaUrl references (not actual files)
  // Return export data (for small exports) or create a file for large ones

async getExportStatus(exportId: string, userId: string)
  // Return progress

async downloadExport(exportId: string, userId: string)
  // Return file content
```

**Location message support** — no new endpoints needed, just ensure sendMessage handles LOCATION type:
- Location payload: `{ latitude: number, longitude: number, address?: string, name?: string }`
- Contact payload: `{ name: string, phone?: string, email?: string }`
- These go in the existing `content` field as JSON strings

**~300 lines total**

---

## AGENT 5: Mobile — E2E Encryption Client Library

**Creates:**
- `apps/mobile/src/services/encryption.ts`
- `apps/mobile/src/services/encryptionApi.ts`
- `apps/mobile/src/types/encryption.ts`

**types/encryption.ts (~30 lines):**
```tsx
export interface EncryptionKey {
  userId: string;
  publicKey: string;
  keyFingerprint: string;
}

export interface KeyEnvelope {
  conversationId: string;
  encryptedKey: string;
  nonce: string;
  version: number;
}

export interface EncryptedPayload {
  ciphertext: string;  // base64
  nonce: string;       // base64
}
```

**encryptionApi.ts (~40 lines):**
Mirror backend encryption endpoints.

**encryption.ts (~300 lines):**
```typescript
// Core E2E encryption service using tweetnacl (pure JS, works in Expo)
import nacl from 'tweetnacl';
import * as SecureStore from 'expo-secure-store';
import { encryptionApi } from './encryptionApi';

const PRIVATE_KEY_STORE = 'mizanly_e2e_private_key';
const CONVERSATION_KEYS_STORE = 'mizanly_conv_keys';

export class EncryptionService {
  private keyPair: nacl.BoxKeyPair | null = null;
  private conversationKeys: Map<string, Uint8Array> = new Map();

  // ── Key Management ──
  async initialize()
    // Load or generate X25519 keypair
    // Store private key in SecureStore (biometric protected)
    // Register public key with server

  async getOrCreateKeyPair(): Promise<nacl.BoxKeyPair>
    // Try load from SecureStore
    // If not found, generate new pair
    // Return keypair

  async registerPublicKey()
    // POST to /encryption/keys with base64 public key

  // ── Conversation Key Exchange ──
  async setupConversationEncryption(conversationId: string, memberUserIds: string[])
    // 1. Generate random 32-byte conversation key
    // 2. Fetch public keys for all members
    // 3. For each member: encrypt conversation key with their public key
    // 4. POST envelopes to server
    // 5. Cache conversation key locally

  async getConversationKey(conversationId: string): Promise<Uint8Array | null>
    // Check local cache first
    // If not cached, fetch envelope from server, decrypt with private key
    // Cache and return

  // ── Message Encryption/Decryption ──
  async encryptMessage(conversationId: string, plaintext: string): Promise<EncryptedPayload>
    // Get conversation key
    // Generate random nonce (24 bytes)
    // Encrypt with nacl.secretbox(message, nonce, key)
    // Return { ciphertext: base64, nonce: base64 }

  async decryptMessage(conversationId: string, ciphertext: string, nonce: string): Promise<string>
    // Get conversation key
    // Decrypt with nacl.secretbox.open(ciphertext, nonce, key)
    // Return plaintext

  // ── Key Rotation ──
  async rotateConversationKey(conversationId: string, memberUserIds: string[])
    // Generate new conversation key
    // Re-encrypt for all members
    // POST rotation to server
    // Update local cache

  // ── Verification ──
  getFingerprint(): string
    // Return SHA-256 fingerprint of public key in "XXXX XXXX XXXX" format
    // For QR code / visual comparison
}

export const encryptionService = new EncryptionService();
```

**IMPORTANT:** Use `tweetnacl` (pure JS, zero native deps, works in Expo managed workflow). The package is `tweetnacl` on npm. Also use `tweetnacl-util` for encoding helpers.

**~370 lines total**

---

## AGENT 6: Mobile — Chat Lock Screen

**Creates:**
- `apps/mobile/app/(screens)/chat-lock.tsx`
- `apps/mobile/src/hooks/useChatLock.ts`

**useChatLock.ts (~80 lines):**
```tsx
// Hook for managing per-conversation biometric lock
// Uses expo-secure-store to store locked conversation IDs
// Uses expo-local-authentication for Face ID / fingerprint

import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

export function useChatLock() {
  const isLocked = async (conversationId: string): Promise<boolean> => { ... };
  const lockConversation = async (conversationId: string) => { ... };
  const unlockConversation = async (conversationId: string) => { ... };
  const authenticate = async (): Promise<boolean> => {
    // Check if device has biometrics
    // Prompt for authentication
    // Return success/failure
  };
  return { isLocked, lockConversation, unlockConversation, authenticate };
}
```

**chat-lock.tsx (~250 lines):**
```
Screen for configuring conversation lock:
1. GlassHeader "Chat Lock" + back
2. Toggle: "Lock this conversation" (Switch)
3. When enabled: biometric authentication required to view
4. "Change lock method" option (if multiple biometrics available)
5. Info text: "When locked, this conversation won't show message previews in notifications"
6. Unlock requires Face ID / fingerprint
```

**~330 lines total**

---

## AGENT 7: Mobile — View-Once Media + Disappearing Messages UI

**Creates:**
- `apps/mobile/src/components/ViewOnceMedia.tsx`
- `apps/mobile/app/(screens)/disappearing-settings.tsx`

**ViewOnceMedia.tsx (~250 lines):**
```tsx
// Component for viewing view-once photos/videos
// Shows media once, then shows "Opened" placeholder
// Props: { message: Message; onViewed: () => void }
//
// UI:
// - If not viewed: "Photo/Video" pill with eye icon, tap to view
// - Viewing: full-screen overlay, auto-closes after media ends (video) or 10sec (photo)
// - After viewed: grayed out "Opened" with clock icon
// - Sender sees: "Opened" with check when recipient viewed
//
// Uses expo-av Video for video, expo-image for photos
// Calls messagesApi.markViewOnceViewed on open
```

**disappearing-settings.tsx (~200 lines):**
```
Screen for setting disappearing message timer per conversation:
1. GlassHeader "Disappearing Messages" + back
2. Current setting displayed
3. Options list:
   - Off
   - 24 hours
   - 7 days
   - 90 days
4. Info text explaining the feature
5. Calls messagesApi.setDisappearingTimer on selection
```

**~450 lines total**

---

## AGENT 8: Mobile — Pin Messages UI + Location Sharing

**Creates:**
- `apps/mobile/src/components/PinnedMessageBar.tsx`
- `apps/mobile/app/(screens)/location-picker.tsx`
- `apps/mobile/src/components/LocationMessage.tsx`
- `apps/mobile/src/components/ContactMessage.tsx`

**PinnedMessageBar.tsx (~120 lines):**
```tsx
// Slim bar shown at top of conversation when pinned messages exist
// Props: { pinnedMessages: Message[]; onTapPin: (messageId: string) => void; onViewAll: () => void }
// Shows rotating preview of latest pinned message
// Tap → scroll to pinned message, tap "View all" → pinned-messages screen
```

**location-picker.tsx (~300 lines):**
```
Screen for sharing location in chat:
1. GlassHeader "Share Location" + back
2. Map view placeholder (or address input since expo-maps needs config)
3. Current location button (uses expo-location)
4. Address search input
5. "Share Location" GradientButton
6. Returns { latitude, longitude, address, name } to conversation
```

**LocationMessage.tsx (~150 lines):**
```tsx
// Renders a location message bubble in conversation
// Shows mini map preview (static image from map API) or address card
// Tap opens in native maps app via Linking
```

**ContactMessage.tsx (~120 lines):**
```tsx
// Renders a contact card message bubble
// Shows name, phone, email with icons
// "Add to Contacts" button
```

**~690 lines total**

---

## AGENT 9: Mobile — Chat Wallpaper + Notification Tones

**Creates:**
- `apps/mobile/app/(screens)/chat-wallpaper.tsx`
- `apps/mobile/app/(screens)/notification-tones.tsx`

**chat-wallpaper.tsx (~350 lines):**
```
Screen for setting per-conversation wallpaper:
1. GlassHeader "Chat Wallpaper" + back
2. Preview of current wallpaper
3. Options:
   a. Solid colors (grid of 12 colors)
   b. Gradients (grid of 8 gradient pairs)
   c. Built-in patterns (6-8 Islamic geometric patterns)
   d. Custom image (from camera roll via ImagePicker)
   e. Default (remove wallpaper)
4. "Set Wallpaper" GradientButton
5. Saves via messagesApi.setConversationWallpaper
```

**notification-tones.tsx (~250 lines):**
```
Screen for per-conversation notification sound:
1. GlassHeader "Notification Tone" + back
2. List of tone options:
   - Default
   - Silent
   - Adhan (soft)
   - Gentle Bell
   - Soft Chime
   - Islamic Melody
   - None
3. Each option has play preview button (Audio.Sound from expo-av)
4. Currently selected has emerald checkmark
5. Saves via messagesApi.setCustomTone
```

**~600 lines total**

---

## AGENT 10: Mobile — Storage Management + Media Settings

**Creates:**
- `apps/mobile/app/(screens)/storage-management.tsx`
- `apps/mobile/app/(screens)/media-settings.tsx`

**storage-management.tsx (~350 lines):**
```
Screen showing storage used by Mizanly:
1. GlassHeader "Storage" + back
2. Total storage used (calculated from AsyncStorage + cached images)
3. Per-conversation breakdown (sorted by size):
   - Conversation name + avatar
   - Size badge (e.g., "45.2 MB")
   - Chevron to manage
4. Per-conversation detail:
   - Photos: X MB (with clear button)
   - Videos: X MB (with clear button)
   - Voice: X MB (with clear button)
   - Files: X MB (with clear button)
   - "Clear All" for conversation
5. Total clear cache button at bottom
6. Uses FileSystem from expo-file-system for size calculation
```

**media-settings.tsx (~250 lines):**
```
Screen for media auto-download preferences:
1. GlassHeader "Media Auto-Download" + back
2. Sections:
   a. "When using mobile data":
      - Photos (toggle)
      - Audio (toggle)
      - Video (toggle)
      - Documents (toggle)
   b. "When connected to Wi-Fi":
      - Photos (toggle, default ON)
      - Audio (toggle, default ON)
      - Video (toggle, default ON)
      - Documents (toggle, default ON)
   c. "When roaming":
      - All off by default
3. "Data saver mode" toggle (disables all auto-download)
4. Settings stored in AsyncStorage
```

**~600 lines total**

---

## AGENT 11: Mobile — Chat Export + Contact Sharing UI

**Creates:**
- `apps/mobile/app/(screens)/chat-export.tsx`
- `apps/mobile/src/services/chatExportApi.ts`

**chatExportApi.ts (~30 lines):**
Mirror backend chat-export endpoints.

**chat-export.tsx (~300 lines):**
```
Screen for exporting chat history:
1. GlassHeader "Export Chat" + back
2. Conversation info card (name, member count, message count)
3. Format selector:
   - Text (.txt) — human readable
   - JSON (.json) — machine readable
4. Options:
   - Include media links (toggle)
   - Date range: All / Last 30 days / Last 7 days / Custom
5. "Export" GradientButton
6. Progress indicator while generating
7. Share sheet (via expo-sharing) when complete
8. Uses expo-file-system to write temp file, expo-sharing to share
```

**~330 lines total**

---

## AGENT 12: Mobile — Status Privacy + Disappearing Defaults

**Creates:**
- `apps/mobile/app/(screens)/status-privacy.tsx`
- `apps/mobile/app/(screens)/disappearing-default.tsx`

**status-privacy.tsx (~300 lines):**
```
Screen for controlling who sees your online status:
1. GlassHeader "Status Privacy" + back
2. "Last seen" options:
   - Everyone
   - My contacts
   - My contacts except... (select list)
   - Nobody
3. "Online" options:
   - Same as last seen
   - Nobody
4. "Read receipts" toggle
5. "Typing indicators" toggle
6. Info text: "Changes apply to future messages"
7. Saves to user settings via settingsApi
```

**disappearing-default.tsx (~200 lines):**
```
Screen for setting default disappearing timer for all NEW conversations:
1. GlassHeader "Default Message Timer" + back
2. Options:
   - Off (default)
   - 24 hours
   - 7 days
   - 90 days
3. Info: "This will apply to all new conversations you start"
4. Saves to user settings
```

**~500 lines total**

---

## AGENT 13: Mobile — Wire Encryption to Conversation

**Modifies (ONLY):**
- `apps/mobile/app/(screens)/conversation/[id].tsx`

**Changes:**
1. Import encryption service:
```tsx
import { encryptionService } from '@/services/encryption';
```

2. Add encryption state:
```tsx
const [isEncrypted, setIsEncrypted] = useState(false);
const [encryptionReady, setEncryptionReady] = useState(false);
```

3. On conversation load, check if encryption is set up:
```tsx
useEffect(() => {
  const checkEncryption = async () => {
    const key = await encryptionService.getConversationKey(conversationId);
    if (key) {
      setIsEncrypted(true);
      setEncryptionReady(true);
    }
  };
  checkEncryption();
}, [conversationId]);
```

4. Wrap message sending with encryption:
```tsx
// In the send handler, before calling messagesApi.sendMessage:
if (isEncrypted && encryptionReady) {
  const encrypted = await encryptionService.encryptMessage(conversationId, content);
  // Send encrypted content with isEncrypted: true
} else {
  // Send plaintext as before
}
```

5. Wrap message display with decryption:
```tsx
// In the message rendering, if message.isEncrypted:
// Decrypt content on-the-fly and display
// Show lock icon next to encrypted messages
```

6. Add encryption banner at top:
```tsx
{isEncrypted && (
  <View style={styles.encryptionBanner}>
    <Icon name="lock" size="xs" color={colors.emerald} />
    <Text style={styles.encryptionText}>{t('chat.e2eEncrypted')}</Text>
  </View>
)}
```

7. Add "Enable encryption" option in conversation menu (BottomSheet).

**~80-120 lines added**

---

## AGENT 14: Mobile — Key Verification Screen

**Creates:**
- `apps/mobile/app/(screens)/verify-encryption.tsx`

**verify-encryption.tsx (~300 lines):**
```
Screen for verifying encryption keys with another user:
1. GlassHeader "Verify Security" + back
2. Both users' key fingerprints displayed:
   - Your fingerprint (in XXXX XXXX XXXX format)
   - Their fingerprint
3. QR code containing your fingerprint (react-native-qrcode-svg)
4. "Scan their code" button → opens QR scanner
5. Verification status:
   - Not verified: yellow warning
   - Verified: green checkmark
6. Info text explaining why verification matters
7. "Mark as verified" manual button (for in-person verification)
```

**~300 lines total**

---

## FILE → AGENT CONFLICT MAP (zero overlaps)

| Agent | Files | Type |
|-------|-------|------|
| 1 | schema.prisma (ADD models), modules/encryption/ (3 NEW) | Backend |
| 2 | schema.prisma (ADD fields), messages.service.ts + controller (ADD methods) | Backend |
| 3 | schema.prisma (ADD fields), messages.service.ts + controller (ADD methods) | Backend |
| 4 | modules/chat-export/ (3 NEW) | Backend |
| 5 | services/encryption.ts, encryptionApi.ts, types/encryption.ts (3 NEW) | Mobile |
| 6 | chat-lock.tsx (NEW), hooks/useChatLock.ts (NEW) | Mobile |
| 7 | ViewOnceMedia.tsx (NEW), disappearing-settings.tsx (NEW) | Mobile |
| 8 | PinnedMessageBar.tsx, location-picker.tsx, LocationMessage.tsx, ContactMessage.tsx (4 NEW) | Mobile |
| 9 | chat-wallpaper.tsx, notification-tones.tsx (2 NEW) | Mobile |
| 10 | storage-management.tsx, media-settings.tsx (2 NEW) | Mobile |
| 11 | chat-export.tsx, chatExportApi.ts (2 NEW) | Mobile |
| 12 | status-privacy.tsx, disappearing-default.tsx (2 NEW) | Mobile |
| 13 | conversation/[id].tsx (MODIFY) | Mobile |
| 14 | verify-encryption.tsx (NEW) | Mobile |

**CONFLICT NOTE:** Agents 2 and 3 both modify schema.prisma, messages.service.ts, and messages.controller.ts. **Run Agent 2 FIRST, then Agent 3** (sequential, not parallel).

---

## POST-BATCH TASKS

1. Register new modules in `app.module.ts`: `EncryptionModule`, `ChatExportModule`
2. `cd apps/api && npm install tweetnacl tweetnacl-util` (if backend needs it)
3. `cd apps/mobile && npx expo install tweetnacl tweetnacl-util expo-local-authentication expo-secure-store expo-location expo-sharing`
4. Run `npx prisma db push` after schema changes
5. Add i18n keys for all new screens
6. Set up message expiry cron job (can use NestJS @Cron decorator)

---

## DEFERRED TO BATCH 41+

- **Group video calls** — requires SFU (Selective Forwarding Unit) server, complex WebRTC multi-party
- **Screen sharing** — requires native screen capture API
- **Multi-device** — requires device linking protocol + message sync queue
- **Custom sticker maker** — nice-to-have, not ship-blocking
- **Vanish mode** — merged into disappearing messages functionality
