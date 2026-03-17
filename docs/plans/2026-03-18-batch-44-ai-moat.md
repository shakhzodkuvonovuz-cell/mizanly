# Batch 44: AI-Powered Moat (Tier 9) — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build 8 AI-powered features that create switching costs and delight — content assistant, auto-translate, AI moderation, video captions, avatar creation, smart replies, content summarization, smart space routing.

**Architecture:** New `ai` backend module wrapping Claude/Anthropic API for text tasks and Whisper API for audio. All AI features share a common AI service. Mobile adds AI-powered UI components across create flows, DMs, and content viewing.

**Tech Stack:** NestJS 10 + Anthropic Claude API (via @anthropic-ai/sdk) + OpenAI Whisper API + Prisma + Expo SDK 52

---

## SCHEMA CHANGES (Agent 0)

Add to `apps/api/prisma/schema.prisma`:

```prisma
model AiTranslation {
  id            String   @id @default(uuid())
  contentType   String   // post | thread | comment | video_description
  contentId     String
  sourceLanguage String
  targetLanguage String
  translatedText String  @db.Text
  createdAt     DateTime @default(now())
  @@unique([contentId, targetLanguage])
  @@index([contentId])
  @@map("ai_translations")
}

model AiCaption {
  id        String   @id @default(uuid())
  videoId   String
  language  String
  srtContent String  @db.Text
  status    String   @default("pending") // pending | processing | complete | failed
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  video     Video    @relation(fields: [videoId], references: [id], onDelete: Cascade)
  @@unique([videoId, language])
  @@map("ai_captions")
}

model AiAvatar {
  id        String   @id @default(uuid())
  userId    String
  sourceUrl String   // original photo
  avatarUrl String   // generated avatar
  style     String   @default("default") // default | anime | watercolor | islamic_art
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@map("ai_avatars")
}
```

Extend Video model:
```prisma
aiCaptions AiCaption[]
```

Extend User model:
```prisma
aiAvatars AiAvatar[]
```

---

## AGENT 1: AI Service Foundation

New backend module: `apps/api/src/modules/ai/`
- `ai.module.ts` — registers AI service
- `ai.service.ts` — wraps Anthropic Claude API for text generation
  - `generateText(prompt, maxTokens?)` — generic completion
  - `suggestCaption(content, mediaDescription?)` — suggest post caption
  - `suggestHashtags(content)` — extract relevant hashtags
  - `translateText(text, targetLanguage)` — translate content
  - `summarizeText(text, maxLength?)` — TLDR
  - `moderateContent(text)` — check against Islamic values
  - `suggestReplies(context, lastMessages)` — smart reply suggestions
  - `routeToSpace(content, mediaTypes)` — recommend best space

Uses `ANTHROPIC_API_KEY` from env. Falls back gracefully when API unavailable.

~300 lines

---

## AGENT 2: AI Content Assistant

**Backend:** Add to posts.service.ts / ai.service.ts:
- `POST /ai/suggest-caption` — body: { content?, mediaDescription? } → caption suggestions
- `POST /ai/suggest-hashtags` — body: { content } → hashtag array
- `POST /ai/suggest-posting-time` — returns optimal posting time based on user's audience timezone

**Mobile:** `apps/mobile/app/(screens)/ai-assistant.tsx`
- GlassHeader: "AI Assistant"
- Tab selector: Captions | Hashtags | Ideas
- Each tab:
  - Captions: text input for context → generates 3 caption suggestions, tap to copy
  - Hashtags: text input → generates relevant hashtags as tappable chips
  - Ideas: content type selector → generates content ideas as cards
- Integrated into create-post/create-thread as "AI Assist" button

~500 lines

---

## AGENT 3: AI Auto-Translate

**Backend:**
- `POST /ai/translate` — body: { text, targetLanguage }
- `GET /posts/:id/translate/:lang` — cached translation
- `GET /threads/:id/translate/:lang` — cached translation
- Stores translations in AiTranslation model for caching

**Mobile:**
- "Translate" button on PostCard and ThreadCard
- BottomSheet with language picker (Arabic, English, Urdu, Turkish, Malay, French, Bangla)
- Inline translated text with "Translated from X" label
- Animated reveal of translation

~400 lines

---

## AGENT 4: AI Content Moderation

**Backend:**
- `POST /ai/moderate` — body: { text, contentType }
- Returns: { safe: boolean, flags: string[], confidence: number, suggestion?: string }
- Categories: inappropriate, offensive, spam, misinformation, un-islamic
- Integrated into post/thread/comment creation pipeline
- Auto-flag content for review if confidence < 0.7

~400 lines

---

## AGENT 5: AI Video Captions

**Backend:**
- `POST /videos/:id/ai-captions` — triggers Whisper transcription
- `GET /videos/:id/ai-captions` — get generated captions
- Uses OpenAI Whisper API for speech-to-text
- Stores SRT format in AiCaption model
- Supports multiple languages via translation after transcription

**Mobile:**
- "Auto-caption" button in video upload flow
- CC toggle in VideoPlayer showing subtitles overlay
- Language selector for captions

~400 lines

---

## AGENT 6: AI Avatar Creation

**Backend:**
- `POST /ai/avatar` — body: { sourceUrl, style }
- Generates styled avatar from photo (anime, watercolor, islamic_art, default)
- Stores in AiAvatar model + uploads to R2

**Mobile:** `apps/mobile/app/(screens)/ai-avatar.tsx`
- Upload photo or use existing avatar
- Style selector (4 style cards with previews)
- Generate button → loading animation → result preview
- "Set as Profile Picture" button
- Gallery of previously generated avatars

~400 lines

---

## AGENT 7: AI Smart Replies

**Backend:**
- `POST /ai/smart-replies` — body: { conversationContext, lastMessages[] }
- Returns 3 contextual reply suggestions

**Mobile:**
- In conversation/[id].tsx: "Smart Reply" chip bar above keyboard
- 3 suggestion chips that autofill message input on tap
- Refreshable (shake or tap refresh icon)

~300 lines

---

## AGENT 8: AI Content Summarization + Smart Space Routing

**Backend:**
- `POST /ai/summarize` — body: { text, maxLength? }
- `POST /ai/route-space` — body: { content, mediaTypes[] }
- Returns recommended space with confidence

**Mobile:**
- "TLDR" button on long threads (>500 chars)
- Summary card with expandable full text
- In create flow: space recommendation banner ("This looks like a thread — post to Majlis?")

~300 lines

---

## EXECUTION ORDER

1. Agent 0: Schema changes
2. Agent 1: AI Service Foundation (must be first — all others depend on it)
3. Agents 2-8: All parallel after Agent 1

## ESTIMATED OUTPUT

| Agent | Feature | Lines |
|-------|---------|-------|
| 0 | Schema | ~80 |
| 1 | AI Service Foundation | ~300 |
| 2 | AI Content Assistant | ~500 |
| 3 | AI Auto-Translate | ~400 |
| 4 | AI Content Moderation | ~400 |
| 5 | AI Video Captions | ~400 |
| 6 | AI Avatar Creation | ~400 |
| 7 | AI Smart Replies | ~300 |
| 8 | AI Summarization + Routing | ~300 |
| **TOTAL** | | **~3,080** |
