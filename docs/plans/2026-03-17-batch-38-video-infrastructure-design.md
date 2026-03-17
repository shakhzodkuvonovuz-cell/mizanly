# Batch 38 — Video Infrastructure Design

**Date:** 2026-03-17
**Scope:** Cloudflare Stream integration, HLS playback, quality/speed/loop controls, thumbnail customization
**Approach:** A — R2 upload first, Stream ingests from R2 URL (backend-driven)

---

## Deferred (post-launch, needs FFmpeg/native SDK)

- Video trim/cut editor
- Speed ramping (variable speed within clip)
- Video transitions library
- Sound sync (auto-cut to beat drops)
- Boomerang / layout camera modes
- Auto-captions (Whisper API) — standalone, not editing-dependent
- Text-to-speech on videos
- Voiceover recording
- Actual volume normalization processing

---

## 1. Backend — StreamService + Webhook

**New module:** `apps/api/src/modules/stream/`

Files:
- `stream.module.ts` — imports ConfigModule, exports StreamService
- `stream.service.ts` — wraps Cloudflare Stream API
- `stream.controller.ts` — webhook endpoint
- `stream.service.spec.ts` — unit tests

### StreamService methods

- `uploadFromUrl(r2PublicUrl: string, meta: { title: string, creatorId: string })` — POST to `https://api.cloudflare.com/client/v4/accounts/{account_id}/stream/copy` with the R2 URL. Returns `streamId`.
- `getVideoStatus(streamId: string)` — GET stream status (readyToStream, thumbnail, playback URLs)
- `getPlaybackUrls(streamId: string)` — returns `{ hlsUrl, dashUrl, thumbnailUrl }`
- `deleteVideo(streamId: string)` — DELETE from Stream when video/reel is deleted

### Webhook endpoint

`POST /stream/webhook` — receives Cloudflare Stream webhook events.

- Verify webhook signature via `CF_STREAM_WEBHOOK_SECRET`
- On `stream.ready`:
  - Look up Video or Reel by `streamId`
  - Update `hlsUrl`, `dashUrl`, `qualities[]`, `status = PUBLISHED` (Video) or `READY` (Reel)
- On `stream.error`:
  - Set status to `FAILED` (new enum value needed? No — use existing DRAFT for Video, FAILED for Reel)
  - Log error details

### Integration with existing services

**VideosService.create():**
1. Save to DB with `status: PROCESSING` (new — currently jumps to PUBLISHED)
2. Call `streamService.uploadFromUrl(r2VideoUrl, { title, creatorId: userId })`
3. Store returned `streamId` on the Video record
4. Video stays PROCESSING until webhook fires `stream.ready`

**ReelsService.create():**
1. Already saves with `status: PROCESSING` — no change
2. Call `streamService.uploadFromUrl(r2VideoUrl, { title: caption, creatorId: userId })`
3. Store `streamId`
4. Webhook updates to READY

**VideosService.delete() / ReelsService.delete():**
- After DB delete, call `streamService.deleteVideo(streamId)` if streamId exists

### Environment variables

```env
CF_STREAM_API_TOKEN=xxx        # Cloudflare API token with Stream:Edit permission
CF_STREAM_ACCOUNT_ID=xxx       # Cloudflare account ID
CF_STREAM_WEBHOOK_SECRET=xxx   # Webhook signing secret
```

---

## 2. Schema Changes

Add to existing Video model:
```prisma
hlsUrl       String?
dashUrl      String?
qualities    String[]     // e.g. ["360p", "720p", "1080p"]
isLooping    Boolean      @default(false)
```

Add to existing Reel model:
```prisma
hlsUrl       String?
dashUrl      String?
qualities    String[]
isLooping    Boolean      @default(true)
```

`streamId` already exists on both — no change.

No new models or enums required.

---

## 3. Mobile — VideoPlayer Upgrade

File: `apps/mobile/src/components/ui/VideoPlayer.tsx`

### HLS playback

- Accept new prop `hlsUrl?: string`
- Use `hlsUrl` as source when available, fall back to `uri` (raw R2 URL)
- `expo-av` supports HLS natively on both iOS and Android — no extra dependency

### Quality selector

- New prop `qualities?: string[]` (from API response)
- New BottomSheet with quality options: "Auto" + each available quality
- Cloudflare Stream quality-specific URLs follow the pattern: append `?clientBandwidthHint={kbps}` to HLS URL
- Default to "Auto" (let HLS adaptive bitrate handle it)

### Loop toggle

- New prop `isLooping?: boolean` (default false for Minbar, true for Bakra)
- Toggle button in controls — icon switches between `repeat` and `repeat` with active color
- Pass `isLooping` to `<Video isLooping={isLooping} />`

### 0.25x speed

- Add `0.25` to `PlaybackSpeed` type: `type PlaybackSpeed = 0.25 | 0.5 | 1 | 1.25 | 1.5 | 2;`
- Add corresponding BottomSheetItem

### Props summary (new additions)

```ts
interface VideoPlayerProps {
  uri: string;
  hlsUrl?: string;          // NEW — prefer over uri
  thumbnailUrl?: string;
  duration?: number;
  qualities?: string[];      // NEW — from API
  isLooping?: boolean;       // NEW — default false
  autoPlay?: boolean;
  onProgress?: (progress: number) => void;
  onComplete?: () => void;
}
```

---

## 4. Mobile — Thumbnail Customization

### Install dependency

`expo-video-thumbnails` — generates frame images from local video files.

### create-video.tsx changes

After video is picked:
1. Generate ~10 thumbnail frames at evenly-spaced intervals using `VideoThumbnails.getThumbnailAsync(uri, { time: ms })`
2. Show horizontal scrollable filmstrip below the video preview
3. Tap a frame to select it as thumbnail
4. "Upload custom thumbnail" button opens `ImagePicker.launchImageLibraryAsync()`
5. Selected thumbnail uploads to R2 (folder: `thumbnails`) via existing presigned URL flow
6. `thumbnailUrl` sent with video metadata to API

### create-reel.tsx changes

Same pattern but simpler — single row of 6 frames (reels are shorter).

---

## 5. Volume Normalization Flag

### API

Add `normalizeAudio?: boolean` to:
- `CreateVideoDto`
- `CreateReelDto`

Store on the model (add field to schema):
```prisma
// Video + Reel
normalizeAudio Boolean @default(false)
```

No actual processing — metadata flag for future FFmpeg integration.

### Mobile

Toggle switch on create-video.tsx and create-reel.tsx:
- Label: "Normalize audio levels"
- Subtitle: "Consistent volume across the video"
- Default: off

---

## API Response Changes

### Video response — add fields:

```json
{
  "hlsUrl": "https://customer-xxx.cloudflarestream.com/xxx/manifest/video.m3u8",
  "dashUrl": "https://customer-xxx.cloudflarestream.com/xxx/manifest/video.mpd",
  "qualities": ["360p", "720p", "1080p"],
  "isLooping": false,
  "streamId": "abc123"
}
```

### Reel response — same pattern:

```json
{
  "hlsUrl": "...",
  "qualities": ["360p", "720p"],
  "isLooping": true
}
```

Mobile uses `hlsUrl` when present, falls back to `videoUrl`.

---

## File Changes Summary

### API (new files)
- `apps/api/src/modules/stream/stream.module.ts`
- `apps/api/src/modules/stream/stream.service.ts`
- `apps/api/src/modules/stream/stream.controller.ts`
- `apps/api/src/modules/stream/stream.service.spec.ts`

### API (modified files)
- `apps/api/prisma/schema.prisma` — add fields to Video + Reel
- `apps/api/src/modules/videos/videos.service.ts` — integrate StreamService
- `apps/api/src/modules/videos/videos.module.ts` — import StreamModule
- `apps/api/src/modules/videos/dto/create-video.dto.ts` — add normalizeAudio
- `apps/api/src/modules/reels/reels.service.ts` — integrate StreamService
- `apps/api/src/modules/reels/reels.module.ts` — import StreamModule
- `apps/api/src/modules/reels/dto/create-reel.dto.ts` — add normalizeAudio
- `apps/api/src/app.module.ts` — register StreamModule

### Mobile (modified files)
- `apps/mobile/src/components/ui/VideoPlayer.tsx` — HLS, quality, loop, 0.25x
- `apps/mobile/app/(screens)/create-video.tsx` — thumbnail picker, normalize toggle
- `apps/mobile/app/(screens)/create-reel.tsx` — thumbnail picker, normalize toggle
- `apps/mobile/src/services/api.ts` — add hlsUrl/qualities/isLooping to response types
- `apps/mobile/src/types/index.ts` — update Video/Reel types

### Mobile (new dependency)
- `expo-video-thumbnails`
