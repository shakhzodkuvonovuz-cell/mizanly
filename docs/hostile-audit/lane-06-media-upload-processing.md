# Lane 06: Media Upload / Processing

## High

### 1. Presigned upload limits are advisory only; the server never enforces object size
- The upload API validates and returns `maxFileSize`, but `UploadService.getPresignedUrl()` signs a plain `PutObjectCommand` with `ContentType` and `CacheControl` only. There is no signed size constraint, checksum, or server-side post-upload verification before the object becomes usable.
- Any authenticated client can request a valid presign for a small asset class and then upload a much larger object to R2, creating direct storage and bandwidth abuse on the bucket/CDN path.
- File references:
  - `C:\dev\mizanly\apps\api\src\modules\upload\upload.controller.ts`
  - `C:\dev\mizanly\apps\api\src\modules\upload\upload.service.ts`
- Action:
  - Enforce size at the storage boundary, not just in JSON metadata. Use a mechanism that supports policy conditions, or verify object size with a server-side HEAD/check before persisting any URL into application records.

### 2. Multiple content creation paths accept arbitrary public media URLs, then make backend/third-party fetches against them
- Posts, stories, reels, and video replies accept any `https://` URL rather than requiring application-owned storage URLs. After persistence, the backend queues image processing and/or AI moderation against those user-supplied URLs.
- This lets users hotlink third-party media into first-party content, force the backend to fetch arbitrary public hosts, and offload repeated fetch traffic to internal workers and Anthropic moderation calls. It is not private-network SSRF, but it is still a server-side fetch primitive and a billing/bandwidth abuse path.
- The validation is especially weak because `AiService.validateMediaUrl()` and `MediaProcessor.validateMediaUrl()` only enforce `https` plus non-private IPs; they do not require the URL to belong to `R2_PUBLIC_URL` or another trusted allowlist.
- File references:
  - `C:\dev\mizanly\apps\api\src\modules\posts\dto\create-post.dto.ts`
  - `C:\dev\mizanly\apps\api\src\modules\stories\dto\create-story.dto.ts`
  - `C:\dev\mizanly\apps\api\src\modules\reels\dto\create-reel.dto.ts`
  - `C:\dev\mizanly\apps\api\src\modules\video-replies\video-replies.service.ts`
  - `C:\dev\mizanly\apps\api\src\modules\posts\posts.service.ts`
  - `C:\dev\mizanly\apps\api\src\modules\stories\stories.service.ts`
  - `C:\dev\mizanly\apps\api\src\modules\reels\reels.service.ts`
  - `C:\dev\mizanly\apps\api\src\modules\ai\ai.service.ts`
  - `C:\dev\mizanly\apps\api\src\common\queue\processors\media.processor.ts`
- Action:
  - Reject media URLs that are not on an explicit storage allowlist for first-party uploads.
  - If external URLs are intentionally supported, isolate them behind a dedicated ingestion path with tighter quotas, content-length checks, MIME validation, and caching rules.

## Medium

### 3. The mobile upload contract is out of sync with the API, so several user-facing media flows fail at presign time
- The mobile helper accepts `folder: string`, but the API only allows `avatars`, `covers`, `posts`, `stories`, `messages`, `reels`, `videos`, `thumbnails`, and `misc`.
- User-reachable screens request unsupported folders such as `threads`, `group-avatars`, `community-posts`, `live-thumbnails`, `backgrounds`, `broadcast`, `voice-posts`, and `voice-messages`.
- Audio is also mismatched: the client requests `audio/m4a`, while the API only allows `audio/mpeg`, `audio/wav`, and `audio/mp4`.
- Result: these flows fail before upload even starts, despite the UI being wired as if they were supported.
- File references:
  - `C:\dev\mizanly\apps\mobile\src\services\api.ts`
  - `C:\dev\mizanly\apps\api\src\modules\upload\upload.controller.ts`
  - `C:\dev\mizanly\apps\api\src\modules\upload\upload.service.ts`
  - `C:\dev\mizanly\apps\mobile\app\(screens)\create-thread.tsx`
  - `C:\dev\mizanly\apps\mobile\app\(screens)\create-group.tsx`
  - `C:\dev\mizanly\apps\mobile\app\(screens)\community-posts.tsx`
  - `C:\dev\mizanly\apps\mobile\app\(screens)\schedule-live.tsx`
  - `C:\dev\mizanly\apps\mobile\app\(screens)\profile-customization.tsx`
  - `C:\dev\mizanly\apps\mobile\app\(screens)\create-broadcast.tsx`
  - `C:\dev\mizanly\apps\mobile\app\(screens)\voice-post-create.tsx`
  - `C:\dev\mizanly\apps\mobile\app\(screens)\voice-recorder.tsx`
- Action:
  - Replace free-form folder strings on the client with a shared typed contract from the API.
  - Either expand the backend allowlist intentionally or remove the dead client flows.
  - Normalize audio uploads on one MIME (`audio/mp4` or `audio/m4a`) across both sides.

### 4. Reel creation frequently stores the video URL as the thumbnail URL, then routes it through image-only processing
- `useReelPublish()` initializes `thumbnailUrl` to the uploaded video URL when no thumbnail was selected, and `reel-remix.tsx` does the same explicitly.
- `ReelsService.create()` unconditionally queues `thumbnailUrl` through `addMediaProcessingJob()`, and `QueueService` always enqueues `image-resize` plus `blurhash`. `MediaProcessor` then tries to decode that URL with `sharp`, which is an image pipeline.
- Impact: common reel flows can persist an MP4 as the thumbnail, produce broken preview semantics, and generate failing worker jobs/retries/DLQ noise on normal usage rather than only on malformed input.
- File references:
  - `C:\dev\mizanly\apps\mobile\src\hooks\create\useReelPublish.ts`
  - `C:\dev\mizanly\apps\mobile\app\(screens)\reel-remix.tsx`
  - `C:\dev\mizanly\apps\api\src\modules\reels\reels.service.ts`
  - `C:\dev\mizanly\apps\api\src\common\queue\queue.service.ts`
  - `C:\dev\mizanly\apps\api\src\common\queue\processors\media.processor.ts`
- Action:
  - Make `thumbnailUrl` truly optional for reels.
  - Reject non-image thumbnail URLs server-side.
  - Only enqueue image jobs when the referenced asset is actually an image.
