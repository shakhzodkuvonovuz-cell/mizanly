# Lane 05: Messaging, Crypto, Calls

## High

### Sealed-sender messages are delivered before durable persistence
- File: `C:\dev\mizanly\apps\api\src\gateways\chat.gateway.ts:653`
- File: `C:\dev\mizanly\apps\api\src\gateways\chat.gateway.ts:670`
- File: `C:\dev\mizanly\apps\api\src\gateways\chat.gateway.ts:692`
- The gateway emits `sealed_message` to the recipient room before `messagesService.sendMessage(...)` commits. If the DB write fails, the recipient can still decrypt and render the message while the sender gets `Failed to persist sealed message` and is likely to retry. That creates non-durable delivery, duplicate retries, and sender/recipient history divergence for the most privacy-sensitive path in the app. Persist first, then emit, or add an idempotent outbox/transactional publish path.

### Any conversation member can forge delivery receipts for any message in that conversation
- File: `C:\dev\mizanly\apps\api\src\gateways\chat.gateway.ts:764`
- File: `C:\dev\mizanly\apps\api\src\gateways\chat.gateway.ts:771`
- File: `C:\dev\mizanly\apps\api\src\gateways\chat.gateway.ts:785`
- `message_delivered` only checks that the caller belongs to the conversation, then sets `deliveredAt` on any `messageId` in that conversation and emits a receipt naming the caller as `deliveredTo`. In group chats, any member can spoof delivery for messages they never received, and the single `deliveredAt` field lets one participant mark the whole message as delivered. The handler needs recipient-specific receipt records and must verify the caller is an intended recipient of the target message before mutating state.

## Medium

### Message deletion leaves sealed-sender envelope material behind
- File: `C:\dev\mizanly\apps\api\src\modules\messages\messages.service.ts:263`
- File: `C:\dev\mizanly\apps\api\src\modules\messages\messages.service.ts:264`
- File: `C:\dev\mizanly\apps\api\src\modules\messages\messages.service.ts:573`
- `deleteMessage()` clears `encryptedContent` and the ratchet metadata, but it does not clear `e2eSealedEphemeralKey` or `e2eSealedCiphertext`. Those fields were added specifically for offline sealed-sender retrieval, so a deleted message can still retain enough envelope material to survive in backups, forensic dumps, or any future code path that exposes those columns. Deletion should null every encrypted payload field, including the sealed-sender envelope bytes.

### Host mute is unenforceable in audio rooms
- File: `C:\dev\mizanly\apps\api\src\modules\audio-rooms\audio-rooms.service.ts:380`
- File: `C:\dev\mizanly\apps\api\src\modules\audio-rooms\audio-rooms.service.ts:393`
- File: `C:\dev\mizanly\apps\api\src\modules\audio-rooms\audio-rooms.service.ts:405`
- `toggleMute()` lets any participant flip their own `isMuted` flag. A host can mute someone, but that participant can immediately call the same endpoint without `targetUserId` and unmute themselves. That breaks moderation for live audio spaces and makes host mute effectively cosmetic. Split self-mute from host-imposed mute, or track a separate host mute state that listeners cannot clear.

## Low

### The encrypted search index cap is effectively disabled for current HMAC-backed entries
- File: `C:\dev\mizanly\apps\mobile\src\services\signal\search-index.ts:115`
- File: `C:\dev\mizanly\apps\mobile\src\services\signal\search-index.ts:239`
- File: `C:\dev\mizanly\apps\mobile\src\services\signal\search-index.ts:261`
- The code increments a global `MAX_INDEXED_MESSAGES` counter and calls `evictOldestIndexEntries(500)`, but the eviction routine explicitly skips the HMAC-keyed records that the app now writes. In practice, the searchable plaintext metadata for decrypted messages will keep growing until logout/manual wipe, which turns the advertised cap into a false safety bound and creates avoidable on-device storage growth for the encrypted-messaging subsystem.
