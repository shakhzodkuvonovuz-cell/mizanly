# Prisma Schema Enums — Complete Reference

**Source:** `apps/api/prisma/schema.prisma`
**Total enums:** 83
**Extracted:** 2026-03-25

---

## Summary Table

| # | Enum Name | Line | Values | Used By (Model.field) |
|---|-----------|------|--------|----------------------|
| 1 | UserRole | 24 | 4 | User.role |
| 2 | ContentSpace | 31 | 4 | Post.space, FeedInteraction.space, DraftPost.space, CreatorStat.space |
| 3 | PostType | 38 | 4 | Post.postType |
| 4 | PostVisibility | 45 | 3 | Post.visibility |
| 5 | ReelStatus | 51 | 3 | Reel.status |
| 6 | ThreadVisibility | 57 | 3 | Thread.visibility |
| 7 | VideoStatus | 63 | 5 | Video.status |
| 8 | VideoCategory | 71 | 11 | Video.category |
| 9 | ChannelType | 85 | 2 | BroadcastChannel.channelType |
| 10 | ChannelRole | 90 | 4 | ChannelMember.role |
| 11 | LiveType | 97 | 2 | LiveSession.liveType |
| 12 | LiveStatus | 102 | 4 | LiveSession.status |
| 13 | ReactionType | 109 | 4 | ReelReaction.reaction, ReelCommentReaction.reaction, ThreadReaction.reaction, PostReaction.reaction, CommentReaction.reaction |
| 14 | ReportStatus | 116 | 4 | Report.status |
| 15 | ReportReason | 123 | 11 | Report.reason |
| 16 | ModerationAction | 138 | 6 | Report.actionTaken, ModerationLog.action |
| 17 | NotificationType | 147 | 21 | Notification.type |
| 18 | MessageType | 173 | 10 | Message.messageType, BroadcastMessage.messageType |
| 19 | CircleRole | 187 | 4 | CircleMember.role |
| 20 | CirclePrivacy | 194 | 3 | Circle.privacy |
| 21 | FollowRequestStatus | 200 | 3 | FollowRequest.status |
| 22 | CallType | 206 | 2 | CallSession.callType |
| 23 | CallStatus | 211 | 5 | CallSession.status |
| 24 | CollabStatus | 219 | 3 | PostCollab.status |
| 25 | OrderStatus | 225 | 6 | Order.status |
| 26 | ProductStatus | 234 | 4 | Product.status |
| 27 | SubscriptionStatus | 241 | 3 | PremiumSubscription.status |
| 28 | SubscriptionPlan | 247 | 2 | PremiumSubscription.plan |
| 29 | DownloadStatus | 252 | 5 | OfflineDownload.status |
| 30 | DownloadQuality | 260 | 4 | OfflineDownload.quality |
| 31 | EndScreenType | 267 | 4 | EndScreen.type |
| 32 | ProfileLayout | 274 | 4 | ProfileCustomization.layoutStyle |
| 33 | ProfileBioFont | 281 | 4 | ProfileCustomization.bioFont |
| 34 | StreakType | 288 | 5 | UserStreak.streakType |
| 35 | CoinTransactionType | 296 | 8 | CoinTransaction.type |
| 36 | HalalCategory | 307 | 6 | HalalBusiness.category |
| 37 | ZakatCategory | 316 | 6 | ZakatFund.category |
| 38 | VolunteerCategory | 325 | 6 | VolunteerOpportunity.category |
| 39 | ChallengeCategory | 334 | 6 | Challenge.category |
| 40 | FatwaTopicType | 343 | 5 | Mentorship.topic |
| 41 | ScholarTopicType | 351 | 6 | StudyCircle.topic |
| 42 | LiveRole | 360 | 5 | LiveParticipant.role |
| 43 | EarningType | 368 | 4 | CreatorEarning.type |
| 44 | ReputationTier | 375 | 5 | UserReputation.tier |
| 45 | AvatarStyle | 383 | 4 | AiAvatar.style |
| 46 | IslamicEventType | 390 | 7 | IslamicEvent.eventType |
| 47 | DailyTaskType | 400 | 3 | DailyTaskCompletion.taskType |
| 48 | AdminLogAction | 406 | 18 | AdminLog.action |
| 49 | ThumbnailContentType | 426 | 3 | OfflineDownload.contentType, ThumbnailVariant.contentType |
| 50 | FastingType | 432 | 12 | FastingLog.fastType |
| 51 | HifzStatus | 447 | 4 | HifzProgress.status |
| 52 | ChallengeType | 454 | 4 | Challenge.challengeType |
| 53 | ReplyPermission | 461 | 4 | Thread.replyPermission |
| 54 | CommentPermission | 468 | 3 | Post.commentPermission, Reel.commentPermission |
| 55 | TagApprovalStatus | 474 | 3 | PostTaggedUser.status, ReelTaggedUser.status |
| 56 | AutoPlaySetting | 480 | 3 | UserSettings.autoPlaySetting |
| 57 | ChatFolderFilterType | 486 | 2 | ChatFolder.filterType |
| 58 | CommentTargetType | 491 | 2 | VideoReply.commentType |
| 59 | ContentStrictnessLevel | 496 | 4 | ContentFilterSetting.strictnessLevel |
| 60 | AdhanStyle | 503 | 7 | PrayerNotificationSetting.adhanStyle |
| 61 | CountdownTheme | 513 | 3 | VideoPremiere.countdownTheme |
| 62 | EventPrivacy | 519 | 2 | Event.privacy |
| 63 | EventTypeEnum | 524 | 3 | Event.eventType |
| 64 | MadhhabType | 530 | 5 | ScholarVerification.madhab, FatwaQuestion.madhab |
| 65 | ForwardedFromType | 538 | 5 | SavedMessage.forwardedFromType |
| 66 | AchievementCategory | 546 | 5 | Achievement.category |
| 67 | AchievementRarity | 554 | 4 | Achievement.rarity |
| 68 | SeriesCategory | 561 | 5 | Series.category |
| 69 | VoteType | 569 | 2 | ScholarQuestionVote.voteType |
| 70 | TranslationContentType | 574 | 4 | AiTranslation.contentType |
| 71 | AiCaptionStatus | 581 | 4 | AiCaption.status |
| 72 | ScholarQACategory | 588 | 8 | ScholarQA.category |
| 73 | ScholarQAStatus | 599 | 3 | ScholarQA.status |
| 74 | FatwaStatus | 605 | 3 | FatwaQuestion.status |
| 75 | StageSessionStatus | 611 | 3 | StageSession.status |
| 76 | MentorshipStatus | 617 | 4 | Mentorship.status |
| 77 | ScholarVerificationStatus | 624 | 3 | ScholarVerification.status |
| 78 | NoteRating | 630 | 3 | CommunityNoteRating.rating |
| 79 | ProductCategory | 636 | 7 | Product.category |
| 80 | CommunityNoteStatus | 646 | 3 | CommunityNote.status |
| 81 | CollabInviteStatus | 652 | 3 | CollabInvite.status |
| 82 | LiveGuestStatus | 1822 | 3 | LiveGuest.status |
| 83 | EmbeddingContentType | 4234 | 4 | Embedding.contentType, CommunityNote.contentType |

---

## Full Enum Details

### 1. UserRole (line 24)

| Value | Description |
|-------|-------------|
| USER | Default role |
| CREATOR | Content creator |
| MODERATOR | Community moderator |
| ADMIN | Platform administrator |

**Used by:** `User.role` (line 684, default: USER)

---

### 2. ContentSpace (line 31)

| Value | Description |
|-------|-------------|
| SAF | Feed posts (Instagram-style) |
| BAKRA | Short videos (TikTok-style) |
| MAJLIS | Threads/microblog (X-style) |
| MINBAR | Long videos (YouTube-style) |

**Used by:**
- `Post.space` (line 969, default: SAF)
- `FeedInteraction.space` (line 2064, default: SAF)
- `DraftPost.space` (line 2281, default: SAF)
- `CreatorStat.space` (line 2499, no default)

---

### 3. PostType (line 38)

| Value |
|-------|
| TEXT |
| IMAGE |
| VIDEO |
| CAROUSEL |

**Used by:** `Post.postType` (line 967, default: TEXT)

---

### 4. PostVisibility (line 45)

| Value |
|-------|
| PUBLIC |
| FOLLOWERS |
| CIRCLE |

**Used by:** `Post.visibility` (line 968, default: PUBLIC)

---

### 5. ReelStatus (line 51)

| Value |
|-------|
| PROCESSING |
| READY |
| FAILED |

**Used by:** `Reel.status` (line 1123, default: PROCESSING)

---

### 6. ThreadVisibility (line 57)

| Value |
|-------|
| PUBLIC |
| FOLLOWERS |
| CIRCLE |

**Used by:** `Thread.visibility` (line 1266, default: PUBLIC)

---

### 7. VideoStatus (line 63)

| Value |
|-------|
| DRAFT |
| PROCESSING |
| PUBLISHED |
| UNLISTED |
| PRIVATE |

**Used by:** `Video.status` (line 1396, default: DRAFT)

---

### 8. VideoCategory (line 71)

| Value |
|-------|
| EDUCATION |
| QURAN |
| LECTURE |
| VLOG |
| NEWS |
| DOCUMENTARY |
| ENTERTAINMENT |
| SPORTS |
| COOKING |
| TECH |
| OTHER |

**Used by:** `Video.category` (line 1397, default: OTHER)

---

### 9. ChannelType (line 85)

| Value |
|-------|
| BROADCAST |
| DISCUSSION |

**Used by:** `BroadcastChannel.channelType` (line 1708, default: BROADCAST)

---

### 10. ChannelRole (line 90)

| Value |
|-------|
| OWNER |
| ADMIN |
| MEMBER |
| SUBSCRIBER |

**Used by:** `ChannelMember.role` (line 1723, default: SUBSCRIBER)

---

### 11. LiveType (line 97)

| Value |
|-------|
| VIDEO_STREAM |
| AUDIO_SPACE |

**Used by:** `LiveSession.liveType` (line 1765, no default)

---

### 12. LiveStatus (line 102)

| Value |
|-------|
| SCHEDULED |
| LIVE |
| ENDED |
| CANCELLED |

**Used by:** `LiveSession.status` (line 1766, default: SCHEDULED)

---

### 13. ReactionType (line 109)

| Value |
|-------|
| LIKE |
| LOVE |
| SUPPORT |
| INSIGHTFUL |

**Used by:**
- `ReelReaction.reaction` (line 1201, default: LIKE)
- `ReelCommentReaction.reaction` (line 1233, default: LIKE)
- `ThreadReaction.reaction` (line 1301, default: LIKE)
- `PostReaction.reaction` (line 1558, default: LIKE)
- `CommentReaction.reaction` (line 1571, default: LIKE)

---

### 14. ReportStatus (line 116)

| Value |
|-------|
| PENDING |
| REVIEWING |
| RESOLVED |
| DISMISSED |

**Used by:** `Report.status` (line 1958, default: PENDING)

---

### 15. ReportReason (line 123)

| Value |
|-------|
| HATE_SPEECH |
| HARASSMENT |
| VIOLENCE |
| SPAM |
| MISINFORMATION |
| NUDITY |
| SELF_HARM |
| TERRORISM |
| DOXXING |
| COPYRIGHT |
| IMPERSONATION |
| OTHER |

**Used by:** `Report.reason` (line 1956, no default)

---

### 16. ModerationAction (line 138)

| Value |
|-------|
| WARNING |
| CONTENT_REMOVED |
| TEMP_MUTE |
| TEMP_BAN |
| PERMANENT_BAN |
| NONE |

**Used by:**
- `Report.actionTaken` (line 1962, default: NONE)
- `ModerationLog.action` (line 1987, no default)

---

### 17. NotificationType (line 147)

| Value |
|-------|
| LIKE |
| COMMENT |
| FOLLOW |
| FOLLOW_REQUEST |
| FOLLOW_REQUEST_ACCEPTED |
| MENTION |
| REPLY |
| CIRCLE_INVITE |
| CIRCLE_JOIN |
| MESSAGE |
| THREAD_REPLY |
| REPOST |
| QUOTE_POST |
| CHANNEL_POST |
| LIVE_STARTED |
| VIDEO_PUBLISHED |
| REEL_LIKE |
| REEL_COMMENT |
| VIDEO_LIKE |
| VIDEO_COMMENT |
| STORY_REPLY |
| POLL_VOTE |
| SYSTEM |

**Used by:** `Notification.type` (line 1904, no default)

---

### 18. MessageType (line 173)

| Value |
|-------|
| TEXT |
| IMAGE |
| VOICE |
| VIDEO |
| STICKER |
| FILE |
| SYSTEM |
| GIF |
| STORY_REPLY |
| LOCATION |
| CONTACT |

**Used by:**
- `Message.messageType` (line 1654, default: TEXT)
- `BroadcastMessage.messageType` (line 1739, default: TEXT)

---

### 19. CircleRole (line 187)

| Value |
|-------|
| OWNER |
| ADMIN |
| MODERATOR |
| MEMBER |

**Used by:** `CircleMember.role` (line 1869, default: MEMBER)

---

### 20. CirclePrivacy (line 194)

| Value |
|-------|
| PUBLIC |
| PRIVATE |
| INVITE_ONLY |

**Used by:** `Circle.privacy` (line 1839, default: PUBLIC)

---

### 21. FollowRequestStatus (line 200)

| Value |
|-------|
| PENDING |
| ACCEPTED |
| DECLINED |

**Used by:** `FollowRequest.status` (line 2091, default: PENDING)

---

### 22. CallType (line 206)

| Value |
|-------|
| VOICE |
| VIDEO |

**Used by:** `CallSession.callType` (line 2326, no default)

---

### 23. CallStatus (line 211)

| Value |
|-------|
| RINGING |
| ACTIVE |
| ENDED |
| MISSED |
| DECLINED |

**Used by:** `CallSession.status` (line 2327, default: RINGING)

---

### 24. CollabStatus (line 219)

| Value |
|-------|
| PENDING |
| ACCEPTED |
| DECLINED |

**Used by:** `PostCollab.status` (line 2472, default: PENDING)

---

### 25. OrderStatus (line 225)

| Value |
|-------|
| PENDING |
| PAID |
| SHIPPED |
| DELIVERED |
| CANCELLED |
| REFUNDED |

**Used by:** `Order.status` (line 3667, default: PENDING)

---

### 26. ProductStatus (line 234)

| Value |
|-------|
| ACTIVE |
| SOLD_OUT |
| DRAFT |
| REMOVED |

**Used by:** `Product.status` (line 3627, default: ACTIVE)

---

### 27. SubscriptionStatus (line 241)

| Value |
|-------|
| ACTIVE |
| CANCELLED |
| EXPIRED |

**Used by:** `PremiumSubscription.status` (line 3818, default: ACTIVE)

---

### 28. SubscriptionPlan (line 247)

| Value |
|-------|
| MONTHLY |
| YEARLY |

**Used by:** `PremiumSubscription.plan` (line 3817, default: MONTHLY)

---

### 29. DownloadStatus (line 252)

| Value |
|-------|
| PENDING |
| DOWNLOADING |
| COMPLETE |
| FAILED |
| PAUSED |

**Used by:** `OfflineDownload.status` (line 3240, default: PENDING)

---

### 30. DownloadQuality (line 260)

| Value |
|-------|
| AUTO |
| LOW |
| MEDIUM |
| HIGH |

**Used by:** `OfflineDownload.quality` (line 3238, default: AUTO)

---

### 31. EndScreenType (line 267)

| Value |
|-------|
| SUBSCRIBE |
| WATCH_NEXT |
| PLAYLIST |
| LINK |

**Used by:** `EndScreen.type` (line 3310, no default)

---

### 32. ProfileLayout (line 274)

| Value |
|-------|
| DEFAULT |
| GRID |
| MAGAZINE |
| MINIMAL |

**Used by:** `ProfileCustomization.layoutStyle` (line 3598, default: DEFAULT)

---

### 33. ProfileBioFont (line 281)

| Value |
|-------|
| DEFAULT |
| SERIF |
| MONO |
| ARABIC |

**Used by:** `ProfileCustomization.bioFont` (line 3604, default: DEFAULT)

---

### 34. StreakType (line 288)

| Value |
|-------|
| POSTING |
| ENGAGEMENT |
| QURAN |
| DHIKR |
| LEARNING |

**Used by:** `UserStreak.streakType` (line 3408, default: POSTING)

---

### 35. CoinTransactionType (line 296)

| Value |
|-------|
| PURCHASE |
| GIFT_SENT |
| GIFT_RECEIVED |
| TIP_SENT |
| TIP_RECEIVED |
| REWARD |
| REFUND |
| CASHOUT |

**Used by:** `CoinTransaction.type` (line 2922, no default)

---

### 36. HalalCategory (line 307)

| Value |
|-------|
| RESTAURANT |
| GROCERY |
| SERVICES |
| EDUCATION |
| MOSQUE |
| OTHER |

**Used by:** `HalalBusiness.category` (line 3700, no default)

---

### 37. ZakatCategory (line 316)

| Value |
|-------|
| INDIVIDUAL |
| MOSQUE |
| SCHOOL |
| DISASTER |
| ORPHAN |
| OTHER |

**Used by:** `ZakatFund.category` (line 3747, no default)

---

### 38. VolunteerCategory (line 325)

| Value |
|-------|
| DISASTER_RELIEF |
| MOSQUE |
| EDUCATION |
| FOOD_BANK |
| CLEANUP |
| OTHER |

**Used by:** `VolunteerOpportunity.category` (line 3914, no default)

---

### 39. ChallengeCategory (line 334)

| Value |
|-------|
| QURAN |
| DHIKR |
| PHOTOGRAPHY |
| FITNESS |
| COOKING |
| LEARNING |

**Used by:** `Challenge.category` (line 3478, no default)

---

### 40. FatwaTopicType (line 343)

| Value |
|-------|
| NEW_MUSLIM |
| QURAN |
| ARABIC |
| FIQH |
| GENERAL |

**Used by:** `Mentorship.topic` (line 3856, no default)

---

### 41. ScholarTopicType (line 351)

| Value |
|-------|
| QURAN |
| HADITH |
| FIQH |
| SEERAH |
| ARABIC |
| TAFSIR |

**Used by:** `StudyCircle.topic` (line 3875, no default)

---

### 42. LiveRole (line 360)

| Value |
|-------|
| VIEWER |
| HOST |
| SPEAKER |
| MODERATOR |
| RAISED_HAND |

**Used by:** `LiveParticipant.role` (line 1794, default: VIEWER)

---

### 43. EarningType (line 368)

| Value |
|-------|
| CASHOUT |
| TIP |
| GIFT |
| SUBSCRIPTION |

**Used by:** `CreatorEarning.type` (line 4269, no default)

---

### 44. ReputationTier (line 375)

| Value |
|-------|
| NEWCOMER |
| MEMBER |
| TRUSTED |
| GUARDIAN |
| ELDER |

**Used by:** `UserReputation.tier` (line 3960, default: NEWCOMER)

---

### 45. AvatarStyle (line 383)

| Value |
|-------|
| DEFAULT |
| ANIME |
| WATERCOLOR |
| ISLAMIC_ART |

**Used by:** `AiAvatar.style` (line 3395, default: DEFAULT)

---

### 46. IslamicEventType (line 390)

| Value |
|-------|
| EID_PRAYER |
| IFTAR |
| LECTURE |
| QURAN_COMPETITION |
| FUNDRAISER |
| SOCIAL |
| OTHER |

**Used by:** `IslamicEvent.eventType` (line 3935, no default)

---

### 47. DailyTaskType (line 400)

| Value |
|-------|
| DHIKR |
| QURAN |
| REFLECTION |

**Used by:** `DailyTaskCompletion.taskType` (line 3030, no default)

---

### 48. AdminLogAction (line 406)

| Value |
|-------|
| MEMBER_ADDED |
| MEMBER_REMOVED |
| MEMBER_BANNED |
| TITLE_CHANGED |
| PHOTO_CHANGED |
| PIN_MESSAGE |
| UNPIN_MESSAGE |
| SLOW_MODE_CHANGED |
| PERMISSIONS_CHANGED |
| TOPIC_CREATED |
| TOPIC_UPDATED |
| TOPIC_DELETED |
| EMOJI_PACK_CREATED |
| EMOJI_PACK_UPDATED |
| EMOJI_PACK_DELETED |
| EMOJI_ADDED |
| EMOJI_REMOVED |

**Used by:** `AdminLog.action` (line 4093, no default)

---

### 49. ThumbnailContentType (line 426)

| Value |
|-------|
| POST |
| REEL |
| VIDEO |

**Used by:**
- `OfflineDownload.contentType` (line 3236, no default)
- `ThumbnailVariant.contentType` (line 3567, no default)

---

### 50. FastingType (line 432)

| Value |
|-------|
| RAMADAN |
| MONDAY |
| THURSDAY |
| AYYAM_AL_BID |
| ARAFAT |
| ASHURA |
| QADA |
| NAFL |
| OBLIGATORY |
| SUNNAH |
| VOLUNTARY |
| MAKEUP |

**Used by:** `FastingLog.fastType` (line 4577, default: RAMADAN)

---

### 51. HifzStatus (line 447)

| Value |
|-------|
| NOT_STARTED |
| IN_PROGRESS |
| MEMORIZED |
| NEEDS_REVIEW |

**Used by:** `HifzProgress.status` (line 4351, default: NOT_STARTED)

---

### 52. ChallengeType (line 454)

| Value |
|-------|
| DAILY |
| WEEKLY |
| MONTHLY |
| CUSTOM |

**Used by:** `Challenge.challengeType` (line 3477, no default)

---

### 53. ReplyPermission (line 461)

| Value |
|-------|
| EVERYONE |
| FOLLOWING |
| MENTIONED |
| NONE |

**Used by:** `Thread.replyPermission` (line 1281, default: EVERYONE)

---

### 54. CommentPermission (line 468)

| Value |
|-------|
| EVERYONE |
| FOLLOWERS |
| NOBODY |

**Used by:**
- `Post.commentPermission` (line 997, default: EVERYONE)
- `Reel.commentPermission` (line 1146, default: EVERYONE)

---

### 55. TagApprovalStatus (line 474)

| Value |
|-------|
| PENDING |
| APPROVED |
| DECLINED |

**Used by:**
- `PostTaggedUser.status` (line 1048, default: PENDING)
- `ReelTaggedUser.status` (line 1190, default: PENDING)

---

### 56. AutoPlaySetting (line 480)

| Value |
|-------|
| WIFI |
| ALWAYS |
| NEVER |

**Used by:** `UserSettings.autoPlaySetting` (line 2541, default: WIFI)

---

### 57. ChatFolderFilterType (line 486)

| Value |
|-------|
| INCLUDE |
| EXCLUDE |

**Used by:** `ChatFolder.filterType` (line 4074, default: INCLUDE)

---

### 58. CommentTargetType (line 491)

| Value |
|-------|
| POST |
| REEL |

**Used by:** `VideoReply.commentType` (line 2836, no default)

---

### 59. ContentStrictnessLevel (line 496)

| Value |
|-------|
| RELAXED |
| MODERATE |
| STRICT |
| FAMILY |

**Used by:** `ContentFilterSetting.strictnessLevel` (line 3144, default: MODERATE)

---

### 60. AdhanStyle (line 503)

| Value |
|-------|
| MAKKAH |
| MISHARY |
| ABDULBASIT |
| MAHER |
| SUDAIS |
| HUSARY |
| MINSHAWI |

**Used by:** `PrayerNotificationSetting.adhanStyle` (line 3132, default: MAKKAH)

---

### 61. CountdownTheme (line 513)

| Value |
|-------|
| EMERALD |
| GOLD |
| COSMIC |

**Used by:** `VideoPremiere.countdownTheme` (line 3261, default: EMERALD)

---

### 62. EventPrivacy (line 519)

| Value |
|-------|
| EVENT_PUBLIC |
| EVENT_PRIVATE |

**Used by:** `Event.privacy` (line 2635, default: EVENT_PUBLIC)

---

### 63. EventTypeEnum (line 524)

| Value |
|-------|
| IN_PERSON |
| ONLINE |
| HYBRID |

**Used by:** `Event.eventType` (line 2634, default: IN_PERSON)

---

### 64. MadhhabType (line 530)

| Value |
|-------|
| HANAFI |
| MALIKI |
| SHAFII |
| HANBALI |
| ANY |

**Used by:**
- `ScholarVerification.madhab` (line 3160, optional/nullable)
- `FatwaQuestion.madhab` (line 3893, optional/nullable)

---

### 65. ForwardedFromType (line 538)

| Value |
|-------|
| FWD_POST |
| FWD_THREAD |
| FWD_REEL |
| FWD_VIDEO |
| FWD_MESSAGE |

**Used by:** `SavedMessage.forwardedFromType` (line 4058, optional/nullable)

---

### 66. AchievementCategory (line 546)

| Value |
|-------|
| CONTENT |
| SOCIAL_ACH |
| ISLAMIC |
| MILESTONE |
| SPECIAL |

**Used by:** `Achievement.category` (line 3426, no default)

---

### 67. AchievementRarity (line 554)

| Value |
|-------|
| COMMON |
| RARE |
| EPIC |
| LEGENDARY |

**Used by:** `Achievement.rarity` (line 3428, default: COMMON)

---

### 68. SeriesCategory (line 561)

| Value |
|-------|
| DRAMA |
| DOCUMENTARY |
| TUTORIAL |
| COMEDY |
| ISLAMIC_SERIES |

**Used by:** `Series.category` (line 3515, no default)

---

### 69. VoteType (line 569)

| Value |
|-------|
| UPVOTE |
| DOWNVOTE |

**Used by:** `ScholarQuestionVote.voteType` (line 4661, no default)

---

### 70. TranslationContentType (line 574)

| Value |
|-------|
| TRANS_POST |
| TRANS_THREAD |
| TRANS_COMMENT |
| TRANS_VIDEO_DESCRIPTION |

**Used by:** `AiTranslation.contentType` (line 3364, no default)

---

### 71. AiCaptionStatus (line 581)

| Value |
|-------|
| CAPTION_PENDING |
| CAPTION_PROCESSING |
| CAPTION_COMPLETE |
| CAPTION_FAILED |

**Used by:** `AiCaption.status` (line 3381, default: CAPTION_PENDING)

---

### 72. ScholarQACategory (line 588)

| Value |
|-------|
| FIQH |
| AQEEDAH |
| TAFSIR |
| SEERAH |
| FAMILY |
| YOUTH |
| WOMEN |
| CONVERTS |

**Used by:** `ScholarQA.category` (line 4429, no default)

---

### 73. ScholarQAStatus (line 599)

| Value |
|-------|
| QA_SCHEDULED |
| QA_LIVE |
| QA_ENDED |

**Used by:** `ScholarQA.status` (line 4435, default: QA_SCHEDULED)

---

### 74. FatwaStatus (line 605)

| Value |
|-------|
| FATWA_PENDING |
| FATWA_ANSWERED |
| FATWA_CLOSED |

**Used by:** `FatwaQuestion.status` (line 3895, default: FATWA_PENDING)

---

### 75. StageSessionStatus (line 611)

| Value |
|-------|
| STAGE_SCHEDULED |
| STAGE_LIVE |
| STAGE_ENDED |

**Used by:** `StageSession.status` (line 4217, default: STAGE_SCHEDULED)

---

### 76. MentorshipStatus (line 617)

| Value |
|-------|
| MENTORSHIP_PENDING |
| MENTORSHIP_ACTIVE |
| MENTORSHIP_COMPLETED |
| MENTORSHIP_CANCELLED |

**Used by:** `Mentorship.status` (line 3855, default: MENTORSHIP_PENDING)

---

### 77. ScholarVerificationStatus (line 624)

| Value |
|-------|
| VERIFICATION_PENDING |
| VERIFICATION_APPROVED |
| VERIFICATION_REJECTED |

**Used by:** `ScholarVerification.status` (line 3162, default: VERIFICATION_PENDING)

---

### 78. NoteRating (line 630)

| Value |
|-------|
| NOTE_HELPFUL |
| NOTE_SOMEWHAT_HELPFUL |
| NOTE_NOT_HELPFUL |

**Used by:** `CommunityNoteRating.rating` (line 4507, no default)

---

### 79. ProductCategory (line 636)

| Value |
|-------|
| FOOD |
| CLOTHING |
| BOOKS |
| ART |
| ELECTRONICS |
| SERVICES |
| PRODUCT_OTHER |

**Used by:** `Product.category` (line 3622, no default)

---

### 80. CommunityNoteStatus (line 646)

| Value |
|-------|
| PROPOSED |
| HELPFUL |
| NOT_HELPFUL |

**Used by:** `CommunityNote.status` (line 4489, default: PROPOSED)

---

### 81. CollabInviteStatus (line 652)

| Value |
|-------|
| COLLAB_PENDING |
| COLLAB_ACCEPTED |
| COLLAB_DECLINED |

**Used by:** `CollabInvite.status` (line 4527, default: COLLAB_PENDING)

---

### 82. LiveGuestStatus (line 1822)

| Value |
|-------|
| INVITED |
| ACCEPTED |
| REMOVED |

**Used by:** `LiveGuest.status` (line 1810, default: INVITED)

**Note:** This enum is defined inline after the LiveGuest model (line 1822), not in the main enum block (lines 24-657).

---

### 83. EmbeddingContentType (line 4234)

| Value |
|-------|
| POST |
| REEL |
| THREAD |
| VIDEO |

**Used by:**
- `Embedding.contentType` (line 4244, no default)
- `CommunityNote.contentType` (line 4484, no default)

**Note:** This enum is defined inline near the Embedding model (line 4234), not in the main enum block.

---

## Statistics

| Metric | Count |
|--------|-------|
| Total enums | 83 |
| Enums in main block (lines 24-657) | 81 |
| Enums defined inline elsewhere | 2 (LiveGuestStatus at 1822, EmbeddingContentType at 4234) |
| Total enum values | 371 |
| Enums with 2 values | 5 (ChannelType, LiveType, CallType, ChatFolderFilterType, CommentTargetType, VoteType, EventPrivacy) |
| Enums with 3 values | 18 |
| Enums with 4 values | 20 |
| Enums with 5+ values | 33 |
| Largest enum | NotificationType (23 values) |
| Second largest | AdminLogAction (18 values) |
| Third largest | FastingType (12 values), ReportReason (12 values) |
| Total model.field usages | 100 |
| Fields with defaults | 58 |
| Nullable enum fields | 3 (MadhhabType x2, ForwardedFromType x1) |

### Enums by Domain

| Domain | Enums | Count |
|--------|-------|-------|
| **User/Profile** | UserRole, ProfileLayout, ProfileBioFont, AvatarStyle, ReputationTier | 5 |
| **Content (Posts)** | PostType, PostVisibility, CommentPermission, TagApprovalStatus, CommentTargetType | 5 |
| **Content (Reels)** | ReelStatus | 1 |
| **Content (Threads)** | ThreadVisibility, ReplyPermission | 2 |
| **Content (Videos)** | VideoStatus, VideoCategory, EndScreenType, DownloadStatus, DownloadQuality, ThumbnailContentType, CountdownTheme, SeriesCategory | 8 |
| **Content (General)** | ContentSpace, EmbeddingContentType, TranslationContentType, AiCaptionStatus, ForwardedFromType | 5 |
| **Social/Reactions** | ReactionType, VoteType, NoteRating, CommunityNoteStatus | 4 |
| **Messaging** | MessageType, ChatFolderFilterType, AdminLogAction | 3 |
| **Channels** | ChannelType, ChannelRole | 2 |
| **Live** | LiveType, LiveStatus, LiveRole, LiveGuestStatus, StageSessionStatus | 5 |
| **Circles/Communities** | CircleRole, CirclePrivacy | 2 |
| **Social Graph** | FollowRequestStatus, CollabStatus, CollabInviteStatus | 3 |
| **Calls** | CallType, CallStatus | 2 |
| **Notifications** | NotificationType | 1 |
| **Moderation/Reports** | ReportStatus, ReportReason, ModerationAction, ContentStrictnessLevel | 4 |
| **Commerce** | OrderStatus, ProductStatus, ProductCategory, HalalCategory, SubscriptionStatus, SubscriptionPlan | 6 |
| **Monetization** | CoinTransactionType, EarningType | 2 |
| **Islamic** | ZakatCategory, VolunteerCategory, IslamicEventType, DailyTaskType, FastingType, HifzStatus, AdhanStyle, MadhhabType, FatwaTopicType, FatwaStatus, ScholarTopicType, ScholarQACategory, ScholarQAStatus, ScholarVerificationStatus, MentorshipStatus | 15 |
| **Gamification** | StreakType, ChallengeCategory, ChallengeType, AchievementCategory, AchievementRarity | 5 |
| **Events** | EventPrivacy, EventTypeEnum | 2 |
| **Settings** | AutoPlaySetting | 1 |
