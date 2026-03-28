# Mobile Content Detail/Viewer Screens — Architecture Extraction

> Extracted 2026-03-25. Source files in `apps/mobile/app/(screens)/`.

---

## 1. Post Detail — `post/[id].tsx`

**Line count:** 1,071 lines
**Path:** `apps/mobile/app/(screens)/post/[id].tsx`

### Components Defined in File
| Component | Lines | Purpose |
|-----------|-------|---------|
| `CommentRow` | ~205 (59-264) | Single comment with swipe-to-like, edit, delete, reaction picker, reply |
| `CommunityNotesSection` | ~185 (266-450) | Community notes display + create + rate (helpful/not helpful) |
| `PostDetailScreen` | ~370 (452-819) | Main screen: post card, comments list, sticky action bar, input |

### API Queries (React Query)
| Query Key | Endpoint | Type | Enabled |
|-----------|----------|------|---------|
| `['post', id]` | `postsApi.getById(id)` | `useQuery` | `!!id` |
| `['post-comments', id]` | `postsApi.getComments(id, cursor)` | `useInfiniteQuery` | `!!id` |
| `['community-notes', 'post', postId]` | `communityNotesApi.getHelpful('post', postId)` | `useQuery` | `!!postId` |

### Mutations
| Mutation | Endpoint | Optimistic Update |
|----------|----------|-------------------|
| Like post | `postsApi.react(id, 'LIKE')` / `postsApi.unreact(id)` | Yes — local state toggle + count |
| Save post | `postsApi.save(id)` / `postsApi.unsave(id)` | Yes — local state toggle |
| Like comment | `postsApi.likeComment(postId, commentId)` / `postsApi.unlikeComment(...)` | Yes — local state |
| Delete comment | `postsApi.deleteComment(postId, commentId)` | No — invalidates on success |
| Edit comment | `postsApi.editComment(postId, commentId, content)` | No |
| Add comment | `postsApi.addComment(id, text, replyToId?)` | No — invalidates `post-comments` + `post` |
| Create community note | `communityNotesApi.create({contentType, contentId, note})` | No |
| Rate community note | `communityNotesApi.rate(noteId, rating)` | No |

### Engagement Actions
- **Like** (sticky bar ActionButton + comment heart icon)
- **Comment** (bottom input with reply-to support, max 500 chars)
- **Save/Bookmark** (sticky bar ActionButton)
- **Share** (native `Share.share` with deep link `mizanly://post/{id}`)
- **Comment like** (heart icon per comment)
- **Comment edit** (inline TextInput, owner only)
- **Comment delete** (Alert confirmation, owner or post author)
- **Swipe-to-like comment** (Pan gesture, translationX > 50 triggers like)
- **Long press comment** for reaction picker (ReactionPicker component)
- **Community notes** — create, rate helpful/not helpful

### Comment Rendering
- **Flat list** (FlatList with cursor-based infinite scroll)
- **Sort options:** "top" (client-side sort by likesCount descending) or "latest" (API order)
- **No threading/nesting** — flat comment list with reply-to support (reply banner shows target username)
- **Pagination:** `onEndReachedThreshold={0.4}`, `getNextPageParam` from `meta.cursor`
- **Post author comments** highlighted with emerald left border (`rtlBorderStart`)

### Media Playback
- None in detail screen itself — media is rendered via `PostCard` component (images/carousel)

### Navigation Patterns
- **Back:** `router.back()` via GlassHeader left action
- **Share:** native share sheet
- **User profile:** via Avatar/username taps in PostCard

### Haptic Usage
| Context | Trigger |
|---------|---------|
| `haptic.like()` | Like post, like comment, swipe-like comment |
| `haptic.save()` | Bookmark/save post |
| `haptic.tick()` | Comment sort toggle |
| `haptic.longPress()` | Long press comment for reactions |
| `haptic.send()` | Submit community note |

### Animation Patterns
| Animation | Library | Details |
|-----------|---------|---------|
| Swipe-to-like comment | Reanimated `Gesture.Pan()` | `translateX` shared value, heart icon opacity interpolated 0-50px, springs back |
| Heart reveal on swipe | Reanimated `interpolate` | Opacity 0->1, scale 0.5->1 as translateX goes 0->50 |
| Send button press | `useAnimatedPress({ scaleTo: 0.85 })` | Spring scale on press |
| Sticky action bar | BlurView (iOS) / rgba overlay (Android) | Glass effect |

### Special Features
- **Swipe-to-like comments** — Pan gesture with heart icon reveal animation
- **Community Notes** (Twitter/X-style) — separate section with create/rate/display, gold-themed gradient cards
- **Comment editing** — inline edit mode with save/cancel
- **Post author badge** — emerald border on comments from post author
- **TTS (Text-to-Speech)** — "Listen" button for posts with content > 100 chars, uses `useTTS()` hook
- **Sticky glass action bar** — BlurView on iOS, rgba on Android, with like/comment/share/save ActionButtons
- **Comment sort** — pill buttons for "Top" vs "Latest"

---

## 2. Reel Detail — `reel/[id].tsx`

**Line count:** 894 lines
**Path:** `apps/mobile/app/(screens)/reel/[id].tsx`

### Components Defined in File
| Component | Lines | Purpose |
|-----------|-------|---------|
| `CommentRow` | ~80 (47-140) | Single comment with like, delete, reply |
| `ReelDetailScreen` | ~525 (142-666) | Video player, overlay info, comments, share-to-DM |

### API Queries (React Query)
| Query Key | Endpoint | Type | Enabled |
|-----------|----------|------|---------|
| `['reel', id]` | `reelsApi.getById(id)` | `useQuery` | `!!id` |
| `['reel-comments', id]` | `reelsApi.getComments(id, cursor)` | `useInfiniteQuery` | `!!id` |
| `['conversations']` | `messagesApi.getConversations()` | `useQuery` | `showShareSheet` (lazy) |

### Mutations
| Mutation | Endpoint | Optimistic Update |
|----------|----------|-------------------|
| Like reel | `reelsApi.like(id)` / `reelsApi.unlike(id)` | Yes — full optimistic with rollback via `onMutate`/`onError` |
| Bookmark reel | `reelsApi.bookmark(id)` / `reelsApi.unbookmark(id)` | No — invalidates |
| Share reel | `reelsApi.share(id)` | No — invalidates + native share |
| Add comment | `reelsApi.comment(id, text, replyToId?)` | No — invalidates both queries |
| Like comment | `reelsApi.likeComment(reelId, commentId)` / `reelsApi.unlikeComment(...)` | Yes — local state |
| Delete comment | `reelsApi.deleteComment(reelId, commentId)` | No |
| Share to DM | `messagesApi.sendMessage(conversationId, {...})` | No |
| Follow user | `followsApi.follow(userId)` | No — invalidates reel query |

### Side Effects
- **View recording on mount:** `reelsApi.view(id)` called in `useEffect` when `id` and `user` exist (fire-and-forget)

### Engagement Actions
- **Like** (ActionButton with heart, optimistic)
- **Comment** (bottom input, reply support, max 500 chars)
- **Share** (native `Share.share` with `mizanly://reel/{id}`)
- **Bookmark** (ActionButton with gold bookmark)
- **Send to DM** (BottomSheet with conversation list, sends as `reel_share` message type)
- **Follow** (follow button on overlay)
- **Comment like** (heart icon)
- **Comment delete** (Alert confirmation, own comments only)

### Comment Rendering
- **Flat list** (FlatList with infinite scroll)
- **No sort options** (API order only)
- **No threading** — flat list with reply-to banner
- **Pagination:** `onEndReachedThreshold={0.4}`

### Media Playback
| Feature | Implementation |
|---------|---------------|
| Video player | `expo-av` `Video` component |
| Resize mode | `ResizeMode.COVER` |
| Auto-play | `shouldPlay={isPlaying}` (starts true) |
| Looping | `isLooping={reel.isLooping ?? true}` |
| Native controls | Disabled (`useNativeControls={false}`) |
| Play/pause | Tap play icon overlay when paused, `videoRef.current?.pauseAsync()/playAsync()` |
| Photo carousel | `ImageCarousel` when `isPhotoCarousel && carouselUrls?.length` |
| Video height | `SCREEN_H * 0.7` |

### Navigation Patterns
- **Back:** `router.back()` via GlassHeader
- **Duet:** `/(screens)/duet-create?reelId={id}` (GlassHeader right action)
- **Remix:** `/(screens)/reel-remix?reelId={id}` (GlassHeader right action)
- **Stitch:** `/(screens)/stitch-create?reelId={id}` (GlassHeader right action)
- **Share to DM:** opens BottomSheet with conversations list

### Haptic Usage
| Context | Trigger |
|---------|---------|
| `haptic.like()` | Like reel, like comment |
| `haptic.save()` | Bookmark reel |
| `haptic.navigate()` | Share reel |
| `haptic.send()` | Share to DM |

### Animation Patterns
| Animation | Library | Details |
|-----------|---------|---------|
| Clear mode overlay toggle | Reanimated `withTiming` | `overlayOpacity` fades 1->0 or 0->1 over 300ms |
| Animated press | `useAnimatedPress()` | Scale feedback on press (used but not visually prominent) |
| Gradient overlay | `LinearGradient` | Bottom gradient over video (transparent -> rgba(0,0,0,0.8)) |

### Special Features
- **Clear mode** — tap video to toggle overlay visibility (animated opacity), toast shown once
- **Share to DM** — BottomSheet lists conversations, lazy-loads `['conversations']` query, sends `reel_share` message
- **Duet/Remix/Stitch** — GlassHeader right actions navigate to creation screens
- **Photo carousel support** — if `isPhotoCarousel`, renders `ImageCarousel` instead of `Video`
- **Audio info overlay** — shows audio title + artist if present
- **Follow button** in video overlay

---

## 3. Thread Detail — `thread/[id].tsx`

**Line count:** 680 lines
**Path:** `apps/mobile/app/(screens)/thread/[id].tsx`

### Components Defined in File
| Component | Lines | Purpose |
|-----------|-------|---------|
| `ReplyRow` | ~146 (34-180) | Nested reply with depth indentation, like, delete, connecting lines |
| `ThreadDetailScreen` | ~385 (182-566) | Thread card, replies list, sticky action bar, reply input |

### API Queries (React Query)
| Query Key | Endpoint | Type | Enabled |
|-----------|----------|------|---------|
| `['thread', id]` | `threadsApi.getById(id)` | `useQuery` | `!!id` |
| `['thread-replies', id]` | `threadsApi.getReplies(id, cursor)` | `useInfiniteQuery` | `!!id` |

### Mutations
| Mutation | Endpoint | Optimistic Update |
|----------|----------|-------------------|
| Like thread | `threadsApi.like(id)` / `threadsApi.unlike(id)` | Yes — local state |
| Bookmark thread | `threadsApi.bookmark(id)` / `threadsApi.unbookmark(id)` | Yes — local state |
| Add reply | `threadsApi.addReply(id, text, parentId?)` | No — invalidates |
| Like reply | `threadsApi.likeReply(threadId, replyId)` / `threadsApi.unlikeReply(...)` | Yes — local state with rollback |
| Delete reply | `threadsApi.deleteReply(threadId, replyId)` | No — Alert confirmation |

### Engagement Actions
- **Like thread** (sticky bar ActionButton)
- **Bookmark thread** (sticky bar ActionButton)
- **Reply** (bottom input, supports reply-to with parentId)
- **Share** (native `Share.share` with `mizanly://thread/{id}`)
- **Like reply** (heart icon per reply)
- **Delete reply** (Alert confirmation, own replies only)

### Comment Rendering (Replies)
- **Threaded/nested** — depth computed via `depthMap` (Map<id, depth>), max depth clamped to 3
- **Visual nesting:** indent = `depth * 24px`, with connecting lines (vertical `indentLine`)
- **Parent-child lines:** emerald reply line (`rgba(10, 123, 79, 0.3)`) below avatar when reply has children
- **Sort options:** "top" (client-side sort by likesCount) or "latest" (API order)
- **Pagination:** infinite scroll with cursor

### Media Playback
- **Reply media:** `ProgressiveImage` for first media URL in `reply.mediaUrls[]`
- No video playback in thread detail

### Navigation Patterns
- **Back:** `router.back()` via GlassHeader
- **Share:** GlassHeader right action + sticky bar

### Haptic Usage
| Context | Trigger |
|---------|---------|
| `haptic.like()` | Like thread (sticky bar) |
| `haptic.save()` | Bookmark thread (sticky bar) |
| `haptic.navigate()` | TTS listen |
| `haptic.tick()` | Reply sort toggle |

### Animation Patterns
| Animation | Library | Details |
|-----------|---------|---------|
| Sticky glass bar | BlurView (iOS) / rgba overlay (Android) | Bottom sticky with like/reply/share/bookmark |

### Special Features
- **Nested reply threads** — computed depth map, clamped at 3 levels, with connecting lines
- **TTS (Text-to-Speech)** — listen button for threads with content > 100 chars
- **Reply sort** — "Top" vs "Latest" pill buttons
- **Sticky glass action bar** — like, reply (focuses input), share, bookmark
- **ThreadCard reuse** — renders the thread header using shared `ThreadCard` component
- **RTL-aware indentation** — indent direction flips for RTL layouts

---

## 4. Video Detail — `video/[id].tsx`

**Line count:** 1,491 lines
**Path:** `apps/mobile/app/(screens)/video/[id].tsx`

### Components Defined in File
| Component | Lines | Purpose |
|-----------|-------|---------|
| `ChapterMarker` | ~45 (51-95) | Single chapter with progress-aware styling (past/current/future) |
| `UpNextSection` | ~76 (98-174) | Recommended videos with thumbnails, lazy-loaded |
| `VideoDetailScreen` | ~820 (176-995) | Full video player with controls, chapters, comments, channel, actions |

### API Queries (React Query)
| Query Key | Endpoint | Type | Enabled |
|-----------|----------|------|---------|
| `['video', id]` | `videosApi.getById(id)` | `useQuery` | `!!id` |
| `['video-comments', id]` | `videosApi.getComments(id, cursor)` | `useInfiniteQuery` | `!!id` |
| `['video-suggested', videoId]` | `videosApi.getRecommended(videoId, 5)` | `useQuery` | `!!videoId` |

### Mutations
| Mutation | Endpoint | Optimistic Update |
|----------|----------|-------------------|
| Like video | `videosApi.like(id)` | No — invalidates |
| Dislike video | `videosApi.dislike(id)` | No — invalidates |
| Remove reaction | `videosApi.removeReaction(id)` | No — invalidates |
| Bookmark video | `videosApi.bookmark(id)` / `videosApi.unbookmark(id)` | No — invalidates |
| Subscribe channel | `channelsApi.subscribe(handle)` / `channelsApi.unsubscribe(handle)` | No — invalidates |
| Add comment | `videosApi.comment(id, text, replyToId?)` | No — invalidates |

### Side Effects
- **View recording:** `videosApi.view(video.id)` on mount (skips self-views)
- **Progress saving:** `videosApi.updateProgress(id, progress, completed)` on unmount + app background (via `AppState` listener)
- **Mini player sync:** stores progress/playing state to Zustand on navigate back

### Engagement Actions
- **Like** (sticky bar, toggles with remove-reaction)
- **Dislike** (sticky bar, toggles with remove-reaction)
- **Comment** (BottomSheet with FlatList + input)
- **Bookmark** (sticky bar, gold color)
- **Share** (sticky bar + header, native `Share.share` with `mizanly://video/{id}`)
- **Subscribe/Unsubscribe** channel (button in channel row)
- **Report** (header action, navigates to report screen)

### Comment Rendering
- **BottomSheet** — comments displayed in a BottomSheet (snapPoint 0.7)
- **Preview:** 2 comments shown inline in scroll view
- **Full list:** FlatList inside BottomSheet with infinite scroll
- **Reply support:** `replyToId` state, basic reply button
- **No threading** — flat comment list

### Media Playback
| Feature | Implementation |
|---------|---------------|
| Video player | `expo-av` `Video` component |
| Resize mode | `ResizeMode.CONTAIN` |
| Auto-play | `shouldPlay={isPlaying}` (starts true) |
| Looping | `isLooping={video.isLooping ?? false}` |
| Native controls | Disabled |
| Custom controls | `VideoControls` component (play/pause, seek, quality, speed, volume, minimize) |
| Quality | State-tracked (`720p` default) — switching requires multiple HLS streams |
| Playback speed | `videoRef.current?.setRateAsync(speed, true)` — presets via VideoControls |
| Volume | `videoRef.current?.setVolumeAsync(volume)` — slider in VideoControls |
| Seek | `videoRef.current?.setPositionAsync(time * 1000)` |
| Progress tracking | `onPlaybackStatusUpdate` callback, position/duration in state |
| Mini player | Zustand store: `setMiniPlayerVideo`, progress/playing state synced |
| Chapters | Seek to chapter start time via `setPositionAsync` |

### Navigation Patterns
- **Back:** `handleBack()` — if playing, shrinks to mini player (Zustand) then `router.back()`
- **Channel:** `/(screens)/channel/{handle}`
- **Share:** native share sheet
- **Report:** `/(screens)/report?type=video&id={id}`
- **Save to playlist:** `/(screens)/save-to-playlist?videoId={id}`
- **Create clip:** `/(screens)/create-clip?videoId={id}`
- **End screen editor:** `/(screens)/end-screen-editor?videoId={id}` (owner only)
- **Premiere:** `/(screens)/video-premiere?videoId={id}` (owner only)
- **Up Next videos:** `/(screens)/video/{id}` (push to same screen type)

### Haptic Usage
| Context | Trigger |
|---------|---------|
| `haptic.like()` | Like video, dislike video |
| `haptic.save()` | Bookmark video |
| `haptic.follow()` | Subscribe/unsubscribe channel |
| `haptic.navigate()` | Share video |
| `haptic.delete()` | Report video |

### Animation Patterns
| Animation | Library | Details |
|-----------|---------|---------|
| Clear mode toggle | Reanimated `withTiming` | Overlay opacity 1->0 or 0->1 (300ms) |
| Chapter "Now Playing" badge | Reanimated `FadeIn` | Fades in when chapter is current |
| Cinematic gradient overlays | `LinearGradient` | 4-stop gradient over video, title gradient at bottom |
| Title accent line | `LinearGradient` | Gold-to-emerald-to-transparent line above title |
| Sticky action bar | BlurView (iOS) / rgba (Android) | Glass effect with safe area padding |
| Scroll-linked parallax | `scrollY` shared value | Tracked but not fully wired to visual effect |

### Special Features
- **Video chapters** — collapsible timeline with `ChapterMarker` components, progress-aware styling (past=dimmed, current=gold highlight, future=gray), seek-to-chapter on tap
- **Mini player** — on back press while playing, video shrinks to Zustand-managed mini player with progress/playing state. Closes mini player if opening same video.
- **Progress persistence** — saves watch progress on unmount and app background via `AppState` listener. Marks completed if progress > 90%.
- **Clear mode** — tap video to hide all overlay UI (same pattern as reel detail)
- **Up Next section** — recommended videos fetched via `videosApi.getRecommended(id, 5)`, rendered as thumbnail rows
- **More options menu** — BottomSheet with save to playlist, create clip, end screen editor (owner), premiere (owner), report
- **Cinematic styling** — gold accent line, gradient overlays, gold "Now Playing" badges on chapters
- **Channel subscribe** — inline button with subscribed/unsubscribed states
- **YouTube-like layout** — title, stats, channel row, description, tags, chapters, up next, comments

---

## 5. Story Viewer — `story-viewer.tsx`

**Line count:** 967 lines
**Path:** `apps/mobile/app/(screens)/story-viewer.tsx`

### Components Defined in File
| Component | Lines | Purpose |
|-----------|-------|---------|
| `ProgressSegment` | ~15 (62-81) | Single animated progress bar segment |
| `ProgressBar` | ~10 (83-99) | Row of progress segments |
| `EmojiReactionButton` | ~23 (103-126) | Animated emoji reaction with scale bounce |
| `StoryGroupPage` (memo) | ~540 (139-681) | One user's stories: media, stickers, reactions, reply, viewers |
| `StoryViewerScreen` | ~155 (685-840) | Horizontal FlatList pager across story groups |

### API Queries (React Query)
| Query Key | Endpoint | Type | Enabled |
|-----------|----------|------|---------|
| `['story-viewers', storyId]` | `storiesApi.getViewers(storyId)` | `useQuery` | `isOwnStory && showViewers && !!storyId` |

### Mutations
| Mutation | Endpoint | Optimistic Update |
|----------|----------|-------------------|
| Reply to story | `storiesApi.replyToStory(storyId, replyText)` | No |
| Emoji reaction | `storiesApi.replyToStory(storyId, emoji)` | No (reuses reply endpoint) |
| Sticker response | `storiesApi.submitStickerResponse(storyId, type, response)` | No (fire-and-forget) |

### Side Effects
- **Mark viewed:** `storiesApi.markViewed(storyId)` on each story when `isActive` (fire-and-forget)
- **Clear store data:** `useStore.getState().setStoryViewerData(null)` on unmount

### Engagement Actions
- **Quick emoji reactions:** 6 preset emojis (heart, fire, clap, joy, heart-eyes, cry) — sent via `replyToStory`
- **Text reply:** bottom input field, appears on tap
- **Sticker interactions:** poll vote, quiz answer, question submit, countdown remind, slider value, add-yours chain, link open
- **View story viewers** (own stories only, BottomSheet)

### Comment Rendering
- No traditional comments — story replies are sent via DM-style `replyToStory` endpoint

### Media Playback
| Feature | Implementation |
|---------|---------------|
| Video stories | `expo-av` `Video` component, `ResizeMode.COVER` |
| Image stories | `ProgressiveImage` (full screen) |
| Auto-advance | Timer-based (5000ms per image), video uses `onPlaybackStatusUpdate.didJustFinish` |
| Progress bar | Reanimated `withTiming` animation (shared value 0->1 over `STORY_DURATION`) |
| Pause/resume | Press-and-hold pauses progress, release resumes (remaining duration calculated) |
| Video progress | `positionMillis / durationMillis` feeds into shared progress value |

### Navigation Patterns
- **Close:** X button → `router.back()`
- **Tap left zone:** previous story in group, or previous group
- **Tap right zone:** next story in group, or next group
- **Horizontal swipe:** FlatList `pagingEnabled` swipes between groups
- **Link sticker:** opens URL via `Linking.openURL`

### Haptic Usage
| Context | Trigger |
|---------|---------|
| `haptic.tick()` | Emoji reaction |

### Animation Patterns
| Animation | Library | Details |
|-----------|---------|---------|
| Progress bars | Reanimated `withTiming` | SharedValue 0->1 per segment, width percentage animated |
| Progress cancel/resume | `cancelAnimation(progressValue)` | On pause, viewer sheet, video stories |
| Emoji reaction bounce | Reanimated `withTiming` | Scale 1->1.3->1 (100ms each) |
| Top gradient | `LinearGradient` | `rgba(0,0,0,0.6)` -> transparent over progress + user row |

### Special Features
- **Instagram-style story progress bars** — segmented progress bar at top, each segment animates fill width
- **12 sticker types rendered:** poll, quiz, question, countdown, slider, gif, link, addYours, music, location, mention, hashtag
- **Sticker response system** — `handleStickerResponse` sends response to API and updates local state
- **Quick emoji reactions** — 6 floating emoji buttons with scale animation
- **Horizontal pager** — FlatList with `pagingEnabled`, `getItemLayout` for O(1) scroll, `maxToRenderPerBatch={3}`, `windowSize={3}`
- **Tap zones** — left 1/3 for previous, right 2/3 for next (Pressable zones)
- **Press-and-hold to pause** — `onPressIn` pauses, `onPressOut` resumes with remaining duration
- **Own story viewers** — BottomSheet with FlatList of viewers (Avatar + name + username)
- **Zustand data passing** — story groups passed via `useStore.storyViewerData` or `groupJson` route param
- **Text overlay** — positioned at 40% top, with text shadow
- **Video auto-advance** — `didJustFinish` triggers `advance()` for video stories

### Sticker Types (Rendered in Viewer)
| Type | Component | Interaction |
|------|-----------|-------------|
| poll | `PollSticker` | Vote on option |
| quiz | `QuizSticker` | Select answer (confetti on correct) |
| question | `QuestionSticker` | Submit text question |
| countdown | `CountdownSticker` | Toggle remind me |
| slider | `SliderSticker` | Drag to set value |
| gif | `GifStickerDisplay` | Display only |
| link | `LinkSticker` | Opens URL |
| addYours | `AddYoursSticker` | Add to chain / view responses |
| music | `MusicSticker` | Display (compact/lyrics/waveform) |
| location | `LocationStickerDisplay` | Tap to view location |
| mention | Inline `<View>` | `@username` badge |
| hashtag | Inline `<View>` | `#tag` badge |

---

## 6. Sound/Audio Track — `sound/[id].tsx`

**Line count:** 486 lines
**Path:** `apps/mobile/app/(screens)/sound/[id].tsx`

### Components Defined in File
| Component | Lines | Purpose |
|-----------|-------|---------|
| `SoundScreen` | ~295 (37-332) | Audio track detail: cover art, stats, preview, grid of reels using this sound |

### API Queries (React Query)
| Query Key | Endpoint | Type | Enabled |
|-----------|----------|------|---------|
| `['audio-track', id]` | `audioTracksApi.getById(id)` | `useQuery` | default |
| `['audio-track-reels', id]` | `audioTracksApi.getReelsUsing(id, cursor)` | `useInfiniteQuery` | `!!track` |

### Mutations
- None

### Side Effects
- **Audio cleanup on unmount:** `soundRef.current?.unloadAsync()` in useEffect cleanup
- **Playback status update:** auto-stops and unloads when `didJustFinish`

### Engagement Actions
- **Play audio preview** — toggle play/stop of audio track
- **Use this sound** — navigates to create-reel with `audioTrackId` param

### Comment Rendering
- No comments on sound page

### Media Playback
| Feature | Implementation |
|---------|---------------|
| Audio preview | `expo-av` `Audio.Sound.createAsync` |
| Play/stop toggle | Single tap on cover art play overlay |
| Auto-cleanup | Unload on finish, unload on unmount |

### Navigation Patterns
- **Back:** `router.back()` via GlassHeader
- **Use sound:** `/(screens)/create-reel?audioTrackId={id}`
- **Reel tap:** `/(screens)/reel/{reelId}`

### Haptic Usage
| Context | Trigger |
|---------|---------|
| `haptic.navigate()` | Use sound button, reel press |

### Animation Patterns
| Animation | Library | Details |
|-----------|---------|---------|
| Grid items entrance | Reanimated `FadeInUp` | Staggered delay (index * 50ms, 400ms duration) |
| Header entrance | Reanimated `FadeInUp` | Delay 0, 400ms duration |
| Gradient cards | `LinearGradient` | Cover-to-transparent gradients on header + stat badges |

### Special Features
- **Audio preview** — play/pause the track audio with cover overlay button
- **Trending badge** — emerald-to-gold gradient badge when `track.isTrending`
- **3-column reel grid** — reels using this sound displayed in masonry-like grid with view count overlays
- **"Use this sound" CTA** — `GradientButton` navigates to create-reel
- **Stats badges** — usage count + plays count in gradient pill badges

---

## Cross-Screen Architecture Summary

### Shared Patterns Across All Detail Screens

| Pattern | post/[id] | reel/[id] | thread/[id] | video/[id] | story-viewer | sound/[id] |
|---------|-----------|-----------|-------------|------------|--------------|------------|
| GlassHeader | Yes | Yes | Yes | Yes | No (custom) | Yes |
| ScreenErrorBoundary | Yes | Yes | Yes | Yes | Yes | Yes |
| BrandedRefreshControl | Yes | Yes | Yes | Yes | Yes (viewers) | Yes |
| Skeleton loading | Yes | Yes | Yes | Yes | No | Yes |
| EmptyState | Yes | Yes | Yes | Yes | Yes | Yes |
| Sticky action bar | Yes (glass) | No (inline) | Yes (glass) | Yes (glass) | No | No |
| Comment input | Yes | Yes | Yes | Yes (sheet) | Yes (reply) | No |
| Infinite scroll | Yes | Yes | Yes | Yes | No | Yes |
| useContextualHaptic | Yes | Yes | Yes | Yes | Yes | Yes |
| useTranslation | Yes | Yes | Yes | Yes | Yes | Yes |
| useThemeColors | Yes | Yes | Yes | Yes | Yes | Yes |
| RTL support | Yes | Partial | Yes | No | Partial | Partial |
| Share deep link | Yes | Yes | Yes | Yes | No | No |
| Optimistic updates | Yes | Yes | Yes | No | No | No |
| BlurView glass bar | Yes | No | Yes | Yes | No | No |
| TTS listen button | Yes | No | Yes | No | No | No |

### Query Key Patterns
All screens use consistent query key patterns:
- Entity: `['post', id]`, `['reel', id]`, `['thread', id]`, `['video', id]`, `['audio-track', id]`
- Comments/Replies: `['post-comments', id]`, `['reel-comments', id]`, `['thread-replies', id]`, `['video-comments', id]`
- Related: `['community-notes', 'post', id]`, `['video-suggested', id]`, `['audio-track-reels', id]`, `['story-viewers', id]`

### Engagement Action Matrix
| Action | Post | Reel | Thread | Video | Story | Sound |
|--------|------|------|--------|-------|-------|-------|
| Like | react/unreact | like/unlike | like/unlike | like/removeReaction | emoji reaction | - |
| Dislike | - | - | - | dislike/removeReaction | - | - |
| Comment | addComment | comment | addReply | comment | replyToStory | - |
| Bookmark | save/unsave | bookmark/unbookmark | bookmark/unbookmark | bookmark/unbookmark | - | - |
| Share | native Share | native Share + DM | native Share | native Share | - | - |
| Follow | - | follow | - | subscribe | - | - |
| Report | - | - | - | report screen | - | - |
| Delete | - | - | - | - | - | - |
| Edit | comment edit | - | - | - | - | - |

### Comment Threading Comparison
| Screen | Threading | Max Depth | Sort Options | Input Location |
|--------|-----------|-----------|--------------|----------------|
| Post | Flat (reply-to) | 0 | Top / Latest | Bottom sticky |
| Reel | Flat (reply-to) | 0 | None | Bottom sticky |
| Thread | Nested (parentId) | 3 | Top / Latest | Bottom sticky |
| Video | Flat (reply-to) | 0 | None | BottomSheet |
| Story | N/A (DM reply) | N/A | N/A | Bottom overlay |
