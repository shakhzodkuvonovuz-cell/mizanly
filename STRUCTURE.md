# Mizanly — Finalized App Structure (A to Z)
## The Complete Source of Truth

> Generated after cross-referencing the current codebase against Instagram, TikTok, X/Twitter,
> WhatsApp, Telegram, YouTube, Snapchat, Discord, Reddit, BeReal, Threads, Pinterest, and LinkedIn.
> Every section below is a **decision**, not a suggestion. This is what we build.

---

## TABLE OF CONTENTS

1. [Feature Scope by Phase](#1-feature-scope-by-phase)
2. [Database Schema — Complete](#2-database-schema--complete)
3. [API Route Map — Complete](#3-api-route-map--complete)
4. [Mobile Screen Map — Complete](#4-mobile-screen-map--complete)
5. [Mobile Component Architecture](#5-mobile-component-architecture)
6. [State Management](#6-state-management)
7. [Real-time Events (Socket.io)](#7-real-time-events-socketio)
8. [Background Jobs & Webhooks](#8-background-jobs--webhooks)
9. [Islamic Features Spec](#9-islamic-features-spec)
10. [Design System Reference](#10-design-system-reference)

---

## 1. Feature Scope by Phase

### MVP — Weeks 1–12 (What ships at launch)

#### Auth & Onboarding
- [x] Sign up (email / Google / Apple via Clerk)
- [x] Log in
- [x] Username selection with availability check
- [x] Profile setup (display name, bio, avatar, language)
- [x] Interest category selection (seeds algorithm — 12 categories)
- [x] Suggested users to follow (based on interests)
- [x] Deep link handling (mizanly:// scheme)

#### Profiles
- [x] View any user's profile
- [x] Own profile page
- [x] Edit profile (name, bio, avatar, cover, website, links, language)
- [x] Multiple profile links (up to 5 — Linktree-style)
- [x] Followers / Following lists
- [x] Follow / Unfollow
- [x] Follow requests (for private accounts — approve/deny)
- [x] Block / Unblock
- [x] Mute / Unmute
- [x] Profile QR code
- [x] Story highlights on profile

#### Saf — Feed & Stories
- [x] Following feed (chronological)
- [x] For You feed (algorithmic)
- [x] Create text post
- [x] Create image post (single + carousel up to 10)
- [x] Create video post
- [x] Post visibility (Public / Followers / Circle)
- [x] Hashtags + @mentions in posts
- [x] Location tagging
- [x] Collab post (co-author with one other user)
- [x] Like / react to posts (Like, Love, Support, Insightful)
- [x] Comment on posts (nested, 3 levels max)
- [x] Pin a comment (post author)
- [x] Save post to collections (named bookmarks)
- [x] Share post (in-app share sheet + native share)
- [x] Delete own post
- [x] Report post
- [x] "Not interested" dismiss signal
- [x] Post detail view
- [x] Stories feed (from people you follow)
- [x] Create story (photo / video / text-only)
- [x] Story text overlay + background color
- [x] Story stickers: Poll, Question, Countdown, "Add Yours", Link
- [x] Story music (from audio library)
- [x] Story view count + who viewed
- [x] Story reply (→ DM)
- [x] Story highlights (pin to profile)
- [x] Story close friends (only your mutual close friends)
- [x] Story archives (private storage after 24h)
- [x] Alt text on images (manual entry)
- [x] Sensitive content flag on posts
- [x] Comments disabled toggle
- [x] Hide like count toggle
- [x] Draft posts (save + resume)

#### Majlis — Threads
- [x] For You feed
- [x] Following feed
- [x] Trending feed
- [x] Create thread (text up to 500 chars + up to 4 images)
- [x] Thread chains (multi-part thread, up to 10 parts)
- [x] Polls in threads (2–4 options, custom expiry)
- [x] Thread visibility (Public / Followers / Circle)
- [x] Like / react to thread
- [x] Reply to thread (nested)
- [x] Repost thread
- [x] Quote thread (with your comment)
- [x] Bookmark thread (save to named collections)
- [x] Majlis Lists (curate feeds from specific accounts)
- [x] Trending topics with context
- [x] Hashtag pages
- [x] Pinned thread on own profile
- [x] Delete thread
- [x] Report thread
- [x] "Not interested" signal

#### Risalah — Messaging
- [x] DM conversation (1:1)
- [x] Group conversation (up to 256 members)
- [x] Send text, image, voice note, video, file, GIF, sticker
- [x] Message reactions (any emoji, per message)
- [x] Reply to a message (threaded)
- [x] Forward a message (with attribution)
- [x] Pin messages in conversation
- [x] Delete messages (for me / for everyone)
- [x] Edit sent message (up to 15 min after sending)
- [x] Delivery ticks (sent ✓ / delivered ✓✓ / read ✓✓ blue)
- [x] Typing indicators
- [x] Online / Last seen status
- [x] View once media (self-destructs after viewing)
- [x] Disappearing messages (set timer per conversation: 24h / 7d / 90d / off)
- [x] Story reply → opens DM with story attached
- [x] Share post/reel/thread/video into a conversation
- [x] Conversation mute / archive / pin
- [x] Group admin controls (rename, avatar, add/remove members, promote admin)
- [x] Group invite link
- [x] Create broadcast channel (Telegram-style, admin-only posts)
- [x] Join/subscribe to broadcast channels
- [x] Search within a conversation

#### Circles — Communities
- [x] Create circle (name, slug, avatar, cover, privacy)
- [x] Circle roles: Owner, Admin, Moderator, Member
- [x] Invite members via link or by username
- [x] Post to circle (Saf posts visible only to circle members)
- [x] Circle rules (markdown text)
- [x] Circle feed
- [x] Circle member list + management
- [x] Leave / disband circle
- [x] Report circle

#### Search & Discover
- [x] Search users, posts, threads, reels, videos, channels, hashtags
- [x] Search history + recent searches
- [x] Trending page (hashtags, topics, unified across spaces)
- [x] Explore visual grid (photos/reels from discover algorithm)
- [x] Topic channels in Explore (Islamic Education, Quran, Cooking, etc.)
- [x] Hashtag page (top + recent)
- [x] User discovery (people you may know)

#### Notifications
- [x] Activity feed (likes, comments, follows, mentions, reposts)
- [x] Grouped notifications ("User A and 9 others liked your post")
- [x] Per-type notification preferences (toggle each type on/off)
- [x] Push notifications (Expo)
- [x] Mark individual / all as read
- [x] Notification badge on tab bar

#### Settings
- [x] Privacy: account private toggle, follow request approval, who can message/mention/tag you, who can see your followers/following list
- [x] Notifications: per-type push preferences, email digest frequency
- [x] Security: 2FA (via Clerk), login activity / sessions, trusted devices
- [x] Blocked accounts list + unblock
- [x] Muted accounts list + unmute
- [x] Filtered words / keyword blocklist (hide comments with certain words)
- [x] Sensitive content filter (show/blur)
- [x] Language + RTL toggle
- [x] Theme (Dark / Light / System)
- [x] Accessibility: text size, reduced motion, high contrast
- [x] Digital wellbeing: daily usage time, usage summary
- [x] Data: download your data, deactivate account, delete account
- [x] About: version, terms of service, privacy policy, community guidelines

---

### V1.1 — Month 4–5

#### Bakra — Short Video
- [ ] For You feed (full-screen vertical swipe)
- [ ] Following feed
- [ ] Record reel (in-app camera, up to 3 min)
- [ ] Upload reel from gallery
- [ ] Speed controls (0.3x / 0.5x / 1x / 2x / 3x)
- [ ] Timer + countdown for hands-free recording
- [ ] Trim clips
- [ ] Audio library (trending sounds, original audio)
- [ ] Add original audio (record or upload)
- [ ] Captions (auto-generated)
- [ ] Duet (split-screen with another reel)
- [ ] Stitch (clip 5 sec of another reel into yours)
- [ ] Green screen effect (replace background with image/video)
- [ ] Reel reactions + comments
- [ ] Save reel to device
- [ ] Share reel externally
- [ ] Creator analytics for reels

#### Creator Tools (V1.1)
- [ ] Creator analytics dashboard (per post/reel/thread/video)
- [ ] Follower growth chart
- [ ] Reach + impressions per content piece
- [ ] Demographics (language, location if shared)
- [ ] Scheduled posts (set publish time up to 30 days in advance)
- [ ] Draft posts

---

### V1.2 — Month 6–7

#### Minbar — Long Video
- [ ] Subscription feed (videos from channels you subscribe to)
- [ ] Recommended feed
- [ ] Trending videos
- [ ] Create channel (handle, name, description, avatar, banner)
- [ ] Upload video (title, description, thumbnail, category, tags)
- [ ] Video chapters (timestamps)
- [ ] Subtitles/captions (SRT upload or auto-generate)
- [ ] Video scheduled publishing
- [ ] Video status: Draft / Processing / Published / Unlisted / Private
- [ ] Video like/dislike
- [ ] Video comments (threaded, pinnable)
- [ ] Subscribe to channel
- [ ] Notification bell per channel
- [ ] Playlists (create, add videos, reorder)
- [ ] Watch history
- [ ] Watch later queue
- [ ] Channel community tab (posts to subscribers)
- [ ] Channel trailer
- [ ] Video end screens + cards (links to other content)
- [ ] Minbar discover (browse by category)
- [ ] Channel analytics

---

### V2.0 — Month 8+

#### Live & Audio Spaces
- [ ] Go live (video stream)
- [ ] Audio spaces (voice rooms, like X Spaces / Clubhouse)
- [ ] Live chat + gifts
- [ ] Schedule a live
- [ ] Record + save live replay
- [ ] Co-host live (invite speaker)
- [ ] Live viewer analytics

#### Monetization
- [ ] Creator tips (send money to creator)
- [ ] Paid subscriptions per creator (exclusive content)
- [ ] Super Duaa / Super Support (live gifts)
- [ ] Branded content tools (sponsorship label)
- [ ] Creator payout dashboard

#### Advanced Risalah
- [ ] Voice calling (1:1 + group)
- [ ] Video calling (1:1 + group)
- [ ] End-to-end encryption for DMs
- [ ] Secret chats (E2E + no forwarding + screenshot alert)
- [ ] Message reactions analytics in groups

#### Platform
- [ ] Islamic Features Pack (see Section 9)
- [ ] Admin moderation panel (web)
- [ ] Appeals system
- [ ] Advertiser tools (self-serve)
- [ ] Public API (developer access)
- [ ] Fediverse / ActivityPub integration (optional)

---

## 2. Database Schema — Complete

### New Models to Add (additions to current v2 schema)

```prisma
// ── FOLLOW REQUESTS (for private accounts) ──────────────────
model FollowRequest {
  id          String   @id @default(cuid())
  requesterId String
  targetId    String
  status      FollowRequestStatus @default(PENDING)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  requester   User @relation("SentFollowRequests",   fields: [requesterId], references: [id], onDelete: Cascade)
  target      User @relation("ReceivedFollowRequests", fields: [targetId],    references: [id], onDelete: Cascade)
  @@unique([requesterId, targetId])
  @@index([targetId, status])
  @@map("follow_requests")
}

enum FollowRequestStatus { PENDING ACCEPTED DECLINED }

// ── POLLS (for Majlis threads) ────────────────────────────────
model Poll {
  id        String @id @default(cuid())
  threadId  String @unique
  thread    Thread @relation(fields: [threadId], references: [id], onDelete: Cascade)
  question  String @db.VarChar(300)
  expiresAt DateTime
  totalVotes Int @default(0)
  createdAt DateTime @default(now())
  options   PollOption[]
  @@map("polls")
}

model PollOption {
  id       String @id @default(cuid())
  pollId   String
  poll     Poll   @relation(fields: [pollId], references: [id], onDelete: Cascade)
  text     String @db.VarChar(100)
  position Int    @default(0)
  votesCount Int  @default(0)
  votes    PollVote[]
  @@index([pollId])
  @@map("poll_options")
}

model PollVote {
  userId   String
  optionId String
  createdAt DateTime @default(now())
  user   User       @relation(fields: [userId],   references: [id], onDelete: Cascade)
  option PollOption @relation(fields: [optionId], references: [id], onDelete: Cascade)
  @@id([userId, optionId])
  @@map("poll_votes")
}

// ── AUDIO TRACKS (sound library for Bakra) ───────────────────
model AudioTrack {
  id          String @id @default(cuid())
  title       String @db.VarChar(200)
  artist      String? @db.VarChar(200)
  coverUrl    String?
  audioUrl    String
  duration    Float
  isOriginal  Boolean @default(false)
  isHalal     Boolean @default(true)    // Islamic content filter
  uploaderId  String?
  usageCount  Int @default(0)
  language    String @default("en")
  createdAt   DateTime @default(now())
  uploader    User?  @relation(fields: [uploaderId], references: [id], onDelete: SetNull)
  reels       Reel[]
  @@index([usageCount(sort: Desc)])
  @@index([isHalal, usageCount(sort: Desc)])
  @@map("audio_tracks")
}

// ── THREAD BOOKMARKS (Majlis saves) ──────────────────────────
model ThreadBookmark {
  userId          String
  threadId        String
  collectionName  String @default("default")
  createdAt       DateTime @default(now())
  user   User   @relation(fields: [userId],   references: [id], onDelete: Cascade)
  thread Thread @relation(fields: [threadId], references: [id], onDelete: Cascade)
  @@id([userId, threadId])
  @@index([userId, createdAt(sort: Desc)])
  @@map("thread_bookmarks")
}

// ── VIDEO BOOKMARKS (Minbar saves) ───────────────────────────
model VideoBookmark {
  userId    String
  videoId   String
  createdAt DateTime @default(now())
  user  User  @relation(fields: [userId],  references: [id], onDelete: Cascade)
  video Video @relation(fields: [videoId], references: [id], onDelete: Cascade)
  @@id([userId, videoId])
  @@index([userId, createdAt(sort: Desc)])
  @@map("video_bookmarks")
}

// ── WATCH HISTORY (Minbar) ────────────────────────────────────
model WatchHistory {
  id              String @id @default(cuid())
  userId          String
  videoId         String
  watchDurationSec Float @default(0)
  completionRate  Float  @default(0)
  watchedAt       DateTime @default(now())
  user  User  @relation(fields: [userId],  references: [id], onDelete: Cascade)
  video Video @relation(fields: [videoId], references: [id], onDelete: Cascade)
  @@unique([userId, videoId])
  @@index([userId, watchedAt(sort: Desc)])
  @@map("watch_history")
}

// ── WATCH LATER (Minbar) ──────────────────────────────────────
model WatchLater {
  userId    String
  videoId   String
  addedAt   DateTime @default(now())
  user  User  @relation(fields: [userId],  references: [id], onDelete: Cascade)
  video Video @relation(fields: [videoId], references: [id], onDelete: Cascade)
  @@id([userId, videoId])
  @@index([userId, addedAt(sort: Desc)])
  @@map("watch_later")
}

// ── MESSAGE REACTIONS ─────────────────────────────────────────
model MessageReaction {
  id        String @id @default(cuid())
  messageId String
  userId    String
  emoji     String @db.VarChar(10)   // any emoji character
  createdAt DateTime @default(now())
  message Message @relation(fields: [messageId], references: [id], onDelete: Cascade)
  user    User    @relation(fields: [userId],    references: [id], onDelete: Cascade)
  @@unique([messageId, userId, emoji])
  @@index([messageId])
  @@map("message_reactions")
}

// ── STORY HIGHLIGHT ALBUMS ────────────────────────────────────
model StoryHighlightAlbum {
  id         String @id @default(cuid())
  userId     String
  user       User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  title      String @db.VarChar(50)
  coverUrl   String?
  position   Int    @default(0)
  storiesCount Int  @default(0)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  stories    Story[]
  @@index([userId, position])
  @@map("story_highlight_albums")
}

// ── STORY STICKER RESPONSES (polls, questions, add yours) ─────
model StoryStickerResponse {
  id        String @id @default(cuid())
  storyId   String
  userId    String
  stickerType String     // 'poll_vote' | 'question_answer' | 'add_yours' | 'slider'
  stickerKey  String     // which sticker on this story (story can have multiple)
  response    String     // vote option / answer text / slider value
  mediaUrl    String?    // for "add yours" responses
  createdAt DateTime @default(now())
  story Story @relation(fields: [storyId], references: [id], onDelete: Cascade)
  user  User  @relation(fields: [userId],  references: [id], onDelete: Cascade)
  @@index([storyId, stickerKey])
  @@map("story_sticker_responses")
}

// ── USER INTERESTS (onboarding + algorithm seeding) ──────────
model UserInterest {
  userId    String
  category  String   // 'islamic_education' | 'quran' | 'cooking' | etc.
  score     Float    @default(1.0)  // updated by algorithm over time
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([userId, category])
  @@index([userId])
  @@map("user_interests")
}

// ── FEED DISMISSALS ("not interested") ───────────────────────
model FeedDismissal {
  id          String @id @default(cuid())
  userId      String
  contentType String  // 'post' | 'reel' | 'thread' | 'video'
  contentId   String
  reason      String? // 'not_interested' | 'seen_too_much' | 'sensitive'
  createdAt   DateTime @default(now())
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, contentType])
  @@map("feed_dismissals")
}

// ── DRAFT POSTS ───────────────────────────────────────────────
model DraftPost {
  id          String @id @default(cuid())
  userId      String
  user        User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  space       ContentSpace   // which space this draft is for
  contentJson Json           // full draft state as JSON
  thumbnailUrl String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([userId, space, updatedAt(sort: Desc)])
  @@map("draft_posts")
}

// ── PROFILE LINKS (multiple website links) ───────────────────
model ProfileLink {
  id       String @id @default(cuid())
  userId   String
  user     User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  title    String @db.VarChar(50)
  url      String @db.VarChar(500)
  position Int    @default(0)
  createdAt DateTime @default(now())
  @@index([userId, position])
  @@map("profile_links")
}

// ── PUSH NOTIFICATION DEVICES ────────────────────────────────
model Device {
  id            String @id @default(cuid())
  userId        String
  user          User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  pushToken     String @unique
  platform      String  // 'ios' | 'android'
  deviceName    String?
  lastSeenAt    DateTime @default(now())
  createdAt     DateTime @default(now())
  @@index([userId])
  @@map("devices")
}

// ── CALL SESSIONS (voice + video calls in Risalah) ───────────
model CallSession {
  id             String @id @default(cuid())
  callType       CallType
  status         CallStatus @default(RINGING)
  initiatorId    String
  conversationId String?
  startedAt      DateTime?
  endedAt        DateTime?
  durationSec    Int?
  createdAt      DateTime @default(now())
  initiator      User         @relation("CallInitiator", fields: [initiatorId],    references: [id])
  conversation   Conversation? @relation(fields: [conversationId], references: [id])
  participants   CallParticipant[]
  @@index([initiatorId])
  @@map("call_sessions")
}

model CallParticipant {
  sessionId String
  userId    String
  joinedAt  DateTime  @default(now())
  leftAt    DateTime?
  session CallSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  user    User        @relation(fields: [userId],    references: [id], onDelete: Cascade)
  @@id([sessionId, userId])
  @@map("call_participants")
}

enum CallType   { VOICE VIDEO }
enum CallStatus { RINGING ACTIVE ENDED MISSED DECLINED }

// ── STICKER PACKS ─────────────────────────────────────────────
model StickerPack {
  id          String @id @default(cuid())
  name        String @db.VarChar(100)
  thumbnailUrl String?
  isOfficial  Boolean @default(false)
  isActive    Boolean @default(true)
  creatorId   String?
  creator     User? @relation(fields: [creatorId], references: [id], onDelete: SetNull)
  createdAt   DateTime @default(now())
  stickers    Sticker[]
  userPacks   UserStickerPack[]
  @@map("sticker_packs")
}

model Sticker {
  id      String @id @default(cuid())
  packId  String
  pack    StickerPack @relation(fields: [packId], references: [id], onDelete: Cascade)
  name    String @db.VarChar(100)
  fileUrl String
  emoji   String?
  @@index([packId])
  @@map("stickers")
}

model UserStickerPack {
  userId  String
  packId  String
  addedAt DateTime @default(now())
  user User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  pack StickerPack @relation(fields: [packId], references: [id], onDelete: Cascade)
  @@id([userId, packId])
  @@map("user_sticker_packs")
}

// ── MAJLIS LISTS (X/Twitter-style curated feeds) ──────────────
model MajlisList {
  id          String @id @default(cuid())
  ownerId     String
  owner       User   @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  name        String @db.VarChar(100)
  description String? @db.VarChar(300)
  isPrivate   Boolean @default(false)
  membersCount Int    @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  members     MajlisListMember[]
  @@index([ownerId])
  @@map("majlis_lists")
}

model MajlisListMember {
  listId    String
  userId    String
  addedAt   DateTime @default(now())
  list MajlisList @relation(fields: [listId], references: [id], onDelete: Cascade)
  user User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([listId, userId])
  @@index([userId])
  @@map("majlis_list_members")
}

// ── COLLAB POSTS (Saf co-authorship) ─────────────────────────
model PostCollab {
  postId       String
  collaboratorId String
  status       CollabStatus @default(PENDING)
  invitedAt    DateTime @default(now())
  acceptedAt   DateTime?
  post         Post @relation(fields: [postId],       references: [id], onDelete: Cascade)
  collaborator User @relation(fields: [collaboratorId], references: [id], onDelete: Cascade)
  @@id([postId, collaboratorId])
  @@map("post_collabs")
}

enum CollabStatus { PENDING ACCEPTED DECLINED }

// ── BLOCKED KEYWORDS (per-user comment filters) ───────────────
model BlockedKeyword {
  id        String @id @default(cuid())
  userId    String
  user      User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  keyword   String @db.VarChar(100)
  createdAt DateTime @default(now())
  @@unique([userId, keyword])
  @@index([userId])
  @@map("blocked_keywords")
}

// ── CREATOR STATS (daily snapshots for analytics) ────────────
model CreatorStat {
  id            String @id @default(cuid())
  userId        String
  user          User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  date          DateTime   // truncated to day
  space         ContentSpace
  newFollowers  Int @default(0)
  profileViews  Int @default(0)
  contentViews  Int @default(0)
  likes         Int @default(0)
  comments      Int @default(0)
  shares        Int @default(0)
  reach         Int @default(0)
  @@unique([userId, space, date])
  @@index([userId, date(sort: Desc)])
  @@map("creator_stats")
}

// ── USER SETTINGS (privacy + notification preferences) ────────
model UserSettings {
  userId String @id
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  // Privacy
  messagePermission    String @default("everyone")  // everyone | followers | none
  mentionPermission    String @default("everyone")
  tagPermission        String @default("everyone")
  showFollowersList    Boolean @default(true)
  showFollowingList    Boolean @default(true)
  activityStatus       Boolean @default(true)       // show online / last seen
  // Notifications (per type, all default true)
  notifyLikes          Boolean @default(true)
  notifyComments       Boolean @default(true)
  notifyFollows        Boolean @default(true)
  notifyMentions       Boolean @default(true)
  notifyMessages       Boolean @default(true)
  notifyReposts        Boolean @default(true)
  notifyLiveStarted    Boolean @default(true)
  notifyVideoPublished Boolean @default(true)
  emailDigest          String  @default("weekly")  // never | daily | weekly
  // Safety
  sensitiveContentFilter Boolean @default(true)
  restrictedMode         Boolean @default(false)
  // Accessibility
  reducedMotion          Boolean @default(false)
  largeText              Boolean @default(false)
  highContrast           Boolean @default(false)
  // Wellbeing
  dailyTimeLimit         Int?    // minutes, null = no limit
  updatedAt              DateTime @updatedAt
  @@map("user_settings")
}

// ── SUBTITLE TRACKS (Minbar video captions) ───────────────────
model SubtitleTrack {
  id       String @id @default(cuid())
  videoId  String
  video    Video  @relation(fields: [videoId], references: [id], onDelete: Cascade)
  language String  // 'en' | 'ar' | 'tr' | etc.
  label    String  @db.VarChar(50)  // "English" | "Arabic" | etc.
  fileUrl  String
  isAuto   Boolean @default(false)  // auto-generated vs uploaded
  createdAt DateTime @default(now())
  @@unique([videoId, language])
  @@map("subtitle_tracks")
}

// ── CHANNEL POSTS (Minbar community tab) ─────────────────────
model ChannelPost {
  id        String @id @default(cuid())
  channelId String
  userId    String
  channel   Channel @relation(fields: [channelId], references: [id], onDelete: Cascade)
  user      User    @relation(fields: [userId],    references: [id], onDelete: Cascade)
  content   String  @db.VarChar(2000)
  mediaUrls String[] @default([])
  videoId   String?  // optional: link a video
  likesCount    Int @default(0)
  commentsCount Int @default(0)
  createdAt DateTime @default(now())
  @@index([channelId, createdAt(sort: Desc)])
  @@map("channel_posts")
}

// ── REEL INTERACTIONS (for Bakra algorithm) ──────────────────
model ReelInteraction {
  id             String @id @default(cuid())
  userId         String
  reelId         String
  viewed         Boolean @default(false)
  watchDurationMs Int     @default(0)
  loopCount      Int     @default(0)
  liked          Boolean @default(false)
  commented      Boolean @default(false)
  shared         Boolean @default(false)
  saved          Boolean @default(false)
  dismissed      Boolean @default(false)
  completionRate Float?
  createdAt      DateTime @default(now())
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  reel Reel @relation(fields: [reelId], references: [id], onDelete: Cascade)
  @@unique([userId, reelId])
  @@index([reelId])
  @@map("reel_interactions")
}

// ── VIDEO INTERACTIONS (for Minbar algorithm) ────────────────
model VideoInteraction {
  id             String @id @default(cuid())
  userId         String
  videoId        String
  watchDurationSec Float  @default(0)
  completionRate Float    @default(0)
  liked          Boolean @default(false)
  disliked       Boolean @default(false)
  commented      Boolean @default(false)
  saved          Boolean @default(false)
  dismissed      Boolean @default(false)
  lastPosition   Float?   // resume playback
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  user  User  @relation(fields: [userId],  references: [id], onDelete: Cascade)
  video Video @relation(fields: [videoId], references: [id], onDelete: Cascade)
  @@unique([userId, videoId])
  @@index([videoId])
  @@map("video_interactions")
}
```

### Changes to Existing Models

```
User:
  + isDeactivated    Boolean @default(false)
  + deactivatedAt    DateTime?
  + messagePermission String @default("everyone")  // everyone | followers | none
  + Remove expoPushToken (now in Device model)
  + Add relations: followRequestsSent, followRequestsReceived, devices, profileLinks,
      userInterests, userSettings, threadBookmarks, videoBookmarks, watchHistory,
      watchLater, messageReactions, storyHighlightAlbums, callsInitiated,
      callParticipations, creatorStats, draftPosts, blockedKeywords, feedDismissals

Post:
  + isSensitive      Boolean @default(false)
  + altText          String?
  + scheduledAt      DateTime?
  + hideLikesCount   Boolean @default(false)
  + commentsDisabled Boolean @default(false)
  + Add relation: collabs PostCollab[]

Story:
  + highlightAlbumId String?  (FK to StoryHighlightAlbum)
  + stickerData      Json?    (stores sticker config: position, type, options, etc.)
  + closeFriendsOnly Boolean @default(false)
  + isArchived       Boolean @default(false)

Thread:
  + isPinned         Boolean @default(false)
  + isSensitive      Boolean @default(false)
  + altText          String?  (for media)
  + scheduledAt      DateTime?
  + hideLikesCount   Boolean @default(false)
  + Add relation: poll Poll?
  + Add relation: bookmarks ThreadBookmark[]

Comment (Saf):
  + isPinned         Boolean @default(false)   ← currently missing

ThreadReply:
  + isPinned         Boolean @default(false)

Message:
  + deliveredAt      DateTime?
  + isForwarded      Boolean @default(false)
  + forwardedFromId  String?
  + Add GIF to MessageType enum
  + Add STICKER to MessageType enum (already there actually)
  + editableUntil    DateTime?
  + Add relation: reactions MessageReaction[]

Reel:
  + originalReelId   String?   (for duets — ref to original reel)
  + isDuet           Boolean @default(false)
  + isStitch         Boolean @default(false)
  + isSensitive      Boolean @default(false)
  + scheduledAt      DateTime?
  + altText          String?
  + audioTrackId     String?   (FK to AudioTrack, replaces audioId/audioTitle/audioArtist)
  + Add relation: interactions ReelInteraction[]

Video:
  + Add relation: subtitles SubtitleTrack[]
  + Add relation: bookmarks VideoBookmark[]
  + Add relation: interactions VideoInteraction[]
  + Add relation: watchHistory WatchHistory[]

Hashtag:
  + reelsCount    Int @default(0)
  + threadsCount  Int @default(0)
  + videosCount   Int @default(0)

Notification:
  + threadId     String?  (FK to Thread)
  + reelId       String?  (FK to Reel)
  + videoId      String?  (FK to Video)
  + followRequestId String?
  (and add enum values: POLL_ENDED, COLLAB_INVITE, FOLLOW_REQUEST, CALL_MISSED,
   STORY_REACTION, STORY_MENTION, VIDEO_COMMENT, REEL_COMMENT, LIVE_INVITE)

Report:
  + reportedThreadId String?  (FK to Thread)
  + reportedReelId   String?  (FK to Reel)
  + reportedVideoId  String?  (FK to Video)
  + reportedCircleId String?  (FK to Circle)

ModerationLog:
  + targetReelId    String?
  + targetThreadId  String?
  + targetVideoId   String?
```

---

## 3. API Route Map — Complete

> All routes prefixed `/api/v1/`. All authenticated routes require `Authorization: Bearer <clerk_token>`.

### Auth
```
POST   /auth/register                  # Complete profile after Clerk signup
GET    /auth/me                        # Get current user (Clerk JWT → DB user)
GET    /auth/check-username            # ?username=foo → available: true/false
POST   /auth/interests                 # Set interest categories (onboarding)
GET    /auth/suggested-users           # Suggested accounts to follow (onboarding)
POST   /webhooks/clerk                 # Clerk user.updated webhook (sync to DB)
```

### Users
```
GET    /users/me                       # Own profile (with full settings)
PATCH  /users/me                       # Update own profile
DELETE /users/me                       # Deactivate account
DELETE /users/me/permanent             # Permanently delete account
GET    /users/:username                # Public profile
GET    /users/:username/posts          # User's posts (grid)
GET    /users/:username/reels          # User's reels
GET    /users/:username/threads        # User's threads
GET    /users/:username/videos         # User's videos (Minbar)
GET    /users/me/saved-posts           # Own saved/bookmarked posts
GET    /users/me/saved-threads         # Own bookmarked threads
GET    /users/me/saved-videos          # Own bookmarked videos
GET    /users/me/drafts                # Own draft posts
GET    /users/me/follow-requests       # Incoming follow requests
GET    /users/me/watch-history         # Watch history
GET    /users/me/watch-later           # Watch later list
GET    /users/me/analytics             # Creator analytics overview
GET    /users/me/analytics/:space      # Analytics per space (saf/bakra/majlis/minbar)
GET    /users/me/devices               # Registered push devices
DELETE /users/me/devices/:id           # Remove device
GET    /users/me/sessions              # Active login sessions (via Clerk)
GET    /users/me/qr-code               # Profile QR code data
```

### Profile Links
```
GET    /profile-links                  # Get own links
POST   /profile-links                  # Add link
PATCH  /profile-links/:id              # Update link
DELETE /profile-links/:id              # Remove link
PUT    /profile-links/reorder          # Reorder links
```

### Follows
```
POST   /follows/:userId                # Follow (or send request if private)
DELETE /follows/:userId                # Unfollow
GET    /follows/:userId/followers      # User's followers list
GET    /follows/:userId/following      # User's following list
GET    /follows/requests               # Own incoming follow requests
POST   /follows/requests/:id/accept    # Accept follow request
POST   /follows/requests/:id/decline   # Decline follow request
DELETE /follows/requests/:id           # Cancel sent follow request
GET    /follows/suggestions            # Suggested users (people you may know)
```

### Blocks & Mutes
```
POST   /blocks/:userId                 # Block user
DELETE /blocks/:userId                 # Unblock user
GET    /blocks                         # Own blocked list
POST   /mutes/:userId                  # Mute user
DELETE /mutes/:userId                  # Unmute user
GET    /mutes                          # Own muted list
```

### Settings
```
GET    /settings                       # Get all settings
PATCH  /settings/privacy               # Update privacy settings
PATCH  /settings/notifications         # Update notification preferences
PATCH  /settings/accessibility         # Update accessibility settings
PATCH  /settings/wellbeing             # Update wellbeing settings
GET    /settings/blocked-keywords      # Get filtered words list
POST   /settings/blocked-keywords      # Add keyword filter
DELETE /settings/blocked-keywords/:id  # Remove keyword filter
GET    /settings/data                  # Request data export
```

---

### Saf (Feed & Stories)
```
GET    /saf/feed/following             # Chronological following feed (cursor)
GET    /saf/feed/discover              # Algorithmic discovery feed (cursor)
POST   /saf/posts                      # Create post
GET    /saf/posts/:id                  # Get post
PATCH  /saf/posts/:id                  # Update post (caption/visibility only)
DELETE /saf/posts/:id                  # Delete post
POST   /saf/posts/:id/react            # React to post {reaction: LIKE|LOVE|SUPPORT|INSIGHTFUL}
DELETE /saf/posts/:id/react            # Remove reaction
POST   /saf/posts/:id/save             # Save to collection {collectionName}
DELETE /saf/posts/:id/save             # Unsave
POST   /saf/posts/:id/dismiss          # "Not interested"
GET    /saf/posts/:id/comments         # Get comments (cursor)
POST   /saf/posts/:id/comments         # Add comment
PATCH  /saf/posts/:id/comments/:cid    # Edit comment
DELETE /saf/posts/:id/comments/:cid    # Delete comment
POST   /saf/posts/:id/comments/:cid/react  # React to comment
POST   /saf/posts/:id/comments/:cid/pin    # Pin comment (post author only)
POST   /saf/posts/:id/collab-invite    # Invite collaborator {username}
POST   /saf/posts/:id/collab-accept    # Accept collab invite
POST   /saf/posts/:id/pin              # Pin to own profile
DELETE /saf/posts/:id/pin              # Unpin from profile

GET    /saf/stories/feed               # Stories from following (grouped by user)
POST   /saf/stories                    # Create story
DELETE /saf/stories/:id                # Delete story
POST   /saf/stories/:id/view           # Mark as viewed
GET    /saf/stories/:id/viewers        # Viewer list (own stories only)
POST   /saf/stories/:id/react          # Emoji reaction → goes to DM
POST   /saf/stories/:id/sticker-response  # Respond to poll/question sticker
GET    /saf/stories/highlights         # Get own highlight albums
POST   /saf/stories/highlights         # Create highlight album
PATCH  /saf/stories/highlights/:id     # Update album
DELETE /saf/stories/highlights/:id     # Delete album
POST   /saf/stories/highlights/:id/stories  # Add story to highlight
DELETE /saf/stories/highlights/:id/stories/:sid  # Remove from highlight

GET    /saf/collections                # Get own saved collections (names)
GET    /saf/collections/:name          # Posts in a named collection
```

---

### Bakra (Short Video)
```
GET    /bakra/feed/foryou              # For You algorithm feed
GET    /bakra/feed/following           # Following reels feed
POST   /bakra/reels                    # Upload reel
GET    /bakra/reels/:id                # Get reel
DELETE /bakra/reels/:id                # Delete reel
POST   /bakra/reels/:id/react          # React to reel
DELETE /bakra/reels/:id/react          # Remove reaction
POST   /bakra/reels/:id/view           # Log view signal {watchDurationMs, loopCount, completionRate}
POST   /bakra/reels/:id/dismiss        # Not interested
POST   /bakra/reels/:id/save           # Save reel
DELETE /bakra/reels/:id/save           # Unsave
GET    /bakra/reels/:id/comments       # Comments
POST   /bakra/reels/:id/comments       # Add comment
DELETE /bakra/reels/:id/comments/:cid  # Delete comment

GET    /bakra/sounds                   # Browse audio library (trending, recent, category)
GET    /bakra/sounds/:id               # Get audio track
GET    /bakra/sounds/trending          # Trending sounds
POST   /bakra/sounds                   # Upload original sound
```

---

### Majlis (Threads)
```
GET    /majlis/feed/foryou             # For You feed (cursor)
GET    /majlis/feed/following          # Following feed (cursor)
GET    /majlis/feed/trending           # Trending feed
GET    /majlis/trending                # Trending topics + hashtags
POST   /majlis/threads                 # Create thread
GET    /majlis/threads/:id             # Get thread + chain
PATCH  /majlis/threads/:id             # Edit thread (within 30 min)
DELETE /majlis/threads/:id             # Delete thread
POST   /majlis/threads/:id/react       # React
DELETE /majlis/threads/:id/react       # Remove reaction
POST   /majlis/threads/:id/repost      # Repost
DELETE /majlis/threads/:id/repost      # Undo repost
POST   /majlis/threads/:id/quote       # Quote thread
POST   /majlis/threads/:id/bookmark    # Bookmark {collectionName}
DELETE /majlis/threads/:id/bookmark    # Remove bookmark
POST   /majlis/threads/:id/dismiss     # Not interested
POST   /majlis/threads/:id/pin         # Pin to own profile
DELETE /majlis/threads/:id/pin         # Unpin
GET    /majlis/threads/:id/replies     # Thread replies (cursor)
POST   /majlis/threads/:id/replies     # Reply to thread
POST   /majlis/threads/:id/replies/:rid/pin   # Pin reply (thread author)

POST   /majlis/polls/:optionId/vote    # Vote on poll option
DELETE /majlis/polls/:threadId/vote    # Remove vote

GET    /majlis/lists                   # Own lists
POST   /majlis/lists                   # Create list
GET    /majlis/lists/:id               # Get list
PATCH  /majlis/lists/:id               # Update list
DELETE /majlis/lists/:id               # Delete list
GET    /majlis/lists/:id/members       # List members
POST   /majlis/lists/:id/members       # Add members {userIds: []}
DELETE /majlis/lists/:id/members/:uid  # Remove member
GET    /majlis/lists/:id/feed          # Threads from list members
```

---

### Risalah (Messaging)
```
GET    /risalah/conversations          # List conversations (with unread counts)
POST   /risalah/conversations          # Create DM or group
GET    /risalah/conversations/:id      # Get conversation details
PATCH  /risalah/conversations/:id      # Update group (name, avatar)
DELETE /risalah/conversations/:id      # Leave conversation
GET    /risalah/conversations/:id/messages   # Messages (cursor, newest first)
POST   /risalah/conversations/:id/messages   # Send message
PATCH  /risalah/conversations/:id/messages/:mid  # Edit message (within 15 min)
DELETE /risalah/conversations/:id/messages/:mid  # Delete message
POST   /risalah/conversations/:id/messages/:mid/react  # Add reaction {emoji}
DELETE /risalah/conversations/:id/messages/:mid/react  # Remove reaction {emoji}
POST   /risalah/conversations/:id/messages/:mid/pin    # Pin message (admins)
DELETE /risalah/conversations/:id/messages/:mid/pin    # Unpin message
POST   /risalah/conversations/:id/read       # Mark as read
POST   /risalah/conversations/:id/mute       # Mute conversation
POST   /risalah/conversations/:id/archive    # Archive
POST   /risalah/conversations/:id/pin        # Pin to top of list
GET    /risalah/conversations/:id/members    # Group members
POST   /risalah/conversations/:id/members    # Add members (group admin)
DELETE /risalah/conversations/:id/members/:uid  # Remove member (admin)
POST   /risalah/conversations/:id/admins/:uid   # Promote to admin
DELETE /risalah/conversations/:id/admins/:uid   # Demote from admin
GET    /risalah/conversations/:id/invite-link   # Get group invite link
POST   /risalah/join/:inviteCode               # Join group via invite link
PATCH  /risalah/conversations/:id/disappearing # Set disappearing timer {seconds: null|86400|604800}

GET    /risalah/broadcast-channels         # Joined broadcast channels
POST   /risalah/broadcast-channels         # Create broadcast channel
GET    /risalah/broadcast-channels/:slug   # Get channel
PATCH  /risalah/broadcast-channels/:slug   # Update channel
POST   /risalah/broadcast-channels/:slug/join    # Subscribe
DELETE /risalah/broadcast-channels/:slug/join    # Unsubscribe
POST   /risalah/broadcast-channels/:slug/messages  # Post to channel (admin only)

GET    /risalah/calls                      # Call history
POST   /risalah/calls                      # Initiate call {userId, callType}
GET    /risalah/calls/:id                  # Get call session
POST   /risalah/calls/:id/accept           # Accept call
POST   /risalah/calls/:id/decline          # Decline call
POST   /risalah/calls/:id/end              # End call
```

---

### Minbar (Long Video)
```
GET    /minbar/feed/subscriptions      # Subscription feed (channels I follow)
GET    /minbar/feed/recommended        # Recommendation engine
GET    /minbar/feed/trending           # Trending videos
GET    /minbar/discover                # Browse by category

POST   /minbar/videos                  # Upload video
GET    /minbar/videos/:id              # Get video
PATCH  /minbar/videos/:id              # Update video metadata
DELETE /minbar/videos/:id              # Delete video
POST   /minbar/videos/:id/publish      # Publish draft
POST   /minbar/videos/:id/react        # Like / dislike {isLike: boolean}
DELETE /minbar/videos/:id/react        # Remove reaction
POST   /minbar/videos/:id/view         # Log view progress {watchDurationSec, completionRate, lastPosition}
POST   /minbar/videos/:id/dismiss      # Not interested
POST   /minbar/videos/:id/save         # Save to Watch Later
DELETE /minbar/videos/:id/save         # Remove from Watch Later
GET    /minbar/videos/:id/comments     # Video comments (cursor)
POST   /minbar/videos/:id/comments     # Add comment {content, parentId?, timestamp?}
DELETE /minbar/videos/:id/comments/:cid  # Delete comment
POST   /minbar/videos/:id/comments/:cid/pin  # Pin comment
POST   /minbar/videos/:id/subtitles    # Upload subtitle track
GET    /minbar/videos/:id/subtitles    # List subtitle tracks

GET    /minbar/channels/:handle        # Get channel
POST   /minbar/channels                # Create channel
PATCH  /minbar/channels/:handle        # Update channel
POST   /minbar/channels/:handle/subscribe    # Subscribe
DELETE /minbar/channels/:handle/subscribe    # Unsubscribe
GET    /minbar/channels/:handle/videos       # Channel video list
GET    /minbar/channels/:handle/playlists    # Channel playlists
GET    /minbar/channels/:handle/community    # Community tab posts
POST   /minbar/channels/:handle/community    # Post to community tab
POST   /minbar/channels/:handle/trailer      # Set channel trailer {videoId}

POST   /minbar/playlists               # Create playlist
GET    /minbar/playlists/:id           # Get playlist
PATCH  /minbar/playlists/:id           # Update playlist
DELETE /minbar/playlists/:id           # Delete playlist
POST   /minbar/playlists/:id/videos    # Add video {videoId, position}
DELETE /minbar/playlists/:id/videos/:vid  # Remove video
PUT    /minbar/playlists/:id/reorder   # Reorder videos

GET    /minbar/watch-history           # Watch history (cursor)
DELETE /minbar/watch-history           # Clear all watch history
DELETE /minbar/watch-history/:videoId  # Remove single entry
```

---

### Live Sessions
```
GET    /live/active                    # List currently live sessions
POST   /live/sessions                  # Create live session (schedule or go live)
GET    /live/sessions/:id              # Get session info
POST   /live/sessions/:id/start        # Go live
POST   /live/sessions/:id/end          # End stream
POST   /live/sessions/:id/join         # Join as viewer/speaker
POST   /live/sessions/:id/leave        # Leave session
POST   /live/sessions/:id/invite/:uid  # Invite as co-host/speaker
```

---

### Circles
```
GET    /circles                        # Browse public circles + joined circles
GET    /circles/joined                 # Only my circles
POST   /circles                        # Create circle
GET    /circles/:slug                  # Get circle
PATCH  /circles/:slug                  # Update circle (owner/admin)
DELETE /circles/:slug                  # Disband circle (owner only)
POST   /circles/:slug/join             # Join public circle
DELETE /circles/:slug/join             # Leave circle
GET    /circles/:slug/members          # Member list
POST   /circles/:slug/members          # Add member (admin)
DELETE /circles/:slug/members/:uid     # Remove member (admin)
POST   /circles/:slug/invites          # Create invite link
GET    /circles/join/:code             # Get circle info from invite code
POST   /circles/join/:code             # Join via invite
GET    /circles/:slug/feed             # Circle feed (posts + threads)
```

---

### Search
```
GET    /search                         # ?q=&type=users|posts|reels|threads|videos|channels|hashtags&cursor=
GET    /search/trending                # Trending topics (unified all spaces)
GET    /search/suggestions             # People you may know
GET    /search/history                 # Own recent search history
DELETE /search/history                 # Clear all search history
DELETE /search/history/:id             # Clear single entry
GET    /hashtags/:tag                  # Hashtag page (top posts, reels, threads, videos)
```

---

### Notifications
```
GET    /notifications                  # Notification feed (grouped, cursor)
GET    /notifications/unread-count     # Badge count
POST   /notifications/:id/read         # Mark read
POST   /notifications/read-all         # Mark all read
DELETE /notifications/:id              # Delete notification
```

---

### Media
```
POST   /media/upload-url               # Get presigned Cloudflare R2 upload URL
                                       # {type:'image'|'video'|'reel'|'audio', space:'saf'|'bakra'|'minbar'}
POST   /media/video-upload             # Get Cloudflare Stream upload URL (TUS protocol)
POST   /media/image-upload             # Get Cloudflare Images upload URL
POST   /webhooks/cloudflare-stream     # Stream transcoding complete → update Reel/Video status
```

---

### Stickers
```
GET    /stickers/packs                 # Available sticker packs
GET    /stickers/packs/my              # My added packs
POST   /stickers/packs/:id/add         # Add pack to my collection
DELETE /stickers/packs/:id/remove      # Remove pack
GET    /stickers/packs/:id             # Pack detail + stickers
```

---

### Reports
```
POST   /reports                        # Submit report {contentType, contentId, reason, description}
GET    /reports/my                     # My submitted reports
```

---

### Admin (Role: MODERATOR | ADMIN)
```
GET    /admin/reports                  # All pending reports
GET    /admin/reports/:id              # Report detail
POST   /admin/reports/:id/resolve      # Resolve {action, explanation}
POST   /admin/reports/:id/dismiss      # Dismiss

GET    /admin/users                    # User list with filters
GET    /admin/users/:id                # User detail
POST   /admin/users/:id/warn           # Issue warning
POST   /admin/users/:id/mute           # Temp mute
POST   /admin/users/:id/ban            # Ban {duration?, reason, explanation}
POST   /admin/users/:id/unban          # Unban

GET    /admin/content/flagged          # Auto-flagged content queue
POST   /admin/content/:type/:id/remove # Remove content
POST   /admin/content/:type/:id/restore # Restore content

GET    /admin/stats                    # Platform stats overview
```

---

### Health
```
GET    /health                         # Service health check (for Railway)
GET    /health/db                      # DB connectivity check
```

---

## 4. Mobile Screen Map — Complete

```
app/
├── _layout.tsx                        # Root: ClerkProvider, QueryClient, GestureHandler
│
├── (auth)/
│   ├── _layout.tsx                    # Auth stack (no tab bar)
│   ├── welcome.tsx                    # Splash/Welcome screen
│   ├── login.tsx                      # Clerk sign-in (email / Google / Apple)
│   ├── register.tsx                   # Username + display name selection
│   ├── onboarding.tsx                 # Interest categories (grid of 12 tiles)
│   └── suggested.tsx                  # Suggested users to follow
│
├── (tabs)/
│   ├── _layout.tsx                    # Bottom tab bar (Saf|Bakra|+|Majlis|Risalah)
│   ├── saf.tsx                        # Home feed (Following/For You toggle, Stories row, Post cards)
│   ├── bakra.tsx                      # Full-screen reel swipe feed (V1.1)
│   ├── create.tsx                     # Triggers CreateSheet bottom sheet
│   ├── majlis.tsx                     # Thread feed (For You/Following/Trending tabs)
│   └── risalah.tsx                    # Conversation list (Chats/Groups/Channels tabs)
│
└── (screens)/
    │
    ├── post/
    │   └── [id].tsx                   # Post detail + full comments thread
    ├── reel/
    │   └── [id].tsx                   # Single reel expanded view
    ├── thread/
    │   └── [id].tsx                   # Thread detail + replies tree
    │
    ├── video/
    │   └── [id].tsx                   # Minbar video player (fullscreen, chapters, comments)
    ├── channel/
    │   └── [handle].tsx               # Channel page (About/Videos/Playlists/Community tabs)
    ├── minbar/
    │   └── index.tsx                  # Minbar home (trending/categories/subscriptions)
    │
    ├── profile/
    │   ├── [username].tsx             # Public profile (Posts/Reels/Threads/Videos tabs)
    │   ├── edit.tsx                   # Edit own profile
    │   ├── followers.tsx              # Followers list (with follow-back)
    │   ├── following.tsx              # Following list
    │   ├── links.tsx                  # Manage profile links
    │   └── qr-code.tsx                # Profile QR code (show + share)
    │
    ├── chat/
    │   └── [id].tsx                   # Chat conversation (messages, media, voice notes)
    ├── group/
    │   ├── [id].tsx                   # Group chat
    │   ├── [id]/info.tsx              # Group info (members, settings)
    │   └── [id]/invite.tsx            # Invite link screen
    ├── broadcast/
    │   └── [slug].tsx                 # Broadcast channel view
    ├── new-chat.tsx                   # New DM (search contacts)
    ├── new-group.tsx                  # Create group (select members → set name)
    │
    ├── create/
    │   ├── post.tsx                   # Post composer (text, image picker, carousel)
    │   ├── reel.tsx                   # Reel recorder + editor (camera, trim, audio)
    │   ├── thread.tsx                 # Thread composer (chain support, polls)
    │   ├── video.tsx                  # Video upload for Minbar (title, description, category)
    │   ├── story.tsx                  # Story creator (camera/gallery, stickers, text)
    │   └── live.tsx                   # Go live / schedule live
    │
    ├── comments/
    │   └── [postId].tsx               # Full-screen comment sheet (alternative to in-post)
    │
    ├── hashtag/
    │   └── [tag].tsx                  # Hashtag page (top/recent content grid)
    │
    ├── circle/
    │   ├── [slug].tsx                 # Circle home (feed + about + members)
    │   ├── [slug]/members.tsx         # Full member list
    │   └── [slug]/invite.tsx          # Invite to circle
    ├── circles/
    │   └── index.tsx                  # Browse + create circles
    │
    ├── discover/
    │   └── index.tsx                  # Explore grid (visual) + topic channels + trending
    │
    ├── search/
    │   └── index.tsx                  # Search bar + results (People/Posts/Tags tabs)
    │
    ├── notifications/
    │   └── index.tsx                  # Activity feed (grouped, with avatars)
    │
    ├── lists/
    │   ├── index.tsx                  # My Majlis lists
    │   ├── new.tsx                    # Create list
    │   ├── [id].tsx                   # List detail + add/remove members
    │   └── [id]/feed.tsx              # List feed (threads from members)
    │
    ├── follow-requests/
    │   └── index.tsx                  # Incoming follow request list (accept/decline)
    │
    ├── drafts/
    │   └── index.tsx                  # All saved drafts by space
    │
    ├── saved/
    │   ├── index.tsx                  # Saved collections overview
    │   └── [collection].tsx           # Posts in a named collection
    │
    ├── stickers/
    │   └── index.tsx                  # Browse + add sticker packs
    │
    ├── call/
    │   └── [id].tsx                   # Active call screen (voice + video)
    │
    └── settings/
        ├── index.tsx                  # Settings home (navigation list)
        ├── privacy.tsx                # Privacy settings
        ├── notifications.tsx          # Per-type notification toggles
        ├── security.tsx               # 2FA, login activity, trusted devices
        ├── blocked.tsx                # Blocked accounts
        ├── muted.tsx                  # Muted accounts
        ├── filtered-words.tsx         # Keyword blocklist
        ├── language.tsx               # App language + RTL toggle
        ├── theme.tsx                  # Dark / Light / System
        ├── accessibility.tsx          # Text size, reduced motion, contrast
        ├── wellbeing.tsx              # Screen time, usage dashboard
        ├── islamic.tsx                # Islamic features (prayer times, Hijri, etc.)
        ├── data.tsx                   # Download data, deactivate, delete account
        └── about.tsx                  # Version, Terms, Privacy Policy, Guidelines
```

---

## 5. Mobile Component Architecture

```
src/
├── components/
│   ├── ui/                            # Primitive design system components
│   │   ├── Button.tsx                 # Variants: primary, secondary, ghost, danger, icon
│   │   ├── Input.tsx                  # Text input with label, error, RTL support
│   │   ├── Avatar.tsx                 # Sizes: xs-3xl, with verification badge
│   │   ├── Badge.tsx                  # Notification badge, count badge
│   │   ├── Sheet.tsx                  # Bottom sheet (wraps gesture + blur)
│   │   ├── Modal.tsx                  # Full modal overlay
│   │   ├── Skeleton.tsx               # Loading skeleton placeholders
│   │   ├── Toast.tsx                  # In-app toast notifications
│   │   ├── Tabs.tsx                   # Horizontal scrollable tab bar
│   │   ├── Divider.tsx
│   │   ├── Card.tsx                   # Base card container
│   │   ├── EmptyState.tsx             # Empty state with icon + cta
│   │   ├── ErrorBoundary.tsx
│   │   ├── LoadingSpinner.tsx
│   │   ├── ActionMenu.tsx             # BottomSheet action list (3-dot menus)
│   │   └── VerifiedBadge.tsx          # Emerald checkmark
│   │
│   ├── shared/                        # Cross-space shared components
│   │   ├── RTLText.tsx                # Text with auto-RTL direction
│   │   ├── UserListItem.tsx           # User row (avatar + name + follow btn)
│   │   ├── HashtagText.tsx            # Text with tappable #hashtags + @mentions
│   │   ├── MediaViewer.tsx            # Full-screen image/video viewer
│   │   ├── ImageGrid.tsx              # 1/2/3/4+ image carousel grid
│   │   ├── VideoPlayer.tsx            # Base video player (expo-av)
│   │   ├── AudioPlayer.tsx            # Voice note player
│   │   ├── ReactionBar.tsx            # Like/react row (long-press for options)
│   │   ├── CommentInput.tsx           # Keyboard-aware comment input bar
│   │   ├── ShareSheet.tsx             # Native share + in-app share targets
│   │   ├── ReportSheet.tsx            # Report flow bottom sheet
│   │   ├── FollowButton.tsx           # Follow / Following / Requested states
│   │   ├── PullToRefresh.tsx          # Refresh control wrapper
│   │   ├── InfiniteList.tsx           # FlashList with cursor pagination
│   │   ├── SensitiveContentBlur.tsx   # Blur overlay for sensitive content
│   │   └── LinkPreview.tsx            # URL preview card
│   │
│   ├── saf/
│   │   ├── PostCard.tsx               # Full post card (header + media + actions)
│   │   ├── PostMedia.tsx              # Media renderer (image/video/carousel)
│   │   ├── PostActions.tsx            # Like/comment/share/bookmark action row
│   │   ├── PostHeader.tsx             # Avatar + name + time + 3-dot menu
│   │   ├── FeedList.tsx               # FlashList of PostCards
│   │   ├── StoryRow.tsx               # Horizontal story bubbles row
│   │   ├── StoryBubble.tsx            # Single story ring indicator
│   │   ├── StoryViewer.tsx            # Full-screen story player
│   │   ├── StoryProgress.tsx          # Top progress bars
│   │   ├── StorySticker.tsx           # Renders a sticker overlay on story
│   │   ├── StoryStickerPoll.tsx       # Poll sticker
│   │   ├── StoryStickerQuestion.tsx   # Question sticker
│   │   ├── StoryStickerCountdown.tsx  # Countdown sticker
│   │   ├── StoryStickerAddYours.tsx   # Add Yours chain sticker
│   │   ├── HighlightRow.tsx           # Profile highlights row
│   │   ├── HighlightBubble.tsx        # Single highlight
│   │   └── CommentCard.tsx            # Single comment with replies
│   │
│   ├── bakra/
│   │   ├── ReelPlayer.tsx             # Full-screen reel with autoplay
│   │   ├── ReelOverlay.tsx            # Caption, hashtags, audio info (bottom left)
│   │   ├── ReelActions.tsx            # Like/comment/share/save (right side)
│   │   ├── ReelProgressBar.tsx        # Bottom progress indicator
│   │   ├── AudioInfo.tsx              # Scrolling audio title bar
│   │   ├── ReelFeed.tsx               # Vertical swipe FlatList
│   │   └── SoundCard.tsx              # Audio library item
│   │
│   ├── majlis/
│   │   ├── ThreadCard.tsx             # Thread card with actions
│   │   ├── ThreadComposer.tsx         # Create/edit thread input
│   │   ├── ThreadChain.tsx            # Multi-part thread display
│   │   ├── ThreadActions.tsx          # Reply/repost/like/bookmark/share row
│   │   ├── TrendingBar.tsx            # Horizontal trending topics
│   │   ├── PollCard.tsx               # Poll display + vote UI
│   │   ├── QuoteCard.tsx              # Embedded quoted thread
│   │   └── RepostCard.tsx             # Repost wrapper
│   │
│   ├── risalah/
│   │   ├── ConversationItem.tsx       # Chat list row (avatar, name, preview, time, badge)
│   │   ├── MessageBubble.tsx          # Single message (sent/received, reactions, reply)
│   │   ├── MessageList.tsx            # Virtualized message history
│   │   ├── MessageInput.tsx           # Multi-mode input (text/voice/media/gif/sticker)
│   │   ├── VoiceRecorder.tsx          # Hold-to-record voice note
│   │   ├── TypingIndicator.tsx        # "User is typing…" animated dots
│   │   ├── MessageReactions.tsx       # Reaction bubble strip on message
│   │   ├── GifPicker.tsx              # Giphy/Tenor integration
│   │   ├── StickerPicker.tsx          # Sticker pack browser
│   │   └── CallBanner.tsx             # Incoming call overlay
│   │
│   ├── minbar/
│   │   ├── VideoCard.tsx              # Thumbnail card (YouTube-style)
│   │   ├── VideoPlayer.tsx            # Minbar video player (chapters, quality, captions)
│   │   ├── ChannelHeader.tsx          # Channel banner + subscribe
│   │   ├── PlaylistCard.tsx           # Playlist thumbnail + count
│   │   ├── VideoChapters.tsx          # Chapter list / seekbar markers
│   │   ├── EndScreen.tsx              # End screen suggestions
│   │   └── CommunityPost.tsx          # Channel community tab post
│   │
│   ├── live/
│   │   ├── LiveBadge.tsx              # "LIVE" indicator
│   │   ├── LiveOverlay.tsx            # Viewer count, chat, gifts
│   │   ├── LiveChatBubble.tsx         # Chat message in live
│   │   └── AudioSpaceCard.tsx         # Audio space preview card
│   │
│   └── create/
│       ├── CreateSheet.tsx            # Fan-out bottom sheet (Post/Reel/Thread/Video/Story/Live)
│       ├── PostComposer.tsx           # Full post editor
│       ├── ThreadComposerSheet.tsx    # Thread draft builder
│       ├── CameraView.tsx             # In-app camera (photo + video modes)
│       ├── MediaPicker.tsx            # Gallery picker with multi-select
│       ├── ImageEditor.tsx            # Crop, filter, alt text
│       ├── VideoTrimmer.tsx           # Reel trim UI
│       ├── AudioPicker.tsx            # Browse audio library for Bakra
│       └── PollBuilder.tsx            # Add poll to thread
│
├── hooks/
│   ├── useAuth.ts                     # Clerk + DB user sync
│   ├── useSocket.ts                   # Socket.io connection + room management
│   ├── useSafFeed.ts                  # Saf feed with infinite query
│   ├── useBakraFeed.ts                # Bakra For You / Following
│   ├── useMajlisFeed.ts               # Majlis feed with 3 types
│   ├── useMinbarFeed.ts               # Minbar recommendations
│   ├── useStories.ts                  # Stories feed + view tracking
│   ├── usePost.ts                     # Post detail, react, comment, save
│   ├── useReel.ts                     # Reel detail, view logging, react
│   ├── useThread.ts                   # Thread detail, replies, react, repost
│   ├── useVideo.ts                    # Video player, progress, watch history
│   ├── useProfile.ts                  # User profile + follow state
│   ├── useMessages.ts                 # Conversation messages + send
│   ├── useNotifications.ts            # Notifications + badge count
│   ├── useSearch.ts                   # Search with debounce
│   ├── useCamera.ts                   # Camera permissions + capture
│   ├── useMediaPicker.ts              # Gallery access + multi-select
│   ├── useRTL.ts                      # RTL detection + layout helpers
│   ├── usePushNotifications.ts        # Expo push token registration
│   ├── useDeepLink.ts                 # Handle mizanly:// deep links
│   ├── useHaptics.ts                  # Haptic feedback helpers
│   └── useTheme.ts                    # Theme tokens + dark/light switch
│
├── stores/
│   ├── authStore.ts                   # user, isAuthenticated, token, setUser
│   ├── safStore.ts                    # feedType, activeStory, createSheetOpen
│   ├── bakraStore.ts                  # activeReelIndex, mutedState, feedType
│   ├── majlisStore.ts                 # feedType, composerOpen, draftThread
│   ├── risalahStore.ts                # activeConversation, onlineUsers, typingUsers
│   ├── minbarStore.ts                 # activeVideo, playerState, volume
│   ├── notificationsStore.ts          # unreadCount, lastFetched
│   ├── settingsStore.ts               # theme, language, isRTL, accessibility flags
│   └── uiStore.ts                     # toasts, modals, bottomSheets
│
├── api/
│   ├── client.ts                      # Base fetch client (auth header injection)
│   ├── auth.api.ts
│   ├── users.api.ts
│   ├── follows.api.ts
│   ├── settings.api.ts
│   ├── saf/
│   │   ├── posts.api.ts
│   │   └── stories.api.ts
│   ├── bakra/
│   │   ├── reels.api.ts
│   │   └── sounds.api.ts
│   ├── majlis/
│   │   ├── threads.api.ts
│   │   └── lists.api.ts
│   ├── risalah/
│   │   ├── conversations.api.ts
│   │   ├── messages.api.ts
│   │   └── calls.api.ts
│   ├── minbar/
│   │   ├── videos.api.ts
│   │   └── channels.api.ts
│   ├── live.api.ts
│   ├── circles.api.ts
│   ├── notifications.api.ts
│   ├── search.api.ts
│   ├── media.api.ts
│   └── stickers.api.ts
│
└── lib/
    ├── constants.ts                   # App-wide constants
    ├── theme.ts                       # Design tokens (colors, fonts, spacing)
    ├── i18n.ts                        # i18next setup + language detection
    ├── rtl.ts                         # RTL helpers, I18nManager
    ├── formatters.ts                  # Date, number, duration formatters
    ├── validators.ts                  # Input validation (username, url, etc.)
    ├── socket.ts                      # Socket.io singleton
    ├── deeplinks.ts                   # Route mapping for mizanly:// URLs
    ├── haptics.ts                     # Haptic feedback presets
    └── analytics.ts                   # Event tracking (PostHog / Mixpanel)
```

---

## 6. State Management

### What lives where

| Data | Store/Method | Why |
|------|-------------|-----|
| Logged-in user | Zustand `authStore` | Global, rarely changes |
| Feed posts/reels | React Query + FlashList | Paginated, server-driven |
| Active story | Zustand `safStore` | UI state for story viewer |
| Unread counts | Zustand `notificationsStore` | Badge display across tabs |
| Typing indicators | Zustand `risalahStore` | Ephemeral socket events |
| Online users | Zustand `risalahStore` | Updated via socket |
| Theme / language | Zustand `settingsStore` + MMKV persist | Persisted across launches |
| Active video state | Zustand `minbarStore` | Player state machine |
| Conversation messages | React Query + socket updates | Paginated + real-time merge |
| Search results | React Query (no cache) | Fresh on each query |
| Draft posts | Zustand `safStore` + MMKV persist | Survives app close |
| Toast queue | Zustand `uiStore` | Global toast system |

---

## 7. Real-time Events (Socket.io)

```typescript
// Namespaces
/chat       — Risalah messaging
/live       — Live sessions
/presence   — Online status (user online/offline/last seen)
/notifications — Push to client when new notification arrives

// ── RISALAH (/chat namespace) ──
Client → Server:
  join_conversation    { conversationId }
  leave_conversation   { conversationId }
  send_message         { conversationId, content, type, replyToId?, mediaUrl? }
  typing_start         { conversationId }
  typing_stop          { conversationId }
  mark_read            { conversationId }
  message_reaction     { messageId, emoji, action: 'add'|'remove' }
  call_initiate        { userId, callType }
  call_accept          { sessionId }
  call_decline         { sessionId }
  call_end             { sessionId }

Server → Client:
  new_message          { message, conversationId }
  message_delivered    { messageId, conversationId }
  messages_read        { conversationId, userId, readAt }
  user_typing          { conversationId, userId }
  user_stopped_typing  { conversationId, userId }
  reaction_added       { messageId, userId, emoji }
  reaction_removed     { messageId, userId, emoji }
  message_edited       { messageId, newContent, editedAt }
  message_deleted      { messageId, conversationId }
  incoming_call        { sessionId, callerId, callType }
  call_accepted        { sessionId }
  call_declined        { sessionId }
  call_ended           { sessionId }

// ── PRESENCE (/presence namespace) ──
Server → Client:
  user_online          { userId }
  user_offline         { userId, lastSeenAt }

// ── NOTIFICATIONS (/notifications namespace) ──
Server → Client:
  notification_new     { notification }
  unread_count         { count }

// ── LIVE (/live namespace) ──
Client → Server:
  join_live            { sessionId }
  leave_live           { sessionId }
  live_chat            { sessionId, message }
  speaker_request      { sessionId }

Server → Client:
  viewer_joined        { sessionId, userId, viewerCount }
  viewer_left          { sessionId, userId, viewerCount }
  live_chat_message    { sessionId, message, user }
  live_ended           { sessionId }
  speaker_approved     { sessionId, userId }
  speaker_revoked      { sessionId, userId }
```

---

## 8. Background Jobs & Webhooks

> Use **BullMQ** (Redis-backed) in NestJS for all async work.

### Job Queues

| Queue | Jobs | Trigger |
|-------|------|---------|
| `notifications` | Send push (Expo), create DB notification, group + batch | Any reaction, follow, comment, etc. |
| `media` | Update reel/video status after Cloudflare transcodes, generate thumbnails | Cloudflare webhook |
| `search-index` | Index new post/reel/thread/video in Meilisearch | Content created/deleted |
| `feed-cache` | Invalidate + rebuild feed cache for affected users | New post from followed account |
| `analytics` | Aggregate daily creator stats snapshot | Daily cron at 00:00 UTC |
| `cleanup` | Delete expired stories, expired messages, old sessions | Hourly cron |
| `email` | Send email digest (Resend) | Weekly cron per user setting |
| `hashtag-counts` | Recalculate hashtag post counts | Batch every 15 min |

### Webhook Endpoints

```
POST /webhooks/clerk                   # User updated/deleted in Clerk → sync to DB
POST /webhooks/cloudflare-stream       # Video transcoding complete → update status
POST /webhooks/cloudflare-images       # Image processing complete
```

### Cron Jobs

```
0  0 * * *   analytics:snapshot        # Daily creator stats
0  * * * *   cleanup:stories           # Delete expired stories (expiresAt < now)
0  * * * *   cleanup:messages          # Delete expired (disappearing) messages
*/15 * * * * hashtags:recalculate      # Batch hashtag count update
0  6 * * 0   email:weekly-digest       # Weekly email digest
```

---

## 9. Islamic Features Spec

> These are Mizanly's differentiators. No other platform has these.

### Phase 1 — At Launch (MVP)

**Content Categories**
- Dedicated interest categories: Islamic Education, Quran & Tafsir, Hadith, Islamic History, Fiqh, Dawah, Muslim Lifestyle, Halal Food, Modest Fashion, Islamic Art & Calligraphy
- Quran verse sharing card (formatted, with translation, shareable as image)
- Hadith sharing card (same format)

**Moderation — The Mizan Standard**
- Every content removal includes a written explanation to the user (already in schema)
- Every ban includes a written explanation + appeal process
- Community Guidelines grounded in Islamic ethics and universal respect
- Haram content filter: dedicated report reasons aligned with Islamic values
- All audio tracks tagged `isHalal: boolean` (default true, flagged when reported)

**Language**
- Full RTL layout for Arabic, Urdu, Farsi users
- Arabic-first UI option (Arabic as primary language for Muslim users)
- 7 languages at launch: Arabic, English, Turkish, Urdu, Malay, French, Indonesian

### Phase 2 — V1.1

**Prayer Times Integration**
- Opt-in: detect location (or manual city), show next prayer time in notifications
- Customizable Adhan notification (5 daily prayers)
- "Pause" notification: optionally silence all Mizanly notifications during Salah times
- Settings: `settings/islamic.tsx` with prayer calc method, notification sounds

**Hijri Calendar**
- Display Hijri date alongside Gregorian on profile createdAt, post dates
- Hijri date formatting in all timestamps (toggle in settings)
- Islamic event markers: Ramadan, Eid al-Fitr, Eid al-Adha, Ashura, etc.
- Ramadan Mode: themed UI during Ramadan month

**Halal Indicators**
- Restaurants / food posts: optional "Halal Certified" tag
- Business profiles: show halal certification badge
- Food category posts get a halal badge if creator has added it

### Phase 3 — V2.0

**Duas & Dhikr**
- Daily Dua notification (from curated collection, user selects categories)
- Tasbih counter (digital dhikr counter, in-app)
- Dua Library: searchable, shareable
- "Send a Dua" feature: send dua to someone's profile (like a blessing)

**Qibla & Islamic Tools**
- Qibla compass (geolocation-based)
- 99 Names of Allah with meanings
- Quran audio player (integrated in Minbar for Quran channels)

**Community Features**
- Mosque/Islamic center profiles (verified business accounts)
- Event pages for Islamic events (Eid prayer, lectures, Ramadan programs)
- Waqf / Charity integration (donate to verified Islamic charities)

---

## 10. Design System Reference

### Colors

```typescript
// Brand
emerald:      '#0A7B4F'   // Primary CTA, active states, verification
emeraldLight: '#0D9B63'   // Hover/pressed states
emeraldDark:  '#065F3B'   // Deep emerald (dark headers)
emeraldGlow:  '#12C97B'   // Glow effects, highlights
gold:         '#C8963E'   // Accents, bookmarks, premium, gold badges
goldLight:    '#D4A94F'   // Gold hover
cream:        '#FEFCF7'   // Light mode background

// Dark Mode (primary)
bg:           '#0B0F14'   // Root background
bgElevated:   '#131920'   // Elevated surfaces (tab bar bg, cards)
bgCard:       '#182030'   // Card backgrounds
bgSheet:      '#1A2236'   // Bottom sheets
surface:      '#243044'   // Input backgrounds, secondary surface
border:       '#2A3546'   // Dividers, borders
borderLight:  '#3A4A5E'   // Subtle borders

// Light Mode
bgLight:      '#FFFFFF'
bgElevatedLight: '#F8F7F4'
bgCardLight:  '#F0EEE9'
borderLightMode: '#E8E6E1'

// Text
textPrimary:  '#F0F3F7'   // (dark) / '#1A1A2E' (light)
textSecondary:'#8A95A5'   // (dark) / '#3D3D56' (light)
textTertiary: '#5E6A78'   // (dark) / '#7A7A8E' (light)

// Semantic
error:   '#F04040'
warning: '#D29922'
success: '#0A7B4F'   // = emerald
info:    '#58A6FF'
live:    '#FF3B3B'
online:  '#0FD074'
```

### Typography

```
Heading:  Playfair Display  — weights 400/600/700/900
Body:     DM Sans           — weights 300/400/500/600/700
Arabic:   Noto Naskh Arabic — weights 400/500/600/700
Mono:     JetBrains Mono    — weights 400/500
```

### Spacing Scale

```
4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64
```

### Border Radius

```
sm: 6   md: 10   lg: 16   xl: 24   2xl: 32   full: 9999
```

### Deep Link Scheme

```
mizanly://                             → Home (Saf feed)
mizanly://post/{id}
mizanly://reel/{id}
mizanly://thread/{id}
mizanly://video/{id}
mizanly://profile/{username}
mizanly://channel/{handle}
mizanly://circle/{slug}
mizanly://hashtag/{tag}
mizanly://chat/{conversationId}
mizanly://broadcast/{slug}
mizanly://live/{sessionId}
mizanly://invite/{circleCode}          → Join circle via invite
mizanly://group-invite/{code}          → Join group chat via invite
```

### App.json Expo Config Keys

```json
{
  "scheme": "mizanly",
  "ios": { "bundleIdentifier": "app.mizanly.ios" },
  "android": { "package": "app.mizanly.android" }
}
```

---

## Summary: What Gets Built in What Order

| Week | Focus |
|------|-------|
| 1 | DB schema finalized + migrated. Clerk webhook. ClerkAuthGuard. Users + Settings API. |
| 2 | Auth screens (login, register, onboarding, suggested). Profile screen. Edit profile. |
| 3 | Saf feed API (posts, stories). PostCard, StoryRow, FeedList components. |
| 4 | Post create flow (composer, media picker, camera). Story create + sticker system. |
| 5 | Post detail screen. Comments (create, nested, pin, react). |
| 6 | Majlis feed API (threads, polls, trending). ThreadCard, feed screen, composer. |
| 7 | Thread detail (replies, reposts, quotes, polls). Majlis lists. |
| 8 | Risalah API (DMs, groups, real-time). Chat screen, message components. |
| 9 | Story reactions → DM. Group management. Broadcast channels. |
| 10 | Search + Explore screen. Notifications screen (grouped). Circles. |
| 11 | Settings (privacy, notifications, security, blocked/muted, accessibility). Follow requests. |
| 12 | Deep links. Push notifications. Draft posts. QR codes. Bug fixes. Polish. Launch. |
