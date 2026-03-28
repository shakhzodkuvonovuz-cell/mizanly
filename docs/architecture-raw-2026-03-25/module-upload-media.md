# Module: Upload, Stream & Downloads — Complete Architecture

> Extracted 2026-03-25 from source files in `apps/api/src/modules/upload/`, `apps/api/src/modules/stream/`, `apps/api/src/modules/downloads/`

---

## 1. Upload Module

### 1.1 File Inventory

| File | Lines | Purpose |
|------|-------|---------|
| `upload.module.ts` | 10 | NestJS module — exports `UploadService` |
| `upload.controller.ts` | 68 | Two endpoints: presign + delete |
| `upload.service.ts` | 165 | S3/R2 client, presigned URL generation, file deletion |
| `upload.controller.spec.ts` | 97 | Controller unit tests (7 test cases) |
| `upload.service.spec.ts` | 229 | Service unit tests (12 test cases) |
| `../../common/utils/image.ts` | 112 | Cloudflare Image Resizing URL builder + responsive variants |

### 1.2 Endpoints

#### `POST /api/v1/upload/presign` (Line 40-48 in controller)

- **Auth:** `ClerkAuthGuard` (Bearer JWT)
- **Throttle:** 20 requests per 60 seconds
- **Swagger:** "Get presigned URL for direct R2 upload"
- **Body DTO:** `PresignDto` (inline class, lines 18-31)
  - `contentType: string` — validated by regex `/^(image|video|audio)\/[a-z0-9+.-]+$/` (line 20-21)
  - `folder: string` — one of `['avatars', 'covers', 'posts', 'stories', 'messages', 'reels', 'videos', 'thumbnails', 'misc']` (line 23-24)
  - `maxFileSize?: number` — optional, min 1, max 104857600 (100 MB) (lines 27-30)
- **Calls:** `uploadService.getPresignedUrl(userId, dto.contentType, dto.folder, 300, dto.maxFileSize)`
- **Default expiry:** 300 seconds (5 minutes) hardcoded at call site (line 47)

#### `DELETE /api/v1/upload/:key(*)` (Lines 50-67 in controller)

- **Auth:** `ClerkAuthGuard` (Bearer JWT)
- **Swagger:** "Delete a file from R2 by key (must own the file)"
- **Path param:** `key` — wildcard route, captures full path like `posts/user-123/abc.jpg`
- **Security checks:**
  1. Path traversal rejection: `..`, `//`, and any char outside `[a-zA-Z0-9\/_.-]` blocked (line 57)
  2. Ownership enforcement: key is split by `/`, segment[1] must match `userId` (lines 61-64)
- **Response:** `{ deleted: true, key }` on success
- **Errors:** `BadRequestException` for invalid key, `ForbiddenException` for non-owner

### 1.3 Upload Service — Presigned URL Flow

**File:** `upload.service.ts`

#### S3 Client Initialization (Lines 48-75)

```
Constructor:
1. Reads R2_ACCOUNT_ID (fallback: CLOUDFLARE_ACCOUNT_ID)
2. Reads R2_ACCESS_KEY_ID (fallback: CLOUDFLARE_R2_ACCESS_KEY)
3. Reads R2_SECRET_ACCESS_KEY (fallback: CLOUDFLARE_R2_SECRET_KEY)
4. Logs warning if any credential missing (line 55)
5. Logs which naming convention (R2_* or CLOUDFLARE_*) was resolved (lines 58-62)
6. Creates S3Client with:
   - region: 'auto'
   - endpoint: https://{accountId}.r2.cloudflarestorage.com
7. Bucket: R2_BUCKET_NAME ?? 'mizanly-media'
8. Public URL: R2_PUBLIC_URL ?? 'https://media.mizanly.app'
```

#### `getPresignedUrl()` Method (Lines 77-127)

**Signature:** `async getPresignedUrl(userId: string, contentType: string, folder: UploadFolder, expiresIn = 300, maxFileSize?: number)`

**Flow:**

1. **Global content type validation** (line 85) — calls `validateContentType()` which checks against the union of all allowed image + video + audio types
2. **Folder-specific type validation** (lines 88-93) — checks `FOLDER_ALLOWED_TYPES[folder]` to ensure the content type is permitted for the target folder
3. **File size enforcement** (lines 96-101):
   - If caller provides `maxFileSize`, it must not exceed `FOLDER_MAX_SIZE[folder]`
   - If not provided, defaults to `FOLDER_MAX_SIZE[folder]`
   - Throws `BadRequestException` with human-readable MB message on violation
4. **Key generation** (lines 103-104):
   - Extension resolved from content type via `getExtension()` map
   - Key format: `{folder}/{userId}/{uuid}.{ext}`
   - UUID generated via `uuid.v4()`
5. **S3 PutObjectCommand** (lines 106-111):
   - `Bucket`: configured bucket name
   - `Key`: generated key
   - `ContentType`: the validated content type
   - `CacheControl`: `'public, max-age=31536000, immutable'` (1 year immutable cache)
6. **Signed URL** (line 113): `getSignedUrl(s3, command, { expiresIn })`
7. **Response** (lines 118-126):
   ```json
   {
     "uploadUrl": "<presigned PUT URL>",
     "key": "posts/user-123/abc-uuid.jpg",
     "publicUrl": "https://media.mizanly.app/posts/user-123/abc-uuid.jpg",
     "expiresIn": 300,
     "maxFileSize": 52428800,
     "variants": { ... }   // Only for image types
   }
   ```
   - `variants` only included when `ALLOWED_IMAGE_TYPES.includes(contentType)` (line 116)
   - Variants come from `getResponsiveImageUrls()` (see section 1.5)

#### Allowed MIME Types (Lines 10-12)

| Category | Types |
|----------|-------|
| **Image** | `image/jpeg`, `image/png`, `image/webp`, `image/gif` |
| **Video** | `video/mp4`, `video/quicktime`, `video/webm` |
| **Audio** | `audio/mpeg`, `audio/wav`, `audio/mp4` |

#### Folder Max File Sizes (Lines 15-25)

| Folder | Max Size | Allowed Types |
|--------|----------|---------------|
| `avatars` | 5 MB | Image only |
| `covers` | 10 MB | Image only |
| `posts` | 50 MB | Image + Video |
| `stories` | 50 MB | Image + Video |
| `messages` | 50 MB | Image + Video + Audio |
| `reels` | 100 MB | Video only |
| `videos` | 100 MB | Video only |
| `thumbnails` | 5 MB | Image only |
| `misc` | 20 MB | Image + Video + Audio |

#### Content Type to Extension Map (Lines 150-163)

| MIME Type | Extension |
|-----------|-----------|
| `image/jpeg` | `jpg` |
| `image/png` | `png` |
| `image/webp` | `webp` |
| `image/gif` | `gif` |
| `video/mp4` | `mp4` |
| `video/quicktime` | `mov` |
| `video/webm` | `webm` |
| `audio/mpeg` | `mp3` |
| `audio/wav` | `wav` |
| `audio/mp4` | `m4a` |
| Unknown | `bin` (fallback) |

### 1.4 Delete Flow (Lines 129-139)

**`deleteFile(key: string)`:**

1. Creates `DeleteObjectCommand` with `{ Bucket, Key: key }`
2. Calls `s3.send(command)`
3. On error: logs with `logger.error`, throws `InternalServerErrorException('Failed to delete file')`
4. On success: returns `{ deleted: true, key }`

### 1.5 Image Variant Generation

**File:** `apps/api/src/common/utils/image.ts`

#### `getResponsiveImageUrls(originalUrl)` (Lines 81-101)

Returns 5 variants **only if** `CF_IMAGE_RESIZING_ENABLED=true` env var is set. Otherwise returns the original URL for all sizes (graceful degradation for non-paid Cloudflare plans).

| Variant | Preset / Options | Width | Quality |
|---------|-----------------|-------|---------|
| `thumbnail` | `IMAGE_PRESETS.thumbnail` | 200 | 60 |
| `small` | Inline | 400 | 80 |
| `medium` | `IMAGE_PRESETS.feedCard` | 600 | 80 |
| `large` | `IMAGE_PRESETS.feedFull` | 1200 | 85 |
| `original` | No transform | — | — |

All variants use `format=webp` for smallest payload.

#### `getImageUrl(originalUrl, options)` (Lines 51-76)

Transforms an R2 URL into a Cloudflare Image Resizing URL by inserting `/cdn-cgi/image/{params}/` after the domain origin.

**Example:**
```
Input:  https://media.mizanly.app/posts/user123/abc.jpg
Output: https://media.mizanly.app/cdn-cgi/image/width=400,quality=80,format=webp/posts/user123/abc.jpg
```

Guards:
- Returns empty string for empty URL
- Skips non-image URLs (checked by extension: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.avif`)
- Skips already-transformed URLs (contains `/cdn-cgi/image/`)

#### IMAGE_PRESETS (Lines 21-42)

| Preset | Width | Height | Quality | Fit | Format |
|--------|-------|--------|---------|-----|--------|
| `avatarSm` | 64 | 64 | 80 | cover | webp |
| `avatarMd` | 128 | 128 | 80 | cover | webp |
| `avatarLg` | 256 | 256 | 80 | cover | webp |
| `thumbnail` | 200 | 200 | 60 | cover | webp |
| `feedCard` | 600 | — | 80 | — | webp |
| `feedFull` | 1200 | — | 85 | — | webp |
| `coverSm` | 640 | 200 | 75 | cover | webp |
| `coverLg` | 1280 | 400 | 80 | cover | webp |
| `videoThumb` | 320 | 180 | 70 | cover | webp |
| `videoThumbLg` | 640 | 360 | 80 | cover | webp |
| `blurPlaceholder` | 20 | — | 20 | — | webp |

### 1.6 Module Wiring

```
UploadModule {
  controllers: [UploadController]
  providers: [UploadService]
  exports: [UploadService]   // Available to other modules (e.g., posts, reels, videos)
}
```

Dependencies: `ConfigService` (injected into `UploadService` for R2 credentials).

---

## 2. Stream Module (Cloudflare Stream Integration)

### 2.1 File Inventory

| File | Lines | Purpose |
|------|-------|---------|
| `stream.module.ts` | 10 | NestJS module — exports `StreamService` |
| `stream.controller.ts` | 109 | Webhook endpoint for Cloudflare Stream callbacks |
| `stream.service.ts` | 205 | CF Stream API integration: upload, playback, delete, webhook handlers |
| `stream.controller.spec.ts` | 115 | Controller tests (7 cases including signature verification) |
| `stream.service.spec.ts` | 345 | Service tests (13 cases) |
| `stream.service.nullguard.spec.ts` | 61 | Null result guard tests (3 cases) |

### 2.2 Endpoints

#### `POST /api/v1/stream/webhook` (Lines 36-78 in controller)

- **Auth:** HMAC-SHA256 webhook signature verification (NOT Clerk auth — this is a Cloudflare callback)
- **Throttle:** 60 requests per 60 seconds
- **Swagger:** Excluded from docs (`@ApiExcludeEndpoint()`)
- **HTTP Status:** Always returns 200 (`@HttpCode(200)`)
- **Request body shape:**
  ```typescript
  {
    uid: string;              // Cloudflare Stream video UID
    readyToStream?: boolean;  // True when transcoding complete
    status?: {
      state: string;           // 'error' when transcoding fails
      errorReasonCode?: string; // e.g., 'codec_unsupported', 'duration_exceeded'
    };
  }
  ```
- **Header:** `webhook-signature` — format: `time={unix_ts},sig1={hex_hmac}`

**Webhook Processing Flow:**

1. **Secret check** (lines 50-53): If `CF_STREAM_WEBHOOK_SECRET` is empty, rejects ALL webhooks with `UnauthorizedException`
2. **Signature required** (lines 54-56): Missing `webhook-signature` header -> `UnauthorizedException`
3. **Raw body extraction** (line 59): Uses `req.rawBody` (Buffer) for signature verification to avoid JSON.stringify key reordering issues. Falls back to `JSON.stringify(body)` if rawBody unavailable.
4. **Signature verification** (line 60): Calls `verifySignature()`
5. **UID check** (lines 62-65): If no `uid` in body, returns `{ received: true }` silently
6. **Dispatch** (lines 68-75):
   - `body.readyToStream === true` -> `streamService.handleStreamReady(streamId)`
   - `body.status?.state === 'error'` -> `streamService.handleStreamError(streamId, errorReasonCode ?? 'unknown')`
7. **Response:** `{ received: true }`

### 2.3 Webhook Signature Verification (Lines 80-108 in controller)

**`verifySignature(payload: string, signature: string)`**

Implements Cloudflare's webhook signature scheme:

1. **Parse signature** (lines 81-87): Splits by `,`, extracts `time=` and `sig1=` parts. Throws `UnauthorizedException('Invalid webhook signature format')` if either missing.
2. **Replay protection** (lines 92-96): Computes `|now - timestamp|`. Rejects if >300 seconds (5 minutes) or NaN. Throws `UnauthorizedException('Webhook signature expired')`.
3. **HMAC computation** (lines 98-101):
   - Signature payload: `{timestamp}.{rawBody}`
   - Algorithm: HMAC-SHA256 with `CF_STREAM_WEBHOOK_SECRET`
   - Output: hex digest
4. **Timing-safe comparison** (lines 103-107): `crypto.timingSafeEqual()` comparing computed vs expected signature. Throws `UnauthorizedException('Invalid webhook signature')` on mismatch.

### 2.4 Stream Service — API Integration

**File:** `stream.service.ts`

#### Configuration (Lines 40-49)

```
Constructor reads:
- CF_STREAM_ACCOUNT_ID -> this.accountId
- CF_STREAM_API_TOKEN  -> this.apiToken
- Constructs baseUrl: https://api.cloudflare.com/client/v4/accounts/{accountId}/stream
- Warns if either is missing
```

#### `uploadFromUrl(r2PublicUrl, meta)` -> `string` (uid) (Lines 59-103)

**Purpose:** Triggers Cloudflare Stream to ingest a video from an R2 public URL.

**SSRF Protection (Lines 63-72):**

1. **Domain whitelist** (lines 64-67): URL must start with `R2_PUBLIC_URL` config value. If R2_PUBLIC_URL is configured and URL doesn't match, throws `BadRequestException('Video URL must be from the application storage')`.
2. **Internal IP blocklist** (lines 69-72): Blocks URLs containing:
   - `localhost`
   - `127.0.0.1`
   - `169.254.` (link-local)
   - `10.` (private Class A)
   - `192.168.` (private Class C)
   - `172.16.` (private Class B)
   - `::1` (IPv6 loopback)

**API Call (Lines 74-97):**

- **Endpoint:** `POST {baseUrl}/copy`
- **Headers:** `Authorization: Bearer {apiToken}`, `Content-Type: application/json`
- **Body:**
  ```json
  {
    "url": "<r2PublicUrl>",
    "meta": {
      "name": "<meta.title>",
      "creator": "<meta.creatorId>"
    }
  }
  ```
- **Timeout:** 60 seconds (`AbortSignal.timeout(60000)`) (line 83)
- **Error handling:**
  - Network error -> `InternalServerErrorException('Video upload service unavailable')` (lines 85-89)
  - API failure (`!response.ok || !data.success`) -> `InternalServerErrorException('Cloudflare Stream upload failed')` (lines 92-97)
  - Null result -> `InternalServerErrorException('Cloudflare Stream returned no result')` (lines 99-101)
- **Returns:** `data.result.uid` (the Cloudflare Stream video identifier)

#### `getPlaybackUrls(streamId)` -> `PlaybackUrls` (Lines 105-135)

**Purpose:** Fetches HLS/DASH playback URLs and computes available quality levels.

- **Endpoint:** `GET {baseUrl}/{streamId}`
- **Response processing:**
  1. Extracts `playback.hls` and `playback.dash` URLs
  2. Computes `maxDimension = Math.max(input.width ?? 0, input.height ?? 0)` (lines 118-121)
  3. Quality determination (lines 123-128):
     - `>= 360` -> `360p`
     - `>= 720` -> `720p`
     - `>= 1080` -> `1080p`
     - `>= 2160` -> `4k`
  4. Thumbnail URL: `https://customer-{accountId}.cloudflarestream.com/{streamId}/thumbnails/thumbnail.jpg` (line 132)

**Return shape:**
```typescript
{
  hlsUrl: string;
  dashUrl: string;
  thumbnailUrl: string;
  qualities: string[];  // e.g., ['360p', '720p', '1080p']
}
```

#### `deleteVideo(streamId)` -> `void` (Lines 137-146)

- **Endpoint:** `DELETE {baseUrl}/{streamId}`
- **Error handling:** Logs warning on failure but does NOT throw (fire-and-forget deletion)

#### `handleStreamReady(streamId)` (Lines 148-183)

**Purpose:** Webhook handler — called when Cloudflare finishes transcoding a video.

**Flow:**

1. Calls `getPlaybackUrls(streamId)` to get HLS/DASH URLs and quality levels
2. Looks up `Video` by `streamId` (line 151):
   - If found: Updates with `hlsUrl`, `dashUrl`, `qualities`, `status: 'PUBLISHED'`, `publishedAt: new Date()` (lines 153-164)
3. If no Video found, looks up `Reel` by `streamId` (line 167):
   - If found: Updates with `hlsUrl`, `dashUrl`, `qualities`, `status: 'READY'` (lines 169-179)
4. If neither found: Logs warning (line 182) — no error thrown (orphan stream)

**Key difference:** Videos get status `PUBLISHED` + `publishedAt` timestamp. Reels get status `READY` (no publishedAt).

#### `handleStreamError(streamId, error)` (Lines 185-204)

**Purpose:** Webhook handler — called when transcoding fails.

**Flow:**

1. Logs error with streamId and error message (line 186)
2. Looks up `Video` by `streamId` (line 188):
   - If found: Sets `status: 'DRAFT'` (line 191-193) — allows re-upload
3. If no Video, looks up `Reel` by `streamId` (line 197):
   - If found: Sets `status: 'FAILED'` (line 199-201)
4. If neither found: silently returns (no error)

**Key difference:** Videos revert to `DRAFT` (recoverable). Reels go to `FAILED` (distinct status).

### 2.5 Prisma Schema — streamId Fields

`streamId` appears on 4 models (all optional `String?`):
- `Video` (schema line 1113)
- `Reel` (schema line 1385)
- `LiveStream` (schema line 1769) — not used by StreamService
- `VideoPremiere` (schema line 3292) — not used by StreamService

### 2.6 Module Wiring

```
StreamModule {
  controllers: [StreamController]
  providers: [StreamService]
  exports: [StreamService]   // Available to videos, reels modules
}
```

Dependencies: `ConfigService` (CF credentials), `PrismaService` (Video/Reel lookup on webhook).

---

## 3. Downloads Module (Offline Downloads)

### 3.1 File Inventory

| File | Lines | Purpose |
|------|-------|---------|
| `downloads.module.ts` | 10 | NestJS module — exports `DownloadsService` |
| `downloads.controller.ts` | 89 | 6 endpoints: CRUD + progress + storage |
| `downloads.service.ts` | 164 | Business logic: content resolution, upsert, pagination, aggregation |
| `dto/create-download.dto.ts` | 22 | DTOs: `CreateDownloadDto` + `UpdateProgressDto` |
| `downloads.controller.spec.ts` | 102 | Controller tests (6 cases) |
| `downloads.service.spec.ts` | 162 | Service tests (8 cases) |

### 3.2 DTOs

**File:** `dto/create-download.dto.ts`

#### `CreateDownloadDto` (Lines 3-13)

| Field | Type | Validation | Required |
|-------|------|-----------|----------|
| `contentId` | `string` | `@IsString()` | Yes |
| `contentType` | `string` | `@IsIn(['post', 'video', 'reel'])` | Yes |
| `quality` | `string` | `@IsIn(['auto', '360p', '720p', '1080p'])` | No |

#### `UpdateProgressDto` (Lines 15-22)

| Field | Type | Validation | Required |
|-------|------|-----------|----------|
| `progress` | `number` | `@IsIn([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1])` | No |
| `fileSize` | `number` | None (just `@IsOptional()`) | No |

### 3.3 Endpoints

All endpoints are auth-protected (`ClerkAuthGuard`), tagged `Downloads`, throttled at 60/min.

#### `POST /api/v1/downloads` (Lines 30-37 in controller)

- **Summary:** "Request offline download"
- **Body:** `CreateDownloadDto`
- **Calls:** `service.requestDownload(userId, dto)`
- **Returns:** The upserted `OfflineDownload` record

#### `GET /api/v1/downloads` (Lines 40-49 in controller)

- **Summary:** "List downloads"
- **Query params:**
  - `status?: string` — filter by download status
  - `cursor?: string` — cursor-based pagination
  - `limit?: number` — page size (default 20)
- **Calls:** `service.getDownloads(userId, status, cursor, limit)`
- **Returns:** `{ data: OfflineDownload[], meta: { cursor, hasMore } }`

#### `GET /api/v1/downloads/storage` (Lines 52-56 in controller)

- **Summary:** "Get download storage usage"
- **Calls:** `service.getStorageUsed(userId)`
- **Returns:** `{ usedBytes: number, count: number }`

#### `GET /api/v1/downloads/:id/url` (Lines 59-66 in controller)

- **Summary:** "Get download URL for content"
- **Calls:** `service.getDownloadUrl(userId, id)`
- **Returns:** `{ url: string }` — the resolved media URL for the content

#### `PATCH /api/v1/downloads/:id/progress` (Lines 69-77 in controller)

- **Summary:** "Update download progress"
- **Body:** `UpdateProgressDto`
- **Calls:** `service.updateProgress(userId, id, dto.progress ?? 0, dto.fileSize)`
- **Returns:** Updated `OfflineDownload` record

#### `DELETE /api/v1/downloads/:id` (Lines 80-88 in controller)

- **Summary:** "Delete download"
- **HTTP Status:** 204 No Content
- **Calls:** `service.deleteDownload(userId, id)`
- **Returns:** `{ success: true }`

### 3.4 Downloads Service — Business Logic

**File:** `downloads.service.ts`

#### `requestDownload(userId, dto)` (Lines 18-43)

1. **Content verification** (line 20): Calls `resolveMediaUrl(dto.contentType, dto.contentId)` to ensure the content exists and has downloadable media
2. **Upsert** (lines 26-41): Uses `prisma.offlineDownload.upsert()` with composite unique `userId_contentId`:
   - **If exists:** Resets to `status: 'PENDING'`, `progress: 0`, updates quality
   - **If new:** Creates with `contentType`, `contentId`, `quality` (default `'auto'`), `status: 'PENDING'`, `progress: 0`
3. **Returns:** The upserted record

#### `getDownloads(userId, status?, cursor?, limit = 20)` (Lines 47-70)

- Cursor-based keyset pagination
- Takes `limit + 1` records to determine `hasMore`
- Ordered by `createdAt: 'desc'`
- Optional status filter
- Returns `{ data, meta: { cursor, hasMore } }`

#### `getDownloadUrl(userId, downloadId)` (Lines 73-84)

1. Fetches `OfflineDownload` by ID
2. Ownership check: `download.userId !== userId` -> `ForbiddenException`
3. Resolves actual media URL via `resolveMediaUrl()`
4. Returns `{ url }` or throws `NotFoundException('Content no longer available')`

#### `updateProgress(userId, downloadId, progress, fileSize?)` (Lines 87-102)

1. Fetches and verifies ownership
2. Auto-determines status: `progress >= 1 ? 'complete' : 'downloading'` (line 94)
3. Optionally updates `fileSize`
4. Returns updated record

#### `deleteDownload(userId, downloadId)` (Lines 105-114)

1. Fetches and verifies ownership
2. Hard deletes the record
3. Returns `{ success: true }`

#### `getStorageUsed(userId)` (Lines 117-128)

- Aggregates `fileSize` for all downloads with `status: 'COMPLETE'` (line 119)
- Returns `{ usedBytes: sum ?? 0, count: _count }`

#### `resolveMediaUrl(contentType, contentId)` — Private (Lines 133-163)

Content-type-specific media URL resolution:

| Content Type | Lookup | URL Priority |
|-------------|--------|-------------|
| `post` | `prisma.post.findUnique({ id, isRemoved: false })` | `mediaUrls[0]` > `thumbnailUrl` > `null` |
| `video` | `prisma.video.findUnique({ id, isRemoved: false })` | `hlsUrl` > `videoUrl` > `null` |
| `reel` | `prisma.reel.findUnique({ id, isRemoved: false })` | `hlsUrl` > `videoUrl` > `null` |
| Other | — | `BadRequestException('Unsupported content type')` |

**Key detail:** For video/reel, HLS URL is preferred over raw video URL (adaptive bitrate streaming for offline).

### 3.5 Prisma Schema — OfflineDownload Model (Schema Lines 3233-3251)

```prisma
model OfflineDownload {
  id          String               @id @default(uuid())
  userId      String
  contentType ThumbnailContentType // POST, REEL, VIDEO
  contentId   String
  quality     DownloadQuality      @default(AUTO)   // AUTO, LOW, MEDIUM, HIGH
  fileSize    Int                  @default(0)
  status      DownloadStatus       @default(PENDING) // PENDING, DOWNLOADING, COMPLETE, FAILED, PAUSED
  progress    Float                @default(0)
  filePath    String?
  expiresAt   DateTime?
  createdAt   DateTime             @default(now())
  updatedAt   DateTime             @updatedAt
  user        User                 @relation(...)

  @@unique([userId, contentId])
  @@index([userId, status])
  @@map("offline_downloads")
}
```

**Enums:**

| Enum | Values |
|------|--------|
| `ThumbnailContentType` | `POST`, `REEL`, `VIDEO` |
| `DownloadQuality` | `AUTO`, `LOW`, `MEDIUM`, `HIGH` |
| `DownloadStatus` | `PENDING`, `DOWNLOADING`, `COMPLETE`, `FAILED`, `PAUSED` |

### 3.6 Module Wiring

```
DownloadsModule {
  controllers: [DownloadsController]
  providers: [DownloadsService]
  exports: [DownloadsService]
}
```

Dependencies: `PrismaService` (OfflineDownload, Post, Video, Reel tables).

---

## 4. Cross-Module Data Flow

### 4.1 Complete Upload-to-Playback Pipeline

```
Mobile Client                    Upload Module                 Stream Module                  Cloudflare
     |                              |                              |                              |
     |-- POST /upload/presign ----->|                              |                              |
     |<---- { uploadUrl, key } -----|                              |                              |
     |                              |                              |                              |
     |-- PUT uploadUrl (binary) ---------------------------------->|----- (direct to R2) -------->|
     |                              |                              |                              |
     |-- POST /videos (create) ---->|--- (other module) --------->|                              |
     |                              |                              |                              |
     |                              |   uploadFromUrl(r2Url) ----->|-- POST /stream/copy -------->|
     |                              |                              |<---- { uid: streamId } ------|
     |                              |                              |                              |
     |                              |                              |     ... transcoding ...      |
     |                              |                              |                              |
     |                              |                              |<---- POST /stream/webhook ---|
     |                              |                              |   (readyToStream: true)      |
     |                              |                              |                              |
     |                              |                              |-- getPlaybackUrls(uid) ----->|
     |                              |                              |<---- { hlsUrl, dashUrl } ----|
     |                              |                              |                              |
     |                              |                              |-- prisma.video.update ------>|
     |                              |                              |   (hlsUrl, dashUrl, PUBLISHED)|
     |                              |                              |                              |
     |<---- GET /videos/:id --------|--- (hlsUrl in response) --->|                              |
```

### 4.2 Upload Key Format

```
{folder}/{userId}/{uuid}.{ext}

Examples:
  avatars/clk_user_abc123/550e8400-e29b-41d4-a716-446655440000.jpg
  reels/clk_user_abc123/6ba7b810-9dad-11d1-80b4-00c04fd430c8.mp4
  messages/clk_user_abc123/7c9e6679-7425-40de-944b-e07fc1f90ae7.m4a
```

This format enables:
- Ownership verification by extracting segment[1]
- Folder-based lifecycle rules on R2 (e.g., auto-expire `messages/` after 30 days)
- CDN cache invalidation by folder

### 4.3 Download Pipeline

```
Mobile Client                    Downloads Module              Other Modules (Post/Video/Reel)
     |                              |                              |
     |-- POST /downloads ---------->|                              |
     |   { contentType, contentId } |-- resolveMediaUrl() -------->|
     |                              |<---- mediaUrl or null -------|
     |<---- OfflineDownload --------|                              |
     |                              |                              |
     |-- GET /downloads/:id/url --->|                              |
     |                              |-- resolveMediaUrl() -------->|
     |<---- { url: hlsUrl } --------|                              |
     |                              |                              |
     | (client downloads locally)   |                              |
     |                              |                              |
     |-- PATCH /downloads/:id/progress ->|                         |
     |   { progress: 0.5 }         |                              |
     |<---- updated record ---------|                              |
     |                              |                              |
     |-- PATCH /downloads/:id/progress ->|                         |
     |   { progress: 1.0, fileSize }|                              |
     |<---- { status: 'complete' } -|                              |
```

---

## 5. Test Coverage Summary

### 5.1 Upload Module Tests

| Test File | Suite | Cases | Key Assertions |
|-----------|-------|-------|----------------|
| `upload.controller.spec.ts` | `UploadController` | 7 | Presign delegation, delete ownership, path traversal, error propagation |
| `upload.service.spec.ts` | `UploadService` | 12 | S3 command params, content type validation, extension mapping, folder restrictions, image variants, file size limits |

### 5.2 Stream Module Tests

| Test File | Suite | Cases | Key Assertions |
|-----------|-------|-------|----------------|
| `stream.controller.spec.ts` | `StreamController` | 7 | Signature verification (valid, invalid, expired, missing), ready/error dispatch, no-secret rejection |
| `stream.service.spec.ts` | `StreamService` | 13 | uploadFromUrl (success, failure, success:false), getPlaybackUrls (1080p, 4k, 360p, error), deleteVideo (success, failure), handleStreamReady (video, reel, orphan), handleStreamError (video, reel, orphan) |
| `stream.service.nullguard.spec.ts` | `StreamService null guard` | 3 | Null result from CF, valid result, failed upload response |

### 5.3 Downloads Module Tests

| Test File | Suite | Cases | Key Assertions |
|-----------|-------|-------|----------------|
| `downloads.controller.spec.ts` | `DownloadsController` | 6 | All 6 endpoints delegation |
| `downloads.service.spec.ts` | `DownloadsService` | 8 | requestDownload (video, not found, post with media, post without media), getDownloads (pagination, status filter), updateProgress (partial, complete), getStorageUsed (with data, empty), deleteDownload |

**Total across all 3 modules: 56 test cases.**

---

## 6. Security Summary

| Feature | Implementation | Location |
|---------|---------------|----------|
| Auth on upload/download | `ClerkAuthGuard` (Clerk JWT) | All upload + download endpoints |
| File ownership | Key path segment[1] === userId | `upload.controller.ts:61-64` |
| Path traversal prevention | Regex `^[a-zA-Z0-9\/_.-]+$`, blocks `..` and `//` | `upload.controller.ts:57` |
| MIME type validation | Regex on DTO + allowlist per folder | `upload.controller.ts:20`, `upload.service.ts:28-38` |
| File size limits | Per-folder caps, caller can't exceed | `upload.service.ts:15-25, 96-101` |
| SSRF protection (Stream) | R2 domain whitelist + internal IP blocklist | `stream.service.ts:63-72` |
| Webhook authentication | HMAC-SHA256 with timing-safe compare | `stream.controller.ts:80-108` |
| Replay protection | 5-minute signature expiry window | `stream.controller.ts:92-96` |
| Rate limiting | 20/min presign, 60/min webhook, 60/min downloads | Various `@Throttle()` decorators |

---

## 7. Configuration Dependencies

| Env Variable | Used By | Required | Default |
|-------------|---------|----------|---------|
| `R2_ACCOUNT_ID` | UploadService | Yes (or CLOUDFLARE_ACCOUNT_ID) | — |
| `R2_ACCESS_KEY_ID` | UploadService | Yes (or CLOUDFLARE_R2_ACCESS_KEY) | — |
| `R2_SECRET_ACCESS_KEY` | UploadService | Yes (or CLOUDFLARE_R2_SECRET_KEY) | — |
| `R2_BUCKET_NAME` | UploadService | No | `mizanly-media` |
| `R2_PUBLIC_URL` | UploadService, StreamService (SSRF check) | No | `https://media.mizanly.app` |
| `CF_IMAGE_RESIZING_ENABLED` | image.ts (variant generation) | No | `false` (returns original URLs) |
| `CF_STREAM_ACCOUNT_ID` | StreamService | Yes | — |
| `CF_STREAM_API_TOKEN` | StreamService | Yes | — |
| `CF_STREAM_WEBHOOK_SECRET` | StreamController | Yes | — (rejects all webhooks if empty) |

---

## 8. Known Gaps & Design Limitations

1. **No virus scanning** — uploaded files go directly to R2 without ClamAV or similar scanning.
2. **No content-length enforcement on presigned PUT** — `maxFileSize` is returned to the client for client-side enforcement, but the presigned URL itself doesn't restrict upload size (R2 doesn't support `Content-Length` conditions on presigned URLs the same way S3 does).
3. **R2 lifecycle rules not configured** — temporary/failed uploads can accumulate indefinitely in the bucket.
4. **R2 CORS not configured** — bucket CORS must be set for browser-based uploads.
5. **CF Image Resizing disabled by default** — requires paid Cloudflare plan. Currently returns original URL for all variant sizes.
6. **SSRF blocklist is string-contains based** — `stream.service.ts:69-71` uses `.includes()` which could be bypassed with creative URL encoding (e.g., `172.16` matches but `172.017` in decimal octet form might not). A proper URL parser + IP range check would be more robust.
7. **Download quality selection is DTO-only** — the `quality` field is stored but `resolveMediaUrl()` always returns the same URL regardless of quality preference. Quality-specific URL resolution (e.g., appending quality parameter to HLS manifest) is not implemented.
8. **Stream error sets Video to DRAFT but Reel to FAILED** — asymmetric error handling; unclear if intentional or oversight.
9. **No signed download URLs** — `getDownloadUrl()` returns the raw public/HLS URL. For premium content, this should return time-limited signed URLs.
10. **UpdateProgressDto uses discrete progress values** — `@IsIn([0, 0.1, 0.2, ... 1])` restricts to 10% increments, which may be too coarse for large file downloads.
