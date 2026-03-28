# Prisma Schema Models: User, Follow, Post, PostTaggedUser, Story, StoryView

> Extracted from `apps/api/prisma/schema.prisma` lines 660-1101.

---

## Model: User (lines 662-937)

**Table mapping:** `@@map("users")`

### Scalar Fields

| # | Field | Type | Optional? | Modifiers | Notes |
|---|-------|------|-----------|-----------|-------|
| 1 | `id` | `String` | No | `@id @default(cuid())` | Primary key, cuid |
| 2 | `clerkId` | `String` | No | `@unique` | Clerk auth provider ID |
| 3 | `email` | `String` | No | `@unique` | |
| 4 | `username` | `String` | No | `@unique` | |
| 5 | `previousUsername` | `String` | Yes (`?`) | — | For redirect on username change |
| 6 | `displayName` | `String` | No | — | |
| 7 | `bio` | `String` | No | `@default("") @db.VarChar(500)` | Max 500 chars |
| 8 | `avatarUrl` | `String` | Yes (`?`) | — | |
| 9 | `avatarBlurhash` | `String` | Yes (`?`) | — | |
| 10 | `coverUrl` | `String` | Yes (`?`) | — | |
| 11 | `coverBlurhash` | `String` | Yes (`?`) | — | |
| 12 | `website` | `String` | Yes (`?`) | — | |
| 13 | `location` | `String` | Yes (`?`) | — | |
| 14 | `phone` | `String` | Yes (`?`) | — | |
| 15 | `followersCount` | `Int` | No | `@default(0)` | Denormalized counter |
| 16 | `followingCount` | `Int` | No | `@default(0)` | Denormalized counter |
| 17 | `postsCount` | `Int` | No | `@default(0)` | Denormalized counter |
| 18 | `threadsCount` | `Int` | No | `@default(0)` | Denormalized counter |
| 19 | `reelsCount` | `Int` | No | `@default(0)` | Denormalized counter |
| 20 | `role` | `UserRole` | No | `@default(USER)` | Enum |
| 21 | `isVerified` | `Boolean` | No | `@default(false)` | |
| 22 | `isPrivate` | `Boolean` | No | `@default(false)` | |
| 23 | `language` | `String` | No | `@default("en")` | |
| 24 | `theme` | `String` | No | `@default("system")` | |
| 25 | `expoPushToken` | `String` | Yes (`?`) | — | |
| 26 | `notificationsOn` | `Boolean` | No | `@default(true)` | |
| 27 | `isBanned` | `Boolean` | No | `@default(false)` | |
| 28 | `banReason` | `String` | Yes (`?`) | — | |
| 29 | `banExpiresAt` | `DateTime` | Yes (`?`) | — | |
| 30 | `warningsCount` | `Int` | No | `@default(0)` | |
| 31 | `isScholarVerified` | `Boolean` | No | `@default(false)` | |
| 32 | `nasheedMode` | `Boolean` | No | `@default(false)` | |
| 33 | `coinBalance` | `Int` | No | `@default(0)` | Legacy — see also CoinBalance table |
| 34 | `diamondBalance` | `Int` | No | `@default(0)` | |
| 35 | `stripeConnectAccountId` | `String` | Yes (`?`) | — | |
| 36 | `madhab` | `String` | Yes (`?`) | `@db.VarChar(20)` | Islamic school of thought |
| 37 | `lastActiveAt` | `DateTime` | No | `@default(now())` | |
| 38 | `isDeactivated` | `Boolean` | No | `@default(false)` | |
| 39 | `deactivatedAt` | `DateTime` | Yes (`?`) | — | |
| 40 | `isDeleted` | `Boolean` | No | `@default(false)` | Soft delete |
| 41 | `deletedAt` | `DateTime` | Yes (`?`) | — | |
| 42 | `createdAt` | `DateTime` | No | `@default(now())` | |
| 43 | `updatedAt` | `DateTime` | No | `@updatedAt` | Auto-updated |
| 44 | `lastSeenAt` | `DateTime` | No | `@default(now())` | |
| 45 | `isChildAccount` | `Boolean` | No | `@default(false)` | Parental controls |

### Relations (all on User model)

| # | Field | Target Model | Relation Type | Relation Name | Notes |
|---|-------|-------------|---------------|---------------|-------|
| 1 | `posts` | `Post[]` | 1:N | (default) | Saf posts |
| 2 | `taggedInPosts` | `PostTaggedUser[]` | 1:N | `"taggedInPosts"` | Posts where user is tagged |
| 3 | `stories` | `Story[]` | 1:N | (default) | |
| 4 | `comments` | `Comment[]` | 1:N | (default) | |
| 5 | `postReactions` | `PostReaction[]` | 1:N | (default) | |
| 6 | `commentReactions` | `CommentReaction[]` | 1:N | (default) | |
| 7 | `savedPosts` | `SavedPost[]` | 1:N | (default) | |
| 8 | `reels` | `Reel[]` | 1:N | (default) | Bakra reels |
| 9 | `taggedInReels` | `ReelTaggedUser[]` | 1:N | `"taggedInReels"` | Reels where user is tagged |
| 10 | `reelReactions` | `ReelReaction[]` | 1:N | (default) | |
| 11 | `reelComments` | `ReelComment[]` | 1:N | (default) | |
| 12 | `reelCommentReactions` | `ReelCommentReaction[]` | 1:N | (default) | |
| 13 | `threads` | `Thread[]` | 1:N | (default) | Majlis threads |
| 14 | `threadReactions` | `ThreadReaction[]` | 1:N | (default) | |
| 15 | `threadReplies` | `ThreadReply[]` | 1:N | (default) | |
| 16 | `threadReplyLikes` | `ThreadReplyLike[]` | 1:N | (default) | |
| 17 | `channel` | `Channel?` | 1:1 | (default) | Minbar channel (optional) |
| 18 | `videos` | `Video[]` | 1:N | (default) | |
| 19 | `videoComments` | `VideoComment[]` | 1:N | (default) | |
| 20 | `videoReactions` | `VideoReaction[]` | 1:N | (default) | |
| 21 | `subscriptions` | `Subscription[]` | 1:N | (default) | |
| 22 | `sentMessages` | `Message[]` | 1:N | (default) | Risalah |
| 23 | `conversationMemberships` | `ConversationMember[]` | 1:N | (default) | |
| 24 | `channelMemberships` | `ChannelMember[]` | 1:N | (default) | |
| 25 | `broadcastMessages` | `BroadcastMessage[]` | 1:N | (default) | |
| 26 | `hostedLives` | `LiveSession[]` | 1:N | `"LiveHost"` | Live sessions hosted |
| 27 | `liveParticipations` | `LiveParticipant[]` | 1:N | (default) | |
| 28 | `notifications` | `Notification[]` | 1:N | `"NotificationRecipient"` | |
| 29 | `actedNotifications` | `Notification[]` | 1:N | `"NotificationActor"` | |
| 30 | `ownedCircles` | `Circle[]` | 1:N | (default) | |
| 31 | `circleMemberships` | `CircleMember[]` | 1:N | (default) | |
| 32 | `circleInvitesCreated` | `CircleInvite[]` | 1:N | (default) | |
| 33 | `reports` | `Report[]` | 1:N | `"Reporter"` | Reports filed |
| 34 | `reportedReports` | `Report[]` | 1:N | `"ReportedUser"` | Reports filed against |
| 35 | `moderationActions` | `ModerationLog[]` | 1:N | `"Moderator"` | |
| 36 | `moderationTargets` | `ModerationLog[]` | 1:N | `"ModTarget"` | |
| 37 | `feedInteractions` | `FeedInteraction[]` | 1:N | (default) | |
| 38 | `followers` | `Follow[]` | 1:N | `"Following"` | Users who follow this user |
| 39 | `following` | `Follow[]` | 1:N | `"Follower"` | Users this user follows |
| 40 | `blockedUsers` | `Block[]` | 1:N | `"Blocker"` | |
| 41 | `blockedBy` | `Block[]` | 1:N | `"Blocked"` | |
| 42 | `mutedUsers` | `Mute[]` | 1:N | `"Muter"` | |
| 43 | `mutedBy` | `Mute[]` | 1:N | `"Muted"` | |
| 44 | `removedPosts` | `Post[]` | 1:N | `"PostRemover"` | Posts removed by this mod/admin |
| 45 | `createdConversations` | `Conversation[]` | 1:N | `"ConversationCreator"` | |
| 46 | `followRequests` | `FollowRequest[]` | 1:N | `"SentFollowRequests"` | |
| 47 | `receivedFollowRequests` | `FollowRequest[]` | 1:N | `"ReceivedFollowRequests"` | |
| 48 | `interests` | `UserInterest[]` | 1:N | (default) | |
| 49 | `feedDismissals` | `FeedDismissal[]` | 1:N | (default) | |
| 50 | `draftPosts` | `DraftPost[]` | 1:N | (default) | |
| 51 | `profileLinks` | `ProfileLink[]` | 1:N | (default) | |
| 52 | `devices` | `Device[]` | 1:N | (default) | Max 5 per user |
| 53 | `callParticipations` | `CallParticipant[]` | 1:N | (default) | |
| 54 | `stickerPacks` | `UserStickerPack[]` | 1:N | (default) | |
| 55 | `majlisLists` | `MajlisList[]` | 1:N | (default) | |
| 56 | `majlisListMemberships` | `MajlisListMember[]` | 1:N | (default) | |
| 57 | `postCollabs` | `PostCollab[]` | 1:N | (default) | |
| 58 | `blockedKeywords` | `BlockedKeyword[]` | 1:N | (default) | |
| 59 | `creatorStats` | `CreatorStat[]` | 1:N | (default) | |
| 60 | `settings` | `UserSettings?` | 1:1 | (default) | |
| 61 | `threadBookmarks` | `ThreadBookmark[]` | 1:N | (default) | |
| 62 | `videoBookmarks` | `VideoBookmark[]` | 1:N | (default) | |
| 63 | `watchHistory` | `WatchHistory[]` | 1:N | (default) | |
| 64 | `watchLater` | `WatchLater[]` | 1:N | (default) | |
| 65 | `messageReactions` | `MessageReaction[]` | 1:N | (default) | |
| 66 | `storyHighlightAlbums` | `StoryHighlightAlbum[]` | 1:N | (default) | |
| 67 | `storyStickerResponses` | `StoryStickerResponse[]` | 1:N | (default) | |
| 68 | `pollVotes` | `PollVote[]` | 1:N | (default) | |
| 69 | `channelPosts` | `ChannelPost[]` | 1:N | (default) | |
| 70 | `reelInteractions` | `ReelInteraction[]` | 1:N | (default) | |
| 71 | `videoInteractions` | `VideoInteraction[]` | 1:N | (default) | |
| 72 | `events` | `Event[]` | 1:N | (default) | |
| 73 | `eventRsvps` | `EventRSVP[]` | 1:N | (default) | |
| 74 | `membershipTiers` | `MembershipTier[]` | 1:N | (default) | |
| 75 | `membershipSubscriptions` | `MembershipSubscription[]` | 1:N | (default) | |
| 76 | `audioRoomsHosted` | `AudioRoom[]` | 1:N | (default) | |
| 77 | `audioRoomParticipations` | `AudioRoomParticipant[]` | 1:N | (default) | |
| 78 | `twoFactorSecret` | `TwoFactorSecret?` | 1:1 | (default) | |
| 79 | `sentTips` | `Tip[]` | 1:N | `"TipSender"` | |
| 80 | `receivedTips` | `Tip[]` | 1:N | `"TipReceiver"` | |
| 81 | `offlineDownloads` | `OfflineDownload[]` | 1:N | (default) | |
| 82 | `videoClips` | `VideoClip[]` | 1:N | (default) | |
| 83 | `playlistCollabs` | `PlaylistCollaborator[]` | 1:N | `"PlaylistCollaborators"` | |
| 84 | `parentControls` | `ParentalControl[]` | 1:N | `"ParentControls"` | Parent side |
| 85 | `childControl` | `ParentalControl?` | 1:1 | `"ChildControls"` | Child side |
| 86 | `aiAvatars` | `AiAvatar[]` | 1:N | (default) | |
| 87 | `streaks` | `UserStreak[]` | 1:N | (default) | |
| 88 | `achievements` | `UserAchievement[]` | 1:N | (default) | |
| 89 | `xp` | `UserXP?` | 1:1 | (default) | |
| 90 | `challengesCreated` | `Challenge[]` | 1:N | `"ChallengeCreator"` | |
| 91 | `challengeParticipations` | `ChallengeParticipant[]` | 1:N | (default) | |
| 92 | `series` | `Series[]` | 1:N | (default) | |
| 93 | `profileCustomization` | `ProfileCustomization?` | 1:1 | (default) | |
| 94 | `products` | `Product[]` | 1:N | `"ProductSeller"` | |
| 95 | `productReviews` | `ProductReview[]` | 1:N | (default) | |
| 96 | `orders` | `Order[]` | 1:N | `"OrderBuyer"` | |
| 97 | `halalBusinesses` | `HalalBusiness[]` | 1:N | `"BusinessOwner"` | |
| 98 | `businessReviews` | `BusinessReview[]` | 1:N | (default) | |
| 99 | `zakatFunds` | `ZakatFund[]` | 1:N | `"ZakatRecipient"` | |
| 100 | `zakatDonations` | `ZakatDonation[]` | 1:N | `"ZakatDonor"` | |
| 101 | `treasuriesCreated` | `CommunityTreasury[]` | 1:N | `"TreasuryCreator"` | |
| 102 | `treasuryContributions` | `TreasuryContribution[]` | 1:N | `"TreasuryContributor"` | |
| 103 | `premiumSubscription` | `PremiumSubscription?` | 1:1 | (default) | |
| 104 | `localBoards` | `LocalBoard[]` | 1:N | `"BoardCreator"` | |
| 105 | `mentorOf` | `Mentorship[]` | 1:N | `"MentorOf"` | |
| 106 | `menteeOf` | `Mentorship[]` | 1:N | `"MenteeOf"` | |
| 107 | `studyCircles` | `StudyCircle[]` | 1:N | `"CircleLeader"` | |
| 108 | `fatwaQuestions` | `FatwaQuestion[]` | 1:N | `"FatwaAsker"` | |
| 109 | `volunteerOpps` | `VolunteerOpportunity[]` | 1:N | `"VolunteerOrganizer"` | |
| 110 | `islamicEvents` | `IslamicEvent[]` | 1:N | `"EventOrganizer"` | |
| 111 | `reputation` | `UserReputation?` | 1:1 | (default) | |
| 112 | `voicePosts` | `VoicePost[]` | 1:N | (default) | |
| 113 | `watchParties` | `WatchParty[]` | 1:N | (default) | |
| 114 | `sharedCollections` | `SharedCollection[]` | 1:N | `"CollectionCreator"` | |
| 115 | `waqfFunds` | `WaqfFund[]` | 1:N | `"WaqfCreator"` | |
| 116 | `savedMessages` | `SavedMessage[]` | 1:N | (default) | |
| 117 | `chatFolders` | `ChatFolder[]` | 1:N | (default) | |
| 118 | `emojiPacks` | `CustomEmojiPack[]` | 1:N | `"EmojiPackCreator"` | |
| 119 | `forumThreads` | `ForumThread[]` | 1:N | `"ForumThreadAuthor"` | |
| 120 | `forumReplies` | `ForumReply[]` | 1:N | `"ForumReplyAuthor"` | |
| 121 | `webhooks` | `Webhook[]` | 1:N | `"WebhookCreator"` | |
| 122 | `stageSessions` | `StageSession[]` | 1:N | `"StageHost"` | |
| 123 | `creatorEarnings` | `CreatorEarning[]` | 1:N | `"CreatorEarnings"` | |
| 124 | `liveGuests` | `LiveGuest[]` | 1:N | `"LiveGuest"` | |
| 125 | `generatedStickers` | `GeneratedSticker[]` | 1:N | `"generatedStickers"` | Batch 4 FK fix |
| 126 | `storyChains` | `StoryChain[]` | 1:N | `"storyChains"` | |
| 127 | `storyChainEntries` | `StoryChainEntry[]` | 1:N | `"storyChainEntries"` | |
| 128 | `reelTemplates` | `ReelTemplate[]` | 1:N | `"reelTemplates"` | |
| 129 | `videoReplies` | `VideoReply[]` | 1:N | `"videoReplies"` | |
| 130 | `hashtagFollows` | `HashtagFollow[]` | 1:N | `"hashtagFollows"` | |
| 131 | `coinBalanceRecord` | `CoinBalance?` | 1:1 | `"coinBalanceRecord"` | Correct balance source |
| 132 | `coinTransactions` | `CoinTransaction[]` | 1:N | `"coinTransactions"` | |
| 133 | `giftsSent` | `GiftRecord[]` | 1:N | `"giftsSent"` | |
| 134 | `giftsReceived` | `GiftRecord[]` | 1:N | `"giftsReceived"` | |
| 135 | `postPromotions` | `PostPromotion[]` | 1:N | `"postPromotions"` | |
| 136 | `postReminders` | `PostReminder[]` | 1:N | `"postReminders"` | |
| 137 | `quranReadingPlans` | `QuranReadingPlan[]` | 1:N | `"quranReadingPlans"` | |
| 138 | `dhikrSessions` | `DhikrSession[]` | 1:N | `"dhikrSessions"` | |
| 139 | `dailyTaskCompletions` | `DailyTaskCompletion[]` | 1:N | `"dailyTaskCompletions"` | |
| 140 | `dhikrChallenges` | `DhikrChallenge[]` | 1:N | `"dhikrChallenges"` | |
| 141 | `dhikrParticipations` | `DhikrChallengeParticipant[]` | 1:N | `"dhikrParticipations"` | |
| 142 | `charityDonations` | `CharityDonation[]` | 1:N | `"charityDonations"` | |
| 143 | `charityDonationsReceived` | `CharityDonation[]` | 1:N | `"charityDonationsReceived"` | |
| 144 | `charityCampaigns` | `CharityCampaign[]` | 1:N | `"charityCampaigns"` | |
| 145 | `hajjProgressRecords` | `HajjProgress[]` | 1:N | `"hajjProgress"` | |
| 146 | `prayerNotifications` | `PrayerNotificationSetting?` | 1:1 | `"prayerNotifications"` | |
| 147 | `contentFilter` | `ContentFilterSetting?` | 1:1 | `"contentFilter"` | |
| 148 | `scholarVerificationApp` | `ScholarVerification?` | 1:1 | `"scholarVerification"` | |
| 149 | `restrictsCreated` | `Restrict[]` | 1:N | `"restrictsCreated"` | |
| 150 | `restrictsReceived` | `Restrict[]` | 1:N | `"restrictsReceived"` | |
| 151 | `dmNotes` | `DMNote?` | 1:1 | `"dmNotes"` | |
| 152 | `screenTimeLogs` | `ScreenTimeLog[]` | 1:N | `"screenTimeLogs"` | |
| 153 | `quietMode` | `QuietModeSetting?` | 1:1 | `"quietMode"` | |
| 154 | `premiereReminders` | `PremiereReminder[]` | 1:N | `"premiereReminders"` | |
| 155 | `seriesFollows` | `SeriesFollower[]` | 1:N | `"seriesFollows"` | |
| 156 | `seriesProgressRecords` | `SeriesProgress[]` | 1:N | `"seriesProgress"` | |
| 157 | `communityNotes` | `CommunityNote[]` | 1:N | `"communityNotes"` | |
| 158 | `communityNoteRatings` | `CommunityNoteRating[]` | 1:N | `"communityNoteRatings"` | |
| 159 | `collabInvitesSent` | `CollabInvite[]` | 1:N | `"collabInvitesSent"` | |
| 160 | `collabInvitesReceived` | `CollabInvite[]` | 1:N | `"collabInvitesReceived"` | |
| 161 | `messageChecklists` | `MessageChecklist[]` | 1:N | `"messageChecklists"` | |
| 162 | `fastingLogs` | `FastingLog[]` | 1:N | `"fastingLogs"` | |
| 163 | `halalRestaurantsAdded` | `HalalRestaurant[]` | 1:N | `"halalRestaurantsAdded"` | |
| 164 | `halalRestaurantReviews` | `HalalRestaurantReview[]` | 1:N | `"halalRestaurantReviews"` | |
| 165 | `hifzProgressRecords` | `HifzProgress[]` | 1:N | `"hifzProgressRecords"` | |
| 166 | `mosqueCommunitiesCreated` | `MosqueCommunity[]` | 1:N | `"mosqueCommunitiesCreated"` | |
| 167 | `mosqueMemberships` | `MosqueMembership[]` | 1:N | `"mosqueMemberships"` | |
| 168 | `mosquePosts` | `MosquePost[]` | 1:N | `"mosquePosts"` | |
| 169 | `scholarQAs` | `ScholarQA[]` | 1:N | `"scholarQAs"` | |
| 170 | `scholarQuestions` | `ScholarQuestion[]` | 1:N | `"scholarQuestions"` | |
| 171 | `duaBookmarks` | `DuaBookmark[]` | 1:N | `"duaBookmarks"` | |
| 172 | `altProfileAccessGrants` | `AltProfileAccess[]` | 1:N | `"altProfileAccess"` | |
| 173 | `groupTopicsCreated` | `GroupTopic[]` | 1:N | `"groupTopics"` | |
| 174 | `encryptionKeyRecord` | `EncryptionKey?` | 1:1 | `"encryptionKey"` | |
| 175 | `conversationKeyEnvelopes` | `ConversationKeyEnvelope[]` | 1:N | `"conversationKeyEnvelopes"` | |
| 176 | `adminLogsPerformed` | `AdminLog[]` | 1:N | `"adminLogs"` | |
| 177 | `adminLogTargets` | `AdminLog[]` | 1:N | `"adminLogTargets"` | |
| 178 | `storyViews` | `StoryView[]` | 1:N | `"storyViews"` | |
| 179 | `conversationLastMessages` | `Conversation[]` | 1:N | `"conversationLastMessage"` | |
| 180 | `pinnedMessages` | `Message[]` | 1:N | `"messagePinner"` | |
| 181 | `reportReviews` | `Report[]` | 1:N | `"reportReviewer"` | |
| 182 | `altProfileRecord` | `AltProfile?` | 1:1 | `"altProfile"` | |
| 183 | `callScreenShares` | `CallSession[]` | 1:N | `"callScreenShare"` | |
| 184 | `playlistCollabsAdded` | `PlaylistCollaborator[]` | 1:N | `"playlistCollabAdder"` | |
| 185 | `zakatFundsVerified` | `ZakatFund[]` | 1:N | `"zakatFundVerifier"` | |
| 186 | `waqfDonations` | `WaqfDonation[]` | 1:N | `"waqfDonations"` | Batch 5 FK fix |
| 187 | `videoCommentLikes` | `VideoCommentLike[]` | 1:N | `"videoCommentLikes"` | Batch 5 FK fix |
| 188 | `scholarQuestionVotes` | `ScholarQuestionVote[]` | 1:N | `"scholarQuestionVotes"` | Batch 5 FK fix |
| 189 | `halalVerifyVotes` | `HalalVerifyVote[]` | 1:N | `"halalVerifyVotes"` | Batch 5 FK fix |
| 190 | `starredMessageRecords` | `StarredMessage[]` | 1:N | `"starredMessages"` | Batch 5 FK fix |

### Indexes

| Type | Fields | Notes |
|------|--------|-------|
| `@@index` | `[username]` | Username lookup |
| `@@index` | `[clerkId]` | Clerk auth lookup |
| `@@index` | `[createdAt(sort: Desc)]` | Reverse chronological listing |

### Summary

- **45 scalar fields** (including booleans, counters, timestamps, strings)
- **190 relation fields** pointing to other models
- **3 indexes** + implicit indexes on `@id` and `@unique` fields (`id`, `clerkId`, `email`, `username`)
- **Table name:** `users`

---

## Model: Follow (lines 943-955)

**Table mapping:** `@@map("follows")`

### Fields

| # | Field | Type | Optional? | Modifiers | Notes |
|---|-------|------|-----------|-----------|-------|
| 1 | `followerId` | `String` | No | — | Part of composite PK |
| 2 | `followingId` | `String` | No | — | Part of composite PK |
| 3 | `createdAt` | `DateTime` | No | `@default(now())` | |

### Relations

| # | Field | Target Model | Relation Name | FK Field | onDelete | Notes |
|---|-------|-------------|---------------|----------|----------|-------|
| 1 | `follower` | `User` | `"Follower"` | `followerId` → `User.id` | `Cascade` | N:1 |
| 2 | `following` | `User` | `"Following"` | `followingId` → `User.id` | `Cascade` | N:1 |

### Indexes

| Type | Fields | Notes |
|------|--------|-------|
| `@@id` | `[followerId, followingId]` | Composite primary key — prevents duplicate follows |
| `@@index` | `[followingId]` | Lookup by who is being followed |
| `@@index` | `[createdAt(sort: Desc)]` | Reverse chronological |

> Note: `@@index([followerId])` is commented out as redundant — the composite `@@id` already indexes `followerId` as the leading column.

---

## Model: Post (lines 962-1038)

**Table mapping:** `@@map("posts")`

### Scalar Fields

| # | Field | Type | Optional? | Modifiers | Notes |
|---|-------|------|-----------|-----------|-------|
| 1 | `id` | `String` | No | `@id @default(cuid())` | Primary key |
| 2 | `userId` | `String` | Yes (`?`) | — | FK to User (nullable for soft-deleted users) |
| 3 | `content` | `String` | Yes (`?`) | `@db.VarChar(2000)` | Post body, max 2000 chars |
| 4 | `postType` | `PostType` | No | `@default(TEXT)` | Enum |
| 5 | `visibility` | `PostVisibility` | No | `@default(PUBLIC)` | Enum |
| 6 | `space` | `ContentSpace` | No | `@default(SAF)` | Enum — which space this belongs to |
| 7 | `mediaUrls` | `String[]` | No | `@default([])` | Array of media URLs |
| 8 | `mediaTypes` | `String[]` | No | `@default([])` | Array of MIME types |
| 9 | `thumbnailUrl` | `String` | Yes (`?`) | — | |
| 10 | `mediaWidth` | `Int` | Yes (`?`) | — | |
| 11 | `mediaHeight` | `Int` | Yes (`?`) | — | |
| 12 | `videoDuration` | `Float` | Yes (`?`) | — | |
| 13 | `hashtags` | `String[]` | No | `@default([])` | Extracted hashtags |
| 14 | `mentions` | `String[]` | No | `@default([])` | Extracted @mentions |
| 15 | `locationName` | `String` | Yes (`?`) | — | |
| 16 | `locationLat` | `Float` | Yes (`?`) | — | |
| 17 | `locationLng` | `Float` | Yes (`?`) | — | |
| 18 | `language` | `String` | No | `@default("en")` | |
| 19 | `likesCount` | `Int` | No | `@default(0)` | Denormalized counter |
| 20 | `commentsCount` | `Int` | No | `@default(0)` | Denormalized counter |
| 21 | `sharesCount` | `Int` | No | `@default(0)` | Denormalized counter |
| 22 | `savesCount` | `Int` | No | `@default(0)` | Denormalized counter |
| 23 | `viewsCount` | `Int` | No | `@default(0)` | Denormalized counter |
| 24 | `sharedPostId` | `String` | Yes (`?`) | — | FK for shared/reposted post |
| 25 | `circleId` | `String` | Yes (`?`) | — | FK to Circle (for circle-only posts) |
| 26 | `isSensitive` | `Boolean` | No | `@default(false)` | |
| 27 | `altText` | `String` | Yes (`?`) | — | Accessibility alt text |
| 28 | `scheduledAt` | `DateTime` | Yes (`?`) | — | Null = published, set = scheduled |
| 29 | `hideLikesCount` | `Boolean` | No | `@default(false)` | |
| 30 | `commentsDisabled` | `Boolean` | No | `@default(false)` | Legacy field |
| 31 | `commentPermission` | `CommentPermission` | No | `@default(EVERYONE)` | Enum: EVERYONE, FOLLOWERS, NOBODY |
| 32 | `brandedContent` | `Boolean` | No | `@default(false)` | |
| 33 | `brandPartner` | `String` | Yes (`?`) | — | Partner username/name |
| 34 | `remixAllowed` | `Boolean` | No | `@default(true)` | |
| 35 | `shareToFeed` | `Boolean` | No | `@default(true)` | |
| 36 | `topics` | `String[]` | No | `@default([])` | Category topics |
| 37 | `isDownloadable` | `Boolean` | No | `@default(true)` | |
| 38 | `isFeatured` | `Boolean` | No | `@default(false)` | |
| 39 | `featuredAt` | `DateTime` | Yes (`?`) | — | |
| 40 | `blurhash` | `String` | Yes (`?`) | — | BlurHash placeholder |
| 41 | `isAltProfile` | `Boolean` | No | `@default(false)` | |
| 42 | `isRemoved` | `Boolean` | No | `@default(false)` | Mod removal |
| 43 | `removedReason` | `String` | Yes (`?`) | — | |
| 44 | `removedAt` | `DateTime` | Yes (`?`) | — | |
| 45 | `removedById` | `String` | Yes (`?`) | — | FK to User who removed |
| 46 | `createdAt` | `DateTime` | No | `@default(now())` | |
| 47 | `updatedAt` | `DateTime` | No | `@updatedAt` | Auto-updated |

### Relations

| # | Field | Target Model | Relation Name | FK Field | onDelete | Type |
|---|-------|-------------|---------------|----------|----------|------|
| 1 | `user` | `User?` | (default) | `userId` → `User.id` | `SetNull` | N:1 |
| 2 | `sharedPost` | `Post?` | `"PostShares"` | `sharedPostId` → `Post.id` | `SetNull` | N:1 (self-referential) |
| 3 | `shares` | `Post[]` | `"PostShares"` | — | — | 1:N (inverse of sharedPost) |
| 4 | `circle` | `Circle?` | (default) | `circleId` → `Circle.id` | `SetNull` | N:1 |
| 5 | `removedBy` | `User?` | `"PostRemover"` | `removedById` → `User.id` | `SetNull` | N:1 |
| 6 | `comments` | `Comment[]` | (default) | — | — | 1:N |
| 7 | `reactions` | `PostReaction[]` | (default) | — | — | 1:N |
| 8 | `savedBy` | `SavedPost[]` | (default) | — | — | 1:N |
| 9 | `notifications` | `Notification[]` | (default) | — | — | 1:N |
| 10 | `feedInteractions` | `FeedInteraction[]` | (default) | — | — | 1:N |
| 11 | `moderationLogs` | `ModerationLog[]` | `"ModPostTarget"` | — | — | 1:N |
| 12 | `collabs` | `PostCollab[]` | (default) | — | — | 1:N |
| 13 | `promotions` | `PostPromotion[]` | (default) | — | — | 1:N |
| 14 | `reminders` | `PostReminder[]` | (default) | — | — | 1:N |
| 15 | `collabInvites` | `CollabInvite[]` | `"collabInvites"` | — | — | 1:N |
| 16 | `productTags` | `PostProductTag[]` | `"productTags"` | — | — | 1:N |
| 17 | `reportedInReports` | `Report[]` | `"reportedPosts"` | — | — | 1:N |
| 18 | `seriesEpisodes` | `SeriesEpisode[]` | `"seriesEpisodePosts"` | — | — | 1:N |
| 19 | `taggedUsers` | `PostTaggedUser[]` | (default) | — | — | 1:N |

### Indexes

| Type | Fields | Notes |
|------|--------|-------|
| `@@index` | `[userId, createdAt(sort: Desc)]` | User's posts reverse-chrono |
| `@@index` | `[createdAt(sort: Desc)]` | Global feed reverse-chrono |
| `@@index` | `[circleId, createdAt(sort: Desc)]` | Circle posts reverse-chrono |
| `@@index` | `[space, createdAt(sort: Desc)]` | Per-space feed |
| `@@index` | `[hashtags]` | GIN index on hashtag array |
| `@@index` | `[isFeatured, featuredAt(sort: Desc)]` | Featured posts lookup |

---

## Model: PostTaggedUser (lines 1040-1054)

**Table mapping:** `@@map("post_tagged_users")`

### Fields

| # | Field | Type | Optional? | Modifiers | Notes |
|---|-------|------|-----------|-----------|-------|
| 1 | `id` | `String` | No | `@id @default(cuid())` | Primary key |
| 2 | `postId` | `String` | No | — | FK to Post |
| 3 | `userId` | `String` | No | — | FK to User |
| 4 | `positionX` | `Float` | Yes (`?`) | — | Tag X position on media |
| 5 | `positionY` | `Float` | Yes (`?`) | — | Tag Y position on media |
| 6 | `status` | `TagApprovalStatus` | No | `@default(PENDING)` | Enum: PENDING, APPROVED, DECLINED |
| 7 | `createdAt` | `DateTime` | No | `@default(now())` | |

### Relations

| # | Field | Target Model | Relation Name | FK Field | onDelete | Type |
|---|-------|-------------|---------------|----------|----------|------|
| 1 | `post` | `Post` | (default) | `postId` → `Post.id` | `Cascade` | N:1 |
| 2 | `user` | `User` | `"taggedInPosts"` | `userId` → `User.id` | `Cascade` | N:1 |

### Indexes

| Type | Fields | Notes |
|------|--------|-------|
| `@@unique` | `[postId, userId]` | One tag per user per post |
| `@@index` | `[userId]` | Find posts a user is tagged in |

---

## Model: Story (lines 1056-1089)

**Table mapping:** `@@map("stories")`

### Scalar Fields

| # | Field | Type | Optional? | Modifiers | Notes |
|---|-------|------|-----------|-----------|-------|
| 1 | `id` | `String` | No | `@id @default(cuid())` | Primary key |
| 2 | `userId` | `String` | Yes (`?`) | — | FK to User (nullable for soft-deleted users) |
| 3 | `mediaUrl` | `String` | No | — | Required — stories always have media |
| 4 | `mediaType` | `String` | No | — | MIME type |
| 5 | `thumbnailUrl` | `String` | Yes (`?`) | — | |
| 6 | `duration` | `Float` | Yes (`?`) | — | Video duration |
| 7 | `textOverlay` | `String` | Yes (`?`) | — | |
| 8 | `textColor` | `String` | Yes (`?`) | — | |
| 9 | `bgColor` | `String` | Yes (`?`) | — | Background color |
| 10 | `musicId` | `String` | Yes (`?`) | — | Music track ID |
| 11 | `viewsCount` | `Int` | No | `@default(0)` | Denormalized counter |
| 12 | `repliesCount` | `Int` | No | `@default(0)` | Denormalized counter |
| 13 | `expiresAt` | `DateTime` | No | — | Required — stories expire (typically 24h) |
| 14 | `isHighlight` | `Boolean` | No | `@default(false)` | |
| 15 | `highlightName` | `String` | Yes (`?`) | — | |
| 16 | `highlightAlbumId` | `String` | Yes (`?`) | — | FK to StoryHighlightAlbum |
| 17 | `stickerData` | `Json` | Yes (`?`) | — | JSON blob for all sticker types |
| 18 | `blurhash` | `String` | Yes (`?`) | — | BlurHash placeholder |
| 19 | `closeFriendsOnly` | `Boolean` | No | `@default(false)` | |
| 20 | `subscribersOnly` | `Boolean` | No | `@default(false)` | |
| 21 | `isSensitive` | `Boolean` | No | `@default(false)` | |
| 22 | `isArchived` | `Boolean` | No | `@default(false)` | |
| 23 | `createdAt` | `DateTime` | No | `@default(now())` | |

### Relations

| # | Field | Target Model | Relation Name | FK Field | onDelete | Type |
|---|-------|-------------|---------------|----------|----------|------|
| 1 | `user` | `User?` | (default) | `userId` → `User.id` | `SetNull` | N:1 |
| 2 | `highlightAlbum` | `StoryHighlightAlbum?` | (default) | `highlightAlbumId` → `StoryHighlightAlbum.id` | `SetNull` | N:1 |
| 3 | `views` | `StoryView[]` | (default) | — | — | 1:N |
| 4 | `stickerResponses` | `StoryStickerResponse[]` | (default) | — | — | 1:N |
| 5 | `chainEntries` | `StoryChainEntry[]` | (default) | — | — | 1:N |

### Indexes

| Type | Fields | Notes |
|------|--------|-------|
| `@@index` | `[userId, createdAt(sort: Desc)]` | User's stories reverse-chrono |
| `@@index` | `[expiresAt]` | Expiry cleanup queries |

---

## Model: StoryView (lines 1091-1101)

**Table mapping:** `@@map("story_views")`

### Fields

| # | Field | Type | Optional? | Modifiers | Notes |
|---|-------|------|-----------|-----------|-------|
| 1 | `storyId` | `String` | No | — | Part of composite PK, FK to Story |
| 2 | `viewerId` | `String` | No | — | Part of composite PK, FK to User |
| 3 | `createdAt` | `DateTime` | No | `@default(now())` | |

### Relations

| # | Field | Target Model | Relation Name | FK Field | onDelete | Type |
|---|-------|-------------|---------------|----------|----------|------|
| 1 | `viewer` | `User` | `"storyViews"` | `viewerId` → `User.id` | `Cascade` | N:1 |
| 2 | `story` | `Story` | (default) | `storyId` → `Story.id` | `Cascade` | N:1 |

### Indexes

| Type | Fields | Notes |
|------|--------|-------|
| `@@id` | `[storyId, viewerId]` | Composite PK — one view per user per story |
| `@@index` | `[viewerId]` | Find stories viewed by a user |

---

## Cross-Model Relationship Summary

```
User ──1:N──> Post (userId, onDelete: SetNull)
User ──1:N──> Story (userId, onDelete: SetNull)
User ──1:N──> Follow (as follower, via "Follower", onDelete: Cascade)
User ──1:N──> Follow (as following, via "Following", onDelete: Cascade)
User ──1:N──> PostTaggedUser (via "taggedInPosts", onDelete: Cascade)
User ──1:N──> StoryView (via "storyViews", onDelete: Cascade)

Post ──1:N──> PostTaggedUser (postId, onDelete: Cascade)
Post ──N:1──> Post (self-ref via sharedPostId, "PostShares", onDelete: SetNull)
Post ──N:1──> Circle (circleId, onDelete: SetNull)
Post ──N:1──> User (removedById, "PostRemover", onDelete: SetNull)

Story ──1:N──> StoryView (storyId, onDelete: Cascade)
Story ──N:1──> StoryHighlightAlbum (highlightAlbumId, onDelete: SetNull)

Follow: composite PK [followerId, followingId] — no separate id
StoryView: composite PK [storyId, viewerId] — no separate id
```

---

## Enum References (used by models in this range)

| Enum | Used In | Field |
|------|---------|-------|
| `UserRole` | User | `role` |
| `PostType` | Post | `postType` |
| `PostVisibility` | Post | `visibility` |
| `ContentSpace` | Post | `space` |
| `CommentPermission` | Post | `commentPermission` |
| `TagApprovalStatus` | PostTaggedUser | `status` |

---

## Statistics

| Model | Scalar Fields | Relations | Indexes | Lines |
|-------|--------------|-----------|---------|-------|
| User | 45 | 190 | 3 (+4 implicit from @unique/@id) | 662-937 (276 lines) |
| Follow | 3 | 2 | 2 (+1 from @@id) | 943-955 (13 lines) |
| Post | 47 | 19 | 6 (+1 from @id) | 962-1038 (77 lines) |
| PostTaggedUser | 7 | 2 | 1 unique + 1 index (+1 from @id) | 1040-1054 (15 lines) |
| Story | 23 | 5 | 2 (+1 from @id) | 1056-1089 (34 lines) |
| StoryView | 3 | 2 | 1 (+1 from @@id) | 1091-1101 (11 lines) |
| **TOTAL** | **128** | **220** | **16** | **426 lines** |
