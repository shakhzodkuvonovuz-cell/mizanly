# End-to-End Flow Traces: Auth & Upload

Extracted 2026-03-25 from source code. Every step references the actual file and line where logic lives.

---

## FLOW 1: Authentication (Signup through Socket.io Connection)

### Overview

Mizanly delegates primary authentication to Clerk (email/password, social OAuth). The mobile app never touches raw passwords after Clerk handles them. The backend validates Clerk JWTs on every request and every socket connection. A webhook keeps the local User table in sync with Clerk's user lifecycle.

### Step-by-step: New User Signup

#### 1. User taps "Sign Up" on mobile

**File:** `apps/mobile/app/(auth)/sign-up.tsx`

- Uses `useSignUp()` from `@clerk/clerk-expo` (line 7, line 25).
- Collects email + password client-side.
- Calls `signUp.create({ emailAddress: email, password })` — this hits Clerk's API directly, never our backend (line 114).
- Clerk returns a `SignUp` object with `status: 'needs_verification'`.
- Immediately calls `signUp.prepareEmailAddressVerification({ strategy: 'email_code' })` — Clerk sends a 6-digit code to the email (line 115).
- UI transitions to a verification code input (`pendingVerification` state, line 116).

#### 2. User enters email verification code

**File:** `apps/mobile/app/(auth)/sign-up.tsx` (lines 125-139)

- Calls `signUp.attemptEmailAddressVerification({ code })` (line 131).
- On `status === 'complete'`, calls `setActive({ session: result.createdSessionId })` (line 133).
- This activates the Clerk session in the expo-secure-store token cache. From this point, `useAuth().getToken()` returns a valid JWT.

#### 3. Clerk fires `user.created` webhook to backend

**File:** `apps/api/src/modules/auth/webhooks.controller.ts`

- Clerk POSTs to `POST /api/v1/webhooks/clerk` (line 66).
- Webhook payload includes svix signature headers: `svix-id`, `svix-timestamp`, `svix-signature` (lines 72-74).
- Signature verified via `new Webhook(secret).verify(rawBody, headers)` using the `svix` library (lines 87-95). The `rawBody` is available because `main.ts` creates the NestJS app with `rawBody: true` (main.ts line 64).
- **Idempotency check:** svix-id stored in Redis with 24h TTL. Duplicate deliveries are silently acknowledged (lines 101-111).
- For `user.created` events: extracts email, firstName, lastName, avatarUrl from Clerk payload (lines 117-128).
- Calls `authService.syncClerkUser(clerkId, { email, displayName, avatarUrl })` (line 124).

**File:** `apps/api/src/modules/auth/auth.service.ts` (lines 295-333)

- `syncClerkUser()` checks if a user with this `clerkId` already exists.
  - If yes: updates email, displayName, avatarUrl.
  - If no: generates a cryptographically random username (`user_` + 4 random hex bytes, line 314), creates a new `User` record in Prisma.
- The username is temporary — the user will set their real username during onboarding.

#### 4. Token cache wired into API client

**File:** `apps/mobile/app/_layout.tsx` (lines 205-213)

- `tokenCache` defined using `expo-secure-store` on native, `localStorage` on web.
- Passed to `<ClerkProvider tokenCache={tokenCache}>` (line 489).
- Clerk stores/retrieves session tokens via this cache automatically.

**File:** `apps/mobile/app/_layout.tsx` — `AuthGuard` component (lines 216-280)

- On mount, wires Clerk's `getToken()` into the API client (lines 224-239):
  ```
  api.setTokenGetter(async () => await getToken())
  api.setForceRefreshTokenGetter(async () => await getToken({ skipCache: true }))
  api.setSessionExpiredHandler(() => router.replace('/(auth)/sign-in'))
  ```
- Every subsequent API call uses these getters to attach Bearer tokens.

#### 5. AuthGuard navigation redirect

**File:** `apps/mobile/app/_layout.tsx` (lines 257-277)

- Watches `isSignedIn`, `isLoaded`, `segments`, `user`.
- If signed in but onboarding not complete (`!user.unsafeMetadata.onboardingComplete`): redirects to `/onboarding/username` (line 272).
- If signed in and onboarding complete but still on auth/onboarding screens: redirects to `/(tabs)/saf` (line 274).
- If not signed in: allows anonymous feed browsing (no forced redirect to auth).

#### 6. User completes onboarding — profile registration

**File:** `apps/api/src/modules/auth/auth.controller.ts` (lines 23-33)

- `POST /api/v1/auth/register` — guarded by `ClerkAuthGuard`.
- Receives `RegisterDto`: username, displayName, bio, avatarUrl, language, dateOfBirth, acceptedTerms, deviceId.

**File:** `apps/api/src/modules/auth/auth.service.ts` (lines 55-167)

- **Rate limiting:** Max 5 registration attempts per clerkId in 15-minute window (Redis, lines 57-62).
- **Device fingerprint:** Max 5 accounts per physical device (Redis, lines 65-71).
- **Age verification (COPPA/GDPR):** Calculates age from dateOfBirth. Rejects under 13 (line 75-79). Flags under-18 as `isChildAccount` (line 121).
- **Terms acceptance:** Requires `acceptedTerms: true` (lines 82-86).
- **Email from Clerk:** Fetches the user from Clerk API server-side to get verified email (lines 89-97).
- **Username collision check:** Queries Prisma for existing username. Allows same clerkId to re-register (idempotent) (lines 100-105).
- **Upsert:** Creates or updates User record with all profile fields (lines 110-136).
- **UserSettings:** Ensures UserSettings row exists (lines 139-143).
- **Cleanup:** Clears Redis attempt counter, increments device counter on success (lines 149-156).
- **Analytics:** Tracks `user_registered` event (lines 159-164).

#### 7. Every API request: ClerkAuthGuard

**File:** `apps/api/src/common/guards/clerk-auth.guard.ts`

- Extracts `Bearer` token from `Authorization` header (lines 75-78).
- Calls `verifyToken(token, { secretKey })` from `@clerk/backend` (lines 29-31). This validates the JWT signature, expiry, and issuer without calling Clerk's API.
- Extracts `clerkId` from `payload.sub` (line 32).
- Looks up user in Prisma by `clerkId` (lines 37-49). Selects: id, clerkId, username, displayName, isBanned, isDeactivated, isDeleted, banExpiresAt.
- **Ban check:** If banned and temp ban expired, auto-unbans (lines 57-61). If still banned, throws 403 (line 63).
- **Deactivated/deleted check:** Throws 403 (lines 67-69).
- Attaches full user object to `request.user` (line 71).
- `@CurrentUser('id')` decorator then reads `request.user.id` for controllers.

#### 8. OptionalClerkAuthGuard (public endpoints)

**File:** `apps/api/src/common/guards/optional-clerk-auth.guard.ts`

- Same token extraction and verification logic as ClerkAuthGuard.
- **Never throws** — if token is missing, invalid, or user is banned/deactivated, simply returns `true` without attaching `request.user` (line 24, lines 43-44, line 47).
- Used on public feed/search endpoints that return extra data (isFollowing, userReaction) when authenticated.
- Logs a warning for expired tokens to help debug client token refresh issues (lines 49-51).

#### 9. Client-side 401 retry with token refresh

**File:** `apps/mobile/src/services/api.ts` (lines 263-288)

- On 401 response (and not already retried): calls `forceRefreshToken()` which maps to `getToken({ skipCache: true })` from Clerk (line 267).
- If fresh token obtained: retries the request with the new token (lines 270-276).
- If refresh fails or returns null: shows "Session expired" toast, calls `onSessionExpired()` which navigates to sign-in (lines 282-287).
- Throws `ApiError` with code `SESSION_EXPIRED` (line 287).

#### 10. Client-side 429 retry with backoff

**File:** `apps/mobile/src/services/api.ts` (lines 251-261)

- On 429 response (and not already retried): reads `Retry-After` header (capped at 120s).
- Shows "Rate limited" warning toast.
- Waits the specified duration, then retries once.

#### 11. Socket.io connection auth

**File:** `apps/api/src/gateways/chat.gateway.ts` (lines 173-246)

- Gateway listens on `/chat` namespace (line 52).
- `handleConnection(client)` fires on every new socket:
  1. **IP rate limiting:** Max 10 connections/minute per IP (Redis, lines 176-185). Exceeding disconnects the socket.
  2. **Token extraction:** Reads `client.handshake.auth.token` or falls back to `client.handshake.headers.authorization`. Supports both raw token and `Bearer <token>` format (lines 821-826).
  3. **JWT verification:** Same `verifyToken()` from `@clerk/backend` as the HTTP guard (line 193-195).
  4. **User lookup + status check:** Queries Prisma for user by clerkId. Disconnects if not found, banned, deactivated, or deleted (lines 196-204).
  5. **Socket data attachment:** Sets `client.data.userId` and `client.data.quranRooms` (lines 207-208).
  6. **Redis presence:** Adds socket ID to `presence:{userId}` set with 5-minute TTL (lines 212-214).
  7. **Heartbeat:** Starts a 2-minute interval that refreshes the presence TTL (lines 217-224).
  8. **Online broadcast:** Fetches user's conversation memberships (max 100), emits `user_online` to each conversation room (lines 227-234).
  9. **User room join:** Joins `user:{userId}` room for direct notifications (line 236).
- On any error during connection setup: cleans up heartbeat timer and disconnects (lines 237-245).

#### 12. Socket.io disconnection cleanup

**File:** `apps/api/src/gateways/chat.gateway.ts` (lines 248-317)

- Stops heartbeat timer for this socket (lines 250-254).
- Cleans up Quran room memberships — removes from Redis participant sets, handles host transfer if the disconnecting user was host, marks empty rooms as ended (lines 257-291).
- Removes socket from Redis presence set (line 297).
- If no remaining sockets for this user (fully offline): deletes presence key, updates `lastSeenAt` in DB, broadcasts `user_offline` to conversation rooms (lines 300-316).

#### 13. Real-time notification delivery via Redis pub/sub

**File:** `apps/api/src/gateways/chat.gateway.ts` (lines 82-101)

- `onModuleInit()` creates a duplicate Redis connection for subscribing.
- Subscribes to `notification:new` channel.
- On message: parses `{ userId, notification }`, emits to `user:{userId}` Socket.io room via `server.to().emit('new_notification', notification)`.
- This bridges backend NotificationsService (which publishes to Redis) with live socket delivery.

### Auth Flow Diagram (Signup)

```
Mobile (Clerk SDK)          Clerk Cloud              Backend API              Database
       |                        |                        |                      |
  signUp.create() ──────────>  |                        |                      |
       |                   user created                  |                      |
  prepareVerification() ───>   |                        |                      |
       |                   sends email                   |                      |
  attemptVerification() ───>   |                        |                      |
       |                  session active                 |                      |
  setActive(session) <──────   |                        |                      |
       |                        |                        |                      |
  getToken() returns JWT        |   webhook: user.created |                      |
       |                        | ────────────────────>  |                      |
       |                        |                  verify svix sig              |
       |                        |                  dedupe via Redis             |
       |                        |                  syncClerkUser() ──────>  INSERT User
       |                        |                        |                      |
  POST /auth/register ──────────────────────────────>    |                      |
  (Bearer JWT)                  |                  ClerkAuthGuard               |
       |                        |                  verifyToken(jwt)             |
       |                        |                  lookup user by clerkId       |
       |                        |                  register() ───────────> UPSERT User
       |                        |                  age check (COPPA)            |
       |                        |                  device fingerprint           |
       |                        |                        |                      |
  Socket.io connect ────────────────────────────────>    |                      |
  (auth: { token: jwt })        |                  verifyToken(jwt)             |
       |                        |                  IP rate limit                |
       |                        |                  lookup user                  |
       |                        |                  Redis presence:add           |
       |                        |                  join user:{id} room          |
       |<────────────────── connected                    |                      |
```

### Auth Flow Diagram (Sign-In)

```
Mobile (Clerk SDK)          Clerk Cloud              Backend API
       |                        |                        |
  signIn.create() ──────────>  |                        |
       |                        |                        |
  [If 2FA enabled]              |                        |
  status: needs_second_factor   |                        |
  attemptSecondFactor(totp) ──> |                        |
       |                   session active                |
  setActive(session) <──────   |                        |
       |                        |                        |
  api.setTokenGetter(getToken)  |                        |
       |                        |                        |
  GET /auth/me ─────────────────────────────────────>    |
  (Bearer JWT)                  |                  ClerkAuthGuard
       |                        |                  verifyToken → clerkId
       |                        |                  prisma.user.findUnique
       |<──────────────── { user, twoFactorEnabled }     |
```

### Key Security Properties

| Property | Implementation | File |
|----------|---------------|------|
| JWT never stored in plaintext | expo-secure-store on native, localStorage on web | _layout.tsx:205-213 |
| Token refresh on 401 | `getToken({ skipCache: true })` bypasses Clerk cache | api.ts:264-276 |
| Session expiry redirect | `onSessionExpired` callback navigates to sign-in | api.ts:286, _layout.tsx:237-239 |
| Webhook signature verification | svix library with HMAC verification | webhooks.controller.ts:87-95 |
| Webhook idempotency | svix-id stored in Redis with 24h TTL | webhooks.controller.ts:101-111 |
| Connection flood protection | Max 10 socket connections/minute per IP | chat.gateway.ts:176-185 |
| Socket auth = same as HTTP | `verifyToken()` from @clerk/backend | chat.gateway.ts:193-195 |
| Banned user auto-unban | Temp bans with expiry automatically lifted | clerk-auth.guard.ts:57-61 |
| Device fingerprint limit | Max 5 accounts per device via Redis | auth.service.ts:65-71 |
| Age verification | COPPA (13+), minor flag for under-18 | auth.service.ts:74-79 |
| Request timeout | 30s via AbortController on all API calls | api.ts:224-226 |

---

## FLOW 2: File Upload (Image/Video through CDN Delivery)

### Overview

Mizanly uses a presigned-URL upload pattern: the client requests a signed S3-compatible URL from the backend, then uploads the file directly to Cloudflare R2 (no file passes through the API server). For videos, after R2 upload, the backend copies the file to Cloudflare Stream for HLS transcoding. A Stream webhook notifies the backend when transcoding completes.

### Step-by-step: Image Upload (create-post flow)

#### 1. User picks media via ImagePicker

**File:** `apps/mobile/app/(screens)/create-post.tsx`

- User selects images/videos from device gallery via expo-image-picker.
- Each picked item has: `uri`, `type` ('image'|'video'), `width`, `height`.

#### 2. Client-side image resize

**File:** `apps/mobile/src/utils/imageResize.ts`

- Called as `resizeForUpload(item.uri, item.width, item.height)` (create-post.tsx line 247).
- **GIFs:** Returned as-is (ImageManipulator flattens animation to single frame) (line 33-34).
- **Small JPEGs** (both dimensions <= 2048): Returned as-is (no re-encoding, saves ~200ms) (lines 42-44).
- **PNGs:** Kept as PNG format to preserve transparency (lines 62-63).
- **Everything else:** Resized to max 2048px on longest side (preserving aspect ratio), converted to JPEG at 82% quality (lines 47-68).
- **Fallback:** If `manipulateAsync` fails, returns original URI with best-guess MIME type (lines 70-73).

#### 3. Request presigned URL from backend

**File:** `apps/mobile/src/services/api.ts` (lines 840-846)

```
uploadApi.getPresignUrl(contentType, 'posts')
  → POST /upload/presign { contentType, folder: 'posts' }
```

**File:** `apps/api/src/modules/upload/upload.controller.ts`

- Protected by `ClerkAuthGuard` (line 35).
- Rate limited: 20 requests/minute (line 41).
- Validates DTO:
  - `contentType` must match regex `^(image|video|audio)/[a-z0-9+.-]+$` (line 21).
  - `folder` must be one of: avatars, covers, posts, stories, messages, reels, videos, thumbnails, misc (line 24).
  - `maxFileSize` optional, capped at 100MB (lines 28-30).
- Calls `uploadService.getPresignedUrl(userId, contentType, folder, 300, maxFileSize)` (line 47).

**File:** `apps/api/src/modules/upload/upload.service.ts` (lines 77-127)

- **Content type validation:** Global allowlist check (images: jpeg/png/webp/gif, videos: mp4/quicktime/webm, audio: mpeg/wav/mp4) (lines 85-86).
- **Folder-specific type validation:** e.g., `reels` folder only accepts video types (lines 88-93).
- **Folder-specific size limits:** avatars 5MB, covers 10MB, posts/stories/messages 50MB, reels/videos 100MB, thumbnails 5MB, misc 20MB (lines 15-25). Client-requested maxFileSize cannot exceed folder limit (lines 97-101).
- **Key generation:** `{folder}/{userId}/{uuid}.{ext}` — ensures ownership via userId in path (line 104).
- **S3 PutObjectCommand:** Sets `ContentType` and `CacheControl: public, max-age=31536000, immutable` (one year, immutable because keys are UUID-based) (lines 106-111).
- **Presigned URL:** Generated via `@aws-sdk/s3-request-presigner` with 300s expiry (5 minutes) (line 113).
- **Response includes:**
  - `uploadUrl` — presigned S3-compatible PUT URL for R2
  - `key` — the storage key (`posts/user123/abc-uuid.jpg`)
  - `publicUrl` — the CDN-accessible URL (`https://media.mizanly.app/posts/user123/abc-uuid.jpg`)
  - `expiresIn` — 300 seconds
  - `maxFileSize` — effective limit for this upload
  - `variants` (images only) — responsive image URLs if Cloudflare Image Resizing is enabled

**Image variants** (from `apps/api/src/common/utils/image.ts`):

- Only generated if `CF_IMAGE_RESIZING_ENABLED=true` (line 90-93, image.ts).
- Uses Cloudflare's `/cdn-cgi/image/` URL rewriting: thumbnail (200x200), small (400w), medium (600w), large (1200w), original.
- Presets defined for avatars (64/128/256), feed cards, covers, video thumbnails, blur placeholders (20px wide).

#### 4. Direct upload to R2 with progress tracking

**File:** `apps/mobile/src/components/ui/UploadProgressBar.tsx` (lines 114-156)

- `uploadWithProgress(url, blob, contentType, onProgress)` — uses `XMLHttpRequest` instead of `fetch()` because fetch doesn't support upload progress events (line 111 comment).
- Sets `Content-Type` header on the PUT request (line 125).
- `xhr.upload.onprogress` calculates percentage from `event.loaded / event.total` (lines 127-131).
- Returns `{ promise, abort }` — the `abort()` function calls `xhr.abort()` for cancellation (lines 149-155).

**File:** `apps/mobile/app/(screens)/create-post.tsx` (lines 242-269)

- For each media item in the array:
  1. If image: calls `resizeForUpload()` to get optimized URI + dimensions + MIME type.
  2. If video: infers MIME type from file extension.
  3. Calls `uploadApi.getPresignUrl(contentType, 'posts')` to get presigned URL.
  4. Fetches the local file as a blob via `fetch(uploadUri).blob()`.
  5. Calls `uploadWithProgress(uploadUrl, blob, contentType, progressCallback)`.
  6. Progress is weighted per item: `baseProgress + (percent / 100) * itemWeight` where `itemWeight = 100 / media.length`.

**UploadProgressBar UI** (lines 32-106):

- Emerald-to-gold gradient fill bar with spring animation (Reanimated `withSpring`).
- Shows percentage text or checkmark icon when complete.
- Spinner icon + status label ("Uploading media..." / "Upload complete").
- Cancel button calls the `abort()` function from `uploadWithProgress`.
- Fades in/out with `FadeIn.duration(200)` / `FadeOut.duration(300)`.

#### 5. File deletion (ownership enforcement)

**File:** `apps/api/src/modules/upload/upload.controller.ts` (lines 50-67)

- `DELETE /upload/:key` — key is the full R2 path.
- **Path traversal prevention:** Rejects keys with `..`, `//`, or non-alphanumeric characters (line 57).
- **Ownership check:** Parses the key structure `{folder}/{userId}/{uuid}.{ext}` and verifies `segments[1] === userId` (lines 61-64). Only the file owner can delete.
- Calls `uploadService.deleteFile(key)` which sends `DeleteObjectCommand` to S3/R2 (upload.service.ts lines 129-139).

### Step-by-step: Video Upload (Cloudflare Stream transcoding)

#### 6. Video stored in R2, then copied to Cloudflare Stream

**File:** `apps/api/src/modules/stream/stream.service.ts` (lines 59-103)

- After the client uploads a video to R2 (steps 3-4 above), the backend calls `streamService.uploadFromUrl(r2PublicUrl, meta)`.
- **SSRF prevention:** Validates URL starts with the configured `R2_PUBLIC_URL` domain (lines 64-67). Blocks localhost, private IPs, link-local addresses (lines 69-72).
- POSTs to Cloudflare Stream's `/copy` endpoint with the R2 URL (lines 76-84):
  ```
  POST https://api.cloudflare.com/client/v4/accounts/{accountId}/stream/copy
  { url: r2PublicUrl, meta: { name, creator } }
  ```
- Returns the Stream `uid` (unique video ID) from Cloudflare's response (line 102).
- This `uid` is stored as `streamId` on the Video or Reel Prisma record.

#### 7. Cloudflare Stream transcoding webhook

**File:** `apps/api/src/modules/stream/stream.controller.ts`

- Cloudflare Stream POSTs to `POST /api/v1/stream/webhook` when transcoding completes or fails (line 36).
- **Signature verification** (lines 80-108):
  1. Parses `webhook-signature` header for `time=` and `sig1=` components.
  2. Rejects signatures older than 5 minutes (replay protection, lines 93-96).
  3. Computes HMAC-SHA256 of `{timestamp}.{rawBody}` using `CF_STREAM_WEBHOOK_SECRET`.
  4. Uses `timingSafeEqual()` to compare (line 103-105).
- If `body.readyToStream === true`: calls `streamService.handleStreamReady(streamId)` (line 69).
- If `body.status.state === 'error'`: calls `streamService.handleStreamError(streamId, errorCode)` (lines 70-74).

#### 8. Stream ready — update playback URLs

**File:** `apps/api/src/modules/stream/stream.service.ts` (lines 148-183)

- `handleStreamReady(streamId)`:
  1. Fetches playback URLs from Cloudflare Stream API: `GET /stream/{streamId}` (lines 105-135).
  2. Extracts HLS URL, DASH URL, and generates thumbnail URL.
  3. Determines available quality levels from video dimensions (360p, 720p, 1080p, 4K).
  4. Looks for a `Video` record with this `streamId` — if found, updates with playback URLs and sets `status: 'PUBLISHED'`, `publishedAt: now` (lines 152-165).
  5. If no Video found, looks for a `Reel` — updates with playback URLs and sets `status: 'READY'` (lines 167-180).
  6. Logs warning if neither Video nor Reel found for the streamId (line 182).

#### 9. Stream error handling

**File:** `apps/api/src/modules/stream/stream.service.ts` (lines 185-204)

- `handleStreamError(streamId, error)`:
  - Video: sets `status: 'DRAFT'` (lines 188-194).
  - Reel: sets `status: 'FAILED'` (lines 196-203).
  - The content creator would see a failed status in their profile/drafts.

### Upload Flow Diagram

```
Mobile Client                  Backend API              Cloudflare R2           Cloudflare Stream
     |                              |                        |                        |
  ImagePicker                       |                        |                        |
  resizeForUpload() (client-side)   |                        |                        |
     |                              |                        |                        |
  POST /upload/presign ──────────>  |                        |                        |
  { contentType, folder }     validate type+folder            |                        |
     |                        validate size limits            |                        |
     |                        generate key: {folder}/{userId}/{uuid}.{ext}             |
     |                        sign PutObjectCommand           |                        |
     |<──────────────── { uploadUrl, key, publicUrl, variants }                        |
     |                              |                        |                        |
  PUT uploadUrl ─────────────────────────────────────────>   |                        |
  (XMLHttpRequest w/ progress)      |                   store object                  |
  onprogress → UI bar              |                   CacheControl: immutable         |
     |<──────────────── 200 OK      |                        |                        |
     |                              |                        |                        |
  [For videos only:]                |                        |                        |
  POST /videos or /reels ────────>  |                        |                        |
  { videoUrl: publicUrl }     streamService.uploadFromUrl()  |                        |
     |                        SSRF check on URL              |                        |
     |                              | ── POST /stream/copy ──────────────────────────> |
     |                              |    { url: r2PublicUrl } |                   transcode
     |                              |<── { uid: streamId } ──────────────────────────  |
     |                        save streamId on record         |                        |
     |<──────────────── 201 Created  |                        |                        |
     |                              |                        |                        |
     |                              | <───────── webhook: readyToStream ──────────────  |
     |                              | verify HMAC signature   |                        |
     |                              | getPlaybackUrls()       |                        |
     |                              |  ── GET /stream/{uid} ─────────────────────────> |
     |                              |  <── { hls, dash, input } ─────────────────────  |
     |                              | update Video/Reel:      |                        |
     |                              |   hlsUrl, dashUrl,      |                        |
     |                              |   qualities, status     |                        |
     |                              |                        |                        |
  [User views content:]             |                        |                        |
  GET /videos/{id} ──────────────>  |                        |                        |
     |<──── { hlsUrl, dashUrl, ... }|                        |                        |
  expo-av Video player              |                        |                        |
    src: hlsUrl ──────────────────────────────────────────────────────────────────────> |
     |                              |                   HLS adaptive streaming          |
```

### Upload Security Properties

| Property | Implementation | File |
|----------|---------------|------|
| No file passes through API server | Presigned URL → direct R2 upload | upload.service.ts:106-113 |
| Ownership in key path | `{folder}/{userId}/{uuid}.{ext}` | upload.service.ts:104 |
| Delete ownership check | Parses key segments, verifies userId match | upload.controller.ts:61-64 |
| Path traversal prevention | Rejects `..`, `//`, non-alphanumeric chars | upload.controller.ts:57 |
| Content type allowlist | Only image/video/audio MIME types allowed | upload.service.ts:10-12, 141-148 |
| Folder-specific type restrictions | e.g., `reels` only accepts video types | upload.service.ts:28-38, 88-93 |
| Folder-specific size limits | 5MB (avatars) to 100MB (reels/videos) | upload.service.ts:15-25 |
| Presigned URL expiry | 300 seconds (5 minutes) | upload.service.ts:81 |
| Stream SSRF prevention | URL must start with R2_PUBLIC_URL, blocks private IPs | stream.service.ts:64-72 |
| Stream webhook HMAC | SHA-256 with timing-safe comparison | stream.controller.ts:80-108 |
| Stream webhook replay protection | Rejects signatures older than 5 minutes | stream.controller.ts:93-96 |
| Upload rate limit | 20 presign requests/minute per user | upload.controller.ts:41 |
| Cache immutability | `CacheControl: public, max-age=31536000, immutable` | upload.service.ts:110 |
| Client-side resize | Max 2048px, 82% JPEG quality, preserves PNG/GIF | imageResize.ts:23-74 |

### R2 Storage Key Structure

```
mizanly-media/
├── avatars/{userId}/{uuid}.jpg
├── covers/{userId}/{uuid}.jpg
├── posts/{userId}/{uuid}.{jpg|png|webp|gif|mp4|mov|webm}
├── stories/{userId}/{uuid}.{jpg|png|mp4|mov}
├── messages/{userId}/{uuid}.{jpg|mp4|mp3|wav|m4a}
├── reels/{userId}/{uuid}.{mp4|mov|webm}
├── videos/{userId}/{uuid}.{mp4|mov|webm}
├── thumbnails/{userId}/{uuid}.{jpg|png|webp}
└── misc/{userId}/{uuid}.{any}
```

### Cloudflare Image Resizing URL Pattern

```
Original:  https://media.mizanly.app/posts/user123/abc.jpg
Thumbnail: https://media.mizanly.app/cdn-cgi/image/width=200,height=200,quality=60,fit=cover,format=webp/posts/user123/abc.jpg
Feed card: https://media.mizanly.app/cdn-cgi/image/width=600,quality=80,format=webp/posts/user123/abc.jpg
Feed full: https://media.mizanly.app/cdn-cgi/image/width=1200,quality=85,format=webp/posts/user123/abc.jpg
Avatar sm: https://media.mizanly.app/cdn-cgi/image/width=64,height=64,quality=80,fit=cover,format=webp/avatars/user123/abc.jpg
```

Note: Image Resizing requires Cloudflare Pro plan or higher. When `CF_IMAGE_RESIZING_ENABLED` is not `true`, all variant URLs fall back to the original URL (image.ts lines 90-93).

---

## Cross-Flow Interaction: Auth + Upload

The two flows intersect at a single point: **every upload presign request requires a valid Clerk JWT**. The upload controller uses `ClerkAuthGuard`, so:

1. Client calls `api.post('/upload/presign', ...)` — the `ApiClient.request()` method (api.ts:209) calls the Clerk `getToken()` getter to attach the Bearer header.
2. If the token is expired, the request returns 401. The client auto-retries with a force-refreshed token (api.ts:264-276).
3. If force-refresh fails, the session expired handler navigates to sign-in — the upload is abandoned.
4. The presigned URL itself has no auth — it's a time-limited capability token. Anyone with the URL can upload within the 5-minute window. This is by design (S3-compatible presigned URLs are standard practice).
5. The userId embedded in the key path (`posts/{userId}/...`) ensures that even if a presigned URL leaks, the uploaded file is attributed to the correct user and only that user can delete it.
