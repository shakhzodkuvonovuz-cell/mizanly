# Mobile Create/Compose Screens — Complete Architecture

> Extracted from 8 screen files totaling **8,019 lines** of TypeScript/React Native code.

---

## Overview

| Screen | File | Lines | Space | API Service | Primary Mutation |
|--------|------|-------|-------|-------------|-----------------|
| create-post | `create-post.tsx` | 1,337 | Saf | `postsApi.create()` | `createMutation` |
| create-carousel | `create-carousel.tsx` | 864 | Bakra (reels) | `reelsApi.create()` | `publishMutation` |
| create-story | `create-story.tsx` | 1,639 | Stories | `storiesApi.create()` | `publishMutation` |
| create-reel | `create-reel.tsx` | 1,564 | Bakra | `reelsApi.create()` | `uploadMutation` |
| create-thread | `create-thread.tsx` | 972 | Majlis | `threadsApi.create()` | `createMutation` |
| create-video | `create-video.tsx` | 968 | Minbar | `videosApi.create()` | `uploadMutation` |
| go-live | `go-live.tsx` | 437 | Minbar | `liveApi.create()` + `liveApi.rehearse()` | `createMutation` + `rehearseMutation` |
| voice-post-create | `voice-post-create.tsx` | 238 | Saf | `postsApi.create()` | `postMutation` |

---

## 1. create-post.tsx (1,337 lines)

### State Variables (30)
```
content: string                          // Post text content
media: PickedMedia[]                     // Array of {uri, type, width?, height?}
visibility: 'PUBLIC' | 'FOLLOWERS' | 'CIRCLE'
showVisibility: boolean
circleId: string | undefined
showCirclePicker: boolean
uploading: boolean
uploadProgress: number                   // 0-100 real progress via XMLHttpRequest
uploadAbortRef: ref                      // Abort function for upload cancellation
autocompleteType: 'hashtag' | 'mention' | null
autocompleteQuery: string
showAutocomplete: boolean
showDiscardSheet: boolean
showLocationPicker: boolean
location: {name, latitude?, longitude?} | null
altText: string                          // Accessibility alt text (max 1000 chars)
taggedUsers: string[]                    // Tagged user IDs
tagSearchQuery: string
collaboratorUsername: string
commentControl: 'everyone' | 'followers' | 'nobody'
shareToFeed: boolean (default: true)
brandedContent: boolean (default: false)
brandPartner: string
remixAllowed: boolean (default: true)
selectedTopics: string[] (max 3)
scheduledAt: string | null               // ISO date for scheduled posting
showScheduleSheet: boolean
inputRef: ref<RichCaptionInputRef>
draftSaveRef: ref<setTimeout>
showDraftBanner: boolean
showTopics: boolean (implied, used in JSX)
```

### API Mutations
- **Primary:** `postsApi.create({...})` via `useMutation`
- **Upload:** `uploadApi.getPresignUrl(contentType, 'posts')` per media file
- **Drafts (server):** `draftsApi.save('SAF', {...})`
- **Circles query:** `circlesApi.getMyCircles()` (enabled when visibility === 'CIRCLE')

### Publish Fields Sent to Backend
```ts
postsApi.create({
  content: string | undefined,
  postType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'CAROUSEL',
  mediaUrls: string[],
  mediaTypes: string[],
  mediaWidth?: number,
  mediaHeight?: number,
  visibility: 'PUBLIC' | 'FOLLOWERS' | 'CIRCLE',
  circleId?: string,
  locationName?: string,
  locationLat?: number,
  locationLng?: number,
  altText?: string,
  taggedUserIds?: string[],
  collaboratorUsername?: string,
  commentPermission: 'EVERYONE' | 'FOLLOWERS' | 'NOBODY',
  shareToFeed: boolean,
  brandedContent: boolean,
  brandPartner?: string,
  remixAllowed: boolean,
  topics?: string[],
  scheduledAt?: string,
})
```

### UI Components Used
- `RichCaptionInput` — Live syntax highlighting (#hashtags emerald, @mentions blue, URLs gold)
- `UploadProgressBar` — Spring-animated fill bar with cancel support
- `AnimatedAccordion` — 5 instances (alt text, tag people, collaborator, who can comment, advanced settings)
- `CharCountRing` — Animated SVG ring (content 2200 max, alt text 1000 max)
- `Autocomplete` — Hashtag/mention dropdown
- `LocationPicker` — Real expo-location GPS + reverse geocode
- `SchedulePostSheet` — Date/time picker for scheduled posting
- `BottomSheet` — Discard confirmation, circle picker
- `Avatar`, `Icon`, `ProgressiveImage`, `GlassHeader`, `GradientButton`
- `Skeleton.Circle`, `Skeleton.Rect` — Circle picker loading state
- `LinearGradient` — Media cards, toolbar, char count glow

### Media Handling
1. **Picker:** `expo-image-picker` — multi-select up to 10, images + videos, quality 0.85
2. **File size limits:** Images 20MB, Videos 100MB (checked via `expo-file-system`)
3. **Resize:** `resizeForUpload()` — GIF/PNG preserved, small JPEGs skip re-encoding
4. **NSFW check:** Client-side via `nsfwCheck.checkImages()` (try/catch, server fallback)
5. **Upload:** `uploadWithProgress()` — XMLHttpRequest with real progress callback per file
6. **Presign flow:** `uploadApi.getPresignUrl(contentType, 'posts')` → PUT blob → publicUrl

### Haptic Patterns
- `haptic.success()` — on successful post creation
- `haptic.error()` — on mutation error
- `haptic.success()` — on schedule confirm
- `haptic.delete()` — on clear schedule

### Animation Patterns
- `FadeInUp.delay(idx * 50)` — Staggered media card entrance
- `FadeInUp.delay(200)` — Publish settings section entrance
- `withSpring` on toolbar button press

### Draft System
- **Local:** AsyncStorage `post-draft` key, 2-second debounced auto-save
- **Server:** `draftsApi.save('SAF', {...})` via cloud save button in toolbar
- **Restore:** On mount, loads draft and shows 3-second banner
- **Cleanup:** Cleared on successful publish or explicit discard

### Discard Flow
- `BottomSheet` with 3 options: Save Draft / Discard / Cancel
- Save Draft → AsyncStorage → showToast → router.back()
- Discard → AsyncStorage.removeItem → router.back()

### Toolbar Buttons (8)
Media picker | Location | Hashtag | Mention | Cloud draft save | Schedule | Branded content | Char count ring

---

## 2. create-carousel.tsx (864 lines)

### State Variables (18)
```
slides: Slide[]                          // {uri, width?, height?, text}
selectedIndex: number
caption: string                          // Max 500 chars
uploading: boolean
uploadProgress: number
uploadAbortRef: ref
altText: string
locationName: string
taggedUsers: string[]
tagInput: string
selectedTopics: string[] (max 3)
brandedContent: boolean
brandPartner: string
commentPermission: 'EVERYONE' | 'FOLLOWERS' | 'NOBODY'
remixAllowed: boolean (default: true)
slideDuration: number (default: 5, options: 3/5/7/10)
showMusicPicker: boolean
selectedTrack: AudioTrack | null
```

### Memoized Sub-Component
- `SlideThumb` — `memo()` wrapped, spring scale on press (0.92), FadeInDown staggered entrance

### API Mutations
- **Primary:** `reelsApi.create({...})` — carousel published as a reel with `isPhotoCarousel: true`
- **Upload:** `uploadApi.getPresignUrl(resized.mimeType, 'posts')` per slide
- **Resize:** `resizeForUpload()` before each slide upload

### Publish Fields Sent to Backend
```ts
reelsApi.create({
  videoUrl: carouselUrls[0],             // First image as primary (required field)
  duration: Math.min(180, slides.length * slideDuration),
  isPhotoCarousel: true,
  carouselUrls: string[],
  carouselTexts: string[],               // Per-slide text overlays
  caption?: string,
  altText?: string,
  locationName?: string,
  taggedUserIds?: string[],
  topics?: string[],
  commentPermission: 'EVERYONE' | 'FOLLOWERS' | 'NOBODY',
  remixAllowed: boolean,
  brandedContent: boolean,
  brandPartner?: string,
  audioTrackId?: string,                 // Music attachment
})
```

### UI Components Used
- `ImageCarousel` — Instagram-style dots (max 5 visible, sliding window), ProgressiveImage, prefetch
- `RichCaptionInput` — Per-slide text overlay + caption
- `UploadProgressBar` — With per-slide progress label
- `AnimatedAccordion` — 8 instances: slide text, alt text, location, tag people, topics, slide timing, comment permission, remix, branded content
- `MusicPicker` — Audio track attachment for carousel
- `CharCountRing` — Caption (500 max), slide text (200 max)
- `GlassHeader`, `GradientButton`, `Avatar`, `Icon`
- `SlideThumb` — Custom memoized thumbnail with badge, text indicator, long-press to delete

### Media Handling
1. **Picker:** `expo-image-picker` — images only, multi-select, orderedSelection, max 35 slides
2. **Resize:** `resizeForUpload()` per slide before upload
3. **Upload:** `uploadWithProgress()` per slide with cumulative progress
4. **Cancel:** Abort ref cleaned up on unmount (Rule 27)

### Slide Management
- **Add:** `pickPhotos()` — append to slides array, cap at 35
- **Reorder:** `moveSlide(from, to)` — splice + insert, haptic.tick()
- **Remove:** `removeSlide(index)` — filter + adjust selectedIndex, haptic.delete()
- **Per-slide text:** `updateSlideText(text)` — updates text field on current slide

### Haptic Patterns
- `haptic.tick()` — on photo pick, reorder, tag add, topic toggle, timing change, comment perm change, remix toggle, branded toggle, music picker open
- `haptic.success()` — on publish, on music select
- `haptic.error()` — on publish fail
- `haptic.delete()` — on slide remove, music remove

### Animation Patterns
- `FadeInDown.delay(index * 40).duration(250).springify()` — Slide thumb entrance
- `FadeInUp.duration(300)` — Preview entrance
- `FadeIn.duration(400)` — Empty state entrance
- `withSpring(0.92/1)` — Thumb press scale

### Empty State
- Centered layout with gold gradient icon wrap, title, subtitle, GradientButton to pick photos
- Transitions to editor mode once slides.length >= 1

### Slide Timing
- 4 presets: 3s, 5s, 7s, 10s
- Total duration: `Math.min(180, slides.length * slideDuration)` — capped at 3 minutes

---

## 3. create-story.tsx (1,639 lines)

### State Variables (38)
```
// Eid Frame
eidFrameOccasion: Occasion | null
showEidFramePicker: boolean

// Media
mediaUri: string | null
mediaType: 'image' | 'video'

// Text overlay
text: string (max 200)
textColor: string (8 preset colors)
fontIndex: number (4 fonts: default/serif/mono/bold)
textBgEnabled: boolean

// Filter
filterIndex: number (7 filters: none/warm/cool/vintage/noir/emerald/gold)

// Background
bgGradientIndex: number (6 gradient presets)

// Stickers (12 types)
stickers: Sticker[]                      // {id, type, x, y, scale, data}
showStickerMenu: boolean
activeStickerEditor: StickerType | null

// Sticker editor temp state (per-type)
pollQuestion, pollOptions: string[]
questionPrompt
countdownTitle, countdownDate
quizQuestion, quizOptions: string[], quizCorrectIndex
mentionUsername
hashtagText
sliderQuestion, sliderEmoji, sliderMin, sliderMax
linkUrl, linkTitle
addYoursPrompt
showGifSearch, showLocationSearch
stickerSearch
musicDisplayMode: 'compact' | 'lyrics' | 'waveform'

// Tools
activeTool: 'text' | 'filter' | 'sticker' | null
showMusicPicker, selectedTrack
showDrawing, drawPaths: DrawPath[]
showTextEffects, textEffects: TextEffect[]

// Visibility
closeFriendsOnly: boolean
subscribersOnly: boolean

// UI
showStickerHint: boolean
hintOpacity: SharedValue
giphyCleanupRef: ref
```

### Sticker System (12 types)
| Type | Icon | Color | Data Fields |
|------|------|-------|-------------|
| poll | bar-chart-2 | emerald | question, options[] |
| quiz | check-circle | purple | question, options[], correctIndex |
| question | at-sign | blue | prompt |
| countdown | clock | gold | title, endsAt |
| slider | trending-up | orange | emoji, question, minValue, maxValue |
| location | map-pin | greenBright | locationId, name, address, city |
| link | link | blue | url, title? |
| addYours | circle-plus | emerald | prompt |
| gif | image | purple | gifUrl, gifPreviewUrl, gifWidth, gifHeight, gifTitle |
| music | volume-x | orangeLight | trackId, title, artist, displayMode |
| mention | at-sign | emeraldLight | username |
| hashtag | hash | gold | tag |

### DraggableSticker Component (extracted)
- **Gesture:** `Gesture.Race(Pan, LongPress)` — pan to move, long-press to delete
- **Animation:** Spring scale to 1.08 while dragging, shadow lift (radius 16, elevation 12)
- **Haptic:** `Vibration.vibrate(3)` on drag start
- **Position:** Context-based translate (captures start position, adds delta)

### Sticker Tray UI
- Search bar with TextInput + clear button
- 3-column grid, 80px cells
- `FadeInDown.delay(index * 40).duration(300).springify().damping(14).stiffness(130)` entrance
- Press feedback: scale 0.9, border color change, shadow color change
- LinearGradient icon backgrounds

### API Mutations
- **Primary:** `storiesApi.create({...})`
- **Upload:** `uploadApi.getPresignUrl(contentType, 'stories')`

### Publish Fields Sent to Backend
```ts
storiesApi.create({
  mediaUrl: string,
  mediaType: 'image' | 'video',
  textOverlay?: string,
  textColor: string,
  fontFamily: string,
  filter: string,
  bgGradient?: string,                   // JSON stringified [color, color] for text-only stories
  stickerData?: Sticker[],
  closeFriendsOnly: boolean,
  subscribersOnly: boolean,
})
```

### UI Components Used
- `ProgressiveImage` — Canvas image, GIF sticker preview, filter thumbnails
- `DrawingCanvas` — Freehand/highlighter/neon/eraser drawing (SVG paths)
- `TextEffects` — Styled text overlays (neon, strong, cursive, modern)
- `MusicPicker` — Track selection for story
- `GifSearch` — Waterfall masonry GIF search (GIPHY)
- `LocationSearch` — Real GPS reverse geocode
- `EidFrame` — Islamic occasion overlay frame
- `CharCountRing` — Text (200 max), addYours prompt (200 max)
- `BottomSheet` — GIF search, location search, Eid frame picker, sticker removal confirmation
- `GlassHeader`, `GradientButton`, `Icon`
- `Svg`, `Path` — Draw path rendering on canvas

### Media Handling
1. **Gallery:** `ImagePicker.launchImageLibraryAsync` — all media types, 9:16 aspect, editing
2. **Camera:** `ImagePicker.launchCameraAsync` — with camera permission request
3. **Upload:** Single file upload to presigned R2 URL, blob PUT

### Canvas System
- Height: `SCREEN_H * 0.7`
- Layers (bottom to top): Background gradient → Media image → Filter overlay → Text overlay → Draw paths → Text effects → Stickers → Hint toast
- Background gradients for text-only stories (6 presets)
- Filter system: 7 color overlays applied via absolute-fill View

### Tools (7 header buttons)
Text | Sticker | Filter | Music | Draw | Effects | Eid Frame

### Eid Frame System
- 6 occasions: eid-fitr, eid-adha, ramadan, mawlid, isra-miraj, hijri-new-year
- Wraps canvas content in `<EidFrame>` component
- Loaded from route param or picker

### GIF Picker
- **Primary:** GIPHY native SDK dialog (`showGiphyPicker`) — mediaTypes: gif/sticker/text/emoji
- **Fallback:** Custom `<GifSearch>` component in BottomSheet
- Cleanup ref for SDK listener on unmount

### Visibility Controls
- Close friends toggle (mutually exclusive with subscribers)
- Subscribers-only toggle (mutually exclusive with close friends)

### Haptic Patterns
- `haptic.tick()` — sticker tray item press

### Animation Patterns
- `FadeIn.duration(200)` — Sticker tray entrance
- `FadeInDown.delay(index * 40).springify()` — Sticker grid items
- `withDelay(2000, withTiming(0))` — Sticker placement hint auto-dismiss
- `withSpring(1.08)` / `withSpring(1)` — Sticker drag scale

---

## 4. create-reel.tsx (1,564 lines)

### State Variables (24)
```
caption: string (max 500)
video: PickedVideo | null                // {uri, type, duration, width?, height?}
clips: {uri, duration}[]                 // Multi-clip recording array
totalClipsDuration: number (derived)
clipTransition: ReelTransitionType       // 'none'|'fade'|'dissolve'|'wipeleft'|'slideup'
thumbnailUri: string | null
hashtags: string[] (extracted from caption)
mentions: string[] (extracted from caption)
thumbnailOptions: string[] (generated frames)
customThumbnail: boolean
normalizeAudio: boolean
isUploading: boolean
showAutocomplete: 'hashtag' | 'mention' | null
autocompleteAnchor: number
showMusicPicker: boolean
selectedTrack: AudioTrack | null

// Camera
showCamera: boolean
cameraPermission (from useCameraPermissions)
cameraRef: ref<CameraView>
isRecording: boolean
facing: 'front' | 'back'
recordTime: number
recordTimerRef: ref<setInterval>

// Countdown
countdown: number | null
countdownScale: SharedValue
countdownOpacity: SharedValue
countdownIntervalRef: ref
```

### Multi-Clip Recording System
1. **Record:** `CameraView.recordAsync({ maxDuration: 60 - totalClipsDuration })`
2. **Pause:** Stop recording → add clip to `clips[]`
3. **Delete last:** `clips.slice(0, -1)` with haptic.delete()
4. **Finalize:** If 1 clip → use directly; if multiple → FFmpeg concat with transitions
5. **Transitions:** 5 types cycled on tap: none / fade / dissolve / wipeleft / slideup
6. **Progress bar:** `(totalClipsDuration / 60) * 100` percentage fill
7. **Max:** 60 seconds total capacity across all clips

### FFmpeg Integration
```ts
import { buildConcatCommand } from '@/services/ffmpegEngine';
const cmd = buildConcatCommand(clips, outputPath, clipTransition, 0.5);
FFmpegKit.execute(cmd);
```
- Fallback: If FFmpeg unavailable, uses first clip only with warning toast

### Countdown Timer
- 3-2-1 countdown before recording starts
- Animated scale pulse: `withSequence(withSpring(1.5), withSpring(1))` + opacity fade
- `setInterval` with cleanup on unmount (Rule 27)
- LinearGradient circle (emerald → greenDark), 120x120px

### API Mutations
- **Primary:** `reelsApi.create({...})`
- **Video upload:** `uploadApi.getPresignUrl('video/mp4', 'reels')` → PUT blob
- **Thumbnail upload:** `uploadApi.getPresignUrl('image/jpeg', 'thumbnails')` → PUT blob

### Publish Fields Sent to Backend
```ts
reelsApi.create({
  videoUrl: string,
  thumbnailUrl: string,
  duration: number,
  caption: string,
  hashtags: string[],
  mentions: string[],
  normalizeAudio: boolean,
  audioTrackId?: string,
})
```

### UI Components Used
- `CameraView` (expo-camera) — Video recording with front/back facing
- `Video` (expo-av) — Preview with native controls, isLooping
- `VideoThumbnails` — Frame extraction for thumbnail picker (3-6 frames)
- `Autocomplete` — Hashtag/mention in BottomSheet
- `MusicPicker` — Audio track selection
- `CharCountRing` — Caption (500 max)
- `GlassHeader`, `Icon`, `ProgressiveImage`, `BottomSheet`, `Avatar`
- `LinearGradient` — Focus ring, caption card, toolbar buttons, tag badges

### Media Handling
1. **Gallery:** `ImagePicker.launchImageLibraryAsync` — videos only, 9:16 aspect, 60s max, quality 1
2. **Camera:** `CameraView.recordAsync` — multi-clip support
3. **File size:** 100MB max (checked via expo-file-system)
4. **Thumbnail generation:** `VideoThumbnails.getThumbnailAsync` at intervals
5. **Custom thumbnail:** Gallery pick for custom thumbnail image
6. **Route params:** `videoUri` from video editor return, `edited` flag

### Toolbar Buttons (7)
Hashtag | Mention | Music | Templates | Schedule | Green screen | Audio library

### Haptic Patterns
- `haptic.navigate()` — on pickVideo
- `haptic.success()` — on successful upload
- `haptic.error()` — on upload error
- `haptic.tick()` — on clip record, toolbar press
- `haptic.delete()` — on delete last clip

### Animation Patterns
- `FadeInUp` — Video container entrance
- `FadeIn` — Selected track indicator, countdown
- `withSequence(withSpring(1.5), withSpring(1))` — Countdown scale pulse
- `withDelay(600, withSpring(0))` — Countdown opacity fade

### Auto-Load from Route Params
```ts
if (routeParams.videoUri && !video) {
  setVideo({ uri: routeParams.videoUri, type: 'video', duration: 0 });
}
```
- Video editor return via `returnTo` param
- Real duration captured on Video `onLoad` event

### Hashtag/Mention Extraction
```ts
const extractHashtags = (text) => text.match(/#[\w\u0600-\u06FF]+/g) // supports Arabic
const extractMentions = (text) => text.match(/@[\w\u0600-\u06FF]+/g)
```

---

## 5. create-thread.tsx (972 lines)

### State Variables (12 + per-part)
```
parts: ChainPart[]                       // [{content, media: [{uri, type}]}]
visibility: 'PUBLIC' | 'FOLLOWERS' | 'CIRCLE'
showVisibility: boolean
circleId: string | undefined
showCirclePicker: boolean
poll: {question, options[], allowMultiple} | null
showDiscardSheet: boolean
autocomplete: {partIndex, type, query}
showAutocomplete: boolean
inputRefs: Map<number, TextInput>
draftSaveRef: ref<setTimeout>
```

### Thread Part Component (extracted)
`ThreadPart` — reusable per-part composer with:
- Avatar with connecting gradient chain line
- Glassmorphism LinearGradient card
- TextInput with autocomplete detection (#/@ patterns including Arabic `\u0600-\u06FF`)
- Media thumbnails (max 4 per part) with gradient remove buttons
- Toolbar: Image | Hashtag | Mention | Poll (first part only) | CharCountRing

### Chain System
- Max 10 parts per thread
- First part is chain head with visibility, circleId, poll
- Subsequent parts chained via `chainId`
- Gradient connecting line between parts

### Poll System (first part only)
- Question (max 120 chars) + 2-4 options (max 80 chars each)
- Allow multiple answers checkbox
- Premium gold gradient card with removable header
- Add option button (up to 4)

### API Mutations
- **Primary:** Sequential `threadsApi.create()` calls — first creates chain head, rest chain via `chainId`
- **Upload per part:** `uploadApi.getPresignUrl('image/ext', 'threads')` per media item

### Publish Fields Sent to Backend (per part)
```ts
threadsApi.create({
  content: string,
  mediaUrls: string[],
  mediaTypes: string[],
  isChainHead: boolean,
  chainId?: string,
  // Head only:
  visibility: 'PUBLIC' | 'FOLLOWERS' | 'CIRCLE',
  circleId?: string,
  poll?: {
    question: string,
    options: [{text, position}],
    allowMultiple: boolean,
  },
})
```

### UI Components Used
- `Autocomplete` — Hashtag/mention autocomplete
- `Avatar` — User avatar per part + add-part prompt
- `CharCountRing` — Per-part (500 max)
- `BottomSheet` — Visibility, circle picker, discard confirmation
- `Skeleton.Circle`, `Skeleton.Rect` — Circle picker loading
- `GlassHeader` (implied), `GradientButton`, `Icon`
- `ProgressiveImage` — Media thumbnails
- `LinearGradient` — Chain line, part card, poll form, media cards, toolbar buttons, add-part button

### Media Handling
1. **Picker:** `ImagePicker.launchImageLibraryAsync` — images only, multi-select, max 4 per part, quality 0.85
2. **Upload:** Per-media presigned PUT to R2 in `threads` folder

### Draft System
- AsyncStorage key: `draft:thread`
- 2-second debounced auto-save of `parts` array
- Load on mount, clear on success/discard

### Haptic Patterns
- `haptic.success()` — thread posted
- `haptic.error()` — post failed
- `haptic.tick()` — visibility press, add part

### Animation Patterns
- `FadeInUp.delay(index * 100)` — Staggered part entrance
- `FadeInUp.delay(mi * 50)` — Staggered media card entrance
- Press scale feedback: `withSpring(0.96/0.95)` on add-part, visibility pill

---

## 6. create-video.tsx (968 lines)

### State Variables (18)
```
video: PickedVideo | null
thumbnailUri: string | null
uploadProgress: number
uploading: boolean

// Form fields
title: string (max 100)
description: string (max 5000)
selectedCategory: VideoCategory           // 11 categories
tags: string[] (max 10)
tagInput: string
selectedChannelId: string
visibility: 'PUBLIC' | 'UNLISTED' | 'PRIVATE'

// Thumbnail
thumbnailOptions: string[]
customThumbnail: boolean
normalizeAudio: boolean

// UI
showDiscardSheet: boolean
showCategorySheet: boolean
showVisibilitySheet: boolean
showChannelSheet: boolean
draftSaveRef: ref
```

### Categories (11)
`EDUCATION | QURAN | LECTURE | VLOG | NEWS | DOCUMENTARY | ENTERTAINMENT | SPORTS | COOKING | TECH | OTHER`

### API Mutations
- **Primary:** `videosApi.create({...})`
- **Video upload:** `uploadApi.getPresignUrl('video/mp4', 'videos')`
- **Thumbnail upload:** `uploadApi.getPresignUrl('image/jpeg', 'thumbnails')`
- **Channels query:** `channelsApi.getMyChannels()` — auto-selects first if only one

### Publish Fields Sent to Backend
```ts
videosApi.create({
  channelId: string,
  title: string,
  description?: string,
  videoUrl: string,
  thumbnailUrl?: string,
  duration: number,
  category: VideoCategory,
  tags?: string[],
  normalizeAudio: boolean,
})
```

### UI Components Used
- `Video` (expo-av) — Preview with overlay
- `VideoThumbnails` — Frame extraction (3-10 frames based on duration)
- `ProgressiveImage` — Thumbnail preview, filmstrip frames
- `CharCountRing` — Title (100), description (5000)
- `BottomSheet` — Category, channel, visibility, discard
- `GlassHeader`, `Icon`, `Skeleton`

### Quick Tool Buttons (when video selected)
- **AI Captions:** Navigate to `/(screens)/caption-editor`
- **Edit:** Navigate to `/(screens)/video-editor` with returnTo

### Media Handling
1. **Video picker:** `ImagePicker.launchImageLibraryAsync` — videos only, no editing, no max duration (long-form), quality 1
2. **File size:** 500MB max
3. **Thumbnail picker:** `ImagePicker.launchImageLibraryAsync` — images, 16:9 aspect, editing
4. **Thumbnail filmstrip:** `VideoThumbnails.getThumbnailAsync` at calculated intervals

### Tag System
- TextInput with submit → `addTag()`
- Tags normalized: trimmed, spaces → hyphens, lowercase
- Max 10 tags
- Chip badges with remove button

### Draft System
- AsyncStorage key: `video-draft`
- 1-second debounced auto-save (title, description, category, tags, channelId, visibility)
- Cannot restore video/thumbnail files

### Haptic Patterns
- `haptic.tick()` — video picker, thumbnail filmstrip select
- `haptic.success()` — upload complete
- `haptic.error()` — upload error

### Animation Patterns
- `FadeInUp.duration(300)` — Video picker entrance
- `FadeInUp.delay(100).duration(300)` — Thumbnail section
- `FadeIn` — (implied in inline components)

### Post-Success Navigation
```ts
router.replace(`/(screens)/video/${video.id}`);  // Navigate to video page
```

---

## 7. go-live.tsx (437 lines)

### State Variables (10)
```
title: string (max 100)
description: string (max 500)
liveType: 'VIDEO' | 'AUDIO'
isScheduled: boolean
scheduleDate: Date | null
showDatePicker: boolean
showLiveTypePicker: boolean
uploading: boolean
tempDate: Date
```

### API Mutations (2)
- **Go Live:** `liveApi.create({ title, description, liveType, scheduledAt })`
- **Rehearse:** `liveApi.rehearse({ title, description, liveType })`

### Publish Fields Sent to Backend
```ts
liveApi.create({
  title: string,
  description?: string,
  liveType: 'VIDEO' | 'AUDIO',
  scheduledAt?: string,                   // ISO date
})
```

### UI Components Used
- `CharCountRing` — Title (100), description (500)
- `GlassHeader`, `GradientButton`
- `BottomSheet` — Live type picker, date picker
- `LinearGradient` — Input cards (gradient.cardDark), type icon bg, schedule icon bg
- `Switch` (native) — Schedule toggle
- `Skeleton.Circle` — Upload overlay loading
- `EmptyState` — (imported but not used in JSX)

### Live Type Options
- **VIDEO:** Video Stream (icon: video)
- **AUDIO:** Audio Space (icon: mic)
- Options are i18n'd via `useMemo`

### Schedule System
- Toggle switch → defaults to 30 minutes from now
- Date picker in BottomSheet (placeholder — needs real DateTimePicker)
- Display: `toLocaleString` with weekday/month/day/hour/minute

### Dual Actions
1. **Go Live** → `createMutation.mutate()` (only works if scheduled — non-scheduled shows info toast "live not available")
2. **Rehearse** → `rehearseMutation.mutate()` (private rehearsal mode)

### Post-Success Navigation
```ts
router.back();
router.push(`/(screens)/live/${live.id}`);
```

### Haptic Patterns
- `haptic.send()` — go live button
- `haptic.success()` — stream started
- `haptic.error()` — failed to start
- `haptic.tick()` — rehearsal button

### Animation Patterns
- `FadeInUp.delay(0/100/200/300/400).duration(400)` — Staggered card entrance (5 cards)

### Known Issue
- `tc` declared twice (line 41 and line 58) — duplicate `const tc = useThemeColors()`

---

## 8. voice-post-create.tsx (238 lines)

### State Variables (8)
```
isRecording: boolean
duration: number                          // Seconds elapsed
recordingUri: string | null
isPlaying: boolean
waveformBars: number[] (30 bars)         // Real audio metering levels (0-1)
intervalRef: ref<setInterval>
stopRecordingRef: ref
durationRef: ref (number)
pulseScale: SharedValue                   // Animated pulse during recording
```

### Audio Recording System
- **Library:** `expo-av` Audio.Recording
- **Quality:** `Audio.RecordingOptionsPresets.HIGH_QUALITY`, metering enabled
- **Max duration:** 120 seconds (2 minutes)
- **Waveform:** Real audio metering via `setOnRecordingStatusUpdate` — normalizes dBFS (-60..0) to 0..1
- **Auto-stop:** When duration reaches MAX_DURATION via ref callback
- **Cleanup:** Interval cleared on unmount (Rule 27)

### API Mutations
- **Upload:** `uploadApi.getPresignUrl('audio/m4a', 'voice-posts')` → PUT blob
- **Create:** `postsApi.create({ postType: 'VOICE', content: '', mediaUrls: [url], mediaTypes: ['audio'] })`

### Publish Fields Sent to Backend
```ts
postsApi.create({
  postType: 'VOICE',
  content: '',
  mediaUrls: [publicUrl],
  mediaTypes: ['audio'],
})
```

### UI Components Used
- `GlassHeader`
- `Icon` — mic / x button
- `LinearGradient` — Record button (emerald → green when idle, red when recording), post button
- Waveform bars (30 vertical View elements)

### Waveform Visualization
- 30 bars, 4px width, 3px gap
- **Recording:** Real metering levels: `6 + level * 48` height
- **After recording:** Sine wave: `10 + Math.sin(i * 0.5) * 20 + 20`
- **Idle:** Flat: `10` height
- Color: emerald (recording), emerald+80 opacity (recorded), surface (idle)

### Haptic Patterns
- `haptic.tick()` — start recording
- `haptic.success()` — stop recording, post success
- `haptic.error()` — post error

### Animation Patterns
- `withRepeat(withTiming(1.15, {duration: 800}), -1, true)` — Pulse scale during recording
- `withSpring(1)` — Reset pulse on stop
- `FadeIn.duration(300)` — Timer section
- `FadeInUp.duration(300)` — Post button entrance

### Dynamic Styles
- Uses `createStyles(tc)` pattern — StyleSheet created as function of theme colors
- Only screen using this pattern (all others use static StyleSheet.create)

---

## Cross-Screen Patterns

### Shared Upload Flow
All screens follow the same pattern:
1. Get presigned URL: `uploadApi.getPresignUrl(contentType, folder)`
2. Fetch local file as blob: `fetch(uri).then(r => r.blob())`
3. PUT to presigned URL with Content-Type header
4. Use `publicUrl` from presign response in create API call

### Shared Hooks (all 8 screens)
- `useThemeColors()` — Theme-aware colors
- `useContextualHaptic()` — Semantic haptic feedback
- `useTranslation()` — i18n via `t()` function
- `useUser()` (from Clerk) — User data for avatar/name (7/8 screens, not voice-post)

### Shared Components (across screens)
| Component | Used In |
|-----------|---------|
| `Icon` | All 8 |
| `ScreenErrorBoundary` | All 8 |
| `GlassHeader` | 6 (not create-post, create-story) |
| `GradientButton` | 6 (not create-reel, voice-post-create) |
| `CharCountRing` | 7 (not voice-post-create) |
| `BottomSheet` | 7 (not voice-post-create) |
| `LinearGradient` | All 8 |
| `Avatar` | 5 (post, carousel, story, thread, reel) |
| `ProgressiveImage` | 5 (post, carousel, story, reel, video) |
| `Autocomplete` | 3 (post, thread, reel) |
| `RichCaptionInput` | 2 (post, carousel) |
| `AnimatedAccordion` | 2 (post, carousel) |
| `UploadProgressBar` | 2 (post, carousel) |
| `MusicPicker` | 3 (carousel, story, reel) |
| `Skeleton` | 3 (post, thread, video) |

### Draft Persistence Pattern
| Screen | Storage Key | Auto-save Debounce | Restores |
|--------|------------|-------------------|----------|
| create-post | `post-draft` | 2s | content only |
| create-thread | `draft:thread` | 2s | parts array |
| create-video | `video-draft` | 1s | form fields (not video file) |
| create-carousel | — | — | No drafts |
| create-story | — | — | No drafts |
| create-reel | — | — | No drafts |
| go-live | — | — | No drafts |
| voice-post-create | — | — | No drafts |

### Discard Confirmation Pattern
| Screen | Has Discard Sheet | Options |
|--------|------------------|---------|
| create-post | Yes (BottomSheet) | Save Draft / Discard / Cancel |
| create-thread | Yes (BottomSheet) | Save Draft / Discard / Cancel |
| create-video | Yes (BottomSheet) | Save Draft / Discard / Cancel |
| create-carousel | Yes (Alert.alert) | Cancel / Discard |
| create-story | Yes (Alert.alert) | Keep Editing / Discard |
| create-reel | Yes (Alert.alert) | Keep Editing / Discard |
| go-live | No | — |
| voice-post-create | No | — |

### Visibility System
| Screen | Visibility Options |
|--------|-------------------|
| create-post | PUBLIC / FOLLOWERS / CIRCLE |
| create-thread | PUBLIC / FOLLOWERS / CIRCLE |
| create-video | PUBLIC / UNLISTED / PRIVATE |
| create-story | Close Friends / Subscribers (toggles) |
| create-carousel | — (none) |
| create-reel | — (none) |
| go-live | — (none) |
| voice-post-create | — (none) |

### Publish Fields Matrix
| Field | Post | Carousel | Story | Reel | Thread | Video | Live | Voice |
|-------|------|----------|-------|------|--------|-------|------|-------|
| Content/Caption | Y (2200) | Y (500) | Y (200 text) | Y (500) | Y (500/part) | Y (title 100 + desc 5000) | Y (title 100 + desc 500) | — |
| Media | Multi (10) | Multi (35 slides) | Single | Single video | Multi (4/part) | Single video | — | Audio only |
| Location | Y | Y | — | — | — | — | — | — |
| Alt text | Y (1000) | Y (1000) | — | — | — | — | — | — |
| Tags/People | Y | Y | — | — | — | Y (freeform) | — | — |
| Collaborator | Y | — | — | — | — | — | — | — |
| Comment perm | Y | Y | — | — | — | — | — | — |
| Share to feed | Y | — | — | — | — | — | — | — |
| Branded content | Y | Y | — | — | — | — | — | — |
| Remix allowed | Y | Y | — | — | — | — | — | — |
| Topics | Y (max 3) | Y (max 3) | — | — | — | — | — | — |
| Schedule | Y | — | — | — | — | — | Y | — |
| Music | — | Y | Y | Y | — | — | — | — |
| Stickers | — | — | Y (12 types) | — | — | — | — | — |
| Drawing | — | — | Y | — | — | — | — | — |
| Text effects | — | — | Y | — | — | — | — | — |
| Filters | — | — | Y (7) | — | — | — | — | — |
| Eid frame | — | — | Y | — | — | — | — | — |
| Visibility | Y | — | Y (CF/Sub) | — | Y | Y | — | — |
| Poll | — | — | — | — | Y | — | — | — |
| Normalize audio | — | — | — | Y | — | Y | — | — |
| Category | — | — | — | — | — | Y (11) | — | — |
| Channel | — | — | — | — | — | Y | — | — |
| Hashtags (auto) | — | — | — | Y | — | — | — | — |
| Mentions (auto) | — | — | — | Y | — | — | — | — |
| Thumbnail | — | — | — | Y | — | Y | — | — |
| Slide timing | — | Y | — | — | — | — | — | — |
| Live type | — | — | — | — | — | — | Y | — |
| Close friends | — | — | Y | — | — | — | — | — |
| Subscribers only | — | — | Y | — | — | — | — | — |

### File Size Limits
| Screen | Image Max | Video Max |
|--------|-----------|-----------|
| create-post | 20MB | 100MB |
| create-carousel | (via resize) | — |
| create-story | (no limit checked) | (no limit checked) |
| create-reel | — | 100MB |
| create-thread | (no limit checked) | — |
| create-video | — | 500MB |
| go-live | — | — |
| voice-post-create | (no limit checked) | — |

### Cache Invalidation on Success
| Screen | Invalidated Query Keys |
|--------|----------------------|
| create-post | `['saf-feed']` |
| create-carousel | `['bakra-feed']`, `['reels']` |
| create-story | `['stories-feed']` |
| create-reel | `['reels-feed']`, `['reel', userId]` |
| create-thread | `['majlis-feed']` |
| create-video | `['videos-feed']`, `['channel-videos']` |
| go-live | — (navigates to live page) |
| voice-post-create | `['voice-posts']` |
