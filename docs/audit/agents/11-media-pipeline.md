# Audit Agent #11 — Media Pipeline

**Scope:** Upload service (presigned URLs, R2 storage), Stream service (Cloudflare Stream video), media processor (BullMQ worker), image utilities, and all consumers (videos, reels).

**Files audited line-by-line:**
- `apps/api/src/modules/upload/upload.service.ts` (142 lines)
- `apps/api/src/modules/upload/upload.controller.ts` (61 lines)
- `apps/api/src/modules/upload/upload.module.ts` (10 lines)
- `apps/api/src/modules/upload/upload.service.spec.ts` (229 lines)
- `apps/api/src/modules/upload/upload.controller.spec.ts` (71 lines)
- `apps/api/src/modules/stream/stream.service.ts` (178 lines)
- `apps/api/src/modules/stream/stream.controller.ts` (91 lines)
- `apps/api/src/modules/stream/stream.module.ts` (10 lines)
- `apps/api/src/modules/stream/stream.service.spec.ts` (345 lines)
- `apps/api/src/modules/stream/stream.controller.spec.ts` (62 lines)
- `apps/api/src/common/utils/image.ts` (101 lines)
- `apps/api/src/common/queue/processors/media.processor.ts` (159 lines)
- `apps/api/src/modules/videos/videos.service.ts` (899 lines) — stream integration sections
- `apps/api/src/modules/videos/videos.module.ts` (14 lines)
- `apps/api/src/modules/videos/dto/create-video.dto.ts` (61 lines)
- `apps/api/src/modules/reels/reels.service.ts` (930+ lines) — stream integration sections
- `apps/api/src/modules/reels/reels.module.ts` (15 lines)
- `apps/api/src/modules/reels/dto/create-reel.dto.ts` (67 lines)
- `apps/api/src/modules/health/health.controller.ts` (121 lines) — R2/Stream health checks
- `apps/api/.env.example` (55 lines)

**Total findings: 28**

---

## CRITICAL (P0) — Ship Blockers

### Finding 1: No EXIF stripping — GPS location leakage in all uploaded images
- **File:** `apps/api/src/modules/upload/upload.service.ts`, entire file
- **Line:** N/A (missing functionality)
- **Severity:** P0 CRITICAL / PRIVACY VIOLATION
- **Category:** Privacy, Security
- **Description:** The upload service generates presigned URLs for clients to PUT directly to R2. There is zero server-side processing of uploaded images — no EXIF stripping, no metadata removal. JPEG and TIFF files contain EXIF data including GPS coordinates, device model, serial numbers, timestamps, and sometimes the user's full name. When users upload photos, their exact physical location is embedded in the file and served publicly via the R2 public URL. This is a **serious privacy violation** and potential safety issue (stalking, doxxing). Every social platform (Instagram, Twitter, Facebook) strips EXIF on upload.
- **Impact:** Every photo uploaded to Mizanly leaks the photographer's GPS coordinates to anyone who downloads the image.
- **Fix:** Either (a) route uploads through the server and use `sharp` to strip EXIF before storing, or (b) process images asynchronously via the media processor queue after upload, stripping EXIF and replacing the original in R2. The `sharp` package is already installed (`"sharp": "^0.33.0"` in package.json). Use `sharp(buffer).rotate().toBuffer()` which auto-strips EXIF while respecting orientation.

### Finding 2: R2 env var names in `.env` don't match what code reads — ALL uploads are broken
- **File:** `apps/api/src/modules/upload/upload.service.ts`, lines 49-53
- **Severity:** P0 CRITICAL / BROKEN FEATURE
- **Category:** Configuration
- **Description:** The `.env.example` and CLAUDE.md both document this mismatch but it remains unfixed. The upload service reads:
  - `R2_ACCOUNT_ID` (line 49)
  - `R2_ACCESS_KEY_ID` (line 51)
  - `R2_SECRET_ACCESS_KEY` (line 52)
  - `R2_BUCKET_NAME` (line 55)
  - `R2_PUBLIC_URL` (line 56)

  The `.env.example` now correctly uses these same names, but the CLAUDE.md credential status section says the actual `.env` has `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY`, and `CLOUDFLARE_R2_SECRET_KEY` — which are different names. When credentials are provided under the wrong env var names, the S3Client is initialized with empty strings (`?? ''`), and all presigned URL generation silently produces invalid URLs pointing to `https://.r2.cloudflarestorage.com`.
- **Code:**
  ```typescript
  this.s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${this.config.get('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: this.config.get('R2_ACCESS_KEY_ID') ?? '',  // silent empty string
      secretAccessKey: this.config.get('R2_SECRET_ACCESS_KEY') ?? '',  // silent empty string
    },
  });
  ```
- **Impact:** All file uploads (photos, avatars, covers, videos, messages) are non-functional.
- **Fix:** Add startup validation that throws if any required R2 env vars are empty. Reconcile env var names between `.env`, `.env.example`, and code.

### Finding 3: Stream webhook unauthenticated when secret is not configured
- **File:** `apps/api/src/modules/stream/stream.controller.ts`, lines 42-48
- **Severity:** P0 CRITICAL / SECURITY
- **Category:** Authentication, Webhook Security
- **Description:** When `CF_STREAM_WEBHOOK_SECRET` is empty (which it is — not in `.env.example`), the webhook endpoint accepts ANY POST request without signature verification. An attacker can call `POST /api/v1/stream/webhook` with `{ uid: "any-stream-id", readyToStream: true }` to mark any video/reel as published, or with `{ status: { state: "error" } }` to mark them as failed/draft.
- **Code:**
  ```typescript
  if (this.webhookSecret) {  // Empty string = falsy = skip verification
    if (!signature) {
      throw new UnauthorizedException('Missing webhook signature');
    }
    this.verifySignature(JSON.stringify(body), signature);
  }
  // If webhookSecret is empty, ANYONE can trigger stream ready/error
  ```
- **Impact:** Attacker can arbitrarily change video/reel status (publish unpublished, fail published).
- **Fix:** If `webhookSecret` is empty, reject ALL webhook requests with a 503 "Webhook secret not configured" instead of silently accepting them.

---

## HIGH (P1) — Security Issues

### Finding 4: No timestamp replay protection on Stream webhook signatures
- **File:** `apps/api/src/modules/stream/stream.controller.ts`, lines 68-89
- **Severity:** P1 HIGH / SECURITY
- **Category:** Webhook Security
- **Description:** The `verifySignature` method extracts the `time=` part from the webhook signature and includes it in the HMAC computation, but never checks whether the timestamp is recent. An intercepted valid webhook payload+signature can be replayed indefinitely. Cloudflare's docs recommend rejecting signatures older than 5 minutes.
- **Code:**
  ```typescript
  const timestamp = timePart.replace('time=', '');
  // No age check — a captured signature from 2 years ago would still validate
  const signaturePayload = `${timestamp}.${payload}`;
  ```
- **Fix:** Parse `timestamp` as a number, compare to `Date.now()`, reject if older than 300 seconds.

### Finding 5: Content-Type spoofing — presigned URL trusts client-declared Content-Type
- **File:** `apps/api/src/modules/upload/upload.service.ts`, lines 59-96
- **Severity:** P1 HIGH / SECURITY
- **Category:** File Validation
- **Description:** The presigned URL is generated with a `ContentType` that the client declares in the DTO. While the server validates that the declared type is in the allowlist, it does not validate that the actual uploaded file matches this type. A client can claim `content-type: image/jpeg` to get a presigned URL, then upload an HTML file or a `.exe` with that presigned URL. The R2 bucket will serve it with `Content-Type: image/jpeg` but the actual bytes are executable/HTML. If the R2 public URL domain is trusted by browsers, this enables XSS via HTML injection.
- **Impact:** Potential XSS via uploaded HTML files served from trusted domain. Malware distribution via content-type mismatch.
- **Mitigation:** R2's presigned URLs with `ContentType` set *should* reject mismatched uploads (S3 behavior), but this depends on whether the `ContentType` is included in the signature. With `@aws-sdk/s3-request-presigner`, `ContentType` IS signed by default, so this is mitigated. However, the `ContentLength` issue (Finding 6) means files of any size up to the max can be uploaded.

### Finding 6: ContentLength set to max size, not actual file size — size limit not enforced
- **File:** `apps/api/src/modules/upload/upload.service.ts`, line 92
- **Severity:** P1 HIGH / RESOURCE ABUSE
- **Category:** Upload Security
- **Description:** The `ContentLength` in the `PutObjectCommand` is set to `effectiveMaxSize` (the folder's maximum, e.g., 100MB for videos). This is NOT how S3 presigned URL size limits work. Setting `ContentLength` in the presigned command means the upload MUST be exactly that size — not "up to" that size. This means:
  1. A 1KB avatar upload would fail because the presigned URL expects exactly 5MB
  2. OR if S3/R2 ignores the ContentLength mismatch, then there's no size enforcement at all
- **Code:**
  ```typescript
  ContentLength: effectiveMaxSize,  // e.g., 5MB for avatars — but file might be 50KB
  ```
- **Impact:** Either all uploads fail (ContentLength mismatch), or no size limit is enforced.
- **Fix:** Remove `ContentLength` from the PutObjectCommand. Instead, use S3's `Content-Length-Range` condition via presigned POST policies (not presigned PUT), or validate file size server-side after upload using a webhook/notification from R2.

### Finding 7: SSRF via `uploadFromUrl` — no URL validation on video source
- **File:** `apps/api/src/modules/stream/stream.service.ts`, lines 55-77
- **Severity:** P1 HIGH / SECURITY
- **Category:** SSRF
- **Description:** `uploadFromUrl` passes a `r2PublicUrl` to the Cloudflare Stream `/copy` API. While the DTOs for `CreateVideoDto` and `CreateReelDto` use `@IsUrl()`, this only validates URL format — not that the URL points to the application's own R2 bucket. An attacker can create a video/reel with `videoUrl: "http://169.254.169.254/latest/meta-data/"` or any internal URL. Cloudflare Stream's copy endpoint will then fetch from that URL on behalf of the application.
- **Code:**
  ```typescript
  async uploadFromUrl(r2PublicUrl: string, meta: UploadMeta): Promise<string> {
    const response = await fetch(`${this.baseUrl}/copy`, {
      method: 'POST',
      body: JSON.stringify({ url: r2PublicUrl, ... }),  // Any URL accepted
    });
  ```
- **Impact:** SSRF — attacker can make Cloudflare fetch internal/private URLs. Cloud metadata endpoints, internal services.
- **Fix:** Validate that `r2PublicUrl` starts with the configured `R2_PUBLIC_URL` domain before passing to Stream API.

### Finding 8: Delete endpoint allows path traversal via key parameter
- **File:** `apps/api/src/modules/upload/upload.controller.ts`, lines 47-60
- **Severity:** P1 HIGH / SECURITY
- **Category:** Authorization Bypass
- **Description:** The delete endpoint uses `@Param('key') key: string` with a wildcard route `':key(*)'`. The ownership check splits the key by `/` and checks `segments[1]` against userId. However, a key like `posts/user-123/../other-user/secret.jpg` would pass the ownership check (segments[1] = "user-123") but the S3 `DeleteObjectCommand` would resolve the path to `posts/other-user/secret.jpg`, deleting another user's file.
- **Code:**
  ```typescript
  const segments = key.split('/');
  const keyOwnerId = segments.length >= 2 ? segments[1] : null;
  if (keyOwnerId !== userId) {
    throw new ForbiddenException('You do not own this file');
  }
  // key with ../ still passed to S3
  return this.uploadService.deleteFile(key);
  ```
- **Impact:** Any authenticated user can delete any other user's files from R2.
- **Fix:** Normalize the key path before checking ownership. Reject keys containing `..`, `//`, or any character outside `[a-zA-Z0-9/_.-]`.

---

## MEDIUM (P2) — Functional Bugs

### Finding 9: Reel content moderation checks non-existent `description` field — moderation never fires
- **File:** `apps/api/src/modules/reels/reels.service.ts`, lines 159-162
- **Severity:** P2 MEDIUM / BROKEN FEATURE
- **Category:** Content Moderation
- **Description:** The code checks `if (reel.description)` to decide whether to moderate reel text content. However, the Reel Prisma model has `caption` not `description`. The `REEL_SELECT` object (lines 22-57) does not include a `description` field. Therefore `reel.description` is always `undefined`, and content moderation NEVER fires for reels. Same issue on line 176 where `reel.description` is passed to search indexing.
- **Code:**
  ```typescript
  // reel object from REEL_SELECT has .caption, NOT .description
  if (reel.description) {  // ALWAYS undefined — moderation never runs
    this.queueService.addModerationJob({ content: reel.description, ... });
  }
  ```
- **Impact:** All reel captions bypass text content moderation entirely. Offensive/harmful text in reels goes unmoderated.
- **Fix:** Change `reel.description` to `reel.caption` on lines 160, 161, and 176.

### Finding 10: Media processor image-resize generates variants but discards them
- **File:** `apps/api/src/common/queue/processors/media.processor.ts`, lines 74-109
- **Severity:** P2 MEDIUM / INCOMPLETE
- **Category:** Dead Code
- **Description:** The `processImageResize` method fetches an image, resizes it to three sizes using `sharp`, but then discards the result — the resized buffers from `.toBuffer()` are never uploaded back to R2 or stored anywhere. The comment says "In production: upload each variant to R2" but this was never implemented.
- **Code:**
  ```typescript
  await sharp.default(buffer)
    .resize(size.width, size.height, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();  // Result discarded — never uploaded to R2
  // Comment: "For now, the resizing pipeline is validated"
  ```
- **Impact:** Image resize jobs consume CPU but produce no output. Responsive image variants don't actually exist.
- **Fix:** Implement the R2 upload step, or remove the processor to avoid wasting queue/CPU resources.

### Finding 11: BlurHash processor generates average color, not actual BlurHash
- **File:** `apps/api/src/common/queue/processors/media.processor.ts`, lines 111-148
- **Severity:** P2 MEDIUM / INCORRECT
- **Category:** Incorrect Implementation
- **Description:** The `processBlurHash` method claims to generate BlurHash but actually computes a simple RGB average color. The comment acknowledges this: "BlurHash requires encode library, this provides a functional placeholder." The computed average color is logged but never stored in the database (no Prisma update).
- **Code:**
  ```typescript
  const avgColor = `rgb(${Math.round(r/pixelCount)},${Math.round(g/pixelCount)},${Math.round(b/pixelCount)})`;
  // avgColor is logged but NEVER written to DB
  ```
- **Impact:** BlurHash field in Reel model is always null. Image placeholders don't work.
- **Fix:** Install `blurhash` package, encode actual BlurHash, and write result to the relevant DB record.

### Finding 12: Video error status set to DRAFT instead of FAILED
- **File:** `apps/api/src/modules/stream/stream.service.ts`, lines 158-168
- **Severity:** P2 MEDIUM / DATA INTEGRITY
- **Category:** Data Integrity
- **Description:** When Cloudflare Stream reports an error for a video, the video's status is set to `DRAFT`. For reels, error sets status to `FAILED`. This inconsistency means failed video transcodes appear as editable drafts rather than failed items. Users may try to publish a video that has no valid stream, leading to a broken viewing experience.
- **Code:**
  ```typescript
  // Video error → DRAFT (wrong — should be FAILED or ERROR)
  await this.prisma.video.update({
    where: { id: video.id },
    data: { status: 'DRAFT' },  // Misleading status
  });
  // Reel error → FAILED (correct)
  await this.prisma.reel.update({
    where: { id: reel.id },
    data: { status: 'FAILED' },  // Correct status
  });
  ```
- **Fix:** Set video error status to `FAILED` or add a dedicated `ERROR` status to the VideoStatus enum.

### Finding 13: Health controller uses wrong env var name for Stream account ID
- **File:** `apps/api/src/modules/health/health.controller.ts`, line 35
- **Severity:** P2 MEDIUM / BUG
- **Category:** Configuration
- **Description:** The health check uses `process.env.CF_ACCOUNT_ID` but the stream service uses `CF_STREAM_ACCOUNT_ID`. These are different env var names. The health check will always use the empty fallback `''`, making the Stream health probe hit the wrong Cloudflare API URL and always return false.
- **Code:**
  ```typescript
  // health.controller.ts — wrong name
  'https://api.cloudflare.com/client/v4/accounts/' + (process.env.CF_ACCOUNT_ID || '') + '/stream'
  // stream.service.ts — correct name
  this.accountId = this.config.get('CF_STREAM_ACCOUNT_ID') ?? '';
  ```
- **Fix:** Change `process.env.CF_ACCOUNT_ID` to `process.env.CF_STREAM_ACCOUNT_ID`.

### Finding 14: Video `create` sets publishedAt immediately — no scheduled/draft support
- **File:** `apps/api/src/modules/videos/videos.service.ts`, line 131
- **Severity:** P2 MEDIUM / UX
- **Category:** Functional
- **Description:** When creating a video, `publishedAt` is set to `new Date()` immediately, even though the video status is `PROCESSING`. This means the video appears in feeds sorted by publish time as if it was published when created, not when transcoding finished. If transcoding takes 5 minutes, the video is already buried in the feed by the time it's viewable.
- **Fix:** Set `publishedAt` in `handleStreamReady` when the video becomes viewable, not at creation time.

### Finding 15: isImageUrl uses `includes()` instead of checking file extension at end of path
- **File:** `apps/api/src/common/utils/image.ts`, lines 97-101
- **Severity:** P2 MEDIUM / BUG
- **Category:** Validation
- **Description:** The `isImageUrl` function uses `lower.includes(ext)` which matches anywhere in the URL string, not just the file extension. A URL like `https://example.com/api/v1/.jpg-exploit/data.exe` would be falsely identified as an image URL because it contains `.jpg`. Conversely, `https://example.com/image?format=jpg` would NOT match because `.jpg` (with dot) is checked.
- **Code:**
  ```typescript
  return imageExtensions.some(ext => lower.includes(ext));
  // ".jpg" matches in "/path/.jpg-exploit/malware.exe"
  ```
- **Fix:** Use URL parsing to extract the pathname, then check if it ends with a known extension:
  ```typescript
  const pathname = new URL(url).pathname.toLowerCase();
  return imageExtensions.some(ext => pathname.endsWith(ext));
  ```

### Finding 16: `CF_STREAM_WEBHOOK_SECRET` not in `.env.example`
- **File:** `apps/api/.env.example`, lines 17-19
- **Severity:** P2 MEDIUM / CONFIGURATION
- **Category:** Configuration, Documentation
- **Description:** The `.env.example` file lists `CF_STREAM_API_TOKEN` and `CF_STREAM_ACCOUNT_ID` but omits `CF_STREAM_WEBHOOK_SECRET`. Developers copying `.env.example` will never know they need to configure the webhook secret, leaving the webhook endpoint permanently unauthenticated (see Finding 3).
- **Fix:** Add `CF_STREAM_WEBHOOK_SECRET=""` to `.env.example`.

---

## LOW (P3) — Quality / Hardening

### Finding 17: Presigned URL DTO has no regex validation on contentType
- **File:** `apps/api/src/modules/upload/upload.controller.ts`, lines 17-19
- **Severity:** P3 LOW / DEFENSE IN DEPTH
- **Category:** Input Validation
- **Description:** The `contentType` field in `PresignDto` uses only `@IsString()`. While the service validates against an allowlist, the DTO should also validate the format (e.g., `@Matches(/^(image|video|audio)\/.+$/)`) to reject obviously invalid inputs before they reach the service layer.
- **Fix:** Add `@Matches(/^(image|video|audio)\/[a-z0-9+.-]+$/)` to the contentType field.

### Finding 18: S3Client silently initializes with empty credentials
- **File:** `apps/api/src/modules/upload/upload.service.ts`, lines 47-57
- **Severity:** P3 LOW / ROBUSTNESS
- **Category:** Error Handling
- **Description:** The S3Client is constructed in the class constructor with `?? ''` fallbacks for all credential fields. If env vars are missing, the service initializes successfully but every request fails with cryptic AWS SDK errors. The service should fail fast on construction if required env vars are missing.
- **Code:**
  ```typescript
  accessKeyId: this.config.get('R2_ACCESS_KEY_ID') ?? '',      // empty = broken
  secretAccessKey: this.config.get('R2_SECRET_ACCESS_KEY') ?? '',  // empty = broken
  ```
- **Fix:** Throw on startup if any required R2 env var is empty, or log a prominent warning.

### Finding 19: Stream service silently initializes with empty credentials
- **File:** `apps/api/src/modules/stream/stream.service.ts`, lines 43-44
- **Severity:** P3 LOW / ROBUSTNESS
- **Category:** Error Handling
- **Description:** Same issue as Finding 18 — `CF_STREAM_ACCOUNT_ID` and `CF_STREAM_API_TOKEN` default to empty strings, producing a base URL of `https://api.cloudflare.com/client/v4/accounts//stream` (double slash). Every Stream API call fails with a non-descriptive error.
- **Fix:** Log a warning or throw on initialization if stream env vars are empty.

### Finding 20: Video `create` fires Stream upload as fire-and-forget — no retry on failure
- **File:** `apps/api/src/modules/videos/videos.service.ts`, lines 142-157
- **Severity:** P3 LOW / RELIABILITY
- **Category:** Reliability
- **Description:** The Stream upload is triggered via `.then().catch()` (fire-and-forget promise chain). If the upload fails, the video falls back to `PUBLISHED` status with only a raw R2 URL (line 155), which may not have proper transcoding or adaptive streaming. There is no retry mechanism — the video is stuck as raw R2 forever.
- **Code:**
  ```typescript
  .catch((err) => {
    this.logger.error(...);
    // Fall back to PUBLISHED with raw R2 URL
    this.prisma.video.update({ data: { status: 'PUBLISHED' } });
  });
  ```
- **Fix:** Use the BullMQ queue with retry policy instead of fire-and-forget promises.

### Finding 21: Reel `create` fires Stream upload as fire-and-forget — same issue
- **File:** `apps/api/src/modules/reels/reels.service.ts`, lines 138-153
- **Severity:** P3 LOW / RELIABILITY
- **Category:** Reliability
- **Description:** Identical to Finding 20. On Stream upload failure, the reel falls back to `READY` status (line 151) with only a raw R2 URL and no adaptive streaming.
- **Fix:** Same — use BullMQ queue with retry.

### Finding 22: PresignDto `maxFileSize` accepts 0 and negative numbers
- **File:** `apps/api/src/modules/upload/upload.controller.ts`, line 26
- **Severity:** P3 LOW / VALIDATION
- **Category:** Input Validation
- **Description:** `maxFileSize` has `@Max(104857600)` but no `@Min(1)`. A value of 0 or negative would pass DTO validation and potentially cause unexpected behavior in the S3 presigned URL generation.
- **Fix:** Add `@Min(1)` to the `maxFileSize` field.

### Finding 23: Video processor `processVideoTranscode` is a no-op stub
- **File:** `apps/api/src/common/queue/processors/media.processor.ts`, lines 150-158
- **Severity:** P3 LOW / INCOMPLETE
- **Category:** Dead Code
- **Description:** The video transcode job handler immediately sets progress to 100% and returns without doing anything. If video transcode jobs are queued, they silently succeed without performing any work.
- **Impact:** Wasted queue throughput; misleading job completion metrics.
- **Fix:** Either implement post-processing logic or remove the handler and don't queue video-transcode jobs.

### Finding 24: `getResponsiveImageUrls` generates URLs for non-existent CDN variants
- **File:** `apps/api/src/common/utils/image.ts`, lines 81-95
- **Severity:** P3 LOW / UX
- **Category:** Incorrect Implementation
- **Description:** The function returns URLs using Cloudflare Image Resizing (`/cdn-cgi/image/...`), but this requires Cloudflare's paid Image Resizing feature to be enabled on the domain. If not enabled (which it likely isn't — not mentioned in any setup docs), all variant URLs return 404 or the original image. The mobile app receives these URLs and may try to load non-existent thumbnails.
- **Impact:** Broken image thumbnails if Cloudflare Image Resizing isn't configured.

### Finding 25: Stream webhook body is re-serialized for signature verification
- **File:** `apps/api/src/modules/stream/stream.controller.ts`, line 47
- **Severity:** P3 LOW / SECURITY
- **Category:** Webhook Security
- **Description:** The webhook handler receives `body` as a parsed JSON object (NestJS auto-parses), then re-serializes it with `JSON.stringify(body)` for HMAC verification. JSON serialization is not guaranteed to produce the same byte sequence as the original request body (key ordering, whitespace). This can cause valid signatures to fail verification if the original payload has different formatting than `JSON.stringify` produces.
- **Code:**
  ```typescript
  this.verifySignature(JSON.stringify(body), signature);
  // JSON.stringify may differ from original HTTP body
  ```
- **Fix:** Use raw body middleware (`@RawBody()` decorator or `rawBody: true` in NestJS config) to capture the exact bytes for HMAC verification.

### Finding 26: No virus/malware scanning on uploaded files
- **File:** `apps/api/src/modules/upload/upload.service.ts`
- **Severity:** P3 LOW / SECURITY
- **Category:** Security, Compliance
- **Description:** Files are uploaded directly to R2 with no malware scanning. While content-type validation limits file types, determined attackers can embed malicious content in valid image/video formats (steganography, polyglot files). For a social platform serving user-uploaded content, malware scanning is an industry standard requirement.
- **Impact:** The platform could serve malware-infected files.
- **Fix:** Integrate ClamAV or a cloud-based scanning service (e.g., Cloudflare's built-in scanning) as a post-upload step.

### Finding 27: Test coverage gap — webhook signature verification never tested with valid secret
- **File:** `apps/api/src/modules/stream/stream.controller.spec.ts`
- **Severity:** P3 LOW / TEST QUALITY
- **Category:** Test Coverage
- **Description:** The stream controller spec configures `CF_STREAM_WEBHOOK_SECRET` as empty string (line 26: `get: jest.fn().mockReturnValue('')`), so webhook signature verification is never exercised in tests. All tests pass with unsigned payloads. There are no test cases for valid signatures, invalid signatures, or missing signatures when a secret is configured.
- **Fix:** Add test cases with a non-empty secret, testing valid HMAC, invalid HMAC, missing signature header, and expired timestamp.

### Finding 28: `isImageUrl` includes `.bmp` and `.tiff` but these are not in `ALLOWED_IMAGE_TYPES`
- **File:** `apps/api/src/common/utils/image.ts`, line 98 vs `apps/api/src/modules/upload/upload.service.ts`, line 10
- **Severity:** P3 LOW / INCONSISTENCY
- **Category:** Validation
- **Description:** The `isImageUrl` function considers `.bmp` and `.tiff` as image URLs (line 98), but the upload service's `ALLOWED_IMAGE_TYPES` only allows `image/jpeg`, `image/png`, `image/webp`, `image/gif` (line 10). BMP and TIFF files cannot be uploaded through the presigned URL flow, but if they exist (e.g., from an external source), `getImageUrl` would try to apply Cloudflare Image Resizing to them, which may not support BMP format.
- **Fix:** Align the two lists — either add `image/bmp` and `image/tiff` to upload allowlist, or remove `.bmp`/`.tiff` from `isImageUrl`.

---

## Summary by Severity

| Severity | Count | Key Issues |
|----------|-------|------------|
| P0 Critical | 3 | EXIF not stripped (privacy), R2 env var mismatch (uploads broken), Stream webhook unauthenticated |
| P1 High | 5 | Webhook replay attacks, Content-Type spoofing, ContentLength size enforcement broken, SSRF via uploadFromUrl, delete path traversal |
| P2 Medium | 8 | Reel moderation uses wrong field, media processor discards results, BlurHash is a stub, video error status wrong, health controller env var mismatch, publishedAt timing, isImageUrl false positives, missing env.example entry |
| P3 Low | 12 | Silent empty credentials, fire-and-forget uploads, no retry, DTO validation gaps, dead code stubs, CDN variant assumptions, signature re-serialization, no malware scanning, test gaps, type list inconsistency |
| **Total** | **28** | |

---

## Cross-references to Previous Audit (Agent #11 from March 21)

The March 21 audit found 14 findings for this scope. This deep audit expands to 28 findings by:
1. Discovering path traversal in delete endpoint (new)
2. Identifying ContentLength enforcement bug (new)
3. Finding reel moderation referencing non-existent field (new)
4. Deeper analysis of media processor dead code (expanded)
5. SSRF vector analysis (expanded from previous)
6. Webhook replay attack window (new)
7. Health controller env var mismatch (new)
8. Multiple validation and consistency issues (new)
