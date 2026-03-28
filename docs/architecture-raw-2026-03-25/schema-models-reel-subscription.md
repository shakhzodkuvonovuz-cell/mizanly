# Prisma Schema Models: Reel through SavedPost (Lines 1108-1593)

Exhaustive field-by-field extraction from `apps/api/prisma/schema.prisma`.

---

## Referenced Enums

### ReelStatus (lines 51-55)
| Value | Notes |
|-------|-------|
| PROCESSING | Default |
| READY | |
| FAILED | |

### ReactionType (lines 109-114)
| Value | Notes |
|-------|-------|
| LIKE | Default for PostReaction, ReelReaction, ReelCommentReaction, CommentReaction, ThreadReaction |
| LOVE | |
| SUPPORT | |
| INSIGHTFUL | |

### CommentPermission (lines 468-472)
| Value | Notes |
|-------|-------|
| EVERYONE | Default for Reel |
| FOLLOWERS | |
| NOBODY | |

### TagApprovalStatus (lines 474-478)
| Value | Notes |
|-------|-------|
| PENDING | Default for ReelTaggedUser |
| APPROVED | |
| DECLINED | |

### ThreadVisibility (lines 57-61)
| Value | Notes |
|-------|-------|
| PUBLIC | Default |
| FOLLOWERS | |
| CIRCLE | |

### ReplyPermission (lines 461-466)
| Value | Notes |
|-------|-------|
| EVERYONE | Default for Thread |
| FOLLOWING | |
| MENTIONED | |
| NONE | |

### VideoStatus (lines 63-69)
| Value | Notes |
|-------|-------|
| DRAFT | Default |
| PROCESSING | |
| PUBLISHED | |
| UNLISTED | |
| PRIVATE | |

### VideoCategory (lines 71-83)
| Value | Notes |
|-------|-------|
| EDUCATION | |
| QURAN | |
| LECTURE | |
| VLOG | |
| NEWS | |
| DOCUMENTARY | |
| ENTERTAINMENT | |
| SPORTS | |
| COOKING | |
| TECH | |
| OTHER | Default |

---

## BAKRA (Short Video) Section Header: Lines 1108-1241

---

## Model: Reel (lines 1108-1182)

**Table name:** `reels` (@@map)

### Fields

| # | Field | Type | Modifiers | Optional | Default | DB Annotation | Notes |
|---|-------|------|-----------|----------|---------|---------------|-------|
| 1 | id | String | @id | No | @default(cuid()) | | Primary key |
| 2 | userId | String | | Yes | | | FK to User |
| 3 | videoUrl | String | | No | | | Required |
| 4 | streamId | String | | Yes | | | Cloudflare Stream ID |
| 5 | hlsUrl | String | | Yes | | | HLS playback URL |
| 6 | dashUrl | String | | Yes | | | DASH playback URL |
| 7 | qualities | String[] | | No | @default([]) | | Available quality levels |
| 8 | isLooping | Boolean | | No | @default(true) | | |
| 9 | normalizeAudio | Boolean | | No | @default(false) | | |
| 10 | thumbnailUrl | String | | Yes | | | |
| 11 | duration | Float | | No | | | Required, no default |
| 12 | width | Int | | No | @default(1080) | | |
| 13 | height | Int | | No | @default(1920) | | 9:16 portrait |
| 14 | status | ReelStatus | | No | @default(PROCESSING) | | Enum |
| 15 | caption | String | | Yes | | @db.VarChar(500) | |
| 16 | hashtags | String[] | | No | @default([]) | | |
| 17 | mentions | String[] | | No | @default([]) | | |
| 18 | language | String | | No | @default("en") | | |
| 19 | audioId | String | | Yes | | | Legacy audio reference |
| 20 | audioTitle | String | | Yes | | | |
| 21 | audioArtist | String | | Yes | | | |
| 22 | audioTrackId | String | | Yes | | | FK to AudioTrack |
| 23 | duetOfId | String | | Yes | | | FK self-ref (Reel) |
| 24 | stitchOfId | String | | Yes | | | FK self-ref (Reel) |
| 25 | isDuet | Boolean | | No | @default(false) | | |
| 26 | isStitch | Boolean | | No | @default(false) | | |
| 27 | isPhotoCarousel | Boolean | | No | @default(false) | | Session 5 addition |
| 28 | carouselUrls | String[] | | No | @default([]) | | Photo carousel URLs |
| 29 | carouselTexts | String[] | | No | @default([]) | | Per-slide text overlays |
| 30 | altText | String | | Yes | | | Accessibility |
| 31 | locationName | String | | Yes | | | |
| 32 | locationLat | Float | | Yes | | | |
| 33 | locationLng | Float | | Yes | | | |
| 34 | commentPermission | CommentPermission | | No | @default(EVERYONE) | | Enum |
| 35 | brandedContent | Boolean | | No | @default(false) | | |
| 36 | brandPartner | String | | Yes | | | |
| 37 | remixAllowed | Boolean | | No | @default(true) | | |
| 38 | topics | String[] | | No | @default([]) | | |
| 39 | scheduledAt | DateTime | | Yes | | | Scheduled publishing |
| 40 | blurhash | String | | Yes | | | Placeholder hash |
| 41 | likesCount | Int | | No | @default(0) | | Counter cache |
| 42 | commentsCount | Int | | No | @default(0) | | Counter cache |
| 43 | sharesCount | Int | | No | @default(0) | | Counter cache |
| 44 | savesCount | Int | | No | @default(0) | | Counter cache |
| 45 | viewsCount | Int | | No | @default(0) | | Counter cache |
| 46 | loopsCount | Int | | No | @default(0) | | Counter cache |
| 47 | isFeatureWorthy | Boolean | | No | @default(false) | | Editorial flag |
| 48 | isTrial | Boolean | | No | @default(false) | | Trial reel (Session 5) |
| 49 | isSensitive | Boolean | | No | @default(false) | | Content warning |
| 50 | isArchived | Boolean | | No | @default(false) | | |
| 51 | isRemoved | Boolean | | No | @default(false) | | Soft delete |
| 52 | removedReason | String | | Yes | | | Moderation reason |
| 53 | createdAt | DateTime | | No | @default(now()) | | |
| 54 | updatedAt | DateTime | @updatedAt | No | | | Auto-updated |

### Relations

| Relation Field | Target Model | Relation Name | Type | FK Field | onDelete |
|---------------|--------------|---------------|------|----------|----------|
| user | User | (implicit) | Many-to-one | userId | SetNull |
| audioTrack | AudioTrack | (implicit) | Many-to-one | audioTrackId | SetNull |
| duetOf | Reel | "DuetOf" | Self many-to-one | duetOfId | SetNull |
| stitchOf | Reel | "StitchOf" | Self many-to-one | stitchOfId | SetNull |
| reactions | ReelReaction[] | (implicit) | One-to-many | — | — |
| comments | ReelComment[] | (implicit) | One-to-many | — | — |
| interactions | ReelInteraction[] | (implicit) | One-to-many | — | — |
| notifications | Notification[] | (implicit) | One-to-many | — | — |
| duets | Reel[] | "DuetOf" | Self one-to-many (reverse) | — | — |
| stitches | Reel[] | "StitchOf" | Self one-to-many (reverse) | — | — |
| templates | ReelTemplate[] | "ReelTemplateSource" | One-to-many | — | — |
| seriesEpisodes | SeriesEpisode[] | "seriesEpisodeReels" | One-to-many | — | — |
| taggedUsers | ReelTaggedUser[] | (implicit) | One-to-many | — | — |

### Indexes

| Fields | Sort | Notes |
|--------|------|-------|
| [userId, createdAt] | createdAt DESC | User's reels timeline |
| [createdAt] | DESC | Global timeline |
| [viewsCount] | DESC | Trending/popular |
| [hashtags] | — | GIN array index for hashtag search |

---

## Model: ReelTaggedUser (lines 1184-1196)

**Table name:** `reel_tagged_users` (@@map)

### Fields

| # | Field | Type | Modifiers | Optional | Default | DB Annotation | Notes |
|---|-------|------|-----------|----------|---------|---------------|-------|
| 1 | id | String | @id | No | @default(cuid()) | | Primary key |
| 2 | reelId | String | | No | | | FK to Reel |
| 3 | userId | String | | No | | | FK to User |
| 4 | status | TagApprovalStatus | | No | @default(PENDING) | | Enum |
| 5 | createdAt | DateTime | | No | @default(now()) | | |

### Relations

| Relation Field | Target Model | Relation Name | Type | FK Field | onDelete |
|---------------|--------------|---------------|------|----------|----------|
| reel | Reel | (implicit) | Many-to-one | reelId | Cascade |
| user | User | "taggedInReels" | Many-to-one | userId | Cascade |

### Indexes / Constraints

| Type | Fields | Notes |
|------|--------|-------|
| @@unique | [reelId, userId] | One tag per user per reel |
| @@index | [userId] | Find reels a user is tagged in |

---

## Model: ReelReaction (lines 1198-1209)

**Table name:** `reel_reactions` (@@map)

### Fields

| # | Field | Type | Modifiers | Optional | Default | DB Annotation | Notes |
|---|-------|------|-----------|----------|---------|---------------|-------|
| 1 | userId | String | | No | | | Part of composite PK |
| 2 | reelId | String | | No | | | Part of composite PK |
| 3 | reaction | ReactionType | | No | @default(LIKE) | | Enum |
| 4 | createdAt | DateTime | | No | @default(now()) | | |

### Relations

| Relation Field | Target Model | Relation Name | Type | FK Field | onDelete |
|---------------|--------------|---------------|------|----------|----------|
| user | User | (implicit) | Many-to-one | userId | Cascade |
| reel | Reel | (implicit) | Many-to-one | reelId | Cascade |

### Indexes / Constraints

| Type | Fields | Notes |
|------|--------|-------|
| @@id | [userId, reelId] | Composite primary key — one reaction per user per reel |
| @@index | [reelId] | Find all reactions on a reel |

---

## Model: ReelComment (lines 1211-1228)

**Table name:** `reel_comments` (@@map)

### Fields

| # | Field | Type | Modifiers | Optional | Default | DB Annotation | Notes |
|---|-------|------|-----------|----------|---------|---------------|-------|
| 1 | id | String | @id | No | @default(cuid()) | | Primary key |
| 2 | reelId | String | | No | | | FK to Reel |
| 3 | userId | String | | No | | | FK to User |
| 4 | parentId | String | | Yes | | | FK self-ref for threading |
| 5 | content | String | | No | | @db.VarChar(500) | |
| 6 | likesCount | Int | | No | @default(0) | | Counter cache |
| 7 | createdAt | DateTime | | No | @default(now()) | | |

### Relations

| Relation Field | Target Model | Relation Name | Type | FK Field | onDelete |
|---------------|--------------|---------------|------|----------|----------|
| reel | Reel | (implicit) | Many-to-one | reelId | Cascade |
| user | User | (implicit) | Many-to-one | userId | Cascade |
| parent | ReelComment | "ReelCommentThread" | Self many-to-one | parentId | Cascade |
| replies | ReelComment[] | "ReelCommentThread" | Self one-to-many (reverse) | — | — |
| reactions | ReelCommentReaction[] | (implicit) | One-to-many | — | — |

### Indexes

| Fields | Notes |
|--------|-------|
| [reelId, createdAt] | Comments on a reel, chronological |
| [parentId] | Find replies to a comment |

---

## Model: ReelCommentReaction (lines 1230-1241)

**Table name:** `reel_comment_reactions` (@@map)

### Fields

| # | Field | Type | Modifiers | Optional | Default | DB Annotation | Notes |
|---|-------|------|-----------|----------|---------|---------------|-------|
| 1 | userId | String | | No | | | Part of composite PK |
| 2 | commentId | String | | No | | | Part of composite PK |
| 3 | reaction | ReactionType | | No | @default(LIKE) | | Enum |
| 4 | createdAt | DateTime | | No | @default(now()) | | |

### Relations

| Relation Field | Target Model | Relation Name | Type | FK Field | onDelete |
|---------------|--------------|---------------|------|----------|----------|
| user | User | (implicit) | Many-to-one | userId | Cascade |
| comment | ReelComment | (implicit) | Many-to-one | commentId | Cascade |

### Indexes / Constraints

| Type | Fields | Notes |
|------|--------|-------|
| @@id | [userId, commentId] | Composite PK — one reaction per user per comment |
| @@index | [commentId] | Find all reactions on a comment |

---

## MAJLIS (Text & Discussion) Section Header: Lines 1243-1246

---

## Model: Thread (lines 1248-1296)

**Table name:** `threads` (@@map)

### Fields

| # | Field | Type | Modifiers | Optional | Default | DB Annotation | Notes |
|---|-------|------|-----------|----------|---------|---------------|-------|
| 1 | id | String | @id | No | @default(cuid()) | | Primary key |
| 2 | userId | String | | Yes | | | FK to User |
| 3 | content | String | | No | | @db.VarChar(500) | |
| 4 | mediaUrls | String[] | | No | @default([]) | | Attached media |
| 5 | mediaTypes | String[] | | No | @default([]) | | MIME types for mediaUrls |
| 6 | isChainHead | Boolean | | No | @default(true) | | First in a thread chain |
| 7 | chainId | String | | Yes | | | Groups thread chain parts |
| 8 | chainPosition | Int | | No | @default(0) | | Order within chain |
| 9 | repostOfId | String | | Yes | | | FK self-ref (repost) |
| 10 | isQuotePost | Boolean | | No | @default(false) | | |
| 11 | quoteText | String | | Yes | | @db.VarChar(500) | |
| 12 | hashtags | String[] | | No | @default([]) | | |
| 13 | mentions | String[] | | No | @default([]) | | |
| 14 | language | String | | No | @default("en") | | |
| 15 | visibility | ThreadVisibility | | No | @default(PUBLIC) | | Enum |
| 16 | circleId | String | | Yes | | | FK to Circle |
| 17 | likesCount | Int | | No | @default(0) | | Counter cache |
| 18 | repliesCount | Int | | No | @default(0) | | Counter cache |
| 19 | repostsCount | Int | | No | @default(0) | | Counter cache |
| 20 | quotesCount | Int | | No | @default(0) | | Counter cache |
| 21 | viewsCount | Int | | No | @default(0) | | Counter cache |
| 22 | bookmarksCount | Int | | No | @default(0) | | Counter cache |
| 23 | isPinned | Boolean | | No | @default(false) | | Pinned to profile |
| 24 | isSensitive | Boolean | | No | @default(false) | | Content warning |
| 25 | altText | String | | Yes | | | Accessibility for media |
| 26 | scheduledAt | DateTime | | Yes | | | Scheduled publishing |
| 27 | hideLikesCount | Boolean | | No | @default(false) | | Privacy feature |
| 28 | isRemoved | Boolean | | No | @default(false) | | Soft delete |
| 29 | replyPermission | ReplyPermission | | No | @default(EVERYONE) | | Enum |
| 30 | createdAt | DateTime | | No | @default(now()) | | |
| 31 | updatedAt | DateTime | @updatedAt | No | | | Auto-updated |

### Relations

| Relation Field | Target Model | Relation Name | Type | FK Field | onDelete |
|---------------|--------------|---------------|------|----------|----------|
| user | User | (implicit) | Many-to-one | userId | SetNull |
| repostOf | Thread | "ThreadReposts" | Self many-to-one | repostOfId | SetNull |
| reposts | Thread[] | "ThreadReposts" | Self one-to-many (reverse) | — | — |
| circle | Circle | (implicit) | Many-to-one | circleId | SetNull |
| reactions | ThreadReaction[] | (implicit) | One-to-many | — | — |
| replies | ThreadReply[] | (implicit) | One-to-many | — | — |
| poll | Poll | (implicit) | One-to-one (optional) | — | — |
| bookmarks | ThreadBookmark[] | (implicit) | One-to-many | — | — |
| notifications | Notification[] | (implicit) | One-to-many | — | — |

### Indexes

| Fields | Sort | Notes |
|--------|------|-------|
| [userId, createdAt] | createdAt DESC | User's thread timeline |
| [createdAt] | DESC | Global timeline |
| [chainId] | — | Find all parts of a chain |
| [circleId, createdAt] | createdAt DESC | Circle threads |
| [hashtags] | — | GIN array index for hashtag search |

---

## Model: ThreadReaction (lines 1298-1309)

**Table name:** `thread_reactions` (@@map)

### Fields

| # | Field | Type | Modifiers | Optional | Default | DB Annotation | Notes |
|---|-------|------|-----------|----------|---------|---------------|-------|
| 1 | userId | String | | No | | | Part of composite PK |
| 2 | threadId | String | | No | | | Part of composite PK |
| 3 | reaction | ReactionType | | No | @default(LIKE) | | Enum |
| 4 | createdAt | DateTime | | No | @default(now()) | | |

### Relations

| Relation Field | Target Model | Relation Name | Type | FK Field | onDelete |
|---------------|--------------|---------------|------|----------|----------|
| user | User | (implicit) | Many-to-one | userId | Cascade |
| thread | Thread | (implicit) | Many-to-one | threadId | Cascade |

### Indexes / Constraints

| Type | Fields | Notes |
|------|--------|-------|
| @@id | [userId, threadId] | Composite PK — one reaction per user per thread |
| @@index | [threadId] | Find all reactions on a thread |

---

## Model: ThreadReply (lines 1311-1329)

**Table name:** `thread_replies` (@@map)

### Fields

| # | Field | Type | Modifiers | Optional | Default | DB Annotation | Notes |
|---|-------|------|-----------|----------|---------|---------------|-------|
| 1 | id | String | @id | No | @default(cuid()) | | Primary key |
| 2 | threadId | String | | No | | | FK to Thread |
| 3 | userId | String | | No | | | FK to User |
| 4 | parentId | String | | Yes | | | FK self-ref for nested replies |
| 5 | content | String | | No | | @db.VarChar(500) | |
| 6 | mediaUrls | String[] | | No | @default([]) | | Attached media |
| 7 | likesCount | Int | | No | @default(0) | | Counter cache |
| 8 | createdAt | DateTime | | No | @default(now()) | | |

### Relations

| Relation Field | Target Model | Relation Name | Type | FK Field | onDelete |
|---------------|--------------|---------------|------|----------|----------|
| thread | Thread | (implicit) | Many-to-one | threadId | Cascade |
| user | User | (implicit) | Many-to-one | userId | Cascade |
| parent | ThreadReply | "ThreadReplyChain" | Self many-to-one | parentId | Cascade |
| replies | ThreadReply[] | "ThreadReplyChain" | Self one-to-many (reverse) | — | — |
| likes | ThreadReplyLike[] | (implicit) | One-to-many | — | — |

### Indexes

| Fields | Notes |
|--------|-------|
| [threadId, createdAt] | Replies on a thread, chronological |
| [parentId] | Find nested replies |

---

## Model: ThreadReplyLike (lines 1331-1341)

**Table name:** `thread_reply_likes` (@@map)

### Fields

| # | Field | Type | Modifiers | Optional | Default | DB Annotation | Notes |
|---|-------|------|-----------|----------|---------|---------------|-------|
| 1 | userId | String | | No | | | Part of composite PK |
| 2 | replyId | String | | No | | | Part of composite PK |
| 3 | createdAt | DateTime | | No | @default(now()) | | |

### Relations

| Relation Field | Target Model | Relation Name | Type | FK Field | onDelete |
|---------------|--------------|---------------|------|----------|----------|
| user | User | (implicit) | Many-to-one | userId | Cascade |
| reply | ThreadReply | (implicit) | Many-to-one | replyId | Cascade |

### Indexes / Constraints

| Type | Fields | Notes |
|------|--------|-------|
| @@id | [userId, replyId] | Composite PK — one like per user per reply |
| @@index | [replyId] | Find all likes on a reply |

**Note:** ThreadReplyLike uses Boolean-like semantics (no reaction type field) unlike ThreadReaction which uses ReactionType enum.

---

## MINBAR (Long Video) Section Header: Lines 1343-1346

---

## Model: Channel (lines 1348-1374)

**Table name:** `channels` (@@map)

### Fields

| # | Field | Type | Modifiers | Optional | Default | DB Annotation | Notes |
|---|-------|------|-----------|----------|---------|---------------|-------|
| 1 | id | String | @id | No | @default(cuid()) | | Primary key |
| 2 | userId | String | @unique | Yes | | | FK to User, one channel per user |
| 3 | handle | String | @unique | No | | | URL-safe channel identifier |
| 4 | name | String | | No | | @db.VarChar(100) | Display name |
| 5 | description | String | | Yes | | @db.VarChar(5000) | |
| 6 | avatarUrl | String | | Yes | | | |
| 7 | bannerUrl | String | | Yes | | | |
| 8 | subscribersCount | Int | | No | @default(0) | | Counter cache |
| 9 | videosCount | Int | | No | @default(0) | | Counter cache |
| 10 | totalViews | Int | | No | @default(0) | | Counter cache |
| 11 | isMonetized | Boolean | | No | @default(false) | | |
| 12 | isVerified | Boolean | | No | @default(false) | | |
| 13 | createdAt | DateTime | | No | @default(now()) | | |
| 14 | updatedAt | DateTime | @updatedAt | No | | | Auto-updated |
| 15 | trailerVideoId | String | | Yes | | | Featured/trailer video ID (no FK relation) |

### Relations

| Relation Field | Target Model | Relation Name | Type | FK Field | onDelete |
|---------------|--------------|---------------|------|----------|----------|
| user | User | (implicit) | One-to-one | userId | SetNull |
| videos | Video[] | (implicit) | One-to-many | — | — |
| playlists | Playlist[] | (implicit) | One-to-many | — | — |
| subscribers | Subscription[] | (implicit) | One-to-many | — | — |
| channelPosts | ChannelPost[] | (implicit) | One-to-many | — | — |
| viewerDemographics | ViewerDemographic[] | "viewerDemographics" | One-to-many | — | — |

### Indexes

| Fields | Sort | Notes |
|--------|------|-------|
| [handle] | — | Unique lookup by handle |
| [subscribersCount] | DESC | Popular channels |

**Note:** userId is @unique, establishing a one-to-one relationship with User.

---

## Model: Video (lines 1376-1439)

**Table name:** `videos` (@@map)

### Fields

| # | Field | Type | Modifiers | Optional | Default | DB Annotation | Notes |
|---|-------|------|-----------|----------|---------|---------------|-------|
| 1 | id | String | @id | No | @default(cuid()) | | Primary key |
| 2 | userId | String | | Yes | | | FK to User |
| 3 | channelId | String | | No | | | FK to Channel (required) |
| 4 | title | String | | No | | @db.VarChar(200) | |
| 5 | description | String | | Yes | | @db.VarChar(10000) | |
| 6 | videoUrl | String | | No | | | Required |
| 7 | streamId | String | | Yes | | | Cloudflare Stream ID |
| 8 | hlsUrl | String | | Yes | | | HLS playback |
| 9 | dashUrl | String | | Yes | | | DASH playback |
| 10 | qualities | String[] | | No | @default([]) | | Available quality levels |
| 11 | isLooping | Boolean | | No | @default(false) | | Unlike Reel which defaults true |
| 12 | normalizeAudio | Boolean | | No | @default(false) | | |
| 13 | thumbnailUrl | String | | Yes | | | |
| 14 | blurhash | String | | Yes | | | Placeholder hash |
| 15 | duration | Float | | No | | | Required, no default |
| 16 | width | Int | | Yes | | | Optional unlike Reel |
| 17 | height | Int | | Yes | | | Optional unlike Reel |
| 18 | status | VideoStatus | | No | @default(DRAFT) | | Enum |
| 19 | category | VideoCategory | | No | @default(OTHER) | | Enum |
| 20 | tags | String[] | | No | @default([]) | | |
| 21 | language | String | | No | @default("en") | | |
| 22 | chapters | Json | | Yes | | | JSON chapter data |
| 23 | viewsCount | Int | | No | @default(0) | | Counter cache |
| 24 | likesCount | Int | | No | @default(0) | | Counter cache |
| 25 | dislikesCount | Int | | No | @default(0) | | Counter cache (unique to Video) |
| 26 | commentsCount | Int | | No | @default(0) | | Counter cache |
| 27 | sharesCount | Int | | No | @default(0) | | Counter cache |
| 28 | savesCount | Int | | No | @default(0) | | Counter cache |
| 29 | avgWatchDuration | Float | | Yes | | | Analytics |
| 30 | completionRate | Float | | Yes | | | Analytics |
| 31 | isRemoved | Boolean | | No | @default(false) | | Soft delete |
| 32 | isAgeRestricted | Boolean | | No | @default(false) | | |
| 33 | isPremiereEnabled | Boolean | | No | @default(false) | | YouTube-style premiere |
| 34 | scheduledAt | DateTime | | Yes | | | Scheduled publishing |
| 35 | publishedAt | DateTime | | Yes | | | When published (separate from createdAt) |
| 36 | createdAt | DateTime | | No | @default(now()) | | |
| 37 | updatedAt | DateTime | @updatedAt | No | | | Auto-updated |

### Relations

| Relation Field | Target Model | Relation Name | Type | FK Field | onDelete |
|---------------|--------------|---------------|------|----------|----------|
| user | User | (implicit) | Many-to-one | userId | SetNull |
| channel | Channel | (implicit) | Many-to-one | channelId | Cascade |
| comments | VideoComment[] | (implicit) | One-to-many | — | — |
| reactions | VideoReaction[] | (implicit) | One-to-many | — | — |
| playlistItems | PlaylistItem[] | (implicit) | One-to-many | — | — |
| subtitles | SubtitleTrack[] | (implicit) | One-to-many | — | — |
| bookmarks | VideoBookmark[] | (implicit) | One-to-many | — | — |
| interactions | VideoInteraction[] | (implicit) | One-to-many | — | — |
| watchLater | WatchLater[] | (implicit) | One-to-many | — | — |
| watchHistory | WatchHistory[] | (implicit) | One-to-many | — | — |
| notifications | Notification[] | (implicit) | One-to-many | — | — |
| premiere | VideoPremiere | (implicit) | One-to-one (optional) | — | — |
| clips | VideoClip[] | (implicit) | One-to-many | — | — |
| endScreens | EndScreen[] | (implicit) | One-to-many | — | — |
| aiCaptions | AiCaption[] | (implicit) | One-to-many | — | — |
| videoChapters | VideoChapter[] | "videoChapters" | One-to-many | — | — |
| watchParties | WatchParty[] | "watchParties" | One-to-many | — | — |
| viewerDemographics | ViewerDemographic[] | "viewerDemographics" | One-to-many | — | — |
| seriesEpisodes | SeriesEpisode[] | "seriesEpisodeVideos" | One-to-many | — | — |

### Indexes

| Fields | Sort | Notes |
|--------|------|-------|
| [channelId, publishedAt] | publishedAt DESC | Channel's videos by publish date |
| [status, publishedAt] | publishedAt DESC | Published videos feed |
| [category, viewsCount] | viewsCount DESC | Category browsing, popular first |
| [tags] | — | GIN array index for tag search |

**Key differences from Reel:** Video has title (required), description (10K chars), category enum, chapters (JSON), dislikesCount, avgWatchDuration, completionRate, isAgeRestricted, isPremiereEnabled, publishedAt. Video has channelId (required) while Reel does not.

---

## Model: VideoComment (lines 1441-1460)

**Table name:** `video_comments` (@@map)

### Fields

| # | Field | Type | Modifiers | Optional | Default | DB Annotation | Notes |
|---|-------|------|-----------|----------|---------|---------------|-------|
| 1 | id | String | @id | No | @default(cuid()) | | Primary key |
| 2 | videoId | String | | No | | | FK to Video |
| 3 | userId | String | | No | | | FK to User |
| 4 | parentId | String | | Yes | | | FK self-ref for threading |
| 5 | content | String | | No | | @db.VarChar(2000) | Larger than ReelComment (500) |
| 6 | likesCount | Int | | No | @default(0) | | Counter cache |
| 7 | timestamp | Float | | Yes | | | Video timestamp for comment |
| 8 | isPinned | Boolean | | No | @default(false) | | Channel owner can pin |
| 9 | createdAt | DateTime | | No | @default(now()) | | |

### Relations

| Relation Field | Target Model | Relation Name | Type | FK Field | onDelete |
|---------------|--------------|---------------|------|----------|----------|
| video | Video | (implicit) | Many-to-one | videoId | Cascade |
| user | User | (implicit) | Many-to-one | userId | Cascade |
| parent | VideoComment | "VideoCommentThread" | Self many-to-one | parentId | Cascade |
| replies | VideoComment[] | "VideoCommentThread" | Self one-to-many (reverse) | — | — |
| likes | VideoCommentLike[] | "videoCommentLikes" | One-to-many | — | — |

### Indexes

| Fields | Notes |
|--------|-------|
| [videoId, createdAt] | Comments on a video, chronological |
| [parentId] | Find replies to a comment |

**Note:** VideoComment uses a separate VideoCommentLike join table (defined at line 4638) instead of a CommentReaction pattern. Has `timestamp` field for linking comments to video playback position. Content limit is 2000 chars vs 500 for ReelComment and 1000 for Comment.

---

## Model: VideoCommentLike (lines 4638-4649, referenced from VideoComment)

**Table name:** `video_comment_likes` (@@map)

**Note:** This model is defined at line 4638, outside the 1108-1600 range, but is referenced by VideoComment.likes. Included for completeness.

### Fields

| # | Field | Type | Modifiers | Optional | Default | DB Annotation | Notes |
|---|-------|------|-----------|----------|---------|---------------|-------|
| 1 | id | String | @id | No | @default(cuid()) | | Primary key (not composite) |
| 2 | userId | String | | No | | | FK to User |
| 3 | commentId | String | | No | | | FK to VideoComment |
| 4 | createdAt | DateTime | | No | @default(now()) | | |

### Relations

| Relation Field | Target Model | Relation Name | Type | FK Field | onDelete |
|---------------|--------------|---------------|------|----------|----------|
| user | User | "videoCommentLikes" | Many-to-one | userId | Cascade |
| comment | VideoComment | "videoCommentLikes" | Many-to-one | commentId | Cascade |

### Indexes / Constraints

| Type | Fields | Notes |
|------|--------|-------|
| @@unique | [userId, commentId] | One like per user per comment |
| @@index | [commentId] | Find all likes on a comment |

**Design note:** Unlike other reaction models that use composite @@id, this uses a separate `id` field + @@unique constraint. No ReactionType enum — binary like only.

---

## Model: VideoReaction (lines 1462-1474)

**Table name:** `video_reactions` (@@map)

### Fields

| # | Field | Type | Modifiers | Optional | Default | DB Annotation | Notes |
|---|-------|------|-----------|----------|---------|---------------|-------|
| 1 | userId | String | | No | | | Part of composite PK |
| 2 | videoId | String | | No | | | Part of composite PK |
| 3 | isLike | Boolean | | No | | | true=like, false=dislike |
| 4 | createdAt | DateTime | | No | @default(now()) | | |

### Relations

| Relation Field | Target Model | Relation Name | Type | FK Field | onDelete |
|---------------|--------------|---------------|------|----------|----------|
| user | User | (implicit) | Many-to-one | userId | Cascade |
| video | Video | (implicit) | Many-to-one | videoId | Cascade |

### Indexes / Constraints

| Type | Fields | Notes |
|------|--------|-------|
| @@id | [userId, videoId] | Composite PK — one reaction per user per video |
| @@index | [videoId] | Find all reactions on a video |

**Design note:** Uses `isLike: Boolean` (like/dislike binary) instead of `reaction: ReactionType` enum. This matches YouTube's thumbs up/down pattern, while Reel/Thread/Post/Comment use the richer ReactionType enum (LIKE/LOVE/SUPPORT/INSIGHTFUL). Comment in schema: `// @@index([userId]) — redundant: @@id already has userId as leading column`.

---

## Model: Subscription (lines 1476-1487)

**Table name:** `subscriptions` (@@map)

### Fields

| # | Field | Type | Modifiers | Optional | Default | DB Annotation | Notes |
|---|-------|------|-----------|----------|---------|---------------|-------|
| 1 | userId | String | | No | | | Part of composite PK |
| 2 | channelId | String | | No | | | Part of composite PK |
| 3 | notificationsOn | Boolean | | No | @default(true) | | Bell notification toggle |
| 4 | createdAt | DateTime | | No | @default(now()) | | |

### Relations

| Relation Field | Target Model | Relation Name | Type | FK Field | onDelete |
|---------------|--------------|---------------|------|----------|----------|
| user | User | (implicit) | Many-to-one | userId | Cascade |
| channel | Channel | (implicit) | Many-to-one | channelId | Cascade |

### Indexes / Constraints

| Type | Fields | Notes |
|------|--------|-------|
| @@id | [userId, channelId] | Composite PK — one subscription per user per channel |
| @@index | [channelId] | Find all subscribers of a channel |

---

## Model: Playlist (lines 1489-1506)

**Table name:** `playlists` (@@map)

### Fields

| # | Field | Type | Modifiers | Optional | Default | DB Annotation | Notes |
|---|-------|------|-----------|----------|---------|---------------|-------|
| 1 | id | String | @id | No | @default(cuid()) | | Primary key |
| 2 | channelId | String | | No | | | FK to Channel |
| 3 | title | String | | No | | @db.VarChar(200) | |
| 4 | description | String | | Yes | | @db.VarChar(1000) | |
| 5 | thumbnailUrl | String | | Yes | | | |
| 6 | isPublic | Boolean | | No | @default(true) | | |
| 7 | isCollaborative | Boolean | | No | @default(false) | | |
| 8 | videosCount | Int | | No | @default(0) | | Counter cache |
| 9 | createdAt | DateTime | | No | @default(now()) | | |
| 10 | updatedAt | DateTime | @updatedAt | No | | | Auto-updated |

### Relations

| Relation Field | Target Model | Relation Name | Type | FK Field | onDelete |
|---------------|--------------|---------------|------|----------|----------|
| channel | Channel | (implicit) | Many-to-one | channelId | Cascade |
| items | PlaylistItem[] | (implicit) | One-to-many | — | — |
| collaborators | PlaylistCollaborator[] | (implicit) | One-to-many | — | — |

### Indexes

| Fields | Notes |
|--------|-------|
| [channelId] | Find all playlists for a channel |

---

## Model: PlaylistItem (lines 1508-1520)

**Table name:** `playlist_items` (@@map)

### Fields

| # | Field | Type | Modifiers | Optional | Default | DB Annotation | Notes |
|---|-------|------|-----------|----------|---------|---------------|-------|
| 1 | id | String | @id | No | @default(cuid()) | | Primary key |
| 2 | playlistId | String | | No | | | FK to Playlist |
| 3 | videoId | String | | No | | | FK to Video |
| 4 | position | Int | | No | | | Ordering within playlist |
| 5 | createdAt | DateTime | | No | @default(now()) | | |

### Relations

| Relation Field | Target Model | Relation Name | Type | FK Field | onDelete |
|---------------|--------------|---------------|------|----------|----------|
| playlist | Playlist | (implicit) | Many-to-one | playlistId | Cascade |
| video | Video | (implicit) | Many-to-one | videoId | Cascade |

### Indexes / Constraints

| Type | Fields | Notes |
|------|--------|-------|
| @@unique | [playlistId, videoId] | No duplicate videos in a playlist |
| @@index | [playlistId, position] | Ordered playlist retrieval |

---

## Model: PlaylistCollaborator (lines 3323-3335, referenced from Playlist)

**Table name:** `playlist_collaborators` (@@map)

**Note:** Defined at line 3323, outside this range, but referenced by Playlist.collaborators. Included for completeness.

### Fields

| # | Field | Type | Modifiers | Optional | Default | DB Annotation | Notes |
|---|-------|------|-----------|----------|---------|---------------|-------|
| 1 | playlistId | String | | No | | | Part of composite PK |
| 2 | userId | String | | No | | | Part of composite PK |
| 3 | role | String | | No | @default("editor") | | Role in playlist |
| 4 | addedById | String | | No | | | FK to User (who added) |
| 5 | addedAt | DateTime | | No | @default(now()) | | |

### Relations

| Relation Field | Target Model | Relation Name | Type | FK Field | onDelete |
|---------------|--------------|---------------|------|----------|----------|
| addedBy | User | "playlistCollabAdder" | Many-to-one | addedById | Cascade |
| playlist | Playlist | (implicit) | Many-to-one | playlistId | Cascade |
| user | User | "PlaylistCollaborators" | Many-to-one | userId | Cascade |

### Indexes / Constraints

| Type | Fields | Notes |
|------|--------|-------|
| @@id | [playlistId, userId] | Composite PK — one collaborator entry per user per playlist |

---

## SAF COMMENTS Section Header: Lines 1522-1524

---

## Model: Comment (lines 1526-1553)

**Table name:** `comments` (@@map)

### Fields

| # | Field | Type | Modifiers | Optional | Default | DB Annotation | Notes |
|---|-------|------|-----------|----------|---------|---------------|-------|
| 1 | id | String | @id | No | @default(cuid()) | | Primary key |
| 2 | postId | String | | No | | | FK to Post |
| 3 | userId | String | | No | | | FK to User |
| 4 | parentId | String | | Yes | | | FK self-ref for threading |
| 5 | content | String | | No | | @db.VarChar(1000) | |
| 6 | mentions | String[] | | No | @default([]) | | @mentioned usernames |
| 7 | likesCount | Int | | No | @default(0) | | Counter cache |
| 8 | repliesCount | Int | | No | @default(0) | | Counter cache (unique to Comment) |
| 9 | isPinned | Boolean | | No | @default(false) | | Post owner can pin |
| 10 | isRemoved | Boolean | | No | @default(false) | | Soft delete |
| 11 | isHidden | Boolean | | No | @default(false) | | Hidden by post owner |
| 12 | createdAt | DateTime | | No | @default(now()) | | |
| 13 | updatedAt | DateTime | @updatedAt | No | | | Auto-updated |

### Relations

| Relation Field | Target Model | Relation Name | Type | FK Field | onDelete |
|---------------|--------------|---------------|------|----------|----------|
| post | Post | (implicit) | Many-to-one | postId | Cascade |
| user | User | (implicit) | Many-to-one | userId | Cascade |
| parent | Comment | "CommentThread" | Self many-to-one | parentId | Cascade |
| replies | Comment[] | "CommentThread" | Self one-to-many (reverse) | — | — |
| reactions | CommentReaction[] | (implicit) | One-to-many | — | — |
| notifications | Notification[] | (implicit) | One-to-many | — | — |
| moderationLogs | ModerationLog[] | "ModCommentTarget" | One-to-many | — | — |
| reportedReports | Report[] | "reportedComments" | One-to-many | — | — |

### Indexes

| Fields | Sort | Notes |
|--------|------|-------|
| [postId, createdAt] | — | Comments on a post, chronological |
| [userId, createdAt] | createdAt DESC | User's comment history |
| [parentId] | — | Find replies to a comment |

**Key differences from ReelComment:** Comment has mentions[], repliesCount, isRemoved, isHidden, updatedAt, and relations to ModerationLog + Report. Content limit is 1000 chars vs 500 for ReelComment. Comment is for Post (Saf space); ReelComment is for Reel (Bakra space).

---

## Model: PostReaction (lines 1555-1566)

**Table name:** `post_reactions` (@@map)

### Fields

| # | Field | Type | Modifiers | Optional | Default | DB Annotation | Notes |
|---|-------|------|-----------|----------|---------|---------------|-------|
| 1 | userId | String | | No | | | Part of composite PK |
| 2 | postId | String | | No | | | Part of composite PK |
| 3 | reaction | ReactionType | | No | @default(LIKE) | | Enum |
| 4 | createdAt | DateTime | | No | @default(now()) | | |

### Relations

| Relation Field | Target Model | Relation Name | Type | FK Field | onDelete |
|---------------|--------------|---------------|------|----------|----------|
| user | User | (implicit) | Many-to-one | userId | Cascade |
| post | Post | (implicit) | Many-to-one | postId | Cascade |

### Indexes / Constraints

| Type | Fields | Notes |
|------|--------|-------|
| @@id | [userId, postId] | Composite PK — one reaction per user per post |
| @@index | [postId] | Find all reactions on a post |

---

## Model: CommentReaction (lines 1568-1580)

**Table name:** `comment_reactions` (@@map)

### Fields

| # | Field | Type | Modifiers | Optional | Default | DB Annotation | Notes |
|---|-------|------|-----------|----------|---------|---------------|-------|
| 1 | userId | String | | No | | | Part of composite PK |
| 2 | commentId | String | | No | | | Part of composite PK |
| 3 | reaction | ReactionType | | No | @default(LIKE) | | Enum |
| 4 | createdAt | DateTime | | No | @default(now()) | | |

### Relations

| Relation Field | Target Model | Relation Name | Type | FK Field | onDelete |
|---------------|--------------|---------------|------|----------|----------|
| user | User | (implicit) | Many-to-one | userId | Cascade |
| comment | Comment | (implicit) | Many-to-one | commentId | Cascade |

### Indexes / Constraints

| Type | Fields | Notes |
|------|--------|-------|
| @@id | [userId, commentId] | Composite PK — one reaction per user per comment |
| @@index | [commentId] | Find all reactions on a comment |

**Note:** Schema comment: `// @@index([userId]) — redundant: @@id already has userId as leading column`

---

## Model: SavedPost (lines 1582-1593)

**Table name:** `saved_posts` (@@map)

### Fields

| # | Field | Type | Modifiers | Optional | Default | DB Annotation | Notes |
|---|-------|------|-----------|----------|---------|---------------|-------|
| 1 | userId | String | | No | | | Part of composite PK |
| 2 | postId | String | | No | | | Part of composite PK |
| 3 | collectionName | String | | No | @default("default") | | Save collections/folders |
| 4 | createdAt | DateTime | | No | @default(now()) | | |

### Relations

| Relation Field | Target Model | Relation Name | Type | FK Field | onDelete |
|---------------|--------------|---------------|------|----------|----------|
| user | User | (implicit) | Many-to-one | userId | Cascade |
| post | Post | (implicit) | Many-to-one | postId | Cascade |

### Indexes / Constraints

| Type | Fields | Notes |
|------|--------|-------|
| @@id | [userId, postId] | Composite PK — one save per user per post |
| @@index | [userId, createdAt] | createdAt DESC — user's saved posts timeline |

---

## Cross-Model Design Pattern Summary

### ID Strategy
All models in this range use `@default(cuid())` for primary keys.

### Composite PK Pattern (Join Tables)
These models use `@@id([field1, field2])` instead of a separate id field:
- ReelReaction: `@@id([userId, reelId])`
- ReelCommentReaction: `@@id([userId, commentId])`
- ThreadReaction: `@@id([userId, threadId])`
- ThreadReplyLike: `@@id([userId, replyId])`
- VideoReaction: `@@id([userId, videoId])`
- Subscription: `@@id([userId, channelId])`
- PostReaction: `@@id([userId, postId])`
- CommentReaction: `@@id([userId, commentId])`
- SavedPost: `@@id([userId, postId])`

### Reaction Type Inconsistency
| Model | Reaction Field | Type | Values |
|-------|---------------|------|--------|
| PostReaction | reaction | ReactionType | LIKE/LOVE/SUPPORT/INSIGHTFUL |
| ReelReaction | reaction | ReactionType | LIKE/LOVE/SUPPORT/INSIGHTFUL |
| ReelCommentReaction | reaction | ReactionType | LIKE/LOVE/SUPPORT/INSIGHTFUL |
| ThreadReaction | reaction | ReactionType | LIKE/LOVE/SUPPORT/INSIGHTFUL |
| CommentReaction | reaction | ReactionType | LIKE/LOVE/SUPPORT/INSIGHTFUL |
| VideoReaction | isLike | Boolean | true/false (like/dislike) |
| ThreadReplyLike | (none) | (existence = like) | Binary |
| VideoCommentLike | (none) | (existence = like) | Binary |

### onDelete Strategies
| Pattern | onDelete | Used By |
|---------|----------|---------|
| Content creator | SetNull | Reel.user, Thread.user, Video.user, Channel.user |
| Content ownership | Cascade | Video.channel |
| Engagement/joins | Cascade | All reactions, comments, subscriptions, saved posts, tagged users |
| Thread self-refs | SetNull | Thread.repostOf, Reel.duetOf, Reel.stitchOf |
| Comment self-refs | Cascade | ReelComment.parent, VideoComment.parent, Comment.parent, ThreadReply.parent |

### Counter Cache Fields by Model
| Model | Counters |
|-------|----------|
| Reel | likesCount, commentsCount, sharesCount, savesCount, viewsCount, loopsCount |
| Thread | likesCount, repliesCount, repostsCount, quotesCount, viewsCount, bookmarksCount |
| Video | viewsCount, likesCount, dislikesCount, commentsCount, sharesCount, savesCount |
| Channel | subscribersCount, videosCount, totalViews |
| Comment | likesCount, repliesCount |
| ReelComment | likesCount |
| VideoComment | likesCount |
| ThreadReply | likesCount |
| Playlist | videosCount |

### Comment Threading Pattern
All comment models use self-referential relations for nesting:
- `parentId` (optional FK to self)
- `parent` relation (self many-to-one)
- `replies` relation (self one-to-many)
- Relation names: "ReelCommentThread", "VideoCommentThread", "CommentThread", "ThreadReplyChain"

### Content Limits by Model
| Model | Field | Limit |
|-------|-------|-------|
| Reel | caption | VarChar(500) |
| Thread | content | VarChar(500) |
| Thread | quoteText | VarChar(500) |
| ReelComment | content | VarChar(500) |
| ThreadReply | content | VarChar(500) |
| Comment | content | VarChar(1000) |
| VideoComment | content | VarChar(2000) |
| Video | title | VarChar(200) |
| Video | description | VarChar(10000) |
| Channel | name | VarChar(100) |
| Channel | description | VarChar(5000) |
| Playlist | title | VarChar(200) |
| Playlist | description | VarChar(1000) |

### Space Mapping
| Space | Models in this range |
|-------|---------------------|
| Bakra (Short Video) | Reel, ReelTaggedUser, ReelReaction, ReelComment, ReelCommentReaction |
| Majlis (Text/Discussion) | Thread, ThreadReaction, ThreadReply, ThreadReplyLike |
| Minbar (Long Video) | Channel, Video, VideoComment, VideoReaction, Subscription, Playlist, PlaylistItem |
| Saf (Feed/Posts) | Comment, PostReaction, CommentReaction, SavedPost |
