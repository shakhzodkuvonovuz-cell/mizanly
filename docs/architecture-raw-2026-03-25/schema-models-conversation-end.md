# Prisma Schema Models: Conversation through End of File (Lines 1599-4704)

> Extracted from `apps/api/prisma/schema.prisma`
> Total models in this section: 131
> Covers: Messaging, Broadcast, Live, Communities, Notifications, Moderation, Social Graph, Feed, Polls, Media, Settings, Events, Monetization, Audio, 2FA, Encryption, Coins, Islamic, Wellbeing, Video, Gamification, Commerce, Community Safety, AI, Mosque, Scholar, and more.

---

## Table of Contents

1. [Conversation](#conversation) (line 1599)
2. [ConversationMember](#conversationmember) (line 1628)
3. [Message](#message) (line 1649)
4. [BroadcastChannel](#broadcastchannel) (line 1702)
5. [ChannelMember](#channelmember) (line 1720)
6. [BroadcastMessage](#broadcastmessage) (line 1734)
7. [LiveSession](#livesession) (line 1758)
8. [LiveParticipant](#liveparticipant) (line 1791)
9. [LiveGuest](#liveguest) (line 1806)
10. [Circle](#circle) (line 1832)
11. [CircleMember](#circlemember) (line 1866)
12. [CircleInvite](#circleinvite) (line 1879)
13. [Notification](#notification) (line 1900)
14. [Report](#report) (line 1943)
15. [ModerationLog](#moderationlog) (line 1980)
16. [Block](#block) (line 2013)
17. [Mute](#mute) (line 2025)
18. [Hashtag](#hashtag) (line 2041)
19. [FeedInteraction](#feedinteraction) (line 2060)
20. [FollowRequest](#followrequest) (line 2087)
21. [Poll](#poll) (line 2103)
22. [PollOption](#polloption) (line 2117)
23. [PollVote](#pollvote) (line 2131)
24. [AudioTrack](#audiotrack) (line 2143)
25. [ThreadBookmark](#threadbookmark) (line 2159)
26. [VideoBookmark](#videobookmark) (line 2171)
27. [WatchHistory](#watchhistory) (line 2183)
28. [WatchLater](#watchlater) (line 2198)
29. [MessageReaction](#messagereaction) (line 2210)
30. [StoryHighlightAlbum](#storyhighlightalbum) (line 2224)
31. [StoryStickerResponse](#storystickerresponse) (line 2238)
32. [UserInterest](#userinterest) (line 2252)
33. [FeedDismissal](#feeddismissal) (line 2264)
34. [DraftPost](#draftpost) (line 2277)
35. [ProfileLink](#profilelink) (line 2290)
36. [Device](#device) (line 2303)
37. [CallSession](#callsession) (line 2324)
38. [CallParticipant](#callparticipant) (line 2345)
39. [StickerPack](#stickerpack) (line 2360)
40. [Sticker](#sticker) (line 2375)
41. [UserStickerPack](#userstickerpack) (line 2388)
42. [GeneratedSticker](#generatedsticker) (line 2400)
43. [AltProfile](#altprofile) (line 2413)
44. [AltProfileAccess](#altprofileaccess) (line 2427)
45. [MajlisList](#majlislist) (line 2440)
46. [MajlisListMember](#majlislistmember) (line 2456)
47. [PostCollab](#postcollab) (line 2468)
48. [BlockedKeyword](#blockedkeyword) (line 2482)
49. [CreatorStat](#creatorstat) (line 2494)
50. [UserSettings](#usersettings) (line 2511)
51. [SubtitleTrack](#subtitletrack) (line 2548)
52. [ChannelPost](#channelpost) (line 2562)
53. [ReelInteraction](#reelinteraction) (line 2581)
54. [VideoInteraction](#videointeraction) (line 2600)
55. [Event](#event) (line 2623)
56. [EventRSVP](#eventrsvp) (line 2650)
57. [Tip](#tip) (line 2664)
58. [MembershipTier](#membershiptier) (line 2686)
59. [MembershipSubscription](#membershipsubscription) (line 2704)
60. [AudioRoom](#audioroom) (line 2720)
61. [AudioRoomParticipant](#audioroomparticipant) (line 2744)
62. [TwoFactorSecret](#twofactorsecret) (line 2760)
63. [StoryChain](#storychain) (line 2778)
64. [StoryChainEntry](#storychainentry) (line 2794)
65. [ReelTemplate](#reeltemplate) (line 2810)
66. [VideoReply](#videoreply) (line 2831)
67. [EncryptionKey](#encryptionkey) (line 2855)
68. [ConversationKeyEnvelope](#conversationkeyenvelope) (line 2867)
69. [HashtagFollow](#hashtagfollow) (line 2888)
70. [CoinBalance](#coinbalance) (line 2905)
71. [CoinTransaction](#cointransaction) (line 2918)
72. [GiftRecord](#giftrecord) (line 2932)
73. [PostPromotion](#postpromotion) (line 2954)
74. [PostReminder](#postreminder) (line 2974)
75. [QuranReadingPlan](#quranreadingplan) (line 2994)
76. [DhikrSession](#dhikrsession) (line 3011)
77. [DailyTaskCompletion](#dailytaskcompletion) (line 3025)
78. [DhikrChallenge](#dhikrchallenge) (line 3038)
79. [DhikrChallengeParticipant](#dhikrchallengeparticipant) (line 3056)
80. [CharityDonation](#charitydonation) (line 3070)
81. [CharityCampaign](#charitycampaign) (line 3090)
82. [HajjProgress](#hajjprogress) (line 3110)
83. [PrayerNotificationSetting](#prayernotificationsetting) (line 3126)
84. [ContentFilterSetting](#contentfiltersetting) (line 3140)
85. [ScholarVerification](#scholarverification) (line 3154)
86. [Restrict](#restrict) (line 3174)
87. [DMNote](#dmnote) (line 3186)
88. [ScreenTimeLog](#screentimelog) (line 3198)
89. [QuietModeSetting](#quietmodesetting) (line 3212)
90. [OfflineDownload](#offlinedownload) (line 3233)
91. [VideoPremiere](#videopremiere) (line 3253)
92. [PremiereReminder](#premierereminder) (line 3272)
93. [VideoClip](#videoclip) (line 3283)
94. [EndScreen](#endscreen) (line 3307)
95. [PlaylistCollaborator](#playlistcollaborator) (line 3323)
96. [ParentalControl](#parentalcontrol) (line 3337)
97. [AiTranslation](#aitranslation) (line 3362)
98. [AiCaption](#aicaption) (line 3376)
99. [AiAvatar](#aiavatar) (line 3390)
100. [UserStreak](#userstreak) (line 3405)
101. [Achievement](#achievement) (line 3420)
102. [UserAchievement](#userachievement) (line 3436)
103. [UserXP](#userxp) (line 3447)
104. [XPHistory](#xphistory) (line 3460)
105. [Challenge](#challenge) (line 3472)
106. [ChallengeParticipant](#challengeparticipant) (line 3495)
107. [Series](#series) (line 3509)
108. [SeriesEpisode](#seriesepisode) (line 3530)
109. [SeriesFollower](#seriesfollower) (line 3553)
110. [ThumbnailVariant](#thumbnailvariant) (line 3565)
111. [SeriesProgress](#seriesprogress) (line 3579)
112. [ProfileCustomization](#profilecustomization) (line 3594)
113. [Product](#product) (line 3614)
114. [ProductReview](#productreview) (line 3646)
115. [Order](#order) (line 3660)
116. [PostProductTag](#postproducttag) (line 3683)
117. [HalalBusiness](#halalbusiness) (line 3695)
118. [BusinessReview](#businessreview) (line 3725)
119. [ZakatFund](#zakatfund) (line 3739)
120. [ZakatDonation](#zakatdonation) (line 3760)
121. [CommunityTreasury](#communitytreasury) (line 3778)
122. [TreasuryContribution](#treasurycontribution) (line 3799)
123. [PremiumSubscription](#premiumsubscription) (line 3814)
124. [LocalBoard](#localboard) (line 3832)
125. [Mentorship](#mentorship) (line 3851)
126. [StudyCircle](#studycircle) (line 3870)
127. [FatwaQuestion](#fatwaquestion) (line 3889)
128. [VolunteerOpportunity](#volunteeropportunity) (line 3909)
129. [IslamicEvent](#islamicevent) (line 3930)
130. [UserReputation](#userreputation) (line 3953)
131. [VoicePost](#voicepost) (line 3968)
132. [WatchParty](#watchparty) (line 3984)
133. [SharedCollection](#sharedcollection) (line 4003)
134. [WaqfFund](#waqffund) (line 4019)
135. [WaqfDonation](#waqfdonation) (line 4035)
136. [SavedMessage](#savedmessage) (line 4052)
137. [ChatFolder](#chatfolder) (line 4068)
138. [AdminLog](#adminlog) (line 4087)
139. [GroupTopic](#grouptopic) (line 4104)
140. [CustomEmoji](#customemoji) (line 4123)
141. [CustomEmojiPack](#customemojipack) (line 4137)
142. [ForumThread](#forumthread) (line 4154)
143. [ForumReply](#forumreply) (line 4175)
144. [Webhook](#webhook) (line 4190)
145. [StageSession](#stagesession) (line 4211)
146. [Embedding](#embedding) (line 4241)
147. [CreatorEarning](#creatorearning) (line 4264)
148. [ViewerDemographic](#viewerdemographic) (line 4283)
149. [VideoChapter](#videochapter) (line 4304)
150. [CommunityRole](#communityrole) (line 4321)
151. [HifzProgress](#hifzprogress) (line 4346)
152. [MosqueCommunity](#mosquecommunity) (line 4364)
153. [MosqueMembership](#mosquemembership) (line 4391)
154. [MosquePost](#mosquepost) (line 4404)
155. [ScholarQA](#scholarqa) (line 4423)
156. [ScholarQuestion](#scholarquestion) (line 4445)
157. [DuaBookmark](#duabookmark) (line 4466)
158. [CommunityNote](#communitynote) (line 4482)
159. [CommunityNoteRating](#communitynoterating) (line 4501)
160. [CollabInvite](#collabinvite) (line 4519)
161. [MessageChecklist](#messagechecklist) (line 4540)
162. [MessageChecklistItem](#messagechecklistitem) (line 4555)
163. [FastingLog](#fastinglog) (line 4571)
164. [HalalRestaurant](#halalrestaurant) (line 4590)
165. [HalalRestaurantReview](#halalrestaurantreview) (line 4620)
166. [VideoCommentLike](#videocommentlike) (line 4638)
167. [ScholarQuestionVote](#scholarquestionvote) (line 4655)
168. [HalalVerifyVote](#halalverifyvote) (line 4673)
169. [StarredMessage](#starredmessage) (line 4692)

---

## 1. Conversation
**Lines:** 1599-1626 | **Table:** `conversations`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| isGroup | Boolean | | No | @default(false) |
| groupName | String | | Yes | |
| groupAvatarUrl | String | | Yes | |
| createdById | String | | Yes | |
| lastMessageText | String | | Yes | |
| lastMessageAt | DateTime | | Yes | |
| lastMessageById | String | | Yes | |
| disappearingDuration | Int | | Yes | |
| slowModeSeconds | Int | | Yes | Comment: 0=off, 30, 60, 300, 900, 3600 |
| lockCode | String | | Yes | Comment: Secret code to unlock |
| newMemberHistoryCount | Int | | Yes | @default(25) — 0-100 recent messages for new members |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| createdBy | User ("ConversationCreator") | Many-to-one | SetNull |
| lastMessageBy | User ("conversationLastMessage") | Many-to-one | SetNull |
| members | ConversationMember[] | One-to-many | — |
| messages | Message[] | One-to-many | — |
| notifications | Notification[] | One-to-many | — |
| adminLogs | AdminLog[] | One-to-many | — |
| groupTopics | GroupTopic[] | One-to-many | — |
| checklists | MessageChecklist[] | One-to-many | — |
| keyEnvelopes | ConversationKeyEnvelope[] ("keyEnvelopes") | One-to-many | — |

**Indexes:**
- `@@index([lastMessageAt(sort: Desc)])`

---

## 2. ConversationMember
**Lines:** 1628-1647 | **Table:** `conversation_members`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| conversationId | String | | No | |
| userId | String | | No | |
| lastReadAt | DateTime | | No | @default(now()) |
| unreadCount | Int | | No | @default(0) |
| isMuted | Boolean | | No | @default(false) |
| isArchived | Boolean | | No | @default(false) |
| role | String | @db.VarChar(10) | No | @default("member") |
| isBanned | Boolean | | No | @default(false) |
| customTone | String | | Yes | |
| wallpaperUrl | String | | Yes | |
| tag | String | @db.VarChar(30) | Yes | |
| joinedAt | DateTime | | No | @default(now()) |

**Primary Key:** `@@id([conversationId, userId])` (composite)

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| conversation | Conversation | Many-to-one | Cascade |
| user | User | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId])`

---

## 3. Message
**Lines:** 1649-1700 | **Table:** `messages`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| conversationId | String | | No | |
| senderId | String | | Yes | |
| content | String | @db.VarChar(5000) | Yes | |
| messageType | MessageType (enum) | | No | @default(TEXT) |
| mediaUrl | String | | Yes | |
| mediaType | String | | Yes | |
| voiceDuration | Float | | Yes | |
| fileName | String | | Yes | |
| fileSize | Int | | Yes | |
| replyToId | String | | Yes | |
| deliveredAt | DateTime | | Yes | |
| isForwarded | Boolean | | No | @default(false) |
| forwardedFromId | String | | Yes | |
| forwardCount | Int | | No | @default(0) |
| editableUntil | DateTime | | Yes | |
| expiresAt | DateTime | | Yes | |
| isDeleted | Boolean | | No | @default(false) |
| editedAt | DateTime | | Yes | |
| isScheduled | Boolean | | No | @default(false) |
| scheduledAt | DateTime | | Yes | |
| starredBy | String[] | | No | @default([]) — @deprecated, use StarredMessage join table |
| isPinned | Boolean | | No | @default(false) |
| pinnedAt | DateTime | | Yes | |
| pinnedById | String | | Yes | |
| isViewOnce | Boolean | | No | @default(false) |
| viewedAt | DateTime | | Yes | |
| isSpoiler | Boolean | | No | @default(false) |
| isSilent | Boolean | | No | @default(false) |
| isEncrypted | Boolean | | No | @default(false) |
| transcription | String | | Yes | |
| encNonce | String | | Yes | |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| replyTo | Message ("MessageReply") | Self-referencing many-to-one | SetNull |
| replies | Message[] ("MessageReply") | Self-referencing one-to-many | — |
| forwardedFrom | Message ("MessageForwardedFrom") | Self-referencing many-to-one | SetNull |
| forwardedCopies | Message[] ("MessageForwardedFrom") | Self-referencing one-to-many | — |
| pinnedBy | User ("messagePinner") | Many-to-one | SetNull |
| conversation | Conversation | Many-to-one | Cascade |
| sender | User | Many-to-one | SetNull |
| moderationLogs | ModerationLog[] ("ModMessageTarget") | One-to-many | — |
| reactions | MessageReaction[] | One-to-many | — |
| reportedReports | Report[] ("reportedMessages") | One-to-many | — |
| starredRecords | StarredMessage[] ("starredMessages") | One-to-many | — |

**Indexes:**
- `@@index([conversationId, createdAt(sort: Desc)])`
- `@@index([senderId])`
- `@@index([expiresAt])`
- `@@index([scheduledAt])`

---

## 4. BroadcastChannel
**Lines:** 1702-1718 | **Table:** `broadcast_channels`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| name | String | @db.VarChar(100) | No | |
| slug | String | @unique | No | |
| description | String | @db.VarChar(1000) | Yes | |
| avatarUrl | String | | Yes | |
| channelType | ChannelType (enum) | | No | @default(BROADCAST) |
| subscribersCount | Int | | No | @default(0) |
| postsCount | Int | | No | @default(0) |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| members | ChannelMember[] | One-to-many | — |
| messages | BroadcastMessage[] | One-to-many | — |

**Indexes:**
- `@@index([slug])`

---

## 5. ChannelMember
**Lines:** 1720-1732 | **Table:** `channel_members`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| channelId | String | | No | |
| userId | String | | No | |
| role | ChannelRole (enum) | | No | @default(SUBSCRIBER) |
| isMuted | Boolean | | No | @default(false) |
| joinedAt | DateTime | | No | @default(now()) |

**Primary Key:** `@@id([channelId, userId])` (composite)

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| channel | BroadcastChannel | Many-to-one | Cascade |
| user | User | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId])`

---

## 6. BroadcastMessage
**Lines:** 1734-1752 | **Table:** `broadcast_messages`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| channelId | String | | No | |
| senderId | String | | Yes | |
| content | String | @db.VarChar(5000) | Yes | |
| messageType | MessageType (enum) | | No | @default(TEXT) |
| mediaUrl | String | | Yes | |
| mediaType | String | | Yes | |
| viewsCount | Int | | No | @default(0) |
| reactionsCount | Int | | No | @default(0) |
| isPinned | Boolean | | No | @default(false) |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| channel | BroadcastChannel | Many-to-one | Cascade |
| sender | User | Many-to-one | SetNull |

**Indexes:**
- `@@index([channelId, createdAt(sort: Desc)])`

---

## 7. LiveSession
**Lines:** 1758-1789 | **Table:** `live_sessions`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| hostId | String | | No | |
| title | String | @db.VarChar(200) | No | |
| description | String | @db.VarChar(1000) | Yes | |
| thumbnailUrl | String | | Yes | |
| liveType | LiveType (enum) | | No | |
| status | LiveStatus (enum) | | No | @default(SCHEDULED) |
| streamKey | String | @unique | Yes | |
| playbackUrl | String | | Yes | |
| streamId | String | | Yes | |
| peakViewers | Int | | No | @default(0) |
| currentViewers | Int | | No | @default(0) |
| totalViews | Int | | No | @default(0) |
| scheduledAt | DateTime | | Yes | |
| startedAt | DateTime | | Yes | |
| endedAt | DateTime | | Yes | |
| recordingUrl | String | | Yes | |
| isRecorded | Boolean | | No | @default(true) |
| isRehearsal | Boolean | | No | @default(false) |
| isSubscribersOnly | Boolean | | No | @default(false) |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| host | User ("LiveHost") | Many-to-one | Cascade |
| participants | LiveParticipant[] | One-to-many | — |
| guests | LiveGuest[] | One-to-many | — |

**Indexes:**
- `@@index([hostId, createdAt(sort: Desc)])`
- `@@index([status])`
- `@@index([liveType, status])`

---

## 8. LiveParticipant
**Lines:** 1791-1804 | **Table:** `live_participants`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| sessionId | String | | No | |
| userId | String | | No | |
| role | LiveRole (enum) | | No | @default(VIEWER) |
| joinedAt | DateTime | | No | @default(now()) |
| leftAt | DateTime | | Yes | |

**Primary Key:** `@@id([sessionId, userId])` (composite)

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| session | LiveSession | Many-to-one | Cascade |
| user | User | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId])` (sessionId index redundant due to composite PK)

---

## 9. LiveGuest
**Lines:** 1806-1820 | **Table:** `live_guests`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| liveId | String | | No | |
| userId | String | | No | |
| status | LiveGuestStatus (enum) | | No | @default(INVITED) |
| joinedAt | DateTime | | Yes | |
| leftAt | DateTime | | Yes | |
| createdAt | DateTime | | No | @default(now()) |

**Unique Constraints:** `@@unique([liveId, userId])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| live | LiveSession | Many-to-one | Cascade |
| user | User ("LiveGuest") | Many-to-one | Cascade |

**Indexes:**
- `@@index([liveId, status])`

**Related Enum — LiveGuestStatus** (lines 1822-1826):
- `INVITED`
- `ACCEPTED`
- `REMOVED`

---

## 10. Circle
**Lines:** 1832-1864 | **Table:** `circles`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| name | String | @db.VarChar(100) | No | |
| slug | String | @unique | No | |
| description | String | @db.VarChar(1000) | Yes | |
| avatarUrl | String | | Yes | |
| coverUrl | String | | Yes | |
| privacy | CirclePrivacy (enum) | | No | @default(PUBLIC) |
| ownerId | String | | No | |
| membersCount | Int | | No | @default(1) |
| postsCount | Int | | No | @default(0) |
| rules | String | | Yes | |
| isBanned | Boolean | | No | @default(false) |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| owner | User | Many-to-one | Cascade |
| posts | Post[] | One-to-many | — |
| threads | Thread[] | One-to-many | — |
| members | CircleMember[] | One-to-many | — |
| invites | CircleInvite[] | One-to-many | — |
| notifications | Notification[] | One-to-many | — |
| communityRoles | CommunityRole[] ("communityRoles") | One-to-many | — |
| forumThreads | ForumThread[] ("forumThreads") | One-to-many | — |
| webhooks | Webhook[] ("webhooks") | One-to-many | — |
| stageSessions | StageSession[] ("stageSessions") | One-to-many | — |
| communityEvents | Event[] ("communityEvents") | One-to-many | — |
| communityTreasuries | CommunityTreasury[] ("communityTreasuries") | One-to-many | — |

**Indexes:**
- `@@index([slug])`
- `@@index([ownerId])`
- `@@index([privacy, membersCount(sort: Desc)])`

---

## 11. CircleMember
**Lines:** 1866-1877 | **Table:** `circle_members`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| circleId | String | | No | |
| userId | String | | No | |
| role | CircleRole (enum) | | No | @default(MEMBER) |
| joinedAt | DateTime | | No | @default(now()) |

**Primary Key:** `@@id([circleId, userId])` (composite)

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| circle | Circle | Many-to-one | Cascade |
| user | User | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId])`

---

## 12. CircleInvite
**Lines:** 1879-1894 | **Table:** `circle_invites`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| circleId | String | | No | |
| code | String | @unique | No | @default(cuid()) |
| createdById | String | | No | |
| maxUses | Int | | No | @default(0) |
| useCount | Int | | No | @default(0) |
| expiresAt | DateTime | | Yes | |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| circle | Circle | Many-to-one | Cascade |
| createdBy | User | Many-to-one | Cascade |

**Indexes:**
- `@@index([circleId])`
- `@@index([createdById])`

---

## 13. Notification
**Lines:** 1900-1937 | **Table:** `notifications`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| userId | String | | No | |
| actorId | String | | Yes | |
| type | NotificationType (enum) | | No | |
| postId | String | | Yes | |
| commentId | String | | Yes | |
| circleId | String | | Yes | |
| conversationId | String | | Yes | |
| threadId | String | | Yes | |
| reelId | String | | Yes | |
| videoId | String | | Yes | |
| followRequestId | String | | Yes | |
| title | String | | Yes | |
| body | String | | Yes | |
| isRead | Boolean | | No | @default(false) |
| readAt | DateTime | | Yes | |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User ("NotificationRecipient") | Many-to-one | Cascade |
| actor | User ("NotificationActor") | Many-to-one | Cascade |
| post | Post | Many-to-one | Cascade |
| comment | Comment | Many-to-one | Cascade |
| circle | Circle | Many-to-one | Cascade |
| conversation | Conversation | Many-to-one | Cascade |
| thread | Thread | Many-to-one | Cascade |
| reel | Reel | Many-to-one | Cascade |
| video | Video | Many-to-one | Cascade |
| followRequest | FollowRequest | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId, createdAt(sort: Desc)])`
- `@@index([userId, isRead])`
- `@@index([actorId])`
- `@@index([postId])`
- `@@index([reelId])`
- `@@index([threadId])`
- `@@index([videoId])`

---

## 14. Report
**Lines:** 1943-1978 | **Table:** `reports`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| reporterId | String | | Yes | |
| reportedUserId | String | | Yes | |
| reportedPostId | String | | Yes | |
| reportedCommentId | String | | Yes | |
| reportedMessageId | String | | Yes | |
| reportedThreadId | String | | Yes | |
| reportedReelId | String | | Yes | |
| reportedVideoId | String | | Yes | |
| reason | ReportReason (enum) | | No | |
| description | String | @db.VarChar(1000) | Yes | |
| status | ReportStatus (enum) | | No | @default(PENDING) |
| reviewedById | String | | Yes | |
| reviewedAt | DateTime | | Yes | |
| actionTaken | ModerationAction (enum) | | No | @default(NONE) |
| moderatorNotes | String | | Yes | |
| explanationToReporter | String | | Yes | |
| explanationToReported | String | | Yes | |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| reportedPost | Post ("reportedPosts") | Many-to-one | SetNull |
| reportedComment | Comment ("reportedComments") | Many-to-one | SetNull |
| reportedMessage | Message ("reportedMessages") | Many-to-one | SetNull |
| reviewedBy | User ("reportReviewer") | Many-to-one | SetNull |
| reporter | User ("Reporter") | Many-to-one | SetNull |
| reportedUser | User ("ReportedUser") | Many-to-one | SetNull |
| moderationLogs | ModerationLog[] | One-to-many | — |

**Indexes:**
- `@@index([status, createdAt])`
- `@@index([reportedUserId])`
- `@@index([reporterId])`
- `@@index([reportedThreadId])`
- `@@index([reportedReelId])`
- `@@index([reportedVideoId])`

---

## 15. ModerationLog
**Lines:** 1980-2007 | **Table:** `moderation_log`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| moderatorId | String | | Yes | |
| targetUserId | String | | Yes | |
| targetPostId | String | | Yes | |
| targetCommentId | String | | Yes | |
| targetMessageId | String | | Yes | |
| action | ModerationAction (enum) | | No | |
| reason | String | | No | |
| explanation | String | | No | |
| reportId | String | | Yes | |
| isAppealed | Boolean | | No | @default(false) |
| appealText | String | | Yes | |
| appealResolved | Boolean | | Yes | |
| appealResult | String | | Yes | |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| moderator | User ("Moderator") | Many-to-one | SetNull |
| targetUser | User ("ModTarget") | Many-to-one | SetNull |
| targetPost | Post ("ModPostTarget") | Many-to-one | SetNull |
| targetComment | Comment ("ModCommentTarget") | Many-to-one | SetNull |
| targetMessage | Message ("ModMessageTarget") | Many-to-one | SetNull |
| report | Report | Many-to-one | SetNull |

**Indexes:**
- `@@index([targetUserId, createdAt(sort: Desc)])`
- `@@index([reportId])`
- `@@index([moderatorId])`

---

## 16. Block
**Lines:** 2013-2023 | **Table:** `blocks`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| blockerId | String | | No | |
| blockedId | String | | No | |
| createdAt | DateTime | | No | @default(now()) |

**Primary Key:** `@@id([blockerId, blockedId])` (composite)

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| blocker | User ("Blocker") | Many-to-one | Cascade |
| blocked | User ("Blocked") | Many-to-one | Cascade |

**Indexes:**
- `@@index([blockedId])`

---

## 17. Mute
**Lines:** 2025-2035 | **Table:** `mutes`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| userId | String | | No | |
| mutedId | String | | No | |
| createdAt | DateTime | | No | @default(now()) |

**Primary Key:** `@@id([userId, mutedId])` (composite)

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User ("Muter") | Many-to-one | Cascade |
| muted | User ("Muted") | Many-to-one | Cascade |

**Indexes:**
- `@@index([mutedId])`

---

## 18. Hashtag
**Lines:** 2041-2054 | **Table:** `hashtags`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| name | String | @unique | No | |
| postsCount | Int | | No | @default(0) |
| reelsCount | Int | | No | @default(0) |
| threadsCount | Int | | No | @default(0) |
| videosCount | Int | | No | @default(0) |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:** None (standalone)

**Indexes:**
- `@@index([name])`
- `@@index([postsCount(sort: Desc)])`

---

## 19. FeedInteraction
**Lines:** 2060-2081 | **Table:** `feed_interactions`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| userId | String | | No | |
| postId | String | | No | |
| space | ContentSpace (enum) | | No | @default(SAF) |
| viewed | Boolean | | No | @default(false) |
| viewDurationMs | Int | | No | @default(0) |
| liked | Boolean | | No | @default(false) |
| commented | Boolean | | No | @default(false) |
| shared | Boolean | | No | @default(false) |
| saved | Boolean | | No | @default(false) |
| completionRate | Float | | Yes | |
| createdAt | DateTime | | No | @default(now()) |

**Unique Constraints:** `@@unique([userId, postId])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User | Many-to-one | Cascade |
| post | Post | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId, createdAt(sort: Desc)])`
- `@@index([postId])`
- `@@index([space, userId])`

---

## 20. FollowRequest
**Lines:** 2087-2101 | **Table:** `follow_requests`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| senderId | String | | No | |
| receiverId | String | | No | |
| status | FollowRequestStatus (enum) | | No | @default(PENDING) |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Unique Constraints:** `@@unique([senderId, receiverId])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| sender | User ("SentFollowRequests") | Many-to-one | Cascade |
| receiver | User ("ReceivedFollowRequests") | Many-to-one | Cascade |
| notifications | Notification[] | One-to-many | — |

**Indexes:**
- `@@index([receiverId, status])`

---

## 21. Poll
**Lines:** 2103-2115 | **Table:** `polls`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| threadId | String | @unique | No | |
| question | String | @db.VarChar(300) | No | |
| endsAt | DateTime | | Yes | |
| totalVotes | Int | | No | @default(0) |
| allowMultiple | Boolean | | No | @default(false) |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| thread | Thread | One-to-one | Cascade |
| options | PollOption[] | One-to-many | — |

---

## 22. PollOption
**Lines:** 2117-2129 | **Table:** `poll_options`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| pollId | String | | No | |
| text | String | @db.VarChar(100) | No | |
| votesCount | Int | | No | @default(0) |
| position | Int | | No | @default(0) |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| poll | Poll | Many-to-one | Cascade |
| votes | PollVote[] | One-to-many | — |

**Indexes:**
- `@@index([pollId])`

---

## 23. PollVote
**Lines:** 2131-2141 | **Table:** `poll_votes`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| userId | String | | No | |
| optionId | String | | No | |
| createdAt | DateTime | | No | @default(now()) |

**Primary Key:** `@@id([userId, optionId])` (composite)

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User | Many-to-one | Cascade |
| option | PollOption | Many-to-one | Cascade |

**Indexes:**
- `@@index([optionId])`

---

## 24. AudioTrack
**Lines:** 2143-2157 | **Table:** `audio_tracks`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| title | String | @db.VarChar(200) | No | |
| artist | String | @db.VarChar(100) | Yes | |
| duration | Float | | No | |
| audioUrl | String | | No | |
| coverUrl | String | | Yes | |
| reelsCount | Int | | No | @default(0) |
| isOriginal | Boolean | | No | @default(false) |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| reels | Reel[] | One-to-many | — |

**Indexes:**
- `@@index([reelsCount(sort: Desc)])`

---

## 25. ThreadBookmark
**Lines:** 2159-2169 | **Table:** `thread_bookmarks`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| userId | String | | No | |
| threadId | String | | No | |
| createdAt | DateTime | | No | @default(now()) |

**Primary Key:** `@@id([userId, threadId])` (composite)

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User | Many-to-one | Cascade |
| thread | Thread | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId, createdAt(sort: Desc)])`

---

## 26. VideoBookmark
**Lines:** 2171-2181 | **Table:** `video_bookmarks`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| userId | String | | No | |
| videoId | String | | No | |
| createdAt | DateTime | | No | @default(now()) |

**Primary Key:** `@@id([userId, videoId])` (composite)

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User | Many-to-one | Cascade |
| video | Video | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId, createdAt(sort: Desc)])`

---

## 27. WatchHistory
**Lines:** 2183-2196 | **Table:** `watch_history`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| userId | String | | No | |
| videoId | String | | No | |
| watchedAt | DateTime | | No | @default(now()) |
| progress | Float | | No | @default(0) |
| completed | Boolean | | No | @default(false) |

**Unique Constraints:** `@@unique([userId, videoId])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User | Many-to-one | Cascade |
| video | Video | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId, watchedAt(sort: Desc)])`

---

## 28. WatchLater
**Lines:** 2198-2208 | **Table:** `watch_later`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| userId | String | | No | |
| videoId | String | | No | |
| createdAt | DateTime | | No | @default(now()) |

**Primary Key:** `@@id([userId, videoId])` (composite)

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User | Many-to-one | Cascade |
| video | Video | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId, createdAt(sort: Desc)])`

---

## 29. MessageReaction
**Lines:** 2210-2222 | **Table:** `message_reactions`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| messageId | String | | No | |
| userId | String | | No | |
| emoji | String | @db.VarChar(10) | No | |
| createdAt | DateTime | | No | @default(now()) |

**Unique Constraints:** `@@unique([messageId, userId, emoji])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| message | Message | Many-to-one | Cascade |
| user | User | Many-to-one | Cascade |

**Indexes:**
- `@@index([messageId])`

---

## 30. StoryHighlightAlbum
**Lines:** 2224-2236 | **Table:** `story_highlight_albums`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| userId | String | | No | |
| title | String | @db.VarChar(50) | No | |
| coverUrl | String | | Yes | |
| position | Int | | No | @default(0) |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User | Many-to-one | Cascade |
| stories | Story[] | One-to-many | — |

**Indexes:**
- `@@index([userId])`

---

## 31. StoryStickerResponse
**Lines:** 2238-2250 | **Table:** `story_sticker_responses`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| storyId | String | | No | |
| userId | String | | No | |
| stickerType | String | | No | |
| responseData | Json | | No | |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| story | Story | Many-to-one | Cascade |
| user | User | Many-to-one | Cascade |

**Indexes:**
- `@@index([storyId])`

---

## 32. UserInterest
**Lines:** 2252-2262 | **Table:** `user_interests`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| userId | String | | No | |
| category | String | | No | |
| createdAt | DateTime | | No | @default(now()) |

**Unique Constraints:** `@@unique([userId, category])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId])`

---

## 33. FeedDismissal
**Lines:** 2264-2275 | **Table:** `feed_dismissals`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| userId | String | | No | |
| contentId | String | | No | |
| contentType | String | | No | |
| createdAt | DateTime | | No | @default(now()) |

**Unique Constraints:** `@@unique([userId, contentId, contentType])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId])`

---

## 34. DraftPost
**Lines:** 2277-2288 | **Table:** `draft_posts`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| userId | String | | No | |
| space | ContentSpace (enum) | | No | @default(SAF) |
| data | Json | | No | |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId, updatedAt(sort: Desc)])`

---

## 35. ProfileLink
**Lines:** 2290-2301 | **Table:** `profile_links`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| userId | String | | No | |
| title | String | @db.VarChar(50) | No | |
| url | String | @db.VarChar(500) | No | |
| position | Int | | No | @default(0) |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId])`

---

## 36. Device
**Lines:** 2303-2322 | **Table:** `devices`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| userId | String | | No | |
| platform | String | | No | |
| pushToken | String | @unique | No | |
| deviceId | String | | Yes | |
| deviceName | String | | Yes | |
| os | String | | Yes | |
| ipAddress | String | | Yes | |
| location | String | | Yes | |
| lastActiveAt | DateTime | | No | @default(now()) |
| isActive | Boolean | | No | @default(true) |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId])`
- `@@index([userId, lastActiveAt(sort: Desc)])`

---

## 37. CallSession
**Lines:** 2324-2343 | **Table:** `call_sessions`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| callType | CallType (enum) | | No | |
| status | CallStatus (enum) | | No | @default(RINGING) |
| startedAt | DateTime | | Yes | |
| endedAt | DateTime | | Yes | |
| duration | Int | | Yes | |
| maxParticipants | Int | | No | @default(2) |
| isScreenSharing | Boolean | | No | @default(false) |
| screenShareUserId | String | | Yes | |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| screenShareUser | User ("callScreenShare") | Many-to-one | SetNull |
| participants | CallParticipant[] | One-to-many | — |

**Indexes:**
- `@@index([status])`
- `@@index([createdAt])`
- `@@index([endedAt])`

---

## 38. CallParticipant
**Lines:** 2345-2358 | **Table:** `call_participants`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| sessionId | String | | No | |
| userId | String | | No | |
| role | String | | No | @default("caller") |
| joinedAt | DateTime | | No | @default(now()) |
| leftAt | DateTime | | Yes | |

**Primary Key:** `@@id([sessionId, userId])` (composite)

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| session | CallSession | Many-to-one | Cascade |
| user | User | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId])` (sessionId index redundant due to composite PK)

---

## 39. StickerPack
**Lines:** 2360-2373 | **Table:** `sticker_packs`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| name | String | @db.VarChar(100) | No | |
| coverUrl | String | | Yes | |
| stickersCount | Int | | No | @default(0) |
| isFree | Boolean | | No | @default(true) |
| ownerId | String | | Yes | |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| stickers | Sticker[] | One-to-many | — |
| users | UserStickerPack[] | One-to-many | — |

**Indexes:**
- `@@index([ownerId])`

---

## 40. Sticker
**Lines:** 2375-2386 | **Table:** `stickers`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| packId | String | | No | |
| url | String | | No | |
| name | String | @db.VarChar(50) | Yes | |
| position | Int | | No | @default(0) |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| pack | StickerPack | Many-to-one | Cascade |

**Indexes:**
- `@@index([packId])`

---

## 41. UserStickerPack
**Lines:** 2388-2398 | **Table:** `user_sticker_packs`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| userId | String | | No | |
| packId | String | | No | |
| addedAt | DateTime | | No | @default(now()) |

**Primary Key:** `@@id([userId, packId])` (composite)

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User | Many-to-one | Cascade |
| pack | StickerPack | Many-to-one | Cascade |

**Indexes:** (userId index redundant due to composite PK)

---

## 42. GeneratedSticker
**Lines:** 2400-2411 | **Table:** `generated_stickers`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| userId | String | | No | |
| imageUrl | String | | No | |
| prompt | String | | No | |
| style | String | | No | @default("cartoon") |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User ("generatedStickers") | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId, createdAt(sort: Desc)])`

---

## 43. AltProfile
**Lines:** 2413-2425 | **Table:** `alt_profiles`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| userId | String | @unique | No | |
| displayName | String | | No | |
| bio | String | @db.VarChar(500) | Yes | |
| avatarUrl | String | | Yes | |
| isActive | Boolean | | No | @default(true) |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User ("altProfile") | One-to-one | Cascade |
| access | AltProfileAccess[] | One-to-many | — |

---

## 44. AltProfileAccess
**Lines:** 2427-2438 | **Table:** `alt_profile_access`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| altProfileId | String | | No | |
| userId | String | | No | |
| createdAt | DateTime | | No | @default(now()) |

**Unique Constraints:** `@@unique([altProfileId, userId])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| altProfile | AltProfile | Many-to-one | Cascade |
| user | User ("altProfileAccess") | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId])`

---

## 45. MajlisList
**Lines:** 2440-2454 | **Table:** `majlis_lists`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| ownerId | String | | No | |
| name | String | @db.VarChar(100) | No | |
| description | String | @db.VarChar(500) | Yes | |
| isPrivate | Boolean | | No | @default(false) |
| membersCount | Int | | No | @default(0) |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| owner | User | Many-to-one | Cascade |
| members | MajlisListMember[] | One-to-many | — |

**Indexes:**
- `@@index([ownerId])`

---

## 46. MajlisListMember
**Lines:** 2456-2466 | **Table:** `majlis_list_members`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| listId | String | | No | |
| userId | String | | No | |
| addedAt | DateTime | | No | @default(now()) |

**Primary Key:** `@@id([listId, userId])` (composite)

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| list | MajlisList | Many-to-one | Cascade |
| user | User | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId])`

---

## 47. PostCollab
**Lines:** 2468-2480 | **Table:** `post_collabs`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| postId | String | | No | |
| userId | String | | No | |
| status | CollabStatus (enum) | | No | @default(PENDING) |
| createdAt | DateTime | | No | @default(now()) |

**Unique Constraints:** `@@unique([postId, userId])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| post | Post | Many-to-one | Cascade |
| user | User | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId])`

---

## 48. BlockedKeyword
**Lines:** 2482-2492 | **Table:** `blocked_keywords`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| userId | String | | No | |
| keyword | String | @db.VarChar(100) | No | |
| createdAt | DateTime | | No | @default(now()) |

**Unique Constraints:** `@@unique([userId, keyword])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId])`

---

## 49. CreatorStat
**Lines:** 2494-2509 | **Table:** `creator_stats`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| userId | String | | No | |
| date | DateTime | @db.Date | No | |
| space | ContentSpace (enum) | | No | |
| views | Int | | No | @default(0) |
| likes | Int | | No | @default(0) |
| comments | Int | | No | @default(0) |
| shares | Int | | No | @default(0) |
| followers | Int | | No | @default(0) |

**Unique Constraints:** `@@unique([userId, date, space])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId, date(sort: Desc)])`

---

## 50. UserSettings
**Lines:** 2511-2546 | **Table:** `user_settings`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| userId | String | @unique | No | |
| messagePermission | String | | No | @default("everyone") |
| mentionPermission | String | | No | @default("everyone") |
| activityStatus | Boolean | | No | @default(true) |
| readReceipts | Boolean | | No | @default(true) |
| typingIndicators | Boolean | | No | @default(true) |
| lastSeenVisibility | String | | No | @default("everyone") — "everyone" / "contacts" / "nobody" |
| notifyLikes | Boolean | | No | @default(true) |
| notifyComments | Boolean | | No | @default(true) |
| notifyFollows | Boolean | | No | @default(true) |
| notifyMentions | Boolean | | No | @default(true) |
| notifyMessages | Boolean | | No | @default(true) |
| notifyLiveStreams | Boolean | | No | @default(true) |
| emailDigest | Boolean | | No | @default(false) |
| reducedMotion | Boolean | | No | @default(false) |
| largeText | Boolean | | No | @default(false) |
| highContrast | Boolean | | No | @default(false) |
| dailyTimeLimit | Int | | Yes | |
| restrictedMode | Boolean | | No | @default(false) |
| sensitiveContent | Boolean | | No | @default(false) |
| screenTimeLimitMinutes | Int | | Yes | |
| undoSendSeconds | Int | | No | @default(5) |
| autoPlaySetting | AutoPlaySetting (enum) | | No | @default(WIFI) |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User | One-to-one | Cascade |

---

## 51. SubtitleTrack
**Lines:** 2548-2560 | **Table:** `subtitle_tracks`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| videoId | String | | No | |
| language | String | @db.VarChar(10) | No | |
| label | String | @db.VarChar(50) | No | |
| url | String | | No | |
| isDefault | Boolean | | No | @default(false) |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| video | Video | Many-to-one | Cascade |

**Indexes:**
- `@@index([videoId])`

---

## 52. ChannelPost
**Lines:** 2562-2579 | **Table:** `channel_posts`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| channelId | String | | No | |
| userId | String | | No | |
| content | String | @db.VarChar(5000) | No | |
| mediaUrls | String[] | | No | @default([]) |
| likesCount | Int | | No | @default(0) |
| commentsCount | Int | | No | @default(0) |
| isPinned | Boolean | | No | @default(false) |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| channel | Channel | Many-to-one | Cascade |
| user | User | Many-to-one | Cascade |

**Indexes:**
- `@@index([channelId, createdAt(sort: Desc)])`
- `@@index([userId])`

---

## 53. ReelInteraction
**Lines:** 2581-2598 | **Table:** `reel_interactions`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| userId | String | | No | |
| reelId | String | | No | |
| viewed | Boolean | | No | @default(false) |
| watchDurationMs | Int | | No | @default(0) |
| completionRate | Float | | Yes | |
| liked | Boolean | | No | @default(false) |
| shared | Boolean | | No | @default(false) |
| saved | Boolean | | No | @default(false) |
| createdAt | DateTime | | No | @default(now()) |

**Unique Constraints:** `@@unique([userId, reelId])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User | Many-to-one | Cascade |
| reel | Reel | Many-to-one | Cascade |

**Indexes:**
- `@@index([reelId])`

---

## 54. VideoInteraction
**Lines:** 2600-2617 | **Table:** `video_interactions`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| userId | String | | No | |
| videoId | String | | No | |
| viewed | Boolean | | No | @default(false) |
| watchDurationMs | Int | | No | @default(0) |
| completionRate | Float | | Yes | |
| liked | Boolean | | No | @default(false) |
| shared | Boolean | | No | @default(false) |
| saved | Boolean | | No | @default(false) |
| createdAt | DateTime | | No | @default(now()) |

**Unique Constraints:** `@@unique([userId, videoId])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User | Many-to-one | Cascade |
| video | Video | Many-to-one | Cascade |

**Indexes:**
- `@@index([videoId])`

---

## 55. Event
**Lines:** 2623-2648 | **Table:** `events`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| title | String | @db.VarChar(200) | No | |
| description | String | @db.VarChar(5000) | Yes | |
| coverUrl | String | | Yes | |
| startDate | DateTime | | No | |
| endDate | DateTime | | Yes | |
| location | String | @db.VarChar(500) | Yes | |
| locationUrl | String | | Yes | |
| isOnline | Boolean | | No | @default(false) |
| onlineUrl | String | | Yes | |
| eventType | EventTypeEnum (enum) | | No | @default(IN_PERSON) |
| privacy | EventPrivacy (enum) | | No | @default(EVENT_PUBLIC) |
| userId | String | | No | |
| communityId | String | | Yes | |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User | Many-to-one | Cascade |
| community | Circle ("communityEvents") | Many-to-one | SetNull |
| rsvps | EventRSVP[] | One-to-many | — |

**Indexes:**
- `@@index([userId])`
- `@@index([startDate(sort: Desc)])`
- `@@index([communityId])`

---

## 56. EventRSVP
**Lines:** 2650-2662 | **Table:** `event_rsvps`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| eventId | String | | No | |
| userId | String | | No | |
| status | String | @db.VarChar(20) | No | |
| createdAt | DateTime | | No | @default(now()) |

**Unique Constraints:** `@@unique([eventId, userId])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| event | Event | Many-to-one | Cascade |
| user | User | Many-to-one | Cascade |

**Indexes:**
- `@@index([eventId])`

---

## 57. Tip
**Lines:** 2664-2684 | **Table:** `tips`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| senderId | String | | Yes | |
| receiverId | String | | Yes | |
| amount | Decimal | @db.Decimal(12, 2) | No | |
| currency | String | @db.VarChar(3) | No | @default("USD") |
| message | String | @db.VarChar(500) | Yes | |
| platformFee | Decimal | @db.Decimal(12, 2) | No | @default(0) |
| status | String | @db.VarChar(20) | No | @default("completed") |
| stripePaymentId | String | | Yes | |
| createdAt | DateTime | | No | @default(now()) |

**Unique Constraints:** `@@unique([senderId, receiverId, createdAt])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| sender | User ("TipSender") | Many-to-one | SetNull |
| receiver | User ("TipReceiver") | Many-to-one | SetNull |

**Indexes:**
- `@@index([senderId])`
- `@@index([receiverId])`
- `@@index([senderId, createdAt(sort: Desc)])`
- `@@index([receiverId, createdAt(sort: Desc)])`

---

## 58. MembershipTier
**Lines:** 2686-2702 | **Table:** `membership_tiers`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| userId | String | | No | |
| name | String | @db.VarChar(100) | No | |
| price | Decimal | @db.Decimal(12, 2) | No | |
| currency | String | @db.VarChar(3) | No | @default("USD") |
| benefits | String[] | | No | @default([]) |
| isActive | Boolean | | No | @default(true) |
| level | String | @db.VarChar(10) | No | @default("bronze") |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User | Many-to-one | Cascade |
| subscriptions | MembershipSubscription[] | One-to-many | — |

**Indexes:**
- `@@index([userId])`

---

## 59. MembershipSubscription
**Lines:** 2704-2718 | **Table:** `membership_subscriptions`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| tierId | String | | No | |
| userId | String | | No | |
| status | String | @db.VarChar(20) | No | @default("active") |
| startDate | DateTime | | No | @default(now()) |
| endDate | DateTime | | Yes | |
| createdAt | DateTime | | No | @default(now()) |

**Unique Constraints:** `@@unique([tierId, userId])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| tier | MembershipTier | Many-to-one | Cascade |
| user | User | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId])`

---

## 60. AudioRoom
**Lines:** 2720-2742 | **Table:** `audio_rooms`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| title | String | @db.VarChar(300) | No | |
| description | String | @db.VarChar(2000) | Yes | |
| hostId | String | | No | |
| status | String | @db.VarChar(20) | No | @default("live") |
| scheduledAt | DateTime | | Yes | |
| startedAt | DateTime | | Yes | |
| endedAt | DateTime | | Yes | |
| maxSpeakers | Int | | No | @default(10) |
| isRecording | Boolean | | No | @default(false) |
| recordingUrl | String | | Yes | |
| recordingDuration | Int | | Yes | |
| isPersistent | Boolean | | No | @default(false) |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| host | User | Many-to-one | Cascade |
| participants | AudioRoomParticipant[] | One-to-many | — |

**Indexes:**
- `@@index([hostId])`
- `@@index([status])`

---

## 61. AudioRoomParticipant
**Lines:** 2744-2758 | **Table:** `audio_room_participants`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| roomId | String | | No | |
| userId | String | | No | |
| role | String | @db.VarChar(20) | No | @default("listener") |
| isMuted | Boolean | | No | @default(true) |
| handRaised | Boolean | | No | @default(false) |
| joinedAt | DateTime | | No | @default(now()) |

**Unique Constraints:** `@@unique([roomId, userId])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| room | AudioRoom | Many-to-one | Cascade |
| user | User | Many-to-one | Cascade |

**Indexes:**
- `@@index([roomId])`

---

## 62. TwoFactorSecret
**Lines:** 2760-2776 | **Table:** `two_factor_secrets`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| userId | String | @unique | No | |
| secret | String | | No | |
| encryptedSecret | String | | Yes | TODO: Migrate existing secrets to encrypted column |
| isEnabled | Boolean | | No | @default(false) |
| backupCodes | String[] | | No | @default([]) |
| backupSalt | String | | Yes | TODO: Migrate existing SHA-256 hashes to HMAC-SHA256 |
| verifiedAt | DateTime | | Yes | |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User | One-to-one | Cascade |

---

## 63. StoryChain
**Lines:** 2778-2792 | **Table:** `story_chains`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| prompt | String | @db.VarChar(300) | No | |
| coverUrl | String | | Yes | |
| createdById | String | | No | |
| participantCount | Int | | No | @default(0) |
| viewsCount | Int | | No | @default(0) |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| createdBy | User ("storyChains") | Many-to-one | Cascade |
| entries | StoryChainEntry[] | One-to-many | — |

**Indexes:**
- `@@index([participantCount(sort: Desc)])`
- `@@index([createdById])`

---

## 64. StoryChainEntry
**Lines:** 2794-2808 | **Table:** `story_chain_entries`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| chainId | String | | No | |
| storyId | String | | No | |
| userId | String | | No | |
| createdAt | DateTime | | No | @default(now()) |

**Unique Constraints:** `@@unique([chainId, userId])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| chain | StoryChain | Many-to-one | Cascade |
| story | Story | Many-to-one | Cascade |
| user | User ("storyChainEntries") | Many-to-one | Cascade |

**Indexes:**
- `@@index([chainId])`
- `@@index([storyId])`

---

## 65. ReelTemplate
**Lines:** 2810-2824 | **Table:** `reel_templates`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| name | String | @db.VarChar(100) | No | |
| sourceReelId | String | | No | |
| userId | String | | No | |
| segments | Json | | No | |
| useCount | Int | | No | @default(0) |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| sourceReel | Reel ("ReelTemplateSource") | Many-to-one | Cascade |
| user | User ("reelTemplates") | Many-to-one | Cascade |

**Indexes:**
- `@@index([useCount(sort: Desc)])`
- `@@index([userId])`

---

## 66. VideoReply
**Lines:** 2831-2848 | **Table:** `video_replies`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| userId | String | | No | |
| commentId | String | | No | **NOTE: Polymorphic FK** — points to Comment OR ReelComment based on commentType |
| commentType | CommentTargetType (enum) | | No | |
| mediaUrl | String | | No | |
| thumbnailUrl | String | | Yes | |
| duration | Float | | Yes | |
| viewsCount | Int | | No | @default(0) |
| likesCount | Int | | No | @default(0) |
| isDeleted | Boolean | | No | @default(false) |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User ("videoReplies") | Many-to-one | Cascade |

**Note:** No Prisma relation on commentId — this is a known polymorphic FK (P1-DANGLING item #1 unfixable). Resolved at application layer.

**Indexes:**
- `@@index([commentId])`
- `@@index([userId])`

---

## 67. EncryptionKey
**Lines:** 2855-2865 | **Table:** `encryption_keys`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| userId | String | @unique | No | |
| publicKey | String | | No | |
| keyFingerprint | String | | No | |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User ("encryptionKey") | One-to-one | Cascade |

---

## 68. ConversationKeyEnvelope
**Lines:** 2867-2886 | **Table:** `conversation_key_envelopes`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| conversationId | String | | No | |
| userId | String | | No | |
| encryptedKey | String | | No | |
| nonce | String | | No | |
| version | Int | | No | @default(1) |
| createdAt | DateTime | | No | @default(now()) |

**Unique Constraints:** `@@unique([conversationId, userId, version])` — Race condition prevention for key exchange.

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| conversation | Conversation ("keyEnvelopes") | Many-to-one | Cascade |
| user | User ("conversationKeyEnvelopes") | Many-to-one | Cascade |

**Indexes:**
- `@@index([conversationId])`
- `@@index([userId])`

---

## 69. HashtagFollow
**Lines:** 2888-2898 | **Table:** `hashtag_follows`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| userId | String | | No | |
| hashtagId | String | | No | |
| createdAt | DateTime | | No | @default(now()) |

**Primary Key:** `@@id([userId, hashtagId])` (composite)

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User ("hashtagFollows") | Many-to-one | Cascade |

**Note:** No Prisma relation to Hashtag model (hashtagId is a raw FK).

**Indexes:**
- `@@index([hashtagId])` (userId index redundant due to composite PK)

---

## 70. CoinBalance
**Lines:** 2905-2916 | **Table:** `coin_balances`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| userId | String | @unique | No | |
| coins | Int | | No | @default(0) |
| diamonds | Int | | No | @default(0) |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User ("coinBalanceRecord") | One-to-one | Cascade |

**Note:** Known bug — dual balance system. User.coinBalance (legacy field) coexists with this CoinBalance table. Reading from wrong source = wrong balance.

**Indexes:**
- `@@index([userId])`

---

## 71. CoinTransaction
**Lines:** 2918-2930 | **Table:** `coin_transactions`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| userId | String | | No | |
| type | CoinTransactionType (enum) | | No | |
| amount | Int | | No | |
| currency | String | @db.VarChar(3) | No | @default("USD") |
| description | String | | Yes | |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User ("coinTransactions") | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId, createdAt(sort: Desc)])`

---

## 72. GiftRecord
**Lines:** 2932-2947 | **Table:** `gift_records`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| senderId | String | | Yes | |
| receiverId | String | | Yes | |
| giftType | String | @db.VarChar(50) | No | |
| coinCost | Int | | No | |
| contentId | String | | Yes | |
| contentType | String | @db.VarChar(10) | Yes | |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| sender | User ("giftsSent") | Many-to-one | SetNull |
| receiver | User ("giftsReceived") | Many-to-one | SetNull |

**Indexes:**
- `@@index([receiverId])`
- `@@index([senderId])`

---

## 73. PostPromotion
**Lines:** 2954-2972 | **Table:** `post_promotions`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| postId | String | | No | |
| userId | String | | No | |
| budget | Decimal | @db.Decimal(12, 2) | No | |
| currency | String | @db.VarChar(3) | No | @default("USD") |
| targetReach | Int | | No | |
| actualReach | Int | | No | @default(0) |
| status | String | @db.VarChar(20) | No | @default("active") |
| startsAt | DateTime | | No | @default(now()) |
| endsAt | DateTime | | No | |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| post | Post | Many-to-one | Cascade |
| user | User ("postPromotions") | Many-to-one | Cascade |

**Indexes:**
- `@@index([postId])`
- `@@index([userId])`

---

## 74. PostReminder
**Lines:** 2974-2987 | **Table:** `post_reminders`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| postId | String | | No | |
| userId | String | | No | |
| remindAt | DateTime | | No | |
| sent | Boolean | | No | @default(false) |
| createdAt | DateTime | | No | @default(now()) |

**Unique Constraints:** `@@unique([postId, userId])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| post | Post | Many-to-one | Cascade |
| user | User ("postReminders") | Many-to-one | Cascade |

**Indexes:**
- `@@index([remindAt])`

---

## 75. QuranReadingPlan
**Lines:** 2994-3009 | **Table:** `quran_reading_plans`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| userId | String | | No | |
| planType | String | | No | |
| startDate | DateTime | | No | |
| endDate | DateTime | | No | |
| currentJuz | Int | | No | @default(1) |
| currentPage | Int | | No | @default(1) |
| isComplete | Boolean | | No | @default(false) |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User ("quranReadingPlans") | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId])`

---

## 76. DhikrSession
**Lines:** 3011-3023 | **Table:** `dhikr_sessions`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| userId | String | | No | |
| phrase | String | | No | |
| count | Int | | No | |
| target | Int | | No | @default(33) |
| completedAt | DateTime | | Yes | |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User ("dhikrSessions") | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId, createdAt(sort: Desc)])`

---

## 77. DailyTaskCompletion
**Lines:** 3025-3036 | **Table:** `daily_task_completions`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| userId | String | | No | |
| date | DateTime | @db.Date | No | |
| taskType | DailyTaskType (enum) | | No | |
| createdAt | DateTime | | No | @default(now()) |

**Unique Constraints:** `@@unique([userId, date, taskType])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User ("dailyTaskCompletions") | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId, date])`

---

## 78. DhikrChallenge
**Lines:** 3038-3054 | **Table:** `dhikr_challenges`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| userId | String | | No | |
| title | String | | No | |
| phrase | String | | No | |
| targetTotal | Int | | No | |
| currentTotal | Int | | No | @default(0) |
| participantCount | Int | | No | @default(0) |
| expiresAt | DateTime | | Yes | |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User ("dhikrChallenges") | Many-to-one | Cascade |
| participants | DhikrChallengeParticipant[] | One-to-many | — |

**Indexes:**
- `@@index([createdAt(sort: Desc)])`

---

## 79. DhikrChallengeParticipant
**Lines:** 3056-3068 | **Table:** `dhikr_challenge_participants`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| userId | String | | No | |
| challengeId | String | | No | |
| contributed | Int | | No | @default(0) |
| joinedAt | DateTime | | No | @default(now()) |

**Primary Key:** `@@id([userId, challengeId])` (composite)

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User ("dhikrParticipations") | Many-to-one | Cascade |
| challenge | DhikrChallenge | Many-to-one | Cascade |

**Indexes:**
- `@@index([challengeId])`
- `@@index([userId])`

---

## 80. CharityDonation
**Lines:** 3070-3088 | **Table:** `charity_donations`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| userId | String | | Yes | |
| recipientUserId | String | | Yes | |
| campaignId | String | | Yes | |
| amount | Decimal | @db.Decimal(12, 2) | No | |
| currency | String | | No | @default("usd") |
| stripePaymentId | String | | Yes | |
| status | String | | No | @default("pending") |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User ("charityDonations") | Many-to-one | SetNull |
| recipientUser | User ("charityDonationsReceived") | Many-to-one | SetNull |
| campaign | CharityCampaign | Many-to-one | SetNull |

**Indexes:**
- `@@index([userId, createdAt(sort: Desc)])`
- `@@index([recipientUserId])`
- `@@index([campaignId])`

---

## 81. CharityCampaign
**Lines:** 3090-3108 | **Table:** `charity_campaigns`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| userId | String | | No | |
| title | String | | No | |
| description | String | | Yes | |
| goalAmount | Decimal | @db.Decimal(12, 2) | No | |
| raisedAmount | Decimal | @db.Decimal(12, 2) | No | @default(0) |
| donorCount | Int | | No | @default(0) |
| imageUrl | String | | Yes | |
| isActive | Boolean | | No | @default(true) |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User ("charityCampaigns") | Many-to-one | Cascade |
| donations | CharityDonation[] | One-to-many | — |

**Indexes:**
- `@@index([userId])`
- `@@index([isActive, createdAt(sort: Desc)])`

---

## 82. HajjProgress
**Lines:** 3110-3124 | **Table:** `hajj_progress`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| userId | String | | No | |
| year | Int | | No | |
| currentStep | Int | | No | @default(0) |
| checklistJson | String | | No | @default("{}") |
| notes | String | | Yes | |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Unique Constraints:** `@@unique([userId, year])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User ("hajjProgress") | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId])`

---

## 83. PrayerNotificationSetting
**Lines:** 3126-3138 | **Table:** `prayer_notification_settings`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| userId | String | @unique | No | |
| dndDuringPrayer | Boolean | | No | @default(false) |
| adhanEnabled | Boolean | | No | @default(false) |
| adhanStyle | AdhanStyle (enum) | | No | @default(MAKKAH) |
| reminderMinutes | Int | | No | @default(15) |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User ("prayerNotifications") | One-to-one | Cascade |

---

## 84. ContentFilterSetting
**Lines:** 3140-3152 | **Table:** `content_filter_settings`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| userId | String | @unique | No | |
| strictnessLevel | ContentStrictnessLevel (enum) | | No | @default(MODERATE) |
| blurHaram | Boolean | | No | @default(true) |
| hideMusic | Boolean | | No | @default(false) |
| hideMixedGender | Boolean | | No | @default(false) |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User ("contentFilter") | One-to-one | Cascade |

---

## 85. ScholarVerification
**Lines:** 3154-3168 | **Table:** `scholar_verifications`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| userId | String | @unique | No | |
| institution | String | | No | |
| specialization | String | | Yes | |
| madhab | MadhhabType (enum) | | Yes | |
| verifiedAt | DateTime | | Yes | |
| status | ScholarVerificationStatus (enum) | | No | @default(VERIFICATION_PENDING) |
| documentUrls | String[] | | No | |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User ("scholarVerification") | One-to-one | Cascade |

---

## 86. Restrict
**Lines:** 3174-3184 | **Table:** `restricts`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| restricterId | String | | No | |
| restrictedId | String | | No | |
| createdAt | DateTime | | No | @default(now()) |

**Primary Key:** `@@id([restricterId, restrictedId])` (composite)

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| restricter | User ("restrictsCreated") | Many-to-one | Cascade |
| restricted | User ("restrictsReceived") | Many-to-one | Cascade |

**Indexes:**
- `@@index([restrictedId])`

---

## 87. DMNote
**Lines:** 3186-3196 | **Table:** `dm_notes`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| userId | String | @unique | No | |
| content | String | @db.VarChar(60) | No | |
| expiresAt | DateTime | | No | |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User ("dmNotes") | One-to-one | Cascade |

---

## 88. ScreenTimeLog
**Lines:** 3198-3210 | **Table:** `screen_time_logs`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| userId | String | | No | |
| date | DateTime | @db.Date | No | |
| totalSeconds | Int | | No | @default(0) |
| sessions | Int | | No | @default(0) |
| createdAt | DateTime | | No | @default(now()) |

**Unique Constraints:** `@@unique([userId, date])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User ("screenTimeLogs") | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId, date(sort: Desc)])`

---

## 89. QuietModeSetting
**Lines:** 3212-3225 | **Table:** `quiet_mode_settings`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| userId | String | @unique | No | |
| isActive | Boolean | | No | @default(false) |
| autoReply | String | @db.VarChar(200) | Yes | |
| startTime | String | | Yes | |
| endTime | String | | Yes | |
| isScheduled | Boolean | | No | @default(false) |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User ("quietMode") | One-to-one | Cascade |

---

## 90. OfflineDownload
**Lines:** 3233-3251 | **Table:** `offline_downloads`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| userId | String | | No | |
| contentType | ThumbnailContentType (enum) | | No | |
| contentId | String | | No | |
| quality | DownloadQuality (enum) | | No | @default(AUTO) |
| fileSize | Int | | No | @default(0) |
| status | DownloadStatus (enum) | | No | @default(PENDING) |
| progress | Float | | No | @default(0) |
| filePath | String | | Yes | |
| expiresAt | DateTime | | Yes | |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Unique Constraints:** `@@unique([userId, contentId])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId, status])`

---

## 91. VideoPremiere
**Lines:** 3253-3270 | **Table:** `video_premieres`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| videoId | String | @unique | No | |
| scheduledAt | DateTime | | No | |
| isLive | Boolean | | No | @default(false) |
| chatEnabled | Boolean | | No | @default(true) |
| reminderCount | Int | | No | @default(0) |
| viewerCount | Int | | No | @default(0) |
| countdownTheme | CountdownTheme (enum) | | No | @default(EMERALD) |
| trailerUrl | String | | Yes | |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| video | Video | One-to-one | Cascade |
| reminders | PremiereReminder[] | One-to-many | — |

**Indexes:**
- `@@index([scheduledAt])`

---

## 92. PremiereReminder
**Lines:** 3272-3281 | **Table:** `premiere_reminders`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| premiereId | String | | No | |
| userId | String | | No | |
| createdAt | DateTime | | No | @default(now()) |

**Primary Key:** `@@id([premiereId, userId])` (composite)

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User ("premiereReminders") | Many-to-one | Cascade |
| premiere | VideoPremiere | Many-to-one | Cascade |

---

## 93. VideoClip
**Lines:** 3283-3305 | **Table:** `video_clips`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| userId | String | | No | |
| sourceVideoId | String | | No | |
| title | String | @db.VarChar(100) | Yes | |
| startTime | Float | | No | |
| endTime | Float | | No | |
| duration | Float | | No | |
| clipUrl | String | | Yes | |
| streamId | String | | Yes | |
| hlsUrl | String | | Yes | |
| thumbnailUrl | String | | Yes | |
| viewsCount | Int | | No | @default(0) |
| likesCount | Int | | No | @default(0) |
| sharesCount | Int | | No | @default(0) |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User | Many-to-one | Cascade |
| sourceVideo | Video | Many-to-one | Cascade |

**Indexes:**
- `@@index([sourceVideoId])`
- `@@index([userId])`

---

## 94. EndScreen
**Lines:** 3307-3321 | **Table:** `end_screens`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| videoId | String | | No | |
| type | EndScreenType (enum) | | No | |
| targetId | String | | Yes | |
| label | String | @db.VarChar(60) | No | |
| url | String | | Yes | |
| position | String | | No | @default("bottom-right") |
| showAtSeconds | Float | | No | @default(10) |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| video | Video | Many-to-one | Cascade |

**Indexes:**
- `@@index([videoId])`

---

## 95. PlaylistCollaborator
**Lines:** 3323-3335 | **Table:** `playlist_collaborators`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| playlistId | String | | No | |
| userId | String | | No | |
| role | String | | No | @default("editor") |
| addedById | String | | No | |
| addedAt | DateTime | | No | @default(now()) |

**Primary Key:** `@@id([playlistId, userId])` (composite)

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| addedBy | User ("playlistCollabAdder") | Many-to-one | Cascade |
| playlist | Playlist | Many-to-one | Cascade |
| user | User ("PlaylistCollaborators") | Many-to-one | Cascade |

---

## 96. ParentalControl
**Lines:** 3337-3358 | **Table:** `parental_controls`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| parentUserId | String | | No | |
| childUserId | String | @unique | No | |
| pin | String | | No | |
| restrictedMode | Boolean | | No | @default(true) |
| maxAgeRating | String | | No | @default("PG") |
| dailyLimitMinutes | Int | | Yes | |
| dmRestriction | String | | No | @default("none") |
| canGoLive | Boolean | | No | @default(false) |
| canPost | Boolean | | No | @default(true) |
| canComment | Boolean | | No | @default(true) |
| activityDigest | Boolean | | No | @default(true) |
| lastDigestAt | DateTime | | Yes | |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Unique Constraints:** `@@unique([parentUserId, childUserId])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| parent | User ("ParentControls") | Many-to-one | Cascade |
| child | User ("ChildControls") | One-to-one | Cascade |

---

## 97. AiTranslation
**Lines:** 3362-3374 | **Table:** `ai_translations`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| contentType | TranslationContentType (enum) | | No | |
| contentId | String | | No | |
| sourceLanguage | String | | No | |
| targetLanguage | String | | No | |
| translatedText | String | @db.Text | No | |
| createdAt | DateTime | | No | @default(now()) |

**Unique Constraints:** `@@unique([contentId, targetLanguage])`

**Relations:** None (standalone polymorphic)

**Indexes:**
- `@@index([contentId])`

---

## 98. AiCaption
**Lines:** 3376-3388 | **Table:** `ai_captions`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| videoId | String | | No | |
| language | String | | No | |
| srtContent | String | @db.Text | No | |
| status | AiCaptionStatus (enum) | | No | @default(CAPTION_PENDING) |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Unique Constraints:** `@@unique([videoId, language])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| video | Video | Many-to-one | Cascade |

---

## 99. AiAvatar
**Lines:** 3390-3401 | **Table:** `ai_avatars`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| userId | String | | No | |
| sourceUrl | String | | No | |
| avatarUrl | String | | No | |
| style | AvatarStyle (enum) | | No | @default(DEFAULT) |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId])`

---

## 100. UserStreak
**Lines:** 3405-3418 | **Table:** `user_streaks`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| userId | String | | No | |
| streakType | StreakType (enum) | | No | @default(POSTING) |
| currentDays | Int | | No | @default(0) |
| longestDays | Int | | No | @default(0) |
| lastActiveDate | DateTime | @db.Date | No | |
| startedAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Unique Constraints:** `@@unique([userId, streakType])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User | Many-to-one | Cascade |

---

## 101. Achievement
**Lines:** 3420-3434 | **Table:** `achievements`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| key | String | @unique | No | Comment: first_post, 100_days, quran_khatmah, etc. |
| name | String | @db.VarChar(100) | No | |
| description | String | @db.VarChar(300) | No | |
| iconUrl | String | | Yes | |
| category | AchievementCategory (enum) | | No | |
| xpReward | Int | | No | @default(0) |
| rarity | AchievementRarity (enum) | | No | @default(COMMON) |
| criteria | String | @db.Text | No | JSON criteria for unlocking |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| unlocks | UserAchievement[] | One-to-many | — |

---

## 102. UserAchievement
**Lines:** 3436-3445 | **Table:** `user_achievements`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| userId | String | | No | |
| achievementId | String | | No | |
| unlockedAt | DateTime | | No | @default(now()) |

**Primary Key:** `@@id([userId, achievementId])` (composite)

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User | Many-to-one | Cascade |
| achievement | Achievement | Many-to-one | Cascade |

---

## 103. UserXP
**Lines:** 3447-3458 | **Table:** `user_xp`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| userId | String | @unique | No | |
| totalXP | Int | | No | @default(0) |
| level | Int | | No | @default(1) |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User | One-to-one | Cascade |
| history | XPHistory[] | One-to-many | — |

---

## 104. XPHistory
**Lines:** 3460-3470 | **Table:** `xp_history`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| userXPId | String | | No | |
| amount | Int | | No | |
| reason | String | | No | Comment: post_created, comment_helpful, quran_read, etc. |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| userXP | UserXP | Many-to-one | Cascade |

**Indexes:**
- `@@index([userXPId, createdAt(sort: Desc)])`

---

## 105. Challenge
**Lines:** 3472-3493 | **Table:** `challenges`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| title | String | @db.VarChar(200) | No | |
| description | String | @db.VarChar(1000) | No | |
| coverUrl | String | | Yes | |
| challengeType | ChallengeType (enum) | | No | |
| category | ChallengeCategory (enum) | | No | |
| targetCount | Int | | No | @default(1) |
| xpReward | Int | | No | @default(100) |
| startDate | DateTime | | No | |
| endDate | DateTime | | No | |
| isActive | Boolean | | No | @default(true) |
| createdById | String | | No | |
| participantCount | Int | | No | @default(0) |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| creator | User ("ChallengeCreator") | Many-to-one | Cascade |
| participants | ChallengeParticipant[] | One-to-many | — |

**Indexes:**
- `@@index([isActive, endDate])`

---

## 106. ChallengeParticipant
**Lines:** 3495-3507 | **Table:** `challenge_participants`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| challengeId | String | | No | |
| userId | String | | No | |
| progress | Int | | No | @default(0) |
| completed | Boolean | | No | @default(false) |
| completedAt | DateTime | | Yes | |
| joinedAt | DateTime | | No | @default(now()) |

**Primary Key:** `@@id([challengeId, userId])` (composite)

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| challenge | Challenge | Many-to-one | Cascade |
| user | User | Many-to-one | Cascade |

---

## 107. Series
**Lines:** 3509-3528 | **Table:** `series`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| userId | String | | No | |
| title | String | @db.VarChar(200) | No | |
| description | String | @db.VarChar(1000) | Yes | |
| coverUrl | String | | Yes | |
| category | SeriesCategory (enum) | | No | |
| episodeCount | Int | | No | @default(0) |
| followersCount | Int | | No | @default(0) |
| isComplete | Boolean | | No | @default(false) |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| creator | User | Many-to-one | Cascade |
| episodes | SeriesEpisode[] | One-to-many | — |
| followers | SeriesFollower[] | One-to-many | — |
| progress | SeriesProgress[] | One-to-many | — |

**Indexes:**
- `@@index([userId])`

---

## 108. SeriesEpisode
**Lines:** 3530-3551 | **Table:** `series_episodes`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| seriesId | String | | No | |
| number | Int | | No | |
| title | String | @db.VarChar(200) | No | |
| videoUrl | String | | Yes | |
| thumbnailUrl | String | | Yes | |
| duration | Int | | Yes | Comment: seconds |
| postId | String | | Yes | |
| reelId | String | | Yes | |
| videoId | String | | Yes | |
| releasedAt | DateTime | | Yes | |
| createdAt | DateTime | | No | @default(now()) |

**Unique Constraints:** `@@unique([seriesId, number])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| series | Series | Many-to-one | Cascade |
| post | Post ("seriesEpisodePosts") | Many-to-one | SetNull |
| reel | Reel ("seriesEpisodeReels") | Many-to-one | SetNull |
| video | Video ("seriesEpisodeVideos") | Many-to-one | SetNull |

**Indexes:**
- `@@index([seriesId, number])`

---

## 109. SeriesFollower
**Lines:** 3553-3563 | **Table:** `series_followers`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| seriesId | String | | No | |
| userId | String | | No | |
| followedAt | DateTime | | No | @default(now()) |

**Primary Key:** `@@id([seriesId, userId])` (composite)

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User ("seriesFollows") | Many-to-one | Cascade |
| series | Series | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId])`

---

## 110. ThumbnailVariant
**Lines:** 3565-3577 | **Table:** `thumbnail_variants`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| contentType | ThumbnailContentType (enum) | | No | |
| contentId | String | | No | |
| thumbnailUrl | String | | No | |
| impressions | Int | | No | @default(0) |
| clicks | Int | | No | @default(0) |
| isWinner | Boolean | | No | @default(false) |
| createdAt | DateTime | | No | @default(now()) |

**Relations:** None (standalone polymorphic)

**Indexes:**
- `@@index([contentType, contentId])`

---

## 111. SeriesProgress
**Lines:** 3579-3592 | **Table:** `series_progress`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| seriesId | String | | No | |
| userId | String | | No | |
| lastEpisodeNum | Int | | No | |
| lastTimestamp | Int | | No | @default(0) |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Unique Constraints:** `@@unique([seriesId, userId])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| series | Series | Many-to-one | Cascade |
| user | User ("seriesProgress") | Many-to-one | Cascade |

---

## 112. ProfileCustomization
**Lines:** 3594-3610 | **Table:** `profile_customizations`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| userId | String | @unique | No | |
| accentColor | String | @db.VarChar(7) | Yes | Comment: hex color |
| layoutStyle | ProfileLayout (enum) | | No | @default(DEFAULT) |
| backgroundUrl | String | | Yes | |
| backgroundMusic | String | | Yes | Comment: audio track URL |
| showBadges | Boolean | | No | @default(true) |
| showLevel | Boolean | | No | @default(true) |
| showStreak | Boolean | | No | @default(true) |
| bioFont | ProfileBioFont (enum) | | No | @default(DEFAULT) |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User | One-to-one | Cascade |

---

## 113. Product
**Lines:** 3614-3644 | **Table:** `products`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| sellerId | String | | No | |
| title | String | @db.VarChar(200) | No | |
| description | String | @db.VarChar(2000) | No | |
| price | Decimal | @db.Decimal(12, 2) | No | |
| currency | String | | No | @default("USD") |
| images | String[] | | No | Comment: array of image URLs |
| category | ProductCategory (enum) | | No | |
| isHalal | Boolean | | No | @default(true) |
| halalCertUrl | String | | Yes | |
| isMuslimOwned | Boolean | | No | @default(false) |
| stock | Int | | No | @default(0) |
| status | ProductStatus (enum) | | No | @default(ACTIVE) |
| rating | Decimal | @db.Decimal(3, 2) | No | @default(0) |
| reviewCount | Int | | No | @default(0) |
| salesCount | Int | | No | @default(0) |
| tags | String[] | | No | |
| location | String | | Yes | |
| shippingInfo | String | @db.VarChar(500) | Yes | |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| seller | User ("ProductSeller") | Many-to-one | Cascade |
| reviews | ProductReview[] | One-to-many | — |
| orders | Order[] | One-to-many | — |
| productTags | PostProductTag[] | One-to-many | — |

**Indexes:**
- `@@index([sellerId])`
- `@@index([category, status])`

---

## 114. ProductReview
**Lines:** 3646-3658 | **Table:** `product_reviews`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| productId | String | | No | |
| userId | String | | No | |
| rating | Int | | No | Comment: 1-5 |
| comment | String | @db.VarChar(500) | Yes | |
| createdAt | DateTime | | No | @default(now()) |

**Unique Constraints:** `@@unique([productId, userId])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| product | Product | Many-to-one | Cascade |
| user | User | Many-to-one | Cascade |

---

## 115. Order
**Lines:** 3660-3681 | **Table:** `orders`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| buyerId | String | | Yes | |
| productId | String | | No | |
| quantity | Int | | No | @default(1) |
| totalAmount | Decimal | @db.Decimal(12, 2) | No | |
| currency | String | | No | @default("USD") |
| status | OrderStatus (enum) | | No | @default(PENDING) |
| stripePaymentId | String | | Yes | |
| installments | Int | | No | @default(1) — 1=full, 2-4=split |
| shippingAddress | String | @db.VarChar(500) | Yes | |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| buyer | User ("OrderBuyer") | Many-to-one | SetNull |
| product | Product | Many-to-one | Cascade |

**Indexes:**
- `@@index([buyerId])`
- `@@index([buyerId, createdAt])`
- `@@index([productId])`
- `@@index([status])`

---

## 116. PostProductTag
**Lines:** 3683-3693 | **Table:** `post_product_tags`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| postId | String | | No | |
| productId | String | | No | |
| position | String | | Yes | Comment: x,y coordinates on image |
| createdAt | DateTime | | No | @default(now()) |

**Primary Key:** `@@id([postId, productId])` (composite)

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| post | Post ("productTags") | Many-to-one | Cascade |
| product | Product | Many-to-one | Cascade |

---

## 117. HalalBusiness
**Lines:** 3695-3723 | **Table:** `halal_businesses`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| ownerId | String | | No | |
| name | String | @db.VarChar(200) | No | |
| description | String | @db.VarChar(1000) | Yes | |
| category | HalalCategory (enum) | | No | |
| address | String | @db.VarChar(500) | Yes | |
| lat | Float | | Yes | |
| lng | Float | | Yes | |
| phone | String | | Yes | |
| website | String | | Yes | |
| avatarUrl | String | | Yes | |
| coverUrl | String | | Yes | |
| isVerified | Boolean | | No | @default(false) |
| isMuslimOwned | Boolean | | No | @default(true) |
| rating | Decimal | @db.Decimal(3, 2) | No | @default(0) |
| reviewCount | Int | | No | @default(0) |
| halalCertUrl | String | | Yes | |
| openingHours | String | @db.VarChar(500) | Yes | Comment: JSON |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| owner | User ("BusinessOwner") | Many-to-one | Cascade |
| reviews | BusinessReview[] | One-to-many | — |
| verifyVotes | HalalVerifyVote[] ("halalVerifyVotes") | One-to-many | — |

**Indexes:**
- `@@index([category])`
- `@@index([lat, lng])`

---

## 118. BusinessReview
**Lines:** 3725-3737 | **Table:** `business_reviews`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| businessId | String | | No | |
| userId | String | | No | |
| rating | Int | | No | Comment: 1-5 |
| comment | String | @db.VarChar(500) | Yes | |
| createdAt | DateTime | | No | @default(now()) |

**Unique Constraints:** `@@unique([businessId, userId])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| business | HalalBusiness | Many-to-one | Cascade |
| user | User | Many-to-one | Cascade |

---

## 119. ZakatFund
**Lines:** 3739-3758 | **Table:** `zakat_funds`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| recipientId | String | | No | |
| title | String | @db.VarChar(200) | No | |
| description | String | @db.VarChar(2000) | No | |
| goalAmount | Decimal | @db.Decimal(12, 2) | No | |
| raisedAmount | Decimal | @db.Decimal(12, 2) | No | @default(0) |
| currency | String | | No | @default("USD") |
| category | ZakatCategory (enum) | | No | |
| isVerified | Boolean | | No | @default(false) |
| verifiedById | String | | Yes | |
| status | String | | No | @default("active") — active / completed / closed |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| verifiedBy | User ("zakatFundVerifier") | Many-to-one | SetNull |
| recipient | User ("ZakatRecipient") | Many-to-one | Cascade |
| donations | ZakatDonation[] | One-to-many | — |

---

## 120. ZakatDonation
**Lines:** 3760-3776 | **Table:** `zakat_donations`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| fundId | String | | No | |
| donorId | String | | Yes | |
| amount | Decimal | @db.Decimal(12, 2) | No | |
| currency | String | | No | @default("USD") |
| isAnonymous | Boolean | | No | @default(false) |
| stripePaymentId | String | | Yes | |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| fund | ZakatFund | Many-to-one | Cascade |
| donor | User ("ZakatDonor") | Many-to-one | SetNull |

**Indexes:**
- `@@index([fundId])`
- `@@index([donorId])`
- `@@index([donorId, createdAt(sort: Desc)])`

---

## 121. CommunityTreasury
**Lines:** 3778-3797 | **Table:** `community_treasuries`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| circleId | String | | No | |
| title | String | @db.VarChar(200) | No | |
| description | String | @db.VarChar(1000) | Yes | |
| goalAmount | Decimal | @db.Decimal(12, 2) | No | |
| raisedAmount | Decimal | @db.Decimal(12, 2) | No | @default(0) |
| currency | String | | No | @default("USD") |
| status | String | | No | @default("active") — active / completed / closed |
| createdById | String | | No | |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| circle | Circle ("communityTreasuries") | Many-to-one | Cascade |
| creator | User ("TreasuryCreator") | Many-to-one | Cascade |
| contributions | TreasuryContribution[] | One-to-many | — |

**Indexes:**
- `@@index([circleId])`
- `@@index([createdById])`

---

## 122. TreasuryContribution
**Lines:** 3799-3812 | **Table:** `treasury_contributions`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| treasuryId | String | | No | |
| userId | String | | Yes | |
| amount | Decimal | @db.Decimal(12, 2) | No | |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| treasury | CommunityTreasury | Many-to-one | Cascade |
| user | User ("TreasuryContributor") | Many-to-one | SetNull |

**Indexes:**
- `@@index([treasuryId])`
- `@@index([userId])`
- `@@index([userId, createdAt(sort: Desc)])`

---

## 123. PremiumSubscription
**Lines:** 3814-3828 | **Table:** `premium_subscriptions`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| userId | String | @unique | No | |
| plan | SubscriptionPlan (enum) | | No | @default(MONTHLY) |
| status | SubscriptionStatus (enum) | | No | @default(ACTIVE) |
| stripeSubId | String | | Yes | |
| startDate | DateTime | | No | @default(now()) |
| endDate | DateTime | | Yes | |
| autoRenew | Boolean | | No | @default(true) |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User | One-to-one | Cascade |

---

## 124. LocalBoard
**Lines:** 3832-3849 | **Table:** `local_boards`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| name | String | @db.VarChar(200) | No | |
| description | String | @db.VarChar(1000) | Yes | |
| city | String | | No | |
| country | String | | No | |
| lat | Float | | Yes | |
| lng | Float | | Yes | |
| membersCount | Int | | No | @default(0) |
| postsCount | Int | | No | @default(0) |
| createdById | String | | No | |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| creator | User ("BoardCreator") | Many-to-one | Cascade |

**Indexes:**
- `@@index([city, country])`
- `@@index([createdById])`

---

## 125. Mentorship
**Lines:** 3851-3868 | **Table:** `mentorships`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| mentorId | String | | No | |
| menteeId | String | | No | |
| status | MentorshipStatus (enum) | | No | @default(MENTORSHIP_PENDING) |
| topic | FatwaTopicType (enum) | | No | |
| notes | String | @db.VarChar(1000) | Yes | |
| startedAt | DateTime | | Yes | |
| completedAt | DateTime | | Yes | |
| createdAt | DateTime | | No | @default(now()) |

**Unique Constraints:** `@@unique([mentorId, menteeId])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| mentor | User ("MentorOf") | Many-to-one | Cascade |
| mentee | User ("MenteeOf") | Many-to-one | Cascade |

**Indexes:**
- `@@index([mentorId])`
- `@@index([menteeId])`

---

## 126. StudyCircle
**Lines:** 3870-3887 | **Table:** `study_circles`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| leaderId | String | | No | |
| title | String | @db.VarChar(200) | No | |
| description | String | @db.VarChar(1000) | Yes | |
| topic | ScholarTopicType (enum) | | No | |
| schedule | String | @db.VarChar(200) | Yes | Comment: "Every Sunday 7 PM" |
| isOnline | Boolean | | No | @default(true) |
| maxMembers | Int | | No | @default(20) |
| membersCount | Int | | No | @default(0) |
| isActive | Boolean | | No | @default(true) |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| leader | User ("CircleLeader") | Many-to-one | Cascade |

**Indexes:**
- `@@index([topic, isActive])`
- `@@index([leaderId])`

---

## 127. FatwaQuestion
**Lines:** 3889-3907 | **Table:** `fatwa_questions`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| askerId | String | | No | |
| question | String | @db.VarChar(2000) | No | |
| madhab | MadhhabType (enum) | | Yes | |
| language | String | | No | @default("en") |
| status | FatwaStatus (enum) | | No | @default(FATWA_PENDING) |
| answerId | String | | Yes | |
| answeredBy | String | | Yes | |
| answeredAt | DateTime | | Yes | |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| asker | User ("FatwaAsker") | Many-to-one | Cascade |
| answer | FatwaQuestion ("FatwaAnswer") | Self-referencing many-to-one | SetNull |
| answeredQuestions | FatwaQuestion[] ("FatwaAnswer") | Self-referencing one-to-many | — |

**Indexes:**
- `@@index([status, madhab])`
- `@@index([askerId])`

---

## 128. VolunteerOpportunity
**Lines:** 3909-3928 | **Table:** `volunteer_opportunities`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| organizerId | String | | No | |
| title | String | @db.VarChar(200) | No | |
| description | String | @db.VarChar(2000) | No | |
| category | VolunteerCategory (enum) | | No | |
| location | String | | Yes | |
| lat | Float | | Yes | |
| lng | Float | | Yes | |
| date | DateTime | | Yes | |
| spotsTotal | Int | | No | @default(10) |
| spotsFilled | Int | | No | @default(0) |
| isActive | Boolean | | No | @default(true) |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| organizer | User ("VolunteerOrganizer") | Many-to-one | Cascade |

**Indexes:**
- `@@index([category, isActive])`
- `@@index([organizerId])`

---

## 129. IslamicEvent
**Lines:** 3930-3951 | **Table:** `islamic_events`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| organizerId | String | | No | |
| title | String | @db.VarChar(200) | No | |
| description | String | @db.VarChar(2000) | Yes | |
| eventType | IslamicEventType (enum) | | No | |
| location | String | | Yes | |
| lat | Float | | Yes | |
| lng | Float | | Yes | |
| startDate | DateTime | | No | |
| endDate | DateTime | | Yes | |
| isOnline | Boolean | | No | @default(false) |
| streamUrl | String | | Yes | |
| attendeeCount | Int | | No | @default(0) |
| coverUrl | String | | Yes | |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| organizer | User ("EventOrganizer") | Many-to-one | Cascade |

**Indexes:**
- `@@index([eventType, startDate])`
- `@@index([organizerId])`

---

## 130. UserReputation
**Lines:** 3953-3966 | **Table:** `user_reputations`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| userId | String | @unique | No | |
| score | Int | | No | @default(0) |
| helpfulCount | Int | | No | @default(0) |
| reportedCount | Int | | No | @default(0) |
| warningCount | Int | | No | @default(0) |
| tier | ReputationTier (enum) | | No | @default(NEWCOMER) |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User | One-to-one | Cascade |

---

## 131. VoicePost
**Lines:** 3968-3982 | **Table:** `voice_posts`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| userId | String | | No | |
| audioUrl | String | | No | |
| duration | Float | | No | Comment: seconds |
| transcript | String | @db.Text | Yes | |
| likesCount | Int | | No | @default(0) |
| commentsCount | Int | | No | @default(0) |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId])`
- `@@index([createdAt])`

---

## 132. WatchParty
**Lines:** 3984-4001 | **Table:** `watch_parties`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| hostId | String | | No | |
| videoId | String | | No | |
| title | String | @db.VarChar(200) | No | |
| isActive | Boolean | | No | @default(false) |
| viewerCount | Int | | No | @default(0) |
| startedAt | DateTime | | Yes | |
| endedAt | DateTime | | Yes | |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| video | Video ("watchParties") | Many-to-one | Cascade |
| host | User | Many-to-one | Cascade |

**Indexes:**
- `@@index([hostId])`
- `@@index([videoId])`
- `@@index([isActive])`

---

## 133. SharedCollection
**Lines:** 4003-4017 | **Table:** `shared_collections`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| name | String | @db.VarChar(100) | No | |
| description | String | @db.VarChar(300) | Yes | |
| createdById | String | | No | |
| isPublic | Boolean | | No | @default(false) |
| itemCount | Int | | No | @default(0) |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| creator | User ("CollectionCreator") | Many-to-one | Cascade |

**Indexes:**
- `@@index([createdById])`
- `@@index([isPublic])`

---

## 134. WaqfFund
**Lines:** 4019-4033 | **Table:** `waqf_funds`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| title | String | @db.VarChar(200) | No | |
| description | String | @db.VarChar(2000) | No | |
| goalAmount | Decimal | @db.Decimal(12, 2) | No | |
| raisedAmount | Decimal | @db.Decimal(12, 2) | No | @default(0) |
| createdById | String | | No | |
| isActive | Boolean | | No | @default(true) |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| creator | User ("WaqfCreator") | Many-to-one | Cascade |
| donations | WaqfDonation[] | One-to-many | — |

**Indexes:**
- `@@index([createdById])`

---

## 135. WaqfDonation
**Lines:** 4035-4048 | **Table:** `waqf_donations`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| fundId | String | | No | |
| userId | String | | Yes | |
| amount | Decimal | @db.Decimal(12, 2) | No | |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| fund | WaqfFund | Many-to-one | Cascade |
| user | User ("waqfDonations") | Many-to-one | SetNull |

**Indexes:**
- `@@index([fundId])`
- `@@index([userId])`
- `@@index([userId, createdAt(sort: Desc)])`

---

## 136. SavedMessage
**Lines:** 4052-4066 | **Table:** `saved_messages`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| userId | String | | No | |
| content | String | @db.Text | Yes | |
| mediaUrl | String | | Yes | |
| mediaType | String | | Yes | |
| forwardedFromType | ForwardedFromType (enum) | | Yes | |
| forwardedFromId | String | | Yes | |
| isPinned | Boolean | | No | @default(false) |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId, createdAt(sort: Desc)])`

---

## 137. ChatFolder
**Lines:** 4068-4085 | **Table:** `chat_folders`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| userId | String | | No | |
| name | String | @db.VarChar(50) | No | |
| icon | String | | Yes | Comment: emoji or icon name |
| position | Int | | No | @default(0) |
| filterType | ChatFolderFilterType (enum) | | No | @default(INCLUDE) |
| conversationIds | String[] | | No | Comment: array of conversation IDs |
| includeGroups | Boolean | | No | @default(false) |
| includeChannels | Boolean | | No | @default(false) |
| includeBots | Boolean | | No | @default(false) |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId, position])`

---

## 138. AdminLog
**Lines:** 4087-4102 | **Table:** `admin_logs`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| groupId | String | | No | Comment: conversationId |
| adminId | String | | No | |
| action | AdminLogAction (enum) | | No | |
| targetId | String | | Yes | Comment: userId or messageId affected |
| details | String | @db.VarChar(500) | Yes | |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| group | Conversation | Many-to-one | Cascade |
| admin | User ("adminLogs") | Many-to-one | Cascade |
| target | User ("adminLogTargets") | Many-to-one | SetNull |

**Indexes:**
- `@@index([groupId, createdAt(sort: Desc)])`
- `@@index([adminId])`

---

## 139. GroupTopic
**Lines:** 4104-4121 | **Table:** `group_topics`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| conversationId | String | | No | |
| name | String | @db.VarChar(100) | No | |
| iconColor | String | | Yes | Comment: hex color for topic icon |
| isPinned | Boolean | | No | @default(false) |
| isClosed | Boolean | | No | @default(false) |
| messageCount | Int | | No | @default(0) |
| lastMessageAt | DateTime | | Yes | |
| createdById | String | | No | |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| conversation | Conversation | Many-to-one | Cascade |
| createdBy | User ("groupTopics") | Many-to-one | Cascade |

**Indexes:**
- `@@index([conversationId, isPinned])`

---

## 140. CustomEmoji
**Lines:** 4123-4135 | **Table:** `custom_emojis`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| packId | String | | No | |
| shortcode | String | | No | Comment: :emoji_name: |
| imageUrl | String | | No | |
| isAnimated | Boolean | | No | @default(false) |
| createdAt | DateTime | | No | @default(now()) |

**Unique Constraints:** `@@unique([packId, shortcode])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| pack | CustomEmojiPack | Many-to-one | Cascade |

**Indexes:**
- `@@index([packId])`

---

## 141. CustomEmojiPack
**Lines:** 4137-4150 | **Table:** `custom_emoji_packs`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| creatorId | String | | No | |
| name | String | @db.VarChar(100) | No | |
| description | String | @db.VarChar(300) | Yes | |
| thumbnailUrl | String | | Yes | |
| isPublic | Boolean | | No | @default(true) |
| usageCount | Int | | No | @default(0) |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| creator | User ("EmojiPackCreator") | Many-to-one | Cascade |
| emojis | CustomEmoji[] | One-to-many | — |

---

## 142. ForumThread
**Lines:** 4154-4173 | **Table:** `forum_threads`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| circleId | String | | No | Comment: community/server |
| title | String | @db.VarChar(200) | No | |
| content | String | @db.Text | No | |
| authorId | String | | No | **Exception: uses authorId NOT userId** |
| isPinned | Boolean | | No | @default(false) |
| isLocked | Boolean | | No | @default(false) |
| replyCount | Int | | No | @default(0) |
| lastReplyAt | DateTime | | Yes | |
| tags | String[] | | No | |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| circle | Circle ("forumThreads") | Many-to-one | Cascade |
| author | User ("ForumThreadAuthor") | Many-to-one | Cascade |
| replies | ForumReply[] | One-to-many | — |

**Indexes:**
- `@@index([circleId, isPinned, lastReplyAt(sort: Desc)])`

---

## 143. ForumReply
**Lines:** 4175-4188 | **Table:** `forum_replies`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| threadId | String | | No | |
| authorId | String | | No | **Exception: uses authorId NOT userId** |
| content | String | @db.Text | No | |
| likesCount | Int | | No | @default(0) |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| thread | ForumThread | Many-to-one | Cascade |
| author | User ("ForumReplyAuthor") | Many-to-one | Cascade |

**Indexes:**
- `@@index([threadId, createdAt])`
- `@@index([authorId])`

---

## 144. Webhook
**Lines:** 4190-4209 | **Table:** `webhooks`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| circleId | String | | No | |
| name | String | @db.VarChar(100) | No | |
| avatarUrl | String | | Yes | |
| token | String | @unique | No | @default(uuid()) |
| targetChannelId | String | | Yes | |
| url | String | @db.VarChar(500) | Yes | |
| secret | String | @db.VarChar(64) | Yes | |
| events | String[] | | No | |
| createdById | String | | No | |
| isActive | Boolean | | No | @default(true) |
| lastUsedAt | DateTime | | Yes | |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| circle | Circle ("webhooks") | Many-to-one | Cascade |
| creator | User ("WebhookCreator") | Many-to-one | Cascade |

**Indexes:**
- `@@index([circleId])`

---

## 145. StageSession
**Lines:** 4211-4228 | **Table:** `stage_sessions`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| circleId | String | | No | |
| title | String | @db.VarChar(200) | No | |
| hostId | String | | No | |
| status | StageSessionStatus (enum) | | No | @default(STAGE_SCHEDULED) |
| speakerIds | String[] | | No | |
| audienceCount | Int | | No | @default(0) |
| scheduledAt | DateTime | | Yes | |
| startedAt | DateTime | | Yes | |
| endedAt | DateTime | | Yes | |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| circle | Circle ("stageSessions") | Many-to-one | Cascade |
| host | User ("StageHost") | Many-to-one | Cascade |

**Indexes:**
- `@@index([circleId, status])`

---

## 146. Embedding
**Lines:** 4241-4258 | **Table:** `embeddings`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| contentId | String | | No | |
| contentType | EmbeddingContentType (enum) | | No | Values: POST, REEL, THREAD, VIDEO |
| vector | Unsupported("vector(768)") | | No | pgvector 768-dim |
| metadata | Json | | Yes | |
| postId | String | | Yes | |
| userId | String | | Yes | |
| createdAt | DateTime | | No | @default(now()) |
| updatedAt | DateTime | @updatedAt | No | |

**Unique Constraints:** `@@unique([contentId, contentType])`

**Relations:** None (standalone, uses Unsupported type for pgvector)

**Indexes:**
- `@@index([contentType])`
- `@@index([contentType, contentId])`
- `@@index([postId])`
- `@@index([userId])`

**Note:** Uses HNSW vector index for KNN search (created via raw SQL migration, not shown in Prisma schema).

---

## 147. CreatorEarning
**Lines:** 4264-4277 | **Table:** `creator_earnings`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(uuid()) |
| userId | String | | Yes | |
| amount | Decimal | @db.Decimal(12, 2) | No | |
| currency | String | @db.VarChar(3) | No | @default("USD") |
| type | EarningType (enum) | | No | |
| diamonds | Int | | No | @default(0) |
| year | Int | | No | |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User ("CreatorEarnings") | Many-to-one | SetNull |

**Indexes:**
- `@@index([userId, year])`

---

## 148. ViewerDemographic
**Lines:** 4283-4298 | **Table:** `viewer_demographics`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| videoId | String | | Yes | |
| channelId | String | | Yes | |
| country | String | @db.VarChar(2) | No | |
| ageRange | String | @db.VarChar(10) | No | Comment: 13-17, 18-24, 25-34, 35-44, 45-54, 55+ |
| gender | String | @db.VarChar(10) | No | Comment: male, female, other |
| source | String | @db.VarChar(20) | No | @default("browse") — search, browse, suggested, external, direct |
| viewDate | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| video | Video ("viewerDemographics") | Many-to-one | SetNull |
| channel | Channel ("viewerDemographics") | Many-to-one | SetNull |

**Indexes:**
- `@@index([videoId, viewDate])`
- `@@index([channelId, viewDate])`

---

## 149. VideoChapter
**Lines:** 4304-4315 | **Table:** `video_chapters`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| videoId | String | | No | |
| title | String | @db.VarChar(200) | No | |
| timestampSeconds | Int | | No | |
| order | Int | | No | @default(0) |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| video | Video ("videoChapters") | Many-to-one | Cascade |

**Indexes:**
- `@@index([videoId])`

---

## 150. CommunityRole
**Lines:** 4321-4340 | **Table:** `community_roles`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| communityId | String | | No | |
| name | String | @db.VarChar(100) | No | |
| color | String | @db.VarChar(7) | Yes | |
| position | Int | | No | @default(0) |
| canSendMessages | Boolean | | No | @default(true) |
| canPostMedia | Boolean | | No | @default(true) |
| canInvite | Boolean | | No | @default(false) |
| canKick | Boolean | | No | @default(false) |
| canBan | Boolean | | No | @default(false) |
| canManageRoles | Boolean | | No | @default(false) |
| canManageChannels | Boolean | | No | @default(false) |
| canSpeak | Boolean | | No | @default(true) |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| community | Circle ("communityRoles") | Many-to-one | Cascade |

**Indexes:**
- `@@index([communityId, position])`

---

## 151. HifzProgress
**Lines:** 4346-4358 | **Table:** `hifz_progress`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| userId | String | | No | |
| surahNum | Int | | No | Comment: 1-114 |
| status | HifzStatus (enum) | | No | @default(NOT_STARTED) |
| lastReviewedAt | DateTime | | Yes | |
| updatedAt | DateTime | @updatedAt | No | |

**Unique Constraints:** `@@unique([userId, surahNum])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User ("hifzProgressRecords") | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId])`

---

## 152. MosqueCommunity
**Lines:** 4364-4389 | **Table:** `mosque_communities`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| name | String | | No | |
| address | String | | No | |
| city | String | | No | |
| country | String | | No | |
| latitude | Float | | No | |
| longitude | Float | | No | |
| madhab | String | | Yes | Comment: hanafi, shafi, maliki, hanbali |
| language | String | | Yes | |
| phone | String | | Yes | |
| website | String | | Yes | |
| imageUrl | String | | Yes | |
| memberCount | Int | | No | @default(0) |
| createdById | String | | No | |
| isVerified | Boolean | | No | @default(false) |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| createdBy | User ("mosqueCommunitiesCreated") | Many-to-one | Cascade |
| memberships | MosqueMembership[] | One-to-many | — |
| posts | MosquePost[] | One-to-many | — |

**Indexes:**
- `@@index([latitude, longitude])`
- `@@index([city])`

---

## 153. MosqueMembership
**Lines:** 4391-4402 | **Table:** `mosque_memberships`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| mosqueId | String | | No | |
| userId | String | | No | |
| role | String | | No | @default("member") — member, admin, imam |
| createdAt | DateTime | | No | @default(now()) |

**Unique Constraints:** `@@unique([mosqueId, userId])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| mosque | MosqueCommunity | Many-to-one | Cascade |
| user | User ("mosqueMemberships") | Many-to-one | Cascade |

---

## 154. MosquePost
**Lines:** 4404-4417 | **Table:** `mosque_posts`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| mosqueId | String | | No | |
| userId | String | | No | |
| content | String | | No | |
| mediaUrls | String[] | | No | |
| isPinned | Boolean | | No | @default(false) |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| mosque | MosqueCommunity | Many-to-one | Cascade |
| user | User ("mosquePosts") | Many-to-one | Cascade |

**Indexes:**
- `@@index([mosqueId, createdAt(sort: Desc)])`

---

## 155. ScholarQA
**Lines:** 4423-4443 | **Table:** `scholar_qa`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| scholarId | String | | No | |
| title | String | | No | |
| description | String | | Yes | |
| category | ScholarQACategory (enum) | | No | |
| language | String | | No | @default("en") |
| scheduledAt | DateTime | | No | |
| startedAt | DateTime | | Yes | |
| endedAt | DateTime | | Yes | |
| recordingUrl | String | | Yes | |
| status | ScholarQAStatus (enum) | | No | @default(QA_SCHEDULED) |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| scholar | User ("scholarQAs") | Many-to-one | Cascade |
| questions | ScholarQuestion[] | One-to-many | — |

**Indexes:**
- `@@index([scheduledAt])`
- `@@index([scholarId])`

---

## 156. ScholarQuestion
**Lines:** 4445-4460 | **Table:** `scholar_questions`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| qaId | String | | No | |
| userId | String | | No | |
| question | String | | No | |
| votes | Int | | No | @default(0) |
| isAnswered | Boolean | | No | @default(false) |
| answeredAt | DateTime | | Yes | |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| qa | ScholarQA | Many-to-one | Cascade |
| user | User ("scholarQuestions") | Many-to-one | Cascade |
| voteRecords | ScholarQuestionVote[] ("scholarQuestionVotes") | One-to-many | — |

**Indexes:**
- `@@index([qaId, votes(sort: Desc)])`

---

## 157. DuaBookmark
**Lines:** 4466-4476 | **Table:** `dua_bookmarks`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| userId | String | | No | |
| duaId | String | | No | |
| createdAt | DateTime | | No | @default(now()) |

**Unique Constraints:** `@@unique([userId, duaId])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User ("duaBookmarks") | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId])`

---

## 158. CommunityNote
**Lines:** 4482-4499 | **Table:** `community_notes`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| contentType | EmbeddingContentType (enum) | | No | |
| contentId | String | | No | |
| authorId | String | | No | |
| note | String | | No | |
| status | CommunityNoteStatus (enum) | | No | @default(PROPOSED) |
| helpfulVotes | Int | | No | @default(0) |
| notHelpfulVotes | Int | | No | @default(0) |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| author | User ("communityNotes") | Many-to-one | Cascade |
| ratings | CommunityNoteRating[] | One-to-many | — |

**Indexes:**
- `@@index([contentType, contentId])`
- `@@index([authorId])`

---

## 159. CommunityNoteRating
**Lines:** 4501-4513 | **Table:** `community_note_ratings`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| noteId | String | | No | |
| userId | String | | No | |
| rating | NoteRating (enum) | | No | |
| createdAt | DateTime | | No | @default(now()) |

**Unique Constraints:** `@@unique([noteId, userId])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| note | CommunityNote | Many-to-one | Cascade |
| user | User ("communityNoteRatings") | Many-to-one | Cascade |

**Indexes:**
- `@@index([noteId])`

---

## 160. CollabInvite
**Lines:** 4519-4534 | **Table:** `collab_invites`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| postId | String | | No | |
| inviterId | String | | No | |
| inviteeId | String | | No | |
| status | CollabInviteStatus (enum) | | No | @default(COLLAB_PENDING) |
| createdAt | DateTime | | No | @default(now()) |

**Unique Constraints:** `@@unique([postId, inviteeId])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| post | Post ("collabInvites") | Many-to-one | Cascade |
| inviter | User ("collabInvitesSent") | Many-to-one | Cascade |
| invitee | User ("collabInvitesReceived") | Many-to-one | Cascade |

**Indexes:**
- `@@index([inviteeId, status])`
- `@@index([inviterId])`

---

## 161. MessageChecklist
**Lines:** 4540-4553 | **Table:** `message_checklists`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| conversationId | String | | No | |
| title | String | | No | |
| createdById | String | | No | |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| conversation | Conversation | Many-to-one | Cascade |
| createdBy | User ("messageChecklists") | Many-to-one | Cascade |
| items | MessageChecklistItem[] | One-to-many | — |

**Indexes:**
- `@@index([conversationId])`

---

## 162. MessageChecklistItem
**Lines:** 4555-4565 | **Table:** `message_checklist_items`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| checklistId | String | | No | |
| text | String | | No | |
| isCompleted | Boolean | | No | @default(false) |
| completedBy | String | | Yes | |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| checklist | MessageChecklist | Many-to-one | Cascade |

---

## 163. FastingLog
**Lines:** 4571-4584 | **Table:** `fasting_logs`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| userId | String | | No | |
| date | DateTime | @db.Date | No | |
| isFasting | Boolean | | No | |
| fastType | FastingType (enum) | | No | @default(RAMADAN) |
| reason | String | | Yes | Comment: if not fasting: travel, illness, menstruation, other |
| createdAt | DateTime | | No | @default(now()) |

**Unique Constraints:** `@@unique([userId, date])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User ("fastingLogs") | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId, date])`

---

## 164. HalalRestaurant
**Lines:** 4590-4618 | **Table:** `halal_restaurants`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| name | String | | No | |
| address | String | | No | |
| city | String | | No | |
| country | String | | No | |
| latitude | Float | | No | |
| longitude | Float | | No | |
| cuisineType | String | | Yes | |
| priceRange | Int | | Yes | Comment: 1-4 |
| halalCertified | Boolean | | No | @default(false) |
| certifyingBody | String | | Yes | |
| phone | String | | Yes | |
| website | String | | Yes | |
| imageUrl | String | | Yes | |
| averageRating | Decimal | @db.Decimal(3, 2) | No | @default(0) |
| reviewCount | Int | | No | @default(0) |
| verifyVotes | Int | | No | @default(0) |
| addedById | String | | Yes | |
| isVerified | Boolean | | No | @default(false) |
| createdAt | DateTime | | No | @default(now()) |

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| addedBy | User ("halalRestaurantsAdded") | Many-to-one | SetNull |
| reviews | HalalRestaurantReview[] | One-to-many | — |

**Indexes:**
- `@@index([latitude, longitude])`
- `@@index([city])`

---

## 165. HalalRestaurantReview
**Lines:** 4620-4632 | **Table:** `halal_restaurant_reviews`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| restaurantId | String | | No | |
| userId | String | | No | |
| rating | Int | | No | Comment: 1-5 |
| comment | String | | Yes | |
| createdAt | DateTime | | No | @default(now()) |

**Unique Constraints:** `@@unique([restaurantId, userId])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| restaurant | HalalRestaurant | Many-to-one | Cascade |
| user | User ("halalRestaurantReviews") | Many-to-one | Cascade |

---

## 166. VideoCommentLike
**Lines:** 4638-4649 | **Table:** `video_comment_likes`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| userId | String | | No | |
| commentId | String | | No | |
| createdAt | DateTime | | No | @default(now()) |

**Unique Constraints:** `@@unique([userId, commentId])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User ("videoCommentLikes") | Many-to-one | Cascade |
| comment | VideoComment ("videoCommentLikes") | Many-to-one | Cascade |

**Indexes:**
- `@@index([commentId])`

---

## 167. ScholarQuestionVote
**Lines:** 4655-4667 | **Table:** `scholar_question_votes`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| userId | String | | No | |
| questionId | String | | No | |
| voteType | VoteType (enum) | | No | |
| createdAt | DateTime | | No | @default(now()) |

**Unique Constraints:** `@@unique([userId, questionId])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User ("scholarQuestionVotes") | Many-to-one | Cascade |
| question | ScholarQuestion ("scholarQuestionVotes") | Many-to-one | Cascade |

**Indexes:**
- `@@index([questionId])`

---

## 168. HalalVerifyVote
**Lines:** 4673-4685 | **Table:** `halal_verify_votes`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| userId | String | | No | |
| businessId | String | | No | |
| isVerified | Boolean | | No | @default(true) |
| createdAt | DateTime | | No | @default(now()) |

**Unique Constraints:** `@@unique([userId, businessId])`

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User ("halalVerifyVotes") | Many-to-one | Cascade |
| business | HalalBusiness ("halalVerifyVotes") | Many-to-one | Cascade |

**Indexes:**
- `@@index([businessId])`

---

## 169. StarredMessage
**Lines:** 4692-4704 | **Table:** `starred_messages`

| Field | Type | Modifiers | Optional | Default |
|-------|------|-----------|----------|---------|
| id | String | @id | No | @default(cuid()) |
| userId | String | | No | |
| messageId | String | | No | |
| createdAt | DateTime | | No | @default(now()) |

**Unique Constraints:** `@@unique([userId, messageId])`

**Note:** Replaces the deprecated `Message.starredBy String[]` field.

**Relations:**
| Field | Target | Type | onDelete |
|-------|--------|------|----------|
| user | User ("starredMessages") | Many-to-one | Cascade |
| message | Message ("starredMessages") | Many-to-one | Cascade |

**Indexes:**
- `@@index([userId, createdAt(sort: Desc)])`
- `@@index([messageId])`

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Total models in section | 169 |
| Models with composite PK (@@id) | 23 (ConversationMember, CircleMember, Block, Mute, PollVote, ThreadBookmark, VideoBookmark, WatchLater, UserStickerPack, MajlisListMember, HashtagFollow, LiveParticipant, CallParticipant, PremiereReminder, PlaylistCollaborator, PostProductTag, UserAchievement, ChallengeParticipant, SeriesFollower, DhikrChallengeParticipant, Restrict) |
| Models with @unique on userId (one-to-one) | 18 (AltProfile, TwoFactorSecret, EncryptionKey, CoinBalance, UserSettings, PrayerNotificationSetting, ContentFilterSetting, ScholarVerification, DMNote, QuietModeSetting, UserXP, ProfileCustomization, UserReputation, PremiumSubscription, ParentalControl.childUserId) |
| Models using uuid() default | ~55 (extensions/tier 8+) |
| Models using cuid() default | ~114 (core models) |
| Self-referencing models | 2 (Message via replyTo/forwardedFrom, FatwaQuestion via answer) |
| Polymorphic FK (no Prisma relation) | 1 (VideoReply.commentId) |
| Deprecated fields | 1 (Message.starredBy — replaced by StarredMessage join table) |
| Models with Unsupported type | 1 (Embedding — pgvector) |
| Join tables (many-to-many) | StarredMessage, WaqfDonation, VideoCommentLike, ScholarQuestionVote, HalalVerifyVote, PostProductTag, PlaylistCollaborator, CollabInvite, PostCollab |

### ID Strategy Distribution
- **cuid()**: Core models (Conversation, Message, Post, Notification, etc.)
- **uuid()**: Extension models added in later batches (tiers 8-12: Events, Islamic, AI, Gamification, Commerce, Community)

### onDelete Strategy Summary
- **Cascade**: Most child records (members, interactions, bookmarks, participants)
- **SetNull**: Optional ownership (sender on messages, buyer on orders, reviewer on reports, donor on donations)
- **No explicit relation**: VideoReply.commentId (polymorphic), HashtagFollow.hashtagId (raw FK)
