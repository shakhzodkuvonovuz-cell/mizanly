# X15: Media URL Consistency — Hostile Audit

**Date:** 2026-04-05
**Auditor:** Opus 4.6 (1M context)
**Scope:** All media URL fields across API DTOs, mobile client URL references, R2_PUBLIC_URL consistency, @IsStorageUrl usage
**Verdict:** INCONSISTENT — 26 URL fields accept arbitrary external URLs, 7 use @IsStorageUrl

---

## Executive Summary

The codebase has two competing validators for media URLs:
1. **`@IsStorageUrl()`** — custom validator that restricts URLs to `media.mizanly.app`, `*.r2.cloudflarestorage.com`, `*.r2.dev`, and dynamic `R2_PUBLIC_URL`. Used on only **7 fields** across 4 modules.
2. **`@IsUrl()`** — bare class-validator `@IsUrl()` that accepts ANY valid URL. Used on **~40 fields** across ~20 modules.

This means the vast majority of media URL inputs accept `https://evil.com/malware.jpg` and store it in the database. The application then renders these attacker-controlled URLs in the mobile client as if they were application media.

---

## Finding Index

| # | Severity | Module | Finding |
|---|----------|--------|---------|
| X15-01 | **CRITICAL** | Gateway (send-message.dto) | `mediaUrl` uses `@IsUrl()` — arbitrary URLs stored as chat media |
| X15-02 | **CRITICAL** | broadcast (send-broadcast.dto) | `mediaUrl` uses `@IsUrl()` — broadcast to all subscribers with attacker URL |
| X15-03 | **HIGH** | channels (update-channel.dto) | `avatarUrl`, `bannerUrl` both `@IsUrl()` — channel branding with external images |
| X15-04 | **HIGH** | broadcast (update-channel.dto) | `avatarUrl` uses `@IsUrl()` |
| X15-05 | **HIGH** | broadcast (create-channel.dto) | `avatarUrl` uses `@IsUrl()` |
| X15-06 | **HIGH** | communities (create-community.dto) | `coverUrl` uses `@IsUrl()` |
| X15-07 | **HIGH** | communities (update-community.dto) | `coverUrl` uses `@IsUrl()` |
| X15-08 | **HIGH** | live (create-live.dto) | `thumbnailUrl` uses `@IsUrl()` |
| X15-09 | **HIGH** | stories (create-highlight.dto) | `coverUrl` uses `@IsUrl()` |
| X15-10 | **HIGH** | stories (update-highlight.dto) | `coverUrl` uses `@IsUrl()` |
| X15-11 | **HIGH** | threads (create-thread.dto) | `mediaUrls` uses `@IsUrl({}, { each: true })` — NO storage constraint |
| X15-12 | **HIGH** | videos (create-video.dto) | `videoUrl` and `thumbnailUrl` both `@IsUrl()` |
| X15-13 | **HIGH** | videos (update-video.dto) | `thumbnailUrl` uses `@IsUrl()` |
| X15-14 | **HIGH** | videos (premiere.dto) | `trailerUrl` uses `@IsUrl()` |
| X15-15 | **HIGH** | videos (end-screen.dto) | `url` uses `@IsUrl()` |
| X15-16 | **HIGH** | stickers (create-pack.dto) | `coverUrl` and sticker `url` both `@IsUrl()` |
| X15-17 | **HIGH** | audio-tracks (create-audio-track.dto) | `audioUrl` and `coverUrl` both `@IsUrl()` |
| X15-18 | **HIGH** | gamification (gamification.dto) | `coverUrl`, `backgroundUrl`, `backgroundMusic` all `@IsUrl()` |
| X15-19 | **HIGH** | commerce (commerce.dto) | `images` array, `avatarUrl`, `coverUrl`, `halalCertUrl` on 4 DTOs — all `@IsUrl()` (12 fields total) |
| X15-20 | **HIGH** | ai (ai.dto) | `audioUrl` (GenerateCaptionsDto), `sourceUrl` (GenerateAvatarDto) both `@IsUrl()` |
| X15-21 | **HIGH** | discord-features (discord-features.dto) | `avatarUrl` on CreateWebhookDto uses `@IsUrl()` |
| X15-22 | **HIGH** | community (community.dto) | `coverUrl` (CreateEventDto), `audioUrl` (CreateVoicePostDto) both `@IsUrl()` |
| X15-23 | **HIGH** | islamic (charity.dto) | `imageUrl` uses `@IsUrl()` |
| X15-24 | **HIGH** | islamic (scholar-verification.dto) | `documentUrls` array uses `@IsUrl({}, { each: true })` |
| X15-25 | **HIGH** | telegram-features (telegram-features.dto) | `mediaUrl` (SaveMessageDto), `imageUrl` (AddEmojiDto) both `@IsUrl()` |
| X15-26 | **MEDIUM** | auth (register.dto) | `avatarUrl` uses `@IsUrl()` — user can register with external avatar |
| X15-27 | **MEDIUM** | channel-posts (create-channel-post.dto) | `mediaUrls` uses `@IsString({ each: true })` — NO URL validation at all, not even `@IsUrl()` |
| X15-28 | **MEDIUM** | drafts (save-draft.dto) | `data` is `Record<string, unknown>` with `@IsObject()` — draft payload can contain arbitrary URLs in an opaque JSON blob, no validation possible |
| X15-29 | **LOW** | users (update-profile.dto) | `website` uses bare `@IsUrl()` (correct for external links, not media) — no issue but noted for completeness |
| X15-30 | **LOW** | profile-links (create/update) | `url` uses `@IsUrl()` — intentionally external, correct behavior |
| X15-31 | **LOW** | users (request-verification.dto) | `proofUrl` uses `@IsUrl()` — intentionally external proof |

---

## Detailed Findings

### X15-01: WebSocket Message DTO Accepts Arbitrary Media URLs [CRITICAL]

**File:** `apps/api/src/gateways/dto/send-message.dto.ts:17-18`
```typescript
@IsOptional()
@IsUrl()
mediaUrl?: string;
```

**Impact:** Any user can send a message with `mediaUrl: "https://tracking-pixel.evil.com/img.jpg"`. When the recipient renders it, the attacker learns the recipient's IP, user agent, and that they opened the message. In a private messaging app, this is a serious privacy violation. Also enables:
- IP logging/geolocation of recipients
- Content that bypasses moderation (external image not scanned)
- Image injection (replacing expected content with offensive material)
- CSRF-via-image if the app has GET endpoints with side effects

**Should be:** `@IsStorageUrl()` — all chat media must be uploaded to R2 first.

### X15-02: Broadcast DTO Accepts Arbitrary Media URLs [CRITICAL]

**File:** `apps/api/src/modules/broadcast/dto/send-broadcast.dto.ts:17-19`
```typescript
@IsUrl()
@IsOptional()
mediaUrl?: string;
```

**Impact:** A broadcast channel owner can send attacker-controlled media to ALL subscribers. Combined with broadcast fan-out, a single malicious URL reaches thousands of users instantly.

### X15-11: Thread DTO Uses Bare @IsUrl [HIGH]

**File:** `apps/api/src/modules/threads/dto/create-thread.dto.ts:58`
```typescript
@IsUrl({}, { each: true })
mediaUrls?: string[];
```

**Impact:** Threads are public. Anyone can create a thread with 4 external URLs. These appear in feeds, search results, and timelines — maximum exposure for attacker-controlled content.

### X15-12: Video DTO Accepts Any videoUrl [HIGH]

**File:** `apps/api/src/modules/videos/dto/create-video.dto.ts:35-41`
```typescript
@IsUrl()
videoUrl: string;
@IsUrl()
thumbnailUrl?: string;
```

**Impact:** A user creates a "video" pointing to `https://evil.com/rickroll.mp4`. The app tries to play it, potentially leaking the viewer's IP to the attacker's server. The `StreamService.uploadFromUrl()` does validate against R2_PUBLIC_URL before submitting to Cloudflare Stream, but the DTO-level validation happens before the service is called — meaning the attacker URL hits the service layer.

### X15-19: Commerce — 12 Unvalidated URL Fields [HIGH]

**File:** `apps/api/src/modules/commerce/dto/commerce.dto.ts`

Product `images` array, business `avatarUrl`, `coverUrl`, `halalCertUrl`, `website` — all bare `@IsUrl()` across CreateProduct, UpdateProduct, CreateBusiness, UpdateBusiness DTOs. A fake halal certification badge with `halalCertUrl` pointing to a convincing but fake certificate image is a content integrity risk.

### X15-27: Channel Posts — NO URL Validation At All [MEDIUM]

**File:** `apps/api/src/modules/channel-posts/dto/create-channel-post.dto.ts:11-15`
```typescript
@IsString({ each: true })
@MaxLength(2000, { each: true })
@IsOptional()
mediaUrls?: string[];
```

**Impact:** Not even `@IsUrl()` — accepts any string. Could be `javascript:alert(1)`, a relative path, or an IP address. The service layer does not validate these further.

---

## Modules That DO Use @IsStorageUrl (Correct)

| Module | Fields | Notes |
|--------|--------|-------|
| posts (create-post.dto) | `mediaUrls`, `thumbnailUrl` | Correct |
| stories (create-story.dto) | `mediaUrl`, `thumbnailUrl` | Correct |
| reels (create-reel.dto) | `videoUrl`, `thumbnailUrl`, `additionalMediaUrls` | Correct |
| video-replies (controller) | `mediaUrl`, `thumbnailUrl` | Correct |
| users (update-profile.dto) | `avatarUrl`, `coverUrl` | Uses `@Matches(MEDIA_URL_PATTERN)` — slightly different but equivalent intent |

**Total: 7 fields across 4 modules use `@IsStorageUrl()`, ~40 fields across ~20 modules use bare `@IsUrl()`.**

---

## Hardcoded URL Findings

### X15-32: Mobile API Client Falls Back to localhost [MEDIUM]

**Files:**
- `apps/mobile/src/services/api.ts:163` — `const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1'`
- `apps/mobile/src/services/giphyService.ts:9` — identical fallback

**Impact:** If `EXPO_PUBLIC_API_URL` is not set in the EAS build (forgotten .env), all API calls go to `localhost:3000` which will silently fail on a real device. No crash, no error — just a dead app.

### X15-33: LiveKit Client Falls Back to Hardcoded Domain [LOW]

**File:** `apps/mobile/src/services/livekit.ts:3`
```typescript
const LIVEKIT_BASE = process.env.EXPO_PUBLIC_LIVEKIT_URL || 'https://livekit.mizanly.app/api/v1';
```

**Impact:** Acceptable — this domain is owned. But if DNS changes or the service moves, this hardcoded fallback causes silent failures. Should throw like `useLiveKitCall.ts` does for `EXPO_PUBLIC_LIVEKIT_WS_URL`.

### X15-34: API Server Falls Back to `https://media.mizanly.app` [LOW]

**Files:**
- `apps/api/src/modules/upload/upload.service.ts:79` — `this.publicUrl = this.config.get('R2_PUBLIC_URL') ?? 'https://media.mizanly.app'`
- `apps/api/src/modules/upload/upload-cleanup.service.ts:67` — identical
- `apps/api/src/modules/health/health.controller.ts:31` — identical
- `apps/api/src/modules/privacy/privacy.service.ts:23` — identical

**Impact:** Acceptable for now — the domain is owned. But 4 separate files hardcode the same fallback. Should be a shared constant.

### X15-35: Redis Falls Back to `redis://localhost` [MEDIUM]

**File:** `apps/api/src/config/redis.module.ts:29`
```typescript
const redis = new Redis(redisUrl || 'redis://localhost', {
```

**Impact:** In production without `REDIS_URL` set, connects to localhost which likely doesn't exist — but the app continues running with no rate limiting, queues, or dedup. The module does warn and throw in production, but the fallback value itself is never used in that path. Still, having `redis://localhost` as a code-level default is suspicious.

### X15-36: Swagger Server Falls Back to localhost [INFO]

**File:** `apps/api/src/main.ts:212`
```typescript
.addServer(process.env.API_URL || 'http://localhost:3000', 'API Server')
```

**Impact:** Development only — Swagger is disabled in production. Not a real issue.

---

## Summary Statistics

| Category | Count |
|----------|-------|
| Fields using `@IsStorageUrl()` | 7 |
| Fields using `@IsUrl()` (accepts arbitrary URLs) | ~40 |
| Fields with NO URL validation (`@IsString`) | 1 (channel-posts mediaUrls) |
| Fields in opaque JSON blobs (unvalidatable) | 1 (drafts data) |
| Hardcoded localhost fallbacks (mobile) | 2 |
| Hardcoded domain fallbacks (API) | 4 (same domain, should be shared constant) |

---

## Risk Matrix

| Attack | Via | Impact |
|--------|-----|--------|
| IP tracking of message recipients | X15-01 (chat mediaUrl) | Privacy violation |
| Mass IP tracking via broadcast | X15-02 (broadcast mediaUrl) | Privacy violation at scale |
| Content moderation bypass | Any @IsUrl field | Unscreened media rendered to users |
| Phishing via fake halal cert | X15-19 (halalCertUrl) | Trust/brand damage |
| Image injection in feeds/threads | X15-11 (threads), X15-12 (videos) | Content integrity |
| SSRF via AI endpoints | X15-20 (ai.dto audioUrl, sourceUrl) | Server-side request to attacker host |
| Silent app failure on real device | X15-32 (localhost fallback) | UX — app appears broken |

---

## Recommended Fix

Replace all media-hosting URL fields with `@IsStorageUrl()`. Fields that are intentionally external (profile links, websites, proof URLs) should remain `@IsUrl()` but be clearly documented as "external URL" in the DTO.

For the AI endpoints (`audioUrl`, `sourceUrl`), the service layer should validate the URL against `R2_PUBLIC_URL` before making any outbound request — the current `assertNotPrivateUrl()` blocks private IPs but does not restrict to application-owned domains.

For `channel-posts` `mediaUrls`, add at minimum `@IsUrl({}, { each: true })`, preferably `@IsStorageUrl({ each: true })`.
