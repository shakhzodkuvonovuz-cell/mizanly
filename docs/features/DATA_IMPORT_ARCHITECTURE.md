# Data Import — "One Tap Import" Architecture

> Spec created: March 21, 2026  
> Status: Design phase  
> Priority: High — key user acquisition feature

---

## Overview

Allow users to import their entire social media history from Instagram, TikTok, X/Twitter, WhatsApp, and YouTube into Mizanly with minimal friction. Imported content is classified into the appropriate Mizanly space and preserves original creation dates.

## Legal Foundation

- **GDPR Article 20**: Users have the legal right to data portability
- **EU Digital Markets Act (DMA)**: Requires "gatekeepers" (Meta, ByteDance) to provide real-time data portability
- All major platforms provide data export tools — this feature helps users use those exports

---

## Two-Tier Architecture

### Tier 1: Official API Import (OAuth)

**How it works**: User taps "Import from Instagram" → Instagram OAuth flow → grant read permissions → Mizanly pulls data through official API.

| Platform | API | What's Available | What's NOT Available |
|----------|-----|-----------------|---------------------|
| Instagram | Graph API | Posts, captions, media URLs, profile info, public media | Full-res images, DMs, stories, private content |
| TikTok | Display API | Video metadata, public videos, profile | Video downloads (restricted), DMs |
| YouTube | Data API v3 | Channel info, playlists, video metadata | Full video files |
| X/Twitter | API v2 | Tweets, profile, followers | DMs (restricted) |

**Limitations**: APIs are intentionally restricted. Meta requires app review post-Cambridge Analytica. Gives ~60-70% of data.

**Implementation**: Standard OAuth 2.0 flow per platform. Store refresh tokens encrypted. Pull data in background job.

### Tier 2: ZIP Export Import (Full Data)

**How it works**: User downloads their data export ZIP from the source platform → uploads to Mizanly → backend parses the structured JSON → reconstructs posts in Mizanly.

**This is the primary approach.** It gives 95% of data and is 100% within user's legal rights.

#### Instagram Export Format
```
your_instagram_activity/
├── content/
│   ├── posts_1.json          # Array of posts with captions, timestamps
│   ├── reels/                # Reel metadata
│   ├── stories/              # Story metadata
│   └── profile_photos/
├── media/
│   ├── images/               # Full-res images
│   ├── videos/               # Full-res videos
│   └── stories/              # Story media
├── followers_and_following/
│   ├── followers_1.json
│   └── following.json
├── messages/
│   └── inbox/                # DM conversations
└── personal_information/
    └── personal_information.json
```

Each post entry contains:
- `creation_timestamp` (Unix epoch) — maps to `originalCreatedAt`
- `title` / caption text — maps to `content`
- `media` array with file paths — maps to media uploads
- Location data, tagged users, hashtags

#### TikTok Export Format
```
tiktok_data/
├── Video/
│   ├── Videos.json           # Video metadata with dates
│   └── [video files]
├── Profile/
│   └── Profile.json
├── Activity/
│   ├── Like List.json
│   └── Favorite Videos.json
└── Direct Messages/
    └── [conversation folders]
```

#### Content Classification Rules

| Source Content | → Mizanly Space | → Model |
|---------------|-----------------|---------|
| Instagram photo post | Saf | Post (IMAGE) |
| Instagram carousel | Saf | Post (CAROUSEL) |
| Instagram reel | Bakra | Reel |
| Instagram story (highlight) | Saf | StoryHighlightAlbum |
| Instagram DM | Risalah | Conversation + Messages |
| TikTok video | Bakra | Reel |
| X/Twitter tweet | Majlis | Thread |
| X/Twitter thread | Majlis | Thread chain |
| YouTube video | Minbar | Video |
| WhatsApp chat | Risalah | Conversation + Messages |

---

## Schema Changes Required

```prisma
// Add to Post model
model Post {
  // ... existing fields
  importSource      ImportSource?    // Which platform it came from
  originalCreatedAt DateTime?        // Original creation date on source platform
  originalUrl       String?          // Original post URL (if available)
  originalId        String?          // ID on the source platform (for dedup)
}

// Add to Reel model (same fields)
// Add to Thread model (same fields)
// Add to Video model (same fields)

enum ImportSource {
  INSTAGRAM
  TIKTOK
  TWITTER
  YOUTUBE
  WHATSAPP
  TELEGRAM
}

// Import job tracking
model ImportJob {
  id            String        @id @default(cuid())
  userId        String
  user          User          @relation(fields: [userId], references: [id])
  source        ImportSource
  status        ImportStatus  @default(PENDING)
  totalItems    Int           @default(0)
  processedItems Int          @default(0)
  failedItems   Int           @default(0)
  errorLog      String?
  zipFileKey    String?       // R2 key for uploaded ZIP
  startedAt     DateTime?
  completedAt   DateTime?
  createdAt     DateTime      @default(now())

  @@index([userId, createdAt(sort: Desc)])
}

enum ImportStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
  CANCELLED
}
```

---

## Import Flow (User Experience)

1. **Profile Settings → "Import Data"** — shows supported platforms with icons
2. **Select platform** → instructions page: "Here's how to download your [Instagram] data"
   - Step-by-step screenshots showing where to go in the source app
   - Estimated wait time (Instagram: 1-48 hours, TikTok: 1-3 days)
3. **Upload ZIP** — drag/drop or file picker, shows upload progress
4. **Processing** — background job parses ZIP, shows real-time progress bar
   - "Found 487 posts, 23 reels, 156 stories..."
   - "Uploading media to Mizanly... 34%"
5. **Review** — preview screen showing what was imported, organized by space
6. **Import complete** → **Exit story prompt** (optional, see EXIT_STORY_SPEC.md)

---

## "Imported from" Badge

On `PostCard`, `ReelCard`, `ThreadCard`, and `VideoCard`:

```tsx
{post.importSource && (
  <View style={styles.importBadge}>
    <PlatformIcon source={post.importSource} size={12} />
    <Text style={styles.importText}>
      Imported from {formatSource(post.importSource)}
    </Text>
  </View>
)}
```

Badge appears as a subtle pill at bottom of the card. Uses the source platform's brand color for the icon.

### Feed Ranking Consideration

Imported posts should NOT appear in other users' "For You" feeds as new content. Use `createdAt` (import date) for internal tracking but `originalCreatedAt` for display. Feed algorithm should:
- Show imported posts on the user's own profile timeline (sorted by `originalCreatedAt`)
- NOT inject imported posts into followers' For You feeds
- Allow imported posts to appear in Following feeds ONLY if posted within last 48 hours of import

---

## Processing Architecture

```
User uploads ZIP
       ↓
Upload to R2 (temp bucket, 24h TTL)
       ↓
Create ImportJob (status: PENDING)
       ↓
Queue background job (BullMQ via Redis)
       ↓
Worker picks up job:
  1. Download ZIP from R2
  2. Extract to temp directory
  3. Detect platform from folder structure
  4. Parse JSON manifest files
  5. For each content item:
     a. Upload media to R2 (permanent bucket)
     b. Generate thumbnail if video
     c. Create DB record with importSource + originalCreatedAt
     d. Generate embedding (queue separately, lower priority)
     e. Update ImportJob progress
  6. Mark ImportJob as COMPLETED
  7. Send push notification: "Import complete!"
  8. Delete temp ZIP from R2
       ↓
User sees results + exit story prompt
```

---

## Security Considerations

- ZIP files must be validated (max size: 10GB, no zip bombs, no path traversal)
- Media files must pass content-type validation before R2 upload
- DM import should require explicit user consent per conversation
- Imported content inherits user's current privacy settings
- Original platform credentials are NEVER collected or stored
