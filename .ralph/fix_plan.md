# Mizanly — Line-by-Line Audit Fix Plan
# Every file. Every line. Every dimension. Fix everything.

## Phase 1: Infrastructure & Config (14 files)
- [ ] 1.01 apps/api/prisma/schema.prisma — 160 models, check relations, indexes, onDelete, field types
- [ ] 1.02 apps/api/src/app.module.ts — check all module imports, middleware, guards
- [ ] 1.03 apps/api/src/config/prisma.service.ts — connection handling, error handling
- [ ] 1.04 apps/api/src/config/socket-io-adapter.ts — Redis adapter config, auth
- [ ] 1.05 apps/api/src/common/middleware/request-logger.middleware.ts — logging, PII exposure
- [ ] 1.06 apps/api/src/common/services/job-queue.service.ts — queue config, error handling, retries
- [ ] 1.07 apps/api/src/gateways/chat.gateway.ts — socket auth, event handling, cleanup
- [ ] 1.08 apps/mobile/src/theme/index.ts — token completeness, contrast ratios
- [ ] 1.09 apps/mobile/src/theme/highContrast.ts — WCAG AA compliance
- [ ] 1.10 apps/mobile/src/store/index.ts — state shape, selectors, actions
- [ ] 1.11 apps/mobile/src/i18n/index.ts — language loading, fallback
- [ ] 1.12 apps/mobile/src/i18n/en.json — completeness, consistency, no orphan keys
- [ ] 1.13 apps/mobile/src/i18n/ar.json — completeness vs en.json, RTL markers
- [ ] 1.14 apps/mobile/src/types/index.ts — type completeness, no `any`

## Phase 2: Backend Services (77 files)
- [ ] 2.01 modules/admin/admin.service.ts
- [ ] 2.02 modules/ai/ai.service.ts
- [ ] 2.03 modules/audio-rooms/audio-rooms.service.ts
- [ ] 2.04 modules/audio-tracks/audio-tracks.service.ts
- [ ] 2.05 modules/auth/auth.service.ts
- [ ] 2.06 modules/blocks/blocks.service.ts
- [ ] 2.07 modules/bookmarks/bookmarks.service.ts
- [ ] 2.08 modules/broadcast/broadcast.service.ts
- [ ] 2.09 modules/calls/calls.service.ts
- [ ] 2.10 modules/channel-posts/channel-posts.service.ts
- [ ] 2.11 modules/channels/channels.service.ts
- [ ] 2.12 modules/chat-export/chat-export.service.ts
- [ ] 2.13 modules/circles/circles.service.ts
- [ ] 2.14 modules/clips/clips.service.ts
- [ ] 2.15 modules/collabs/collabs.service.ts
- [ ] 2.16 modules/commerce/commerce.service.ts
- [ ] 2.17 modules/communities/communities.service.ts
- [ ] 2.18 modules/community/community.service.ts
- [ ] 2.19 modules/creator/creator.service.ts
- [ ] 2.20 modules/devices/devices.service.ts
- [ ] 2.21 modules/discord-features/discord-features.service.ts
- [ ] 2.22 modules/downloads/downloads.service.ts
- [ ] 2.23 modules/drafts/drafts.service.ts
- [ ] 2.24 modules/embeddings/embedding-pipeline.service.ts
- [ ] 2.25 modules/embeddings/embeddings.service.ts
- [ ] 2.26 modules/encryption/encryption.service.ts
- [ ] 2.27 modules/events/events.service.ts
- [ ] 2.28 modules/feed/feed-transparency.service.ts
- [ ] 2.29 modules/feed/feed.service.ts
- [ ] 2.30 modules/feed/personalized-feed.service.ts
- [ ] 2.31 modules/follows/follows.service.ts
- [ ] 2.32 modules/gamification/gamification.service.ts
- [ ] 2.33 modules/gifts/gifts.service.ts
- [ ] 2.34 modules/hashtags/hashtags.service.ts
- [ ] 2.35 modules/islamic/islamic-notifications.service.ts
- [ ] 2.36 modules/islamic/islamic.service.ts
- [ ] 2.37 modules/live/live.service.ts
- [ ] 2.38 modules/majlis-lists/majlis-lists.service.ts
- [ ] 2.39 modules/messages/messages.service.ts
- [ ] 2.40 modules/moderation/content-safety.service.ts
- [ ] 2.41 modules/moderation/moderation.service.ts
- [ ] 2.42 modules/monetization/monetization.service.ts
- [ ] 2.43 modules/monetization/stripe-connect.service.ts
- [ ] 2.44 modules/mutes/mutes.service.ts
- [ ] 2.45 modules/notifications/notifications.service.ts
- [ ] 2.46 modules/notifications/push-trigger.service.ts
- [ ] 2.47 modules/notifications/push.service.ts
- [ ] 2.48 modules/parental-controls/parental-controls.service.ts
- [ ] 2.49 modules/payments/payments.service.ts
- [ ] 2.50 modules/playlists/playlists.service.ts
- [ ] 2.51 modules/polls/polls.service.ts
- [ ] 2.52 modules/posts/posts.service.ts
- [ ] 2.53 modules/privacy/privacy.service.ts
- [ ] 2.54 modules/profile-links/profile-links.service.ts
- [ ] 2.55 modules/promotions/promotions.service.ts
- [ ] 2.56 modules/recommendations/recommendations.service.ts
- [ ] 2.57 modules/reel-templates/reel-templates.service.ts
- [ ] 2.58 modules/reels/reels.service.ts
- [ ] 2.59 modules/reports/reports.service.ts
- [ ] 2.60 modules/restricts/restricts.service.ts
- [ ] 2.61 modules/retention/retention.service.ts
- [ ] 2.62 modules/scheduling/scheduling.service.ts
- [ ] 2.63 modules/search/search.service.ts
- [ ] 2.64 modules/settings/settings.service.ts
- [ ] 2.65 modules/stickers/stickers.service.ts
- [ ] 2.66 modules/stories/stories.service.ts
- [ ] 2.67 modules/story-chains/story-chains.service.ts
- [ ] 2.68 modules/stream/stream.service.ts
- [ ] 2.69 modules/subtitles/subtitles.service.ts
- [ ] 2.70 modules/telegram-features/telegram-features.service.ts
- [ ] 2.71 modules/threads/threads.service.ts
- [ ] 2.72 modules/two-factor/two-factor.service.ts
- [ ] 2.73 modules/upload/upload.service.ts
- [ ] 2.74 modules/users/users.service.ts
- [ ] 2.75 modules/video-replies/video-replies.service.ts
- [ ] 2.76 modules/videos/videos.service.ts
- [ ] 2.77 modules/watch-history/watch-history.service.ts

## Phase 3: Backend Controllers (72 files)
- [ ] 3.01 modules/admin/admin.controller.ts
- [ ] 3.02 modules/ai/ai.controller.ts
- [ ] 3.03 modules/audio-rooms/audio-rooms.controller.ts
- [ ] 3.04 modules/audio-tracks/audio-tracks.controller.ts
- [ ] 3.05 modules/auth/auth.controller.ts
- [ ] 3.06 modules/auth/webhooks.controller.ts
- [ ] 3.07 modules/blocks/blocks.controller.ts
- [ ] 3.08 modules/bookmarks/bookmarks.controller.ts
- [ ] 3.09 modules/broadcast/broadcast.controller.ts
- [ ] 3.10 modules/calls/calls.controller.ts
- [ ] 3.11 modules/channel-posts/channel-posts.controller.ts
- [ ] 3.12 modules/channels/channels.controller.ts
- [ ] 3.13 modules/chat-export/chat-export.controller.ts
- [ ] 3.14 modules/circles/circles.controller.ts
- [ ] 3.15 modules/clips/clips.controller.ts
- [ ] 3.16 modules/collabs/collabs.controller.ts
- [ ] 3.17 modules/commerce/commerce.controller.ts
- [ ] 3.18 modules/communities/communities.controller.ts
- [ ] 3.19 modules/community/community.controller.ts
- [ ] 3.20 modules/creator/creator.controller.ts
- [ ] 3.21 modules/devices/devices.controller.ts
- [ ] 3.22 modules/discord-features/discord-features.controller.ts
- [ ] 3.23 modules/downloads/downloads.controller.ts
- [ ] 3.24 modules/drafts/drafts.controller.ts
- [ ] 3.25 modules/embeddings/embeddings.controller.ts
- [ ] 3.26 modules/encryption/encryption.controller.ts
- [ ] 3.27 modules/events/events.controller.ts
- [ ] 3.28 modules/feed/feed.controller.ts
- [ ] 3.29 modules/follows/follows.controller.ts
- [ ] 3.30 modules/gamification/gamification.controller.ts
- [ ] 3.31 modules/gifts/gifts.controller.ts
- [ ] 3.32 modules/hashtags/hashtags.controller.ts
- [ ] 3.33 modules/health/health.controller.ts
- [ ] 3.34 modules/islamic/islamic.controller.ts
- [ ] 3.35 modules/live/live.controller.ts
- [ ] 3.36 modules/majlis-lists/majlis-lists.controller.ts
- [ ] 3.37 modules/messages/messages.controller.ts
- [ ] 3.38 modules/moderation/moderation.controller.ts
- [ ] 3.39 modules/monetization/monetization.controller.ts
- [ ] 3.40 modules/mutes/mutes.controller.ts
- [ ] 3.41 modules/notifications/notifications.controller.ts
- [ ] 3.42 modules/parental-controls/parental-controls.controller.ts
- [ ] 3.43 modules/payments/payments.controller.ts
- [ ] 3.44 modules/payments/stripe-webhook.controller.ts
- [ ] 3.45 modules/playlists/playlists.controller.ts
- [ ] 3.46 modules/polls/polls.controller.ts
- [ ] 3.47 modules/posts/posts.controller.ts
- [ ] 3.48 modules/privacy/privacy.controller.ts
- [ ] 3.49 modules/profile-links/profile-links.controller.ts
- [ ] 3.50 modules/promotions/promotions.controller.ts
- [ ] 3.51 modules/recommendations/recommendations.controller.ts
- [ ] 3.52 modules/reel-templates/reel-templates.controller.ts
- [ ] 3.53 modules/reels/reels.controller.ts
- [ ] 3.54 modules/reports/reports.controller.ts
- [ ] 3.55 modules/restricts/restricts.controller.ts
- [ ] 3.56 modules/retention/retention.controller.ts
- [ ] 3.57 modules/scheduling/scheduling.controller.ts
- [ ] 3.58 modules/search/search.controller.ts
- [ ] 3.59 modules/settings/settings.controller.ts
- [ ] 3.60 modules/stickers/stickers.controller.ts
- [ ] 3.61 modules/stories/stories.controller.ts
- [ ] 3.62 modules/story-chains/story-chains.controller.ts
- [ ] 3.63 modules/stream/stream.controller.ts
- [ ] 3.64 modules/subtitles/subtitles.controller.ts
- [ ] 3.65 modules/telegram-features/telegram-features.controller.ts
- [ ] 3.66 modules/threads/threads.controller.ts
- [ ] 3.67 modules/two-factor/two-factor.controller.ts
- [ ] 3.68 modules/upload/upload.controller.ts
- [ ] 3.69 modules/users/users.controller.ts
- [ ] 3.70 modules/video-replies/video-replies.controller.ts
- [ ] 3.71 modules/videos/videos.controller.ts
- [ ] 3.72 modules/watch-history/watch-history.controller.ts

## Phase 4: Mobile Core — Tab Screens & Layouts (10 files)
- [ ] 4.01 apps/mobile/app/_layout.tsx
- [ ] 4.02 apps/mobile/app/(tabs)/_layout.tsx
- [ ] 4.03 apps/mobile/app/(tabs)/saf.tsx
- [ ] 4.04 apps/mobile/app/(tabs)/bakra.tsx
- [ ] 4.05 apps/mobile/app/(tabs)/majlis.tsx
- [ ] 4.06 apps/mobile/app/(tabs)/risalah.tsx
- [ ] 4.07 apps/mobile/app/(tabs)/minbar.tsx
- [ ] 4.08 apps/mobile/app/(tabs)/create.tsx
- [ ] 4.09 apps/mobile/app/(screens)/_layout.tsx
- [ ] 4.10 apps/mobile/app/index.tsx

## Phase 5: Mobile Components (65 files)
- [ ] 5.01 components/ui/Icon.tsx
- [ ] 5.02 components/ui/Avatar.tsx
- [ ] 5.03 components/ui/BottomSheet.tsx
- [ ] 5.04 components/ui/Skeleton.tsx
- [ ] 5.05 components/ui/EmptyState.tsx
- [ ] 5.06 components/ui/CharCountRing.tsx
- [ ] 5.07 components/ui/RichText.tsx
- [ ] 5.08 components/ui/VerifiedBadge.tsx
- [ ] 5.09 components/ui/Badge.tsx
- [ ] 5.10 components/ui/ActionButton.tsx
- [ ] 5.11 components/ui/GlassHeader.tsx
- [ ] 5.12 components/ui/GradientButton.tsx
- [ ] 5.13 components/ui/VideoPlayer.tsx
- [ ] 5.14 components/ui/VideoControls.tsx
- [ ] 5.15 components/ui/ImageLightbox.tsx
- [ ] 5.16 components/ui/ImageCarousel.tsx
- [ ] 5.17 components/ui/ImageGallery.tsx
- [ ] 5.18 components/ui/TabSelector.tsx
- [ ] 5.19 components/ui/TabBarIndicator.tsx
- [ ] 5.20 components/ui/FloatingHearts.tsx
- [ ] 5.21 components/ui/DoubleTapHeart.tsx
- [ ] 5.22 components/ui/CaughtUpCard.tsx
- [ ] 5.23 components/ui/FadeIn.tsx
- [ ] 5.24 components/ui/LinkPreview.tsx
- [ ] 5.25 components/ui/LocationPicker.tsx
- [ ] 5.26 components/ui/MiniPlayer.tsx
- [ ] 5.27 components/ui/OfflineBanner.tsx
- [ ] 5.28 components/ui/PremiereCountdown.tsx
- [ ] 5.29 components/ui/EndScreenOverlay.tsx
- [ ] 5.30 components/ui/ToastNotification.tsx
- [ ] 5.31 components/ui/WebSafeBlurView.tsx
- [ ] 5.32 components/ui/ScreenErrorBoundary.tsx
- [ ] 5.33 components/ui/Autocomplete.tsx
- [ ] 5.34 components/saf/PostCard.tsx
- [ ] 5.35 components/saf/PostMedia.tsx
- [ ] 5.36 components/saf/StoryBubble.tsx
- [ ] 5.37 components/saf/StoryRow.tsx
- [ ] 5.38 components/majlis/ThreadCard.tsx
- [ ] 5.39 components/bakra/CommentsSheet.tsx
- [ ] 5.40 components/story/PollSticker.tsx
- [ ] 5.41 components/story/QuizSticker.tsx
- [ ] 5.42 components/story/CountdownSticker.tsx
- [ ] 5.43 components/story/QuestionSticker.tsx
- [ ] 5.44 components/story/SliderSticker.tsx
- [ ] 5.45 components/story/AddYoursSticker.tsx
- [ ] 5.46 components/story/LinkSticker.tsx
- [ ] 5.47 components/story/DrawingCanvas.tsx
- [ ] 5.48 components/story/MusicPicker.tsx
- [ ] 5.49 components/story/TextEffects.tsx
- [ ] 5.50 components/editor/VideoTimeline.tsx
- [ ] 5.51 components/editor/VideoTransitions.tsx
- [ ] 5.52 components/islamic/EidFrame.tsx
- [ ] 5.53 components/risalah/StickerPicker.tsx
- [ ] 5.54 components/risalah/StickerPackBrowser.tsx
- [ ] 5.55 components/ErrorBoundary.tsx
- [ ] 5.56 components/AlgorithmCard.tsx
- [ ] 5.57 components/ContactMessage.tsx
- [ ] 5.58 components/GiftOverlay.tsx
- [ ] 5.59 components/LocationMessage.tsx
- [ ] 5.60 components/PinnedMessageBar.tsx
- [ ] 5.61 components/ReminderButton.tsx
- [ ] 5.62 components/VideoReplySheet.tsx
- [ ] 5.63 components/ViewOnceMedia.tsx
- [ ] 5.64 components/web/WebLayout.tsx
- [ ] 5.65 components/web/WebSidebar.tsx

## Phase 6: Mobile Hooks & Services (39 files)
- [ ] 6.01 hooks/useAmbientColor.ts
- [ ] 6.02 hooks/useAnimatedPress.ts
- [ ] 6.03 hooks/useBackgroundUpload.ts
- [ ] 6.04 hooks/useChatLock.ts
- [ ] 6.05 hooks/useEntranceAnimation.ts
- [ ] 6.06 hooks/useFpsMonitor.ts
- [ ] 6.07 hooks/useHaptic.ts
- [ ] 6.08 hooks/useIsWeb.ts
- [ ] 6.09 hooks/useNetworkStatus.ts
- [ ] 6.10 hooks/usePayment.ts
- [ ] 6.11 hooks/usePiP.ts
- [ ] 6.12 hooks/usePulseGlow.ts
- [ ] 6.13 hooks/usePushNotificationHandler.ts
- [ ] 6.14 hooks/usePushNotifications.ts
- [ ] 6.15 hooks/useReducedMotion.ts
- [ ] 6.16 hooks/useResponsive.ts
- [ ] 6.17 hooks/useScrollDirection.ts
- [ ] 6.18 hooks/useTranslation.ts
- [ ] 6.19 hooks/useVideoPreload.ts
- [ ] 6.20 hooks/useWebKeyboardShortcuts.ts
- [ ] 6.21 services/api.ts
- [ ] 6.22 services/audioRoomsApi.ts
- [ ] 6.23 services/chatExportApi.ts
- [ ] 6.24 services/communitiesApi.ts
- [ ] 6.25 services/creatorApi.ts
- [ ] 6.26 services/downloadManager.ts
- [ ] 6.27 services/encryption.ts
- [ ] 6.28 services/encryptionApi.ts
- [ ] 6.29 services/eventsApi.ts
- [ ] 6.30 services/giftsApi.ts
- [ ] 6.31 services/islamicApi.ts
- [ ] 6.32 services/monetizationApi.ts
- [ ] 6.33 services/offlineCache.ts
- [ ] 6.34 services/paymentsApi.ts
- [ ] 6.35 services/promotionsApi.ts
- [ ] 6.36 services/pushNotifications.ts
- [ ] 6.37 services/reelTemplatesApi.ts
- [ ] 6.38 services/twoFactorApi.ts
- [ ] 6.39 services/widgetData.ts

## Phase 7: Mobile Screens A-D (52 files)
- [ ] 7.01 2fa-setup.tsx
- [ ] 7.02 2fa-verify.tsx
- [ ] 7.03 account-settings.tsx
- [ ] 7.04 account-switcher.tsx
- [ ] 7.05 achievements.tsx
- [ ] 7.06 ai-assistant.tsx
- [ ] 7.07 ai-avatar.tsx
- [ ] 7.08 analytics.tsx
- [ ] 7.09 appeal-moderation.tsx
- [ ] 7.10 archive.tsx
- [ ] 7.11 audio-library.tsx
- [ ] 7.12 audio-room.tsx
- [ ] 7.13 biometric-lock.tsx
- [ ] 7.14 blocked-keywords.tsx
- [ ] 7.15 blocked.tsx
- [ ] 7.16 bookmark-collections.tsx
- [ ] 7.17 bookmark-folders.tsx
- [ ] 7.18 boost-post.tsx
- [ ] 7.19 branded-content.tsx
- [ ] 7.20 broadcast-channels.tsx
- [ ] 7.21 broadcast/[id].tsx
- [ ] 7.22 call-history.tsx
- [ ] 7.23 call/[id].tsx
- [ ] 7.24 camera.tsx
- [ ] 7.25 caption-editor.tsx
- [ ] 7.26 cashout.tsx
- [ ] 7.27 challenges.tsx
- [ ] 7.28 channel/[handle].tsx
- [ ] 7.29 charity-campaign.tsx
- [ ] 7.30 chat-export.tsx
- [ ] 7.31 chat-folders.tsx
- [ ] 7.32 chat-lock.tsx
- [ ] 7.33 chat-theme-picker.tsx
- [ ] 7.34 chat-wallpaper.tsx
- [ ] 7.35 circles.tsx
- [ ] 7.36 close-friends.tsx
- [ ] 7.37 collab-requests.tsx
- [ ] 7.38 communities.tsx
- [ ] 7.39 community-posts.tsx
- [ ] 7.40 contact-sync.tsx
- [ ] 7.41 content-filter-settings.tsx
- [ ] 7.42 content-settings.tsx
- [ ] 7.43 conversation-info.tsx
- [ ] 7.44 conversation-media.tsx
- [ ] 7.45 conversation/[id].tsx
- [ ] 7.46 create-broadcast.tsx
- [ ] 7.47 create-clip.tsx
- [ ] 7.48 create-event.tsx
- [ ] 7.49 create-group.tsx
- [ ] 7.50 create-playlist.tsx
- [ ] 7.51 create-post.tsx
- [ ] 7.52 create-reel.tsx

## Phase 8: Mobile Screens D-M (48 files)
- [ ] 8.01 create-story.tsx
- [ ] 8.02 create-thread.tsx
- [ ] 8.03 create-video.tsx
- [ ] 8.04 creator-dashboard.tsx
- [ ] 8.05 creator-storefront.tsx
- [ ] 8.06 cross-post.tsx
- [ ] 8.07 dhikr-challenge-detail.tsx
- [ ] 8.08 dhikr-challenges.tsx
- [ ] 8.09 dhikr-counter.tsx
- [ ] 8.10 disappearing-default.tsx
- [ ] 8.11 disappearing-settings.tsx
- [ ] 8.12 discover.tsx
- [ ] 8.13 disposable-camera.tsx
- [ ] 8.14 dm-note-editor.tsx
- [ ] 8.15 donate.tsx
- [ ] 8.16 downloads.tsx
- [ ] 8.17 drafts.tsx
- [ ] 8.18 duet-create.tsx
- [ ] 8.19 edit-channel.tsx
- [ ] 8.20 edit-profile.tsx
- [ ] 8.21 eid-cards.tsx
- [ ] 8.22 enable-tips.tsx
- [ ] 8.23 end-screen-editor.tsx
- [ ] 8.24 event-detail.tsx
- [ ] 8.25 fatwa-qa.tsx
- [ ] 8.26 follow-requests.tsx
- [ ] 8.27 followed-topics.tsx
- [ ] 8.28 followers/[userId].tsx
- [ ] 8.29 following/[userId].tsx
- [ ] 8.30 gift-shop.tsx
- [ ] 8.31 go-live.tsx
- [ ] 8.32 green-screen-editor.tsx
- [ ] 8.33 hadith.tsx
- [ ] 8.34 hajj-companion.tsx
- [ ] 8.35 hajj-step.tsx
- [ ] 8.36 hashtag-explore.tsx
- [ ] 8.37 hashtag/[tag].tsx
- [ ] 8.38 image-editor.tsx
- [ ] 8.39 islamic-calendar.tsx
- [ ] 8.40 leaderboard.tsx
- [ ] 8.41 link-child-account.tsx
- [ ] 8.42 live/[id].tsx
- [ ] 8.43 local-boards.tsx
- [ ] 8.44 location-picker.tsx
- [ ] 8.45 majlis-list/[id].tsx
- [ ] 8.46 majlis-lists.tsx
- [ ] 8.47 manage-broadcast.tsx
- [ ] 8.48 manage-data.tsx

## Phase 9: Mobile Screens M-S (50 files)
- [ ] 9.01 marketplace.tsx
- [ ] 9.02 media-settings.tsx
- [ ] 9.03 membership-tiers.tsx
- [ ] 9.04 mentorship.tsx
- [ ] 9.05 mosque-finder.tsx
- [ ] 9.06 muted.tsx
- [ ] 9.07 mutual-followers.tsx
- [ ] 9.08 my-reports.tsx
- [ ] 9.09 nasheed-mode.tsx
- [ ] 9.10 new-conversation.tsx
- [ ] 9.11 notification-tones.tsx
- [ ] 9.12 notifications.tsx
- [ ] 9.13 orders.tsx
- [ ] 9.14 parental-controls.tsx
- [ ] 9.15 photo-music.tsx
- [ ] 9.16 pinned-messages.tsx
- [ ] 9.17 playlist/[id].tsx
- [ ] 9.18 playlists/[channelId].tsx
- [ ] 9.19 post-insights.tsx
- [ ] 9.20 post/[id].tsx
- [ ] 9.21 prayer-times.tsx
- [ ] 9.22 product-detail.tsx
- [ ] 9.23 product/[id].tsx
- [ ] 9.24 profile-customization.tsx
- [ ] 9.25 profile/[username].tsx
- [ ] 9.26 qibla-compass.tsx
- [ ] 9.27 qr-code.tsx
- [ ] 9.28 qr-scanner.tsx
- [ ] 9.29 quiet-mode.tsx
- [ ] 9.30 quran-reading-plan.tsx
- [ ] 9.31 quran-room.tsx
- [ ] 9.32 quran-share.tsx
- [ ] 9.33 ramadan-mode.tsx
- [ ] 9.34 reel-remix.tsx
- [ ] 9.35 reel-templates.tsx
- [ ] 9.36 reel/[id].tsx
- [ ] 9.37 report.tsx
- [ ] 9.38 reports/[id].tsx
- [ ] 9.39 restricted.tsx
- [ ] 9.40 revenue.tsx
- [ ] 9.41 save-to-playlist.tsx
- [ ] 9.42 saved-messages.tsx
- [ ] 9.43 saved.tsx
- [ ] 9.44 schedule-live.tsx
- [ ] 9.45 schedule-post.tsx
- [ ] 9.46 scholar-verification.tsx
- [ ] 9.47 screen-time.tsx
- [ ] 9.48 search-results.tsx
- [ ] 9.49 search.tsx
- [ ] 9.50 send-tip.tsx

## Phase 10: Mobile Screens S-Z (35 files)
- [ ] 10.01 series-detail.tsx
- [ ] 10.02 series-discover.tsx
- [ ] 10.03 series/[id].tsx
- [ ] 10.04 settings.tsx
- [ ] 10.05 share-profile.tsx
- [ ] 10.06 share-receive.tsx
- [ ] 10.07 sound/[id].tsx
- [ ] 10.08 starred-messages.tsx
- [ ] 10.09 status-privacy.tsx
- [ ] 10.10 sticker-browser.tsx
- [ ] 10.11 stitch-create.tsx
- [ ] 10.12 storage-management.tsx
- [ ] 10.13 story-viewer.tsx
- [ ] 10.14 streaks.tsx
- [ ] 10.15 tafsir-viewer.tsx
- [ ] 10.16 theme-settings.tsx
- [ ] 10.17 thread/[id].tsx
- [ ] 10.18 trending-audio.tsx
- [ ] 10.19 verify-encryption.tsx
- [ ] 10.20 video-editor.tsx
- [ ] 10.21 video-premiere.tsx
- [ ] 10.22 video/[id].tsx
- [ ] 10.23 voice-post-create.tsx
- [ ] 10.24 voice-recorder.tsx
- [ ] 10.25 volunteer-board.tsx
- [ ] 10.26 waqf.tsx
- [ ] 10.27 watch-history.tsx
- [ ] 10.28 watch-party.tsx
- [ ] 10.29 why-showing.tsx
- [ ] 10.30 wind-down.tsx
- [ ] 10.31 xp-history.tsx
- [ ] 10.32 zakat-calculator.tsx
- [ ] 10.33 forgot-password.tsx
- [ ] 10.34 sign-in.tsx
- [ ] 10.35 sign-up.tsx

## Phase 11: Onboarding Screens (4 files)
- [ ] 11.01 onboarding/interests.tsx
- [ ] 11.02 onboarding/profile.tsx
- [ ] 11.03 onboarding/suggested.tsx
- [ ] 11.04 onboarding/username.tsx

## Phase 12: Utils & Config (8 files)
- [ ] 12.01 utils/blurhash.ts
- [ ] 12.02 utils/hijri.ts
- [ ] 12.03 utils/lazily.ts
- [ ] 12.04 utils/localeFormat.ts
- [ ] 12.05 utils/rtl.ts
- [ ] 12.06 apps/mobile/app/+html.tsx
- [ ] 12.07 apps/mobile/src/i18n/tr.json (completeness check)
- [ ] 12.08 i18n files: ur.json, bn.json, fr.json, id.json, ms.json (completeness)

## Phase 13: Test Files (88 files)
- [ ] 13.01 Audit ALL 88 .spec.ts files for: empty tests, missing assertions, adequate coverage, proper mocking

## Phase 14: Cross-Space Compatibility Audit (D16)
Read specs/audit-dimensions.md D16 for full checklist. Check every cross-space interaction.

### Saf ↔ Other Spaces
- [ ] 14.01 Saf → Majlis: Can a Saf post be shared as a Majlis thread? Check create-thread.tsx, cross-post.tsx, PostCard share action
- [ ] 14.02 Saf → Risalah: Can a Saf post be sent in Risalah DM? Check conversation/[id].tsx share receive, share-receive.tsx
- [ ] 14.03 Saf → Bakra: Can a Saf story reference a Bakra reel? Check create-story.tsx link sticker, story mentions
- [ ] 14.04 Saf → Minbar: Can a Saf carousel be posted on Minbar? Check cross-post.tsx, create-video.tsx

### Bakra ↔ Other Spaces
- [ ] 14.05 Bakra → Saf: Can a reel be cross-posted as a Saf post? Check cross-post.tsx, reels.service crossPublish
- [ ] 14.06 Bakra → Majlis: Can reels embed in threads? Check thread/[id].tsx media rendering, RichText link handling
- [ ] 14.07 Bakra → Risalah: Can reels be forwarded in chat? Check messages.service forward, conversation/[id].tsx share
- [ ] 14.08 Bakra → Minbar: Can Bakra audio be used cross-space? Check sound/[id].tsx, audio-library.tsx

### Majlis ↔ Other Spaces
- [ ] 14.09 Majlis → Saf: Can a thread quote a Saf post? Check create-thread.tsx quotePost, ThreadCard quote rendering
- [ ] 14.10 Majlis → Risalah: Can polls be shared to groups? Check polls sharing, conversation/[id].tsx
- [ ] 14.11 Majlis → Bakra: Can threads link to reels with preview? Check RichText, LinkPreview component
- [ ] 14.12 Majlis → Minbar: Can threads link to videos with inline player? Check thread/[id].tsx

### Risalah ↔ Other Spaces
- [ ] 14.13 Risalah → All: Can ALL content types be forwarded via Risalah? Check messages.service.ts forward logic
- [ ] 14.14 Risalah → All: Does share sheet show "Send via Risalah" for every content type? Check every screen's share action
- [ ] 14.15 Risalah → Saf: Can voice messages become voice posts? Check voice-post-create.tsx
- [ ] 14.16 Risalah attribution: Does forwarded content show "shared from [Space]" label?

### Minbar ↔ Other Spaces
- [ ] 14.17 Minbar → Bakra: Can long videos be clipped to reels? Check create-clip.tsx, video/[id].tsx clip action
- [ ] 14.18 Minbar → Majlis: Can video comments link to discussion threads? Check video/[id].tsx, thread linking
- [ ] 14.19 Minbar → Saf: Can channel posts appear in Saf feed? Check feed algorithm, personalized-feed.service
- [ ] 14.20 Minbar → Risalah: Can live streams be announced in groups? Check go-live.tsx share, schedule-live.tsx

### Universal Cross-Space
- [ ] 14.21 Unified notifications: Do notifications from ALL 5 spaces show in notifications.tsx? Check notification types
- [ ] 14.22 Unified search: Does search.tsx / search-results.tsx find content from all 5 spaces? Check search.service.ts
- [ ] 14.23 Unified profile: Does profile/[username].tsx show tabs for posts, reels, threads, videos, channels?
- [ ] 14.24 Cross-space analytics: Does analytics.tsx / creator-dashboard.tsx aggregate stats from all spaces?
- [ ] 14.25 Content graph: Is there a linking model (Post → discussed in Thread → shared in Message)?
- [ ] 14.26 User identity consistency: Same avatar, badge, display name rendered identically across all 5 tab screens?
- [ ] 14.27 Create sheet: Does create.tsx offer options for all content types (post, reel, thread, story, video, live)?
- [ ] 14.28 Deep links: Test mizanly.app/post/X, /reel/X, /thread/X, /video/X, /channel/X routing
- [ ] 14.29 Offline consistency: Does offlineCache.ts cache content from all spaces equally?
- [ ] 14.30 RTL consistency: Are all 5 tab screens and their sub-screens RTL-correct? Check rtl.ts usage in each

## Phase 15: Deep Competitor Parity Audit (D17)
Read specs/audit-dimensions.md D17 for full checklist. Score EVERY screen 1-10 against best competitor.

### vs Instagram — Saf Space (score each 1-10)
- [ ] 15.01 Feed (saf.tsx) — algorithm ranking, suggested interleaved, caught-up marker, pull-to-refresh, story row
- [ ] 15.02 Stories (create-story.tsx, story-viewer.tsx) — all 8 sticker types, music, drawing, text effects, highlights
- [ ] 15.03 Reels in Saf context — reel tab, remix, templates, effects, sound page
- [ ] 15.04 Profile (profile/[username].tsx) — highlights, bio links, story ring, collab, account switching, pro dashboard
- [ ] 15.05 Create (create-post.tsx) — multi-image, filters, editing, scheduling, collab, location, hashtag suggestions, alt text
- [ ] 15.06 Explore (discover.tsx, hashtag-explore.tsx) — mixed grid, categories, search suggestions, trending
- [ ] 15.07 DM from Saf (new-conversation.tsx, conversation/[id].tsx) — vanish mode, reactions, GIF, shared media
- [ ] 15.08 Shopping (marketplace.tsx, product/[id].tsx, creator-storefront.tsx) — product tags, checkout
- [ ] 15.09 Notifications (notifications.tsx) — activity feed, grouping, follow suggestions
- [ ] 15.10 Settings applicable to Saf (settings.tsx, account-settings.tsx, privacy) — privacy, 2FA, data

### vs TikTok — Bakra Space (score each 1-10)
- [ ] 15.11 FYP (bakra.tsx) — algorithm quality, completion-rate ranking, not-interested, scroll feel
- [ ] 15.12 Video player UX — double-tap, hearts, comments, share, sound link, follow, scrubber
- [ ] 15.13 Create (create-reel.tsx, video-editor.tsx, caption-editor.tsx) — recording modes, speed, timer, effects, green screen, duet, stitch, voiceover, captions, transitions
- [ ] 15.14 Sound page (sound/[id].tsx, trending-audio.tsx) — all videos using sound, save, use
- [ ] 15.15 Comments (CommentsSheet.tsx) — nested, liked by creator, pinned, video replies
- [ ] 15.16 Creator profile as TikTok — video grid, liked, sounds, analytics
- [ ] 15.17 Live (live/[id].tsx, go-live.tsx) — gifts, viewers, comments, multi-guest, shopping
- [ ] 15.18 Search from Bakra context — users, videos, sounds, hashtags, live
- [ ] 15.19 Series (series/[id].tsx, series-detail.tsx) — paywall episodic, subscribe
- [ ] 15.20 Analytics for Bakra (analytics.tsx, post-insights.tsx) — views, traffic sources, audience

### vs X/Twitter — Majlis Space (score each 1-10)
- [ ] 15.21 Timeline (majlis.tsx) — For You + Following tabs, algorithm + chronological
- [ ] 15.22 Threads (thread/[id].tsx, create-thread.tsx) — chains, quote, repost, like, bookmark, view count
- [ ] 15.23 Replies — nested, hide reply, mute conversation
- [ ] 15.24 Spaces/Audio (audio-room.tsx) — speaker queue, recording, scheduling
- [ ] 15.25 Communities (communities.tsx, community-posts.tsx) — pages, rules, moderation, roles
- [ ] 15.26 Lists (majlis-lists.tsx, majlis-list/[id].tsx) — custom lists, timeline
- [ ] 15.27 Search from Majlis context (search.tsx) — trending, for you, people tabs
- [ ] 15.28 Polls (create-thread.tsx polls) — multi-option, duration, results
- [ ] 15.29 Subscriptions — subscriber content, badge, subscriber-only replies
- [ ] 15.30 DMs from Majlis — message requests, read receipts

### vs WhatsApp — Risalah Space (score each 1-10)
- [ ] 15.31 Chat (conversation/[id].tsx) — E2E encryption, disappearing, view-once, voice speed, reactions, replies, forward, star, search
- [ ] 15.32 Groups (create-group.tsx, conversation-info.tsx) — admin controls, permissions, approval, topics, description
- [ ] 15.33 Calls (call/[id].tsx, call-history.tsx) — voice/video, group calls, screen sharing, quality
- [ ] 15.34 Status — text + media, privacy controls, replies
- [ ] 15.35 Communities (broadcast-channels.tsx) — announcement groups, sub-groups
- [ ] 15.36 Channels (broadcast/[id].tsx) — one-way broadcast, voice notes, quizzes
- [ ] 15.37 Settings for Risalah — privacy, storage, backup, tones, 2-step
- [ ] 15.38 New 2026 WA features — group history, secret lock, view-once voice, camera effects, translation, member tags
- [ ] 15.39 File sharing — documents, contacts, location (live + static)
- [ ] 15.40 Stickers (sticker-browser.tsx, StickerPicker.tsx) — custom maker, packs, animated

### vs YouTube — Minbar Space (score each 1-10)
- [ ] 15.41 Home (minbar.tsx) — recommendation feed, categories, continue watching
- [ ] 15.42 Video player (video/[id].tsx, VideoPlayer.tsx, VideoControls.tsx) — quality, speed, PiP, mini player, ambient, captions, chapters, end screens
- [ ] 15.43 Shorts equivalent in Minbar — does Minbar have a Shorts/vertical video section?
- [ ] 15.44 Subscriptions — channel list, bell, all/none/personalized
- [ ] 15.45 Library (watch-history.tsx, downloads.tsx, saved.tsx) — history, playlists, downloads, watch later
- [ ] 15.46 Channel (channel/[handle].tsx, edit-channel.tsx) — about, videos, shorts, playlists, community, trailer, memberships
- [ ] 15.47 Upload (create-video.tsx) — title, description, tags, thumbnail, visibility, schedule, monetization, subtitles, end screen
- [ ] 15.48 Analytics for Minbar (analytics.tsx) — views, watch time, revenue, demographics
- [ ] 15.49 Comments from Minbar — threaded, heart, pin, creator reply, timestamps
- [ ] 15.50 Live (live/[id].tsx, go-live.tsx) — stream, chat, super chat, scheduling, premiere

### vs Telegram — Deep Comparison
- [ ] 15.51 Channels: Telegram unlimited subscribers vs Risalah broadcast capacity
- [ ] 15.52 Groups: Telegram 200K members, topics, slow mode, admin log vs Risalah groups
- [ ] 15.53 Bots/Mini Apps: Does Mizanly have ANY extensibility? Check for webhook, bot, or plugin architecture
- [ ] 15.54 Stars/Payments: Telegram Stars vs Mizanly virtual currency — feature completeness
- [ ] 15.55 Chat folders, saved messages, scheduled messages, silent messages, edit history — check all in Risalah
- [ ] 15.56 File sharing: Telegram 2GB vs Mizanly limits — check upload.service.ts limits
- [ ] 15.57 Secret chats vs Risalah encryption — depth comparison
- [ ] 15.58 Username-only contact (phone privacy) — does Mizanly support this?

### vs WeChat — Super App Model
- [ ] 15.59 Mini programs: Does Mizanly have any plugin/extension model? Any equivalent?
- [ ] 15.60 Payments: Is Mizanly payment as seamless as WeChat Pay? Check payment flow friction
- [ ] 15.61 Social feed (Moments): Is Saf feed friends-only by default like Moments? Check visibility defaults
- [ ] 15.62 QR code usage: Does Mizanly use QR for profile, payment, group join? Check qr-code.tsx, qr-scanner.tsx
- [ ] 15.63 Integrated search: Does search span messages, contacts, content, communities? Check search.service.ts scope
- [ ] 15.64 Daily opens: What drives 10+ daily opens? Check notification strategy, retention.service.ts

### vs Discord — Community & Voice
- [ ] 15.65 Server structure: Do Mizanly communities support channels, categories, roles? Check communities.service.ts
- [ ] 15.66 Forum channels: Do communities support threaded discussions? Check community-posts.tsx
- [ ] 15.67 Voice channels: Does Mizanly have always-on drop-in voice? Check audio-room.tsx — is it scheduled-only?
- [ ] 15.68 Webhooks: Does Mizanly support external integrations? Check for webhook endpoints
- [ ] 15.69 Role-based permissions: How granular are community permissions? Check communities.service.ts roles
- [ ] 15.70 Server discovery: Is community discovery as good as Discord's? Check discover.tsx

### vs Snapchat, Reddit, Signal, Threads, Clubhouse
- [ ] 15.71 Snapchat: Map/location features vs mosque-finder, ephemeral vs disappearing, Lenses vs AR plan
- [ ] 15.72 Reddit: Upvote/karma vs XP/reputation, subreddits vs communities, awards vs gifts, wiki vs knowledge base
- [ ] 15.73 Signal: Protocol comparison vs encryption.service.ts, sealed sender, metadata protection depth
- [ ] 15.74 Threads: Fediverse support?, character limits, re-share mechanism, cross-posting to Saf (like Threads→IG)
- [ ] 15.75 Clubhouse: Audio room quality, discovery, replays, clubs vs recurring audio groups

### vs Muslim Pro / Quran.com — Islamic Features
- [ ] 15.76 Prayer times: Calculation method accuracy, multiple methods (MWL, ISNA, Umm Al-Qura, etc.) — check islamic.service.ts
- [ ] 15.77 Quran: Audio recitation (multiple reciters?), word-by-word, tajweed colors, bookmarks — check quran-share.tsx, quran-room.tsx, quran-reading-plan.tsx
- [ ] 15.78 Hadith: Which collections? Bukhari, Muslim, Abu Dawud, Tirmidhi, Nasai, Ibn Majah — check hadith.tsx, islamic.service.ts
- [ ] 15.79 Dua collection: Categorized? Morning/evening, travel, eating, etc. — check islamic features
- [ ] 15.80 Mosque finder: Data source? Coverage? Accuracy? — check mosque-finder.tsx, islamic.service.ts
- [ ] 15.81 Zakat: Handles gold, silver, cash, stocks, crypto, business assets? — check zakat-calculator.tsx
- [ ] 15.82 Islamic calendar: Which method? Um al-Qura, calculated, observed? — check hijri.ts, islamic-calendar.tsx
- [ ] 15.83 Tafsir: Multiple scholars, multiple languages? — check tafsir-viewer.tsx
- [ ] 15.84 Dhikr: Customizable counters, goal tracking, social sharing? — check dhikr-counter.tsx, dhikr-challenges.tsx
- [ ] 15.85 Ramadan: Suhoor/iftar per location, fasting tracker, Ramadan-specific UI? — check ramadan-mode.tsx

## Phase 16: Final Audit Report
- [ ] 16.01 Write docs/AUDIT_REPORT_BATCH84.md — comprehensive findings with:
  - Total issues by severity (P0-P7)
  - Total issues by dimension (D1-D17)
  - Cross-space compatibility score matrix (5×5 grid)
  - Per-screen competitor parity scores (1-10)
  - Space-by-space competitor parity averages
  - Top 20 highest-priority fixes
  - Recommendations for next batch
  - Islamic feature accuracy report

---

## Completion Criteria
ALL items marked [x] + final audit report written = EXIT_SIGNAL: true

## TOTALS
- Phase 1: 14 files (infrastructure)
- Phase 2: 77 files (backend services)
- Phase 3: 72 files (backend controllers)
- Phase 4: 10 files (tab screens)
- Phase 5: 65 files (components)
- Phase 6: 39 files (hooks & services)
- Phase 7: 52 files (screens A-D)
- Phase 8: 48 files (screens D-M)
- Phase 9: 50 files (screens M-S)
- Phase 10: 35 files (screens S-Z)
- Phase 11: 4 files (onboarding)
- Phase 12: 8 files (utils & i18n)
- Phase 13: 88 files (tests)
- Phase 14: 30 items (cross-space compatibility)
- Phase 15: 85 items (deep competitor parity)
- Phase 16: 1 report
- **GRAND TOTAL: ~678 audit items**
