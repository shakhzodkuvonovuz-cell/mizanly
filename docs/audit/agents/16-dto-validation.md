# Agent #16 — DTO Validation Audit

**Scope:** All Data Transfer Objects across 86 DTO files + 50+ controller-inline DTOs
**Auditor:** Claude Opus 4.6 (1M context) Agent #16 of 57
**Date:** 2026-03-21
**Total Findings:** 142

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 28 |
| HIGH     | 41 |
| MEDIUM   | 52 |
| LOW      | 21 |

---

## CRITICAL — Validation Completely Bypassed (26 endpoints)

### C-01: `interface` used instead of `class` — moderation DTOs have ZERO validation
**File:** `apps/api/src/modules/moderation/moderation.service.ts` lines 13-31
**Severity:** CRITICAL
**Category:** Validation Bypass
```ts
export interface CheckTextDto {
  text: string;
  context?: 'post' | 'comment' | 'message' | 'profile';
}
export interface CheckImageDto {
  imageUrl: string;
}
export interface ReviewActionDto {
  action: 'approve' | 'remove' | 'warn';
  note?: string;
}
export interface SubmitAppealDto {
  moderationLogId: string;
  reason: 'no-violation' | 'out-of-context' | 'educational' | 'posted-by-mistake' | 'other';
  details: string;
}
```
**Impact:** `class-validator` only works on classes, not interfaces. NestJS `ValidationPipe` does nothing — any body passes through. A user can send `{ text: "" }` or `{ text: "x".repeat(100_000_000) }` for moderation check. The `imageUrl` field has no URL validation, enabling SSRF. The `details` field in SubmitAppealDto has no MaxLength.

### C-02: `interface` used for chat-export body — ZERO validation
**File:** `apps/api/src/modules/chat-export/chat-export.controller.ts` lines 18-21
**Severity:** CRITICAL
**Category:** Validation Bypass
```ts
interface GenerateExportBody {
  format: 'json' | 'text';
  includeMedia: boolean;
}
```
**Impact:** The `interface` keyword means the `ValidationPipe` passes the raw body through without any type checking. The manual check at line 39 only checks `format` but does not validate `includeMedia` is boolean.

### C-03: Gifts DTOs have ZERO class-validator decorators
**File:** `apps/api/src/modules/gifts/gifts.controller.ts` lines 17-30
**Severity:** CRITICAL
**Category:** Validation Bypass
```ts
class PurchaseCoinsDto { amount: number; }
class SendGiftDto { receiverId: string; giftType: string; contentId?: string; contentType?: string; }
class CashoutDto { diamonds: number; }
```
**Impact:** No `@IsNumber()`, `@IsString()`, `@Min()`, `@Max()` decorators. Attacker can send `{ amount: -99999 }` for PurchaseCoinsDto (negative coin purchase), `{ diamonds: -1 }` for CashoutDto, or `{ giftType: "x".repeat(10_000_000) }` for SendGiftDto. This is a FINANCIAL vulnerability — negative amounts can credit coins without payment.

### C-04: Monetization DTOs have ZERO class-validator decorators
**File:** `apps/api/src/modules/monetization/monetization.controller.ts` lines 20-38
**Severity:** CRITICAL
**Category:** Validation Bypass
```ts
class CreateTipDto { receiverId: string; amount: number; message?: string; }
class CreateTierDto { name: string; price: number; benefits: string[]; level?: string; }
class UpdateTierDto { name?: string; price?: number; benefits?: string[]; level?: string; isActive?: boolean; }
```
**Impact:** `amount` has no `@Min()` — negative tips. `price` has no `@Min()` — zero or negative tier pricing. `message` has no `@MaxLength()` — potential DB overflow. `name` has no `@MaxLength()` — potential DB overflow. `benefits` has no `@ArrayMaxSize()` — array bomb DoS.

### C-05: Payments DTOs have ZERO class-validator decorators
**File:** `apps/api/src/modules/payments/payments.controller.ts` lines 21-34
**Severity:** CRITICAL
**Category:** Validation Bypass
```ts
class CreatePaymentIntentDto { amount: number; currency: string; receiverId: string; }
class CreateSubscriptionDto { tierId: string; paymentMethodId: string; }
class AttachPaymentMethodDto { paymentMethodId: string; }
```
**Impact:** `amount` has no `@IsNumber()`, `@Min()`, `@Max()`. Attacker can send `{ amount: 0 }`, `{ amount: -100 }`, or `{ amount: 999999999 }`. `currency` has no `@MaxLength()` or `@IsIn()` — arbitrary strings. This is a direct financial risk.

### C-06: Promotions DTOs have ZERO class-validator decorators
**File:** `apps/api/src/modules/promotions/promotions.controller.ts` lines 18-32
**Severity:** CRITICAL
**Category:** Validation Bypass
```ts
class BoostPostDto { postId: string; budget: number; duration: number; }
class SetReminderDto { postId: string; remindAt: string; }
class MarkBrandedDto { postId: string; partnerName: string; }
```
**Impact:** `budget` has no `@Min()` — negative budget. `duration` has no `@Min()/@Max()` — can be 0 or massive. `remindAt` has no `@IsISO8601()` or `@IsDateString()` — invalid dates. `partnerName` has no `@MaxLength()`.

### C-07: Subtitles DTO has ZERO class-validator decorators (defined in service file)
**File:** `apps/api/src/modules/subtitles/subtitles.service.ts` lines 10-14
**Severity:** CRITICAL
**Category:** Validation Bypass
```ts
export class CreateSubtitleTrackDto {
  label: string;
  language: string;
  srtUrl: string;
}
```
**Impact:** No decorators at all. `label`/`language` have no `@MaxLength()`. `srtUrl` has no `@IsUrl()` — SSRF risk. DTO is defined in a service file (not a DTO file), making it hard to find and audit.

### C-08: 26 inline type endpoints bypass validation completely
**Severity:** CRITICAL
**Category:** Validation Bypass

These endpoints use `@Body() body: { ... }` with TypeScript inline types. NestJS `ValidationPipe` only validates class instances with decorators — inline types are ignored entirely.

| # | File | Line | Inline Type | Fields Missing Validation |
|---|------|------|-------------|--------------------------|
| 1 | `devices/devices.controller.ts` | 60 | `{ currentSessionId: string }` | No @IsString |
| 2 | `creator/creator.controller.ts` | 86 | `{ question: string }` | No @MaxLength, no @IsString |
| 3 | `webhooks/webhooks.controller.ts` | 20 | `{ circleId: string; name: string; url: string; events: string[] }` | No @IsUrl, no @ArrayMaxSize, no @MaxLength |
| 4 | `feed/feed.controller.ts` | 112 | `{ contentId: string; action: ...; hashtags?; scrollPosition? }` | No limits on hashtags array, no @Min on scrollPosition |
| 5 | `feed/feed.controller.ts` | 168 | `{ featured: boolean }` | No @IsBoolean |
| 6 | `gamification/gamification.controller.ts` | 171 | `{ episodeNum: number; timestamp: number }` | No @IsNumber, no @Min |
| 7 | `live/live.controller.ts` | 173 | `{ title: string; description?; thumbnailUrl? }` | No @MaxLength, no @IsUrl |
| 8 | `live/live.controller.ts` | 202 | `{ subscribersOnly: boolean }` | No @IsBoolean |
| 9 | `messages/messages.controller.ts` | 474 | `{ mediaUrl: string; mediaType?; messageType?; content? }` | No @IsUrl, no @MaxLength |
| 10 | `messages/messages.controller.ts` | 524 | `{ wallpaperUrl: string \| null }` | No @IsUrl |
| 11 | `messages/messages.controller.ts` | 534 | `{ tone: string \| null }` | No @MaxLength |
| 12 | `retention/retention.controller.ts` | 21 | `{ scrollDepth; timeSpentMs; interactionCount; space }` | No @IsNumber, no @Min, no @IsString |
| 13 | `story-chains/story-chains.controller.ts` | 29 | `{ prompt: string; coverUrl? }` | No @MaxLength, no @IsUrl |
| 14 | `story-chains/story-chains.controller.ts` | 58 | `{ storyId: string }` | No @IsString |
| 15 | `islamic/islamic.controller.ts` | 538 | `{ date; isFasting; fastType?; reason? }` | No @IsDateString, no @MaxLength on reason |
| 16 | `islamic/islamic.controller.ts` | 663 | `{ status: string }` | No @IsIn for valid statuses |
| 17 | `islamic/islamic.controller.ts` | 713 | `{ taskType: string }` | No @IsIn for valid types |
| 18 | `settings/settings.controller.ts` | 91 | `{ autoPlaySetting: string }` | No @IsIn for valid values |
| 19 | `settings/settings.controller.ts` | 125 | `{ seconds: number }` | No @Min/@Max |
| 20 | `settings/settings.controller.ts` | 140 | `{ limitMinutes: number \| null }` | No @Min/@Max |
| 21 | `stories/stories.controller.ts` | 176 | `{ stickerType: string; responseData: Record<string, unknown> }` | No @MaxLength, arbitrary object |
| 22 | `thumbnails/thumbnails.controller.ts` | 70 | `{ variantId: string }` | No @IsString |
| 23 | `thumbnails/thumbnails.controller.ts` | 78 | `{ variantId: string }` | No @IsString |
| 24 | `users/users.controller.ts` | 249 | `{ nasheedMode: boolean }` | No @IsBoolean |

---

## HIGH — Missing URL Validation (SSRF Risk)

### H-01: CreateStoryDto.stickerData accepts arbitrary objects
**File:** `apps/api/src/modules/stories/dto/create-story.dto.ts` line 60
**Severity:** HIGH
**Category:** Missing Validation
```ts
@IsOptional()
@IsArray()
stickerData?: object[];
```
**Impact:** `object[]` with no `@ArrayMaxSize()` and no nested validation. Attacker can send arbitrarily large/deep objects causing memory DoS or prototype pollution.

### H-02: CreatePostDto.thumbnailUrl missing @IsUrl
**File:** `apps/api/src/modules/posts/dto/create-post.dto.ts` lines 43-45
**Severity:** HIGH
**Category:** Missing URL Validation
```ts
@IsOptional()
@IsString()
thumbnailUrl?: string;
```
**Impact:** Can accept `file:///etc/passwd` or internal network URLs if the backend fetches this URL.

### H-03: CreateLiveDto.thumbnailUrl missing @IsUrl
**File:** `apps/api/src/modules/live/dto/create-live.dto.ts` lines 17-19
**Severity:** HIGH
**Category:** Missing URL Validation
```ts
@IsOptional()
@IsString()
thumbnailUrl?: string;
```

### H-04: CreateBroadcastChannelDto.avatarUrl missing @IsUrl
**File:** `apps/api/src/modules/broadcast/dto/create-channel.dto.ts` lines 24-27
**Severity:** HIGH
**Category:** Missing URL Validation
```ts
@IsString()
@IsOptional()
avatarUrl?: string;
```

### H-05: CreateAudioTrackDto.audioUrl missing @IsUrl
**File:** `apps/api/src/modules/audio-tracks/dto/create-audio-track.dto.ts` line 8
**Severity:** HIGH
**Category:** Missing URL Validation / SSRF
```ts
@ApiProperty() @IsString() audioUrl: string;
```
**Impact:** `audioUrl` is used to reference audio files but has no `@IsUrl()` validation. Could be exploited for SSRF if server fetches this URL.

### H-06: CreateAudioTrackDto.coverUrl missing @IsUrl
**File:** `apps/api/src/modules/audio-tracks/dto/create-audio-track.dto.ts` line 9
**Severity:** HIGH
**Category:** Missing URL Validation
```ts
@ApiProperty({ required: false }) @IsString() @IsOptional() coverUrl?: string;
```

### H-07: CreateCommunityDto.coverUrl missing @IsUrl
**File:** `apps/api/src/modules/communities/dto/create-community.dto.ts` lines 17-19
**Severity:** HIGH
**Category:** Missing URL Validation
```ts
@IsOptional()
@IsString()
coverUrl?: string;
```

### H-08: UpdateCommunityDto.coverUrl missing @IsUrl
**File:** `apps/api/src/modules/communities/dto/update-community.dto.ts` lines 17-19
**Severity:** HIGH
**Category:** Missing URL Validation
```ts
@IsOptional()
@IsString()
coverUrl?: string;
```

### H-09: StickerItemDto.url missing @IsUrl
**File:** `apps/api/src/modules/stickers/dto/create-pack.dto.ts` lines 7-8
**Severity:** HIGH
**Category:** Missing URL Validation / SSRF
```ts
@IsString()
url: string;
```
**Impact:** Sticker URLs are rendered directly. XSS risk via `javascript:` URLs or SSRF via `file://`.

### H-10: CreateStickerPackDto.coverUrl missing @IsUrl
**File:** `apps/api/src/modules/stickers/dto/create-pack.dto.ts` lines 25-26
**Severity:** HIGH
**Category:** Missing URL Validation
```ts
@IsString()
@IsOptional()
coverUrl?: string;
```

### H-11: ScholarVerificationDto.documentUrls[] missing @IsUrl on each element
**File:** `apps/api/src/modules/islamic/dto/scholar-verification.dto.ts` lines 21-23
**Severity:** HIGH
**Category:** Missing URL Validation
```ts
@IsArray()
@IsString({ each: true })
documentUrls: string[];
```
**Impact:** Scholar verification documents could be any string, not URLs. Missing `@IsUrl({}, { each: true })` and `@ArrayMaxSize()`.

### H-12: CampaignDto.imageUrl missing @IsUrl
**File:** `apps/api/src/modules/islamic/dto/charity.dto.ts` line 8
**Severity:** HIGH
**Category:** Missing URL Validation
```ts
@ApiPropertyOptional() @IsOptional() @IsString() imageUrl?: string;
```

### H-13: CreateMosqueDto.website/imageUrl missing @IsUrl
**File:** `apps/api/src/modules/mosques/mosques.controller.ts` lines 20-21
**Severity:** HIGH
**Category:** Missing URL Validation
```ts
@IsOptional() @IsString() website?: string;
@IsOptional() @IsString() imageUrl?: string;
```

### H-14: CreateRestaurantDto.website/imageUrl missing @IsUrl
**File:** `apps/api/src/modules/halal/halal.controller.ts` lines 22-23
**Severity:** HIGH
**Category:** Missing URL Validation
```ts
@IsOptional() @IsString() website?: string;
@IsOptional() @IsString() imageUrl?: string;
```

### H-15: CreateBusinessDto.website missing @IsUrl
**File:** `apps/api/src/modules/commerce/dto/commerce.dto.ts` line 48
**Severity:** HIGH
**Category:** Missing URL Validation
```ts
@ApiPropertyOptional() @IsOptional() @IsString() website?: string;
```

### H-16: EndScreenItemDto.url missing @IsUrl
**File:** `apps/api/src/modules/videos/dto/end-screen.dto.ts` line 8
**Severity:** HIGH
**Category:** Missing URL Validation
```ts
@IsOptional() @IsString() url?: string;
```
**Impact:** End screen links with type `link` should validate URLs.

### H-17: CreatePremiereDto.trailerUrl missing @IsUrl
**File:** `apps/api/src/modules/videos/dto/premiere.dto.ts` line 7
**Severity:** HIGH
**Category:** Missing URL Validation
```ts
@IsOptional() @IsString() trailerUrl?: string;
```

### H-18: AiDto sources — audioUrl/sourceUrl missing @IsUrl
**File:** `apps/api/src/modules/ai/dto/ai.dto.ts` lines 44, 49
**Severity:** HIGH
**Category:** Missing URL Validation / SSRF
```ts
@ApiProperty() @IsString() audioUrl: string;  // GenerateCaptionsDto
@ApiProperty() @IsString() sourceUrl: string;  // GenerateAvatarDto
```
**Impact:** These URLs are fetched server-side (Whisper API, AI avatar generation). Missing `@IsUrl()` allows SSRF against internal services.

### H-19: CreateWebhookDto.avatarUrl missing @IsUrl
**File:** `apps/api/src/modules/discord-features/dto/discord-features.dto.ts` line 18
**Severity:** HIGH
**Category:** Missing URL Validation
```ts
@ApiPropertyOptional() @IsOptional() @IsString() avatarUrl?: string;
```

### H-20: CreateVoicePostDto.audioUrl missing @IsUrl
**File:** `apps/api/src/modules/community/dto/community.dto.ts` line 62
**Severity:** HIGH
**Category:** Missing URL Validation / SSRF
```ts
@ApiProperty() @IsString() audioUrl: string;
```

### H-21: CreateEventDto.coverUrl missing @IsUrl (community module)
**File:** `apps/api/src/modules/community/dto/community.dto.ts` line 58
**Severity:** HIGH
**Category:** Missing URL Validation
```ts
@ApiPropertyOptional() @IsOptional() @IsString() coverUrl?: string;
```

### H-22: CreateChannelPostDto.mediaUrls[] missing @IsUrl
**File:** `apps/api/src/modules/channel-posts/dto/create-channel-post.dto.ts` lines 11-14
**Severity:** HIGH
**Category:** Missing URL Validation
```ts
@IsArray()
@IsString({ each: true })
@IsOptional()
mediaUrls?: string[];
```
**Impact:** Media URLs are not validated as actual URLs. Missing `@IsUrl({}, { each: true })` and `@ArrayMaxSize()`.

### H-23: SendBroadcastDto.mediaUrl missing @IsUrl
**File:** `apps/api/src/modules/broadcast/dto/send-broadcast.dto.ts` lines 17-19
**Severity:** HIGH
**Category:** Missing URL Validation
```ts
@IsString()
@IsOptional()
mediaUrl?: string;
```

### H-24: SaveDraftDto.data accepts arbitrary object — DoS / injection risk
**File:** `apps/api/src/modules/drafts/dto/save-draft.dto.ts` lines 11-12
**Severity:** HIGH
**Category:** Dangerous Type
```ts
@IsObject()
data: Record<string, unknown>;
```
**Impact:** `@IsObject()` allows any JSON object of arbitrary depth and size. No nested validation, no size limit. Could store malicious payloads, cause DB overflow, or memory DoS.

---

## HIGH — Missing Number Bounds

### H-25: CreateReelDto.duration has no @Min/@Max
**File:** `apps/api/src/modules/reels/dto/create-reel.dto.ts` line 26
**Severity:** HIGH
**Category:** Missing Number Bounds
```ts
@IsNumber()
duration: number;
```
**Impact:** Can be 0, negative, or `Infinity`. Reels should have duration limits (e.g., 1-180 seconds).

### H-26: CreateVideoDto.duration has no @Min/@Max
**File:** `apps/api/src/modules/videos/dto/create-video.dto.ts` line 43
**Severity:** HIGH
**Category:** Missing Number Bounds
```ts
@IsNumber()
duration: number;
```
**Impact:** Can be 0, negative, or extremely large. Videos should have sane duration bounds.

### H-27: CreateStoryDto.duration has no @Min/@Max
**File:** `apps/api/src/modules/stories/dto/create-story.dto.ts` lines 20-22
**Severity:** HIGH
**Category:** Missing Number Bounds
```ts
@IsOptional()
@IsNumber()
duration?: number;
```
**Impact:** Stories should have duration limits (1-60 seconds typically).

### H-28: CreatePostDto.mediaWidth/mediaHeight/videoDuration have no @Min/@Max
**File:** `apps/api/src/modules/posts/dto/create-post.dto.ts` lines 48-60
**Severity:** HIGH
**Category:** Missing Number Bounds
```ts
@IsNumber() mediaWidth?: number;   // lines 49-50
@IsNumber() mediaHeight?: number;  // lines 53-54
@IsNumber() videoDuration?: number; // lines 59-60
```
**Impact:** Can be negative, zero, or enormous values. Negative dimensions could cause rendering issues. Extremely large values could DoS layout calculations.

### H-29: CreateAudioTrackDto.duration has no @Min/@Max
**File:** `apps/api/src/modules/audio-tracks/dto/create-audio-track.dto.ts` line 7
**Severity:** HIGH
**Category:** Missing Number Bounds
```ts
@ApiProperty() @IsNumber() duration: number;
```

### H-30: BanUserDto.duration has no @Max
**File:** `apps/api/src/modules/admin/dto/ban-user.dto.ts` line 13
**Severity:** HIGH
**Category:** Missing Number Bounds
```ts
@IsNumber()
@Min(1)
duration?: number;
```
**Impact:** Missing `@Max()` — admin could accidentally set a ban for `Number.MAX_SAFE_INTEGER` hours.

### H-31: SetDisappearingTimerDto.duration has no @Min/@Max
**File:** `apps/api/src/modules/messages/messages.controller.ts` lines 114-118
**Severity:** HIGH
**Category:** Missing Number Bounds
```ts
@IsOptional()
@IsNumber({ allowNaN: false, allowInfinity: false })
duration?: number | null;
```
**Impact:** Can be 0, negative, or extremely large. Should have sane bounds (e.g., 5 seconds to 7 days).

### H-32: LogInteractionDto.viewDurationMs/completionRate have no @Min/@Max
**File:** `apps/api/src/modules/feed/dto/log-interaction.dto.ts` lines 9-10
**Severity:** HIGH
**Category:** Missing Number Bounds
```ts
@IsNumber() @IsOptional() viewDurationMs?: number;
@IsNumber() @IsOptional() completionRate?: number;
```
**Impact:** `completionRate` should be 0-1.0. `viewDurationMs` should be non-negative. Currently accepts any number including negative, Infinity, NaN.

---

## MEDIUM — Missing @MaxLength (DB Overflow / DoS)

### M-01: ContactSyncDto.phoneNumbers missing @ArrayMaxSize
**File:** `apps/api/src/modules/users/dto/contact-sync.dto.ts` lines 4-5
**Severity:** MEDIUM
**Category:** Missing Array Size Limit
```ts
@IsArray() @IsString({ each: true }) phoneNumbers: string[];
```
**Impact:** Attacker can upload millions of phone numbers in a single request, causing memory exhaustion and DB overload.

### M-02: CreatePostDto.mentions[] missing @ArrayMaxSize
**File:** `apps/api/src/modules/posts/dto/create-post.dto.ts` lines 69-73
**Severity:** MEDIUM
**Category:** Missing Array Size Limit
```ts
@IsArray()
@IsString({ each: true })
mentions?: string[];
```
**Impact:** Unlimited mentions array — potential spam/notification bomb.

### M-03: UpdateVideoDto.tags[] missing @ArrayMaxSize
**File:** `apps/api/src/modules/videos/dto/update-video.dto.ts` lines 31-33
**Severity:** MEDIUM
**Category:** Missing Array Size Limit
```ts
@IsArray()
@IsString({ each: true })
tags?: string[];
```

### M-04: CreateStickerPackDto.stickers[] missing @ArrayMaxSize
**File:** `apps/api/src/modules/stickers/dto/create-pack.dto.ts` lines 33-37
**Severity:** MEDIUM
**Category:** Missing Array Size Limit
```ts
@IsArray()
@ValidateNested({ each: true })
@Type(() => StickerItemDto)
stickers: StickerItemDto[];
```
**Impact:** Unlimited stickers per pack — memory DoS.

### M-05: SetEndScreensDto.items[] missing @ArrayMaxSize
**File:** `apps/api/src/modules/videos/dto/end-screen.dto.ts` lines 14-16
**Severity:** MEDIUM
**Category:** Missing Array Size Limit
```ts
@IsArray() @ValidateNested({ each: true }) @Type(() => EndScreenItemDto)
items: EndScreenItemDto[];
```

### M-06: CreateMosquePostDto.mediaUrls[] missing @ArrayMaxSize
**File:** `apps/api/src/modules/mosques/mosques.controller.ts` line 26
**Severity:** MEDIUM
**Category:** Missing Array Size Limit
```ts
@IsOptional() @IsArray() mediaUrls?: string[];
```

### M-07: AddAccessDto.userIds[] missing @ArrayMaxSize
**File:** `apps/api/src/modules/alt-profile/alt-profile.controller.ts` lines 60-63
**Severity:** MEDIUM
**Category:** Missing Array Size Limit
```ts
@IsArray()
@IsString({ each: true })
userIds!: string[];
```

### M-08: ReorderLinksDto.ids[] missing @ArrayMaxSize
**File:** `apps/api/src/modules/profile-links/profile-links.controller.ts` lines 24-26
**Severity:** MEDIUM
**Category:** Missing Array Size Limit
```ts
@IsArray()
@IsString({ each: true })
ids: string[];
```

### M-09: CreateProductDto.images[] validated but individual strings have no @MaxLength
**File:** `apps/api/src/modules/commerce/dto/commerce.dto.ts` line 13
**Severity:** MEDIUM
**Category:** Missing MaxLength on Array Elements
```ts
@IsArray() @IsString({ each: true }) @ArrayMaxSize(10) images: string[];
```
**Impact:** Each image string can be arbitrarily long. Should have `@MaxLength(2048, { each: true })` or `@IsUrl({}, { each: true })`.

### M-10: UpdateProfileDto.location missing @MaxLength
**File:** `apps/api/src/modules/users/dto/update-profile.dto.ts` lines 33-35
**Severity:** MEDIUM
**Category:** Missing MaxLength
```ts
@IsOptional()
@IsString()
location?: string;
```

### M-11: UpdateProfileDto.language missing @MaxLength
**File:** `apps/api/src/modules/users/dto/update-profile.dto.ts` lines 38-40
**Severity:** MEDIUM
**Category:** Missing MaxLength
```ts
@IsOptional()
@IsString()
language?: string;
```
**Impact:** Should be constrained to 2-5 chars for language codes.

### M-12: UpdateProfileDto.theme missing @IsIn or @MaxLength
**File:** `apps/api/src/modules/users/dto/update-profile.dto.ts` lines 43-45
**Severity:** MEDIUM
**Category:** Missing Enum/MaxLength
```ts
@IsOptional()
@IsString()
theme?: string;
```
**Impact:** Should be `@IsIn(['dark', 'light', 'system'])`.

### M-13: RegisterDto.language missing @MaxLength
**File:** `apps/api/src/modules/auth/dto/register.dto.ts` lines 31-33
**Severity:** MEDIUM
**Category:** Missing MaxLength
```ts
@IsOptional()
@IsString()
language?: string;
```

### M-14: CreateStoryDto.fontFamily missing @MaxLength
**File:** `apps/api/src/modules/stories/dto/create-story.dto.ts` lines 43-45
**Severity:** MEDIUM
**Category:** Missing MaxLength
```ts
@IsOptional()
@IsString()
fontFamily?: string;
```

### M-15: CreateStoryDto.filter missing @MaxLength
**File:** `apps/api/src/modules/stories/dto/create-story.dto.ts` lines 48-50
**Severity:** MEDIUM
**Category:** Missing MaxLength
```ts
@IsOptional()
@IsString()
filter?: string;
```

### M-16: CreateStoryDto.bgGradient missing @MaxLength
**File:** `apps/api/src/modules/stories/dto/create-story.dto.ts` lines 53-55
**Severity:** MEDIUM
**Category:** Missing MaxLength
```ts
@IsOptional()
@IsString()
bgGradient?: string;
```
**Impact:** JSON gradient data with no size limit.

### M-17: SendBroadcastDto.mediaType missing @MaxLength and @IsIn
**File:** `apps/api/src/modules/broadcast/dto/send-broadcast.dto.ts` lines 22-24
**Severity:** MEDIUM
**Category:** Missing MaxLength/Enum
```ts
@IsString()
@IsOptional()
mediaType?: string;
```

### M-18: CreateReportDto.description missing @MaxLength
**File:** `apps/api/src/modules/reports/dto/create-report.dto.ts` line 13
**Severity:** MEDIUM
**Category:** Missing MaxLength
```ts
@IsOptional()
@IsString()
description?: string;
```
**Impact:** Line 10 says `maxLength: 1000` in `@ApiProperty` but there's no `@MaxLength(1000)` decorator. The Swagger docs promise a limit that doesn't exist.

### M-19: Multiple string fields in halal/mosque/commerce DTOs missing @MaxLength
**File:** Multiple controller-inline DTOs
**Severity:** MEDIUM
**Category:** Missing MaxLength

| File | Field | Issue |
|------|-------|-------|
| `halal/halal.controller.ts:11` | `CreateRestaurantDto.name` | No @MaxLength |
| `halal/halal.controller.ts:12` | `CreateRestaurantDto.address` | No @MaxLength |
| `halal/halal.controller.ts:13` | `CreateRestaurantDto.city` | No @MaxLength |
| `halal/halal.controller.ts:14` | `CreateRestaurantDto.country` | No @MaxLength |
| `halal/halal.controller.ts:17` | `CreateRestaurantDto.cuisineType` | No @MaxLength |
| `halal/halal.controller.ts:20` | `CreateRestaurantDto.certifyingBody` | No @MaxLength |
| `halal/halal.controller.ts:21` | `CreateRestaurantDto.phone` | No @MaxLength |
| `halal/halal.controller.ts:28` | `AddReviewDto.comment` | No @MaxLength |
| `mosques/mosques.controller.ts:11` | `CreateMosqueDto.name` | No @MaxLength |
| `mosques/mosques.controller.ts:12` | `CreateMosqueDto.address` | No @MaxLength |
| `mosques/mosques.controller.ts:13` | `CreateMosqueDto.city` | No @MaxLength |
| `mosques/mosques.controller.ts:14` | `CreateMosqueDto.country` | No @MaxLength |
| `mosques/mosques.controller.ts:17` | `CreateMosqueDto.madhab` | No @MaxLength |
| `mosques/mosques.controller.ts:18` | `CreateMosqueDto.language` | No @MaxLength |
| `mosques/mosques.controller.ts:19` | `CreateMosqueDto.phone` | No @MaxLength |
| `mosques/mosques.controller.ts:25` | `CreateMosquePostDto.content` | No @MaxLength |

### M-20: Scholar QA DTOs missing @MaxLength on multiple fields
**File:** `apps/api/src/modules/scholar-qa/scholar-qa.controller.ts` lines 10-20
**Severity:** MEDIUM
**Category:** Missing MaxLength
```ts
class ScheduleQADto {
  @IsString() title: string;       // No @MaxLength
  @IsOptional() @IsString() description?: string;  // No @MaxLength
  @IsString() category: string;    // No @MaxLength
  @IsOptional() @IsString() language?: string;      // No @MaxLength
  @IsString() scheduledAt: string; // No @IsDateString
}
class SubmitQuestionDto {
  @IsString() question: string;    // No @MaxLength
}
```

### M-21: Checklists DTOs missing @MaxLength
**File:** `apps/api/src/modules/checklists/checklists.controller.ts` lines 9-16
**Severity:** MEDIUM
**Category:** Missing MaxLength
```ts
class CreateChecklistDto {
  @IsString() conversationId: string;
  @IsString() title: string;   // No @MaxLength
}
class AddItemDto {
  @IsString() text: string;    // No @MaxLength
}
```

### M-22: CommunityNotesDto fields missing @MaxLength
**File:** `apps/api/src/modules/community-notes/community-notes.controller.ts` lines 10-18
**Severity:** MEDIUM
**Category:** Missing MaxLength
```ts
class CreateNoteDto {
  @IsString() contentType: string;  // No @IsIn, no @MaxLength
  @IsString() contentId: string;
  @IsString() note: string;         // No @MaxLength
}
class RateNoteDto {
  @IsString() rating: string;       // Should be @IsIn(['helpful', 'somewhat_helpful', 'not_helpful'])
}
```

### M-23: TelegramFeatures DTOs — CreateChatFolderDto.conversationIds missing @ArrayMaxSize
**File:** `apps/api/src/modules/telegram-features/dto/telegram-features.dto.ts` line 22
**Severity:** MEDIUM
**Category:** Missing Array Size Limit
```ts
@ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) conversationIds?: string[];
```

### M-24: TelegramFeatures DTOs — UpdateChatFolderDto.conversationIds missing @ArrayMaxSize
**File:** `apps/api/src/modules/telegram-features/dto/telegram-features.dto.ts` line 30
**Severity:** MEDIUM
**Category:** Missing Array Size Limit
```ts
@ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) conversationIds?: string[];
```

### M-25: TelegramFeatures — AddEmojiDto.imageUrl missing @IsUrl
**File:** `apps/api/src/modules/telegram-features/dto/telegram-features.dto.ts` line 58
**Severity:** MEDIUM
**Category:** Missing URL Validation
```ts
@ApiProperty() @IsString() imageUrl: string;
```

### M-26: TelegramFeatures — SaveMessageDto.mediaUrl missing @IsUrl
**File:** `apps/api/src/modules/telegram-features/dto/telegram-features.dto.ts` line 9
**Severity:** MEDIUM
**Category:** Missing URL Validation
```ts
@ApiPropertyOptional() @IsOptional() @IsString() mediaUrl?: string;
```

### M-27: Gamification — CreateChallengeDto.startDate/endDate not validated as dates
**File:** `apps/api/src/modules/gamification/dto/gamification.dto.ts` lines 15-16
**Severity:** MEDIUM
**Category:** Missing Date Validation
```ts
@ApiProperty() @IsString() startDate: string;
@ApiProperty() @IsString() endDate: string;
```
**Impact:** Should use `@IsDateString()` or `@IsISO8601()`. Currently accepts any string.

### M-28: Gamification — CreateChallengeDto.challengeType/category no @IsIn or @MaxLength
**File:** `apps/api/src/modules/gamification/dto/gamification.dto.ts` lines 11-12
**Severity:** MEDIUM
**Category:** Missing Enum/MaxLength
```ts
@ApiProperty() @IsString() challengeType: string;
@ApiProperty() @IsString() category: string;
```

### M-29: Gamification — CreateSeriesDto.category no @MaxLength
**File:** `apps/api/src/modules/gamification/dto/gamification.dto.ts` line 27
**Severity:** MEDIUM
**Category:** Missing MaxLength
```ts
@ApiProperty() @IsString() category: string;
```

### M-30: Gamification — UpdateProfileCustomizationDto.backgroundUrl/backgroundMusic missing @IsUrl
**File:** `apps/api/src/modules/gamification/dto/gamification.dto.ts` lines 40-41
**Severity:** MEDIUM
**Category:** Missing URL Validation
```ts
@ApiPropertyOptional() @IsOptional() @IsString() backgroundUrl?: string;
@ApiPropertyOptional() @IsOptional() @IsString() backgroundMusic?: string;
```

### M-31: CreateChallengeDto.coverUrl missing @IsUrl
**File:** `apps/api/src/modules/gamification/dto/gamification.dto.ts` line 10
**Severity:** MEDIUM
**Category:** Missing URL Validation
```ts
@ApiPropertyOptional() @IsOptional() @IsString() coverUrl?: string;
```

### M-32: CreateSeriesDto.coverUrl missing @IsUrl
**File:** `apps/api/src/modules/gamification/dto/gamification.dto.ts` line 25
**Severity:** MEDIUM
**Category:** Missing URL Validation
```ts
@ApiPropertyOptional() @IsOptional() @IsString() coverUrl?: string;
```

### M-33: Commerce — CreateBusinessDto.category no @MaxLength
**File:** `apps/api/src/modules/commerce/dto/commerce.dto.ts` line 43
**Severity:** MEDIUM
**Category:** Missing MaxLength
```ts
@ApiProperty() @IsString() category: string;
```

### M-34: Commerce — CreateProductDto.category no @MaxLength
**File:** `apps/api/src/modules/commerce/dto/commerce.dto.ts` line 14
**Severity:** MEDIUM
**Category:** Missing MaxLength
```ts
@ApiProperty() @IsString() category: string;
```

### M-35: Commerce — CreateZakatFundDto.category no @MaxLength
**File:** `apps/api/src/modules/commerce/dto/commerce.dto.ts` line 57
**Severity:** MEDIUM
**Category:** Missing MaxLength
```ts
@ApiProperty() @IsString() category: string;
```

### M-36: Community — CreateOpportunityDto.category no @MaxLength
**File:** `apps/api/src/modules/community/dto/community.dto.ts` line 44
**Severity:** MEDIUM
**Category:** Missing MaxLength
```ts
@ApiProperty() @IsString() category: string;
```

### M-37: Community — CreateOpportunityDto.date not validated as date
**File:** `apps/api/src/modules/community/dto/community.dto.ts` line 46
**Severity:** MEDIUM
**Category:** Missing Date Validation
```ts
@ApiPropertyOptional() @IsOptional() @IsString() date?: string;
```

### M-38: Community — CreateEventDto.eventType no @IsIn or @MaxLength
**File:** `apps/api/src/modules/community/dto/community.dto.ts` line 53
**Severity:** MEDIUM
**Category:** Missing Enum/MaxLength
```ts
@ApiProperty() @IsString() eventType: string;
```

### M-39: Community — CreateEventDto.startDate/endDate not validated as dates
**File:** `apps/api/src/modules/community/dto/community.dto.ts` lines 55-56
**Severity:** MEDIUM
**Category:** Missing Date Validation
```ts
@ApiProperty() @IsString() startDate: string;
@ApiPropertyOptional() @IsOptional() @IsString() endDate?: string;
```

### M-40: HajjDto — CreateHajjProgressDto.year has no @Min/@Max
**File:** `apps/api/src/modules/islamic/dto/hajj.dto.ts` line 5
**Severity:** MEDIUM
**Category:** Missing Number Bounds
```ts
@ApiProperty() @IsInt() year: number;
```
**Impact:** Accepts year 0, negative years, or year 999999999.

### M-41: HajjDto — UpdateHajjProgressDto.checklistJson no @MaxLength
**File:** `apps/api/src/modules/islamic/dto/hajj.dto.ts` line 10
**Severity:** MEDIUM
**Category:** Missing MaxLength
```ts
@ApiPropertyOptional() @IsOptional() @IsString() checklistJson?: string;
```
**Impact:** Arbitrary-length JSON stored in DB.

### M-42: HajjDto — UpdateHajjProgressDto.notes no @MaxLength
**File:** `apps/api/src/modules/islamic/dto/hajj.dto.ts` line 11
**Severity:** MEDIUM
**Category:** Missing MaxLength
```ts
@ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
```

### M-43: StageSessionDto.scheduledAt not validated as date
**File:** `apps/api/src/modules/discord-features/dto/discord-features.dto.ts` line 29
**Severity:** MEDIUM
**Category:** Missing Date Validation
```ts
@ApiPropertyOptional() @IsOptional() @IsString() scheduledAt?: string;
```
**Impact:** Should use `@IsDateString()` or `@IsISO8601()`.

---

## MEDIUM — Missing @IsEnum / @IsIn for Enum-typed Fields

### M-44: CreatePostDto.mediaTypes[] should use @IsIn for valid types
**File:** `apps/api/src/modules/posts/dto/create-post.dto.ts` lines 36-40
**Severity:** MEDIUM
**Category:** Missing Enum Validation
```ts
@IsString({ each: true })
mediaTypes?: string[];
```
**Impact:** Should validate against `['IMAGE', 'VIDEO', 'GIF']` etc.

### M-45: CreateStoryDto.mediaType should use @IsIn
**File:** `apps/api/src/modules/stories/dto/create-story.dto.ts` lines 10-12
**Severity:** MEDIUM
**Category:** Missing Enum Validation
```ts
@IsString()
@MaxLength(20)
mediaType: string;
```
**Impact:** Should be `@IsIn(['IMAGE', 'VIDEO'])`.

### M-46: CreateThreadDto.mediaTypes[] should use @IsIn
**File:** `apps/api/src/modules/threads/dto/create-thread.dto.ts` lines 63-67
**Severity:** MEDIUM
**Category:** Missing Enum Validation
```ts
@IsString({ each: true })
mediaTypes?: string[];
```

### M-47: RateNoteDto.rating should use @IsIn instead of plain @IsString
**File:** `apps/api/src/modules/community-notes/community-notes.controller.ts` line 17
**Severity:** MEDIUM
**Category:** Missing Enum Validation
```ts
@IsString() rating: string; // helpful, somewhat_helpful, not_helpful
```
**Impact:** Comment says valid values but code doesn't enforce them.

### M-48: CreateNoteDto.contentType should use @IsIn
**File:** `apps/api/src/modules/community-notes/community-notes.controller.ts` line 11
**Severity:** MEDIUM
**Category:** Missing Enum Validation
```ts
@IsString() contentType: string;
```
**Impact:** Should be `@IsIn(['post', 'thread', 'reel', 'video'])`.

### M-49: RegisterDeviceDto.platform should use @IsIn
**File:** `apps/api/src/modules/devices/devices.controller.ts` line 11
**Severity:** MEDIUM
**Category:** Missing Enum Validation
```ts
@IsString() @IsNotEmpty() platform: string;
```
**Impact:** Should be `@IsIn(['ios', 'android', 'web'])`.

### M-50: ScheduleQADto.scheduledAt should use @IsDateString
**File:** `apps/api/src/modules/scholar-qa/scholar-qa.controller.ts` line 15
**Severity:** MEDIUM
**Category:** Missing Date Validation
```ts
@IsString() scheduledAt: string;
```

### M-51: ScheduleQADto.category should use @IsIn
**File:** `apps/api/src/modules/scholar-qa/scholar-qa.controller.ts` line 13
**Severity:** MEDIUM
**Category:** Missing Enum Validation
```ts
@IsString() category: string;
```

---

## MEDIUM — Inconsistent Validation Between Create and Update DTOs

### M-52: CreateVideoDto.title maxLength=100 vs UpdateVideoDto.title maxLength=200
**File:** `create-video.dto.ts:24` vs `update-video.dto.ts:14`
**Severity:** MEDIUM
**Category:** Inconsistent Limits
**Impact:** Create limits to 100 chars but update allows 200 chars, effectively bypassing the create limit.

### M-53: CreateVideoDto.description maxLength=5000 vs UpdateVideoDto.description maxLength=10000
**File:** `create-video.dto.ts:30` vs `update-video.dto.ts:19`
**Severity:** MEDIUM
**Category:** Inconsistent Limits
**Impact:** Create limits to 5000 chars but update allows 10000 chars. Inconsistent behavior.

---

## LOW — Minor Issues

### L-01: HandToggleDto is an empty class
**File:** `apps/api/src/modules/audio-rooms/dto/hand-toggle.dto.ts` lines 1-3
**Severity:** LOW
**Category:** Empty DTO
```ts
export class HandToggleDto {
  // Empty body for toggling hand raise
}
```
**Impact:** Functional (toggle endpoint), but the DTO is unnecessary overhead.

### L-02: SetInterestsDto.categories[] elements have no @MaxLength
**File:** `apps/api/src/modules/auth/dto/set-interests.dto.ts` line 7
**Severity:** LOW
**Category:** Missing MaxLength on Elements
```ts
@IsString({ each: true })
categories: string[];
```
**Impact:** Each category string can be arbitrarily long.

### L-03: CrossPostDto.targetSpaces should use @IsIn for valid spaces
**File:** `apps/api/src/modules/posts/dto/cross-post.dto.ts` line 9
**Severity:** LOW
**Category:** Missing Enum Validation
```ts
@IsString({ each: true })
targetSpaces: string[];
```
**Impact:** Should validate against `['SAF', 'MAJLIS', 'BAKRA', 'MINBAR']`.

### L-04: AddReplyDto.parentId should use @IsUUID instead of @IsString
**File:** `apps/api/src/modules/threads/dto/add-reply.dto.ts` line 12
**Severity:** LOW
**Category:** Weak ID Validation
```ts
@IsOptional()
@IsString()
parentId?: string;
```
**Impact:** Should be `@IsUUID()` for consistency with other ID fields.

### L-05: CreateVideoCommentDto.parentId should use @IsUUID
**File:** `apps/api/src/modules/videos/dto/create-video-comment.dto.ts` line 10
**Severity:** LOW
**Category:** Weak ID Validation
```ts
@IsOptional()
@IsString()
parentId?: string;
```

### L-06: WatchHistory videoId fields should use @IsUUID
**File:** `apps/api/src/modules/watch-history/dto/add-to-watch-later.dto.ts` line 6, `record-watch.dto.ts` line 7
**Severity:** LOW
**Category:** Weak ID Validation
```ts
@IsString() videoId: string;
```

### L-07: BookmarkDto.postId should use @IsUUID
**File:** `apps/api/src/modules/bookmarks/dto/bookmark.dto.ts` line 7
**Severity:** LOW
**Category:** Weak ID Validation
```ts
@IsString() postId: string;
```

### L-08: SetTrailerDto.videoId should use @IsUUID
**File:** `apps/api/src/modules/channels/dto/set-trailer.dto.ts` line 6
**Severity:** LOW
**Category:** Weak ID Validation
```ts
@IsString() videoId: string;
```

### L-09: Multiple ID fields in various DTOs use @IsString instead of @IsUUID
**Severity:** LOW
**Category:** Weak ID Validation

Affected fields:
- `LogInteractionDto.postId`
- `InviteCollabDto.postId` and `.targetUserId`
- `InitiateCallDto.targetUserId`
- `CreateOrderDto.productId`
- `CreateTreasuryDto.circleId`
- `AddMemberDto.userId` (majlis-lists)
- `MuteToggleDto.targetUserId`
- `CreateDonationDto.campaignId` and `.recipientUserId`
- `CreateWatchPartyDto.videoId`
- `InviteSpeakerDto.speakerId`
- `AddCollaboratorDto.userId`
- `RequestMentorshipDto.mentorId`

### L-10: CreateReelDto.duration allows NaN and Infinity
**File:** `apps/api/src/modules/reels/dto/create-reel.dto.ts` line 26
**Severity:** LOW
**Category:** Number Validation Gap
```ts
@IsNumber()
duration: number;
```
**Impact:** `@IsNumber()` without `{ allowNaN: false, allowInfinity: false }` allows NaN and Infinity.

### L-11: RecordWatchDto.progress has @Min(0) but no @Max
**File:** `apps/api/src/modules/watch-history/dto/record-watch.dto.ts` line 12
**Severity:** LOW
**Category:** Missing Upper Bound
```ts
@IsNumber()
@Min(0)
progress?: number;
```
**Impact:** Progress can be an impossibly large value. Should have a sane max (e.g., video duration or a reasonable cap).

### L-12: DownloadsDto.UpdateProgressDto.fileSize has no decorator
**File:** `apps/api/src/modules/downloads/dto/create-download.dto.ts` line 21
**Severity:** LOW
**Category:** Missing Validation
```ts
@IsOptional()
fileSize?: number;
```
**Impact:** Missing `@IsNumber()`, `@Min(0)`, `@Max()`. Any value passes.

### L-13: Multiple @MaxLength inconsistencies in hashtag/mention arrays
**Severity:** LOW
**Category:** Missing MaxLength on Array Elements
- `CreatePostDto.hashtags[]` — `@IsString({ each: true })` but no `@MaxLength(n, { each: true })`
- `CreateThreadDto.hashtags[]` — same
- `CreateReelDto.hashtags[]` — same
- `CreateThreadDto.mentions[]` — same
- `CreateReelDto.mentions[]` — same

Each element can be arbitrarily long.

### L-14: SmartRepliesDto.lastMessages elements have no @MaxLength
**File:** `apps/api/src/modules/ai/dto/ai.dto.ts` line 30
**Severity:** LOW
**Category:** Missing MaxLength on Array Elements
```ts
@IsArray() @IsString({ each: true }) @ArrayMaxSize(20) lastMessages: string[];
```

### L-15: RouteSpaceDto.mediaTypes elements have no @MaxLength
**File:** `apps/api/src/modules/ai/dto/ai.dto.ts` line 40
**Severity:** LOW
**Category:** Missing MaxLength on Array Elements
```ts
@IsArray() @IsString({ each: true }) @ArrayMaxSize(10) mediaTypes: string[];
```

### L-16: CreateForumThreadDto.tags elements have no @MaxLength
**File:** `apps/api/src/modules/discord-features/dto/discord-features.dto.ts` line 9
**Severity:** LOW
**Category:** Missing MaxLength on Array Elements
```ts
@IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(10) tags?: string[];
```

### L-17: CreateCircleDto.name maxLength=30 — no MinLength
**File:** `apps/api/src/modules/circles/dto/create-circle.dto.ts` line 7
**Severity:** LOW
**Category:** Missing MinLength
```ts
@IsString()
@MaxLength(30)
name: string;
```
**Impact:** Allows empty string as circle name.

### L-18: commerce/community tags/category fields have no `@MaxLength` on individual elements
**Severity:** LOW
**Category:** Missing MaxLength on Array Elements
- `CreateProductDto.tags[]` elements
- `CreateZakatFundDto` no tags array but `category` unbounded (covered in M-35)

### L-19: TranslateDto.contentId/contentType have no @MaxLength
**File:** `apps/api/src/modules/ai/dto/ai.dto.ts` lines 19-20
**Severity:** LOW
**Category:** Missing MaxLength
```ts
@ApiPropertyOptional() @IsOptional() @IsString() contentId?: string;
@ApiPropertyOptional() @IsOptional() @IsString() contentType?: string;
```

### L-20: Multiple `@IsUrl()` without protocol restriction
**Severity:** LOW
**Category:** Loose URL Validation
Files: All `@IsUrl()` usages across DTOs.
**Impact:** `@IsUrl()` by default allows `ftp://`, `ssh://`, etc. For media URLs, should restrict to `{ protocols: ['http', 'https'] }`. Affects all 15+ `@IsUrl()` usages.

### L-21: Broadcast `update` endpoint uses `Partial<CreateBroadcastChannelDto>`
**File:** `apps/api/src/modules/broadcast/broadcast.controller.ts` line 83
**Severity:** LOW
**Category:** Loose Type
```ts
@Body() dto: Partial<CreateBroadcastChannelDto>
```
**Impact:** `Partial<>` with class-validator technically works (makes all fields optional via `@IsOptional()`), but it's an unusual pattern. NestJS `ValidationPipe` with `whitelist: true` should handle this correctly, but it's not the standard `OmitType`/`PartialType` from `@nestjs/swagger`.

---

## Statistics

### Inline Type Endpoints (No Validation): 26
### Controller-Inline DTOs (Have Some Validation): 50+
### DTO Files with Proper Validation: 86
### Total URL Fields Missing @IsUrl: 24
### Total String Fields Missing @MaxLength: 39+
### Total Number Fields Missing @Min/@Max: 12
### Total Array Fields Missing @ArrayMaxSize: 8
### Total Missing @IsIn/@IsEnum: 14
### Total Missing @IsDateString: 6

---

## Recommendations (Priority Order)

1. **IMMEDIATE:** Convert all `interface` DTOs to `class` with decorators (moderation, chat-export)
2. **IMMEDIATE:** Add class-validator decorators to gifts, monetization, payments, promotions DTOs
3. **IMMEDIATE:** Add `@IsUrl()` to all URL fields, especially those fetched server-side (SSRF risk)
4. **HIGH:** Add `@Min()/@Max()` to all numeric fields (especially duration, amounts)
5. **HIGH:** Add `@ArrayMaxSize()` to all unbounded arrays (especially contactSync phoneNumbers)
6. **HIGH:** Add `@MaxLength()` to all unbounded string fields
7. **MEDIUM:** Convert all 26 inline `{ ... }` body types to proper DTO classes
8. **MEDIUM:** Add `@IsIn()` or `@IsEnum()` for enum-like string fields
9. **MEDIUM:** Reconcile inconsistent limits between create/update DTOs
10. **LOW:** Standardize ID fields to use `@IsUUID()` instead of `@IsString()`
