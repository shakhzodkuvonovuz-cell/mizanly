# BATCH 39: Stories & Reels Parity — 12 Agents

**Date:** 2026-03-17
**Theme:** Tier 3 ship-blocking features — complete story and reel creation parity with Instagram/TikTok. Interactive stickers (poll/quiz/countdown/slider/question) are already done. This batch adds the remaining 13 features: Add Yours sticker, music overlay, drawing tools, text effects, link stickers, reel templates, reel remix, duet/stitch wiring, video replies, green screen wiring, photo with music, and disposable camera mode. AR filters deferred to V2 (requires native ML Kit build).

---

## GLOBAL RULES

1. Read `CLAUDE.md` first — mandatory rules
2. No `any` in non-test code. No `@ts-ignore`. No `@ts-expect-error`.
3. NEVER modify any file not explicitly listed in your agent task
4. All new screens must use `useTranslation` + `t()` for all user-visible strings
5. All new screens must be wrapped with `<ScreenErrorBoundary>`
6. All FlatLists must have `<RefreshControl>` or `onRefresh`
7. Use `radius.*` from theme — NEVER hardcode borderRadius >= 6
8. Use `<Icon name="..." />` — NEVER text emoji for icons
9. Use `<BottomSheet>` — NEVER RN `Modal`
10. After completing: `git add -A && git commit -m "feat: batch 39 agent N — <description>"`

---

## AGENT 1: Backend — Reel Templates Module

**Creates:**
- `apps/api/src/modules/reel-templates/reel-templates.module.ts`
- `apps/api/src/modules/reel-templates/reel-templates.controller.ts`
- `apps/api/src/modules/reel-templates/reel-templates.service.ts`

**Prisma:** No schema changes needed. Store templates as JSON in a new `ReelTemplate` approach — use `$executeRaw` or a simple in-memory seed for now. The template concept is:
- A template = a list of `{ startMs, endMs, text? }` clip segments extracted from an existing reel
- Templates are discoverable via trending or search

**Endpoints (5):**
```
GET    /reel-templates                — Browse templates (cursor pagination, optional ?trending=true)
GET    /reel-templates/:id            — Get template detail (includes segment timing array)
POST   /reel-templates                — Create template from a reel (auth, body: { sourceReelId, segments: { startMs, endMs }[], name })
POST   /reel-templates/:id/use        — Mark template usage (auth, increments useCount)
DELETE /reel-templates/:id             — Delete own template (auth)
```

**Service implementation:**
```typescript
// Template storage: use Prisma's Json type or create a simple model
// For now, store in a generic KeyValue table or add ReelTemplate model:
// Create with $executeRaw if no model exists, or use Prisma.JsonValue approach

interface ReelTemplateSegment {
  startMs: number;
  endMs: number;
  text?: string;
}

// createTemplate: validate sourceReelId exists, store segments JSON, set useCount=0
// browseTemplates: paginated, order by useCount desc for trending
// useTemplate: increment useCount, return template segments for client to apply
```

**Module registration:** Export `ReelTemplatesModule` — will be registered in app.module.ts post-batch.

**~300-400 lines total**

---

## AGENT 2: Backend — Story Chains (Add Yours) Module

**Creates:**
- `apps/api/src/modules/story-chains/story-chains.module.ts`
- `apps/api/src/modules/story-chains/story-chains.controller.ts`
- `apps/api/src/modules/story-chains/story-chains.service.ts`

**Concept:** "Add Yours" is a story chain — one user creates a prompt, others contribute their own story in response. Chain = linked list of stories sharing a `chainId`.

**Endpoints (5):**
```
POST   /story-chains                   — Create a new chain (auth, body: { prompt: string, coverUrl?: string })
GET    /story-chains/trending           — Trending chains (cursor pagination, ordered by participantCount)
GET    /story-chains/:chainId           — Get chain detail + participant stories (cursor pagination)
POST   /story-chains/:chainId/join      — Add your story to chain (auth, body: { storyId })
GET    /story-chains/:chainId/stats     — Chain stats (participantCount, viewsCount, createdAt)
```

**Service patterns:**
```typescript
// Store chains in a lightweight way:
// Option A: Add chainId/chainPrompt fields to Story model (preferred if schema change OK)
// Option B: Use a separate in-memory/JSON approach

// createChain: generate chainId (cuid), store prompt, creator info
// joinChain: link user's storyId to chainId, increment participantCount
// trending: order by participantCount desc, created within last 7 days
// getChain: return chain metadata + paginated list of participant stories
```

**~300-400 lines total**

---

## AGENT 3: Backend — Video Replies Module

**Creates:**
- `apps/api/src/modules/video-replies/video-replies.module.ts`
- `apps/api/src/modules/video-replies/video-replies.controller.ts`
- `apps/api/src/modules/video-replies/video-replies.service.ts`

**Concept:** Reply to a comment on a reel/post with a short video. The video reply is stored as a Reel with `isVideoReply: true` and a reference to the original comment.

**Endpoints (4):**
```
POST   /video-replies                   — Create video reply (auth, body: { commentId, commentType: 'post'|'reel', mediaUrl, thumbnailUrl })
GET    /video-replies/comment/:commentId — Get video replies for a comment (optional auth, pagination)
DELETE /video-replies/:id                — Delete own video reply (auth)
GET    /video-replies/:id                — Get single video reply detail
```

**Service patterns:**
```typescript
// createVideoReply:
//   1. Verify comment exists (check Post comments or Reel comments)
//   2. Create a Reel with isVideoReply=true, store commentId in description or metadata
//   3. Return the created reel with comment overlay data

// getVideoReplies: find reels where isVideoReply=true and linked to commentId
// deleteVideoReply: verify ownership, soft delete
```

**~250-350 lines total**

---

## AGENT 4: Mobile — AddYoursSticker + LinkSticker Components

**Creates:**
- `apps/mobile/src/components/story/AddYoursSticker.tsx`
- `apps/mobile/src/components/story/LinkSticker.tsx`

**AddYoursSticker.tsx (~200 lines):**
```tsx
// Renders an "Add Yours" card in story viewer
// Props: { chainId: string; prompt: string; participantCount: number; onAddYours: () => void; isCreator?: boolean }
// UI:
//   - Glassmorphic card with emerald accent border
//   - Prompt text centered
//   - "Add Yours" button (GradientButton)
//   - Participant count badge
//   - When user taps "Add Yours" → onAddYours callback navigates to create-story with chainId param
// Creator mode shows participantCount and "View responses" link

import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { FadeIn, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
```

**LinkSticker.tsx (~180 lines):**
```tsx
// Renders a tappable URL preview card in story viewer
// Props: { url: string; title?: string; favicon?: string; onPress: () => void }
// UI:
//   - Compact card with link icon + truncated URL + optional title
//   - Glassmorphic background (semi-transparent dark)
//   - Tap opens URL via Linking.openURL
//   - Swipe-up indicator ("See more")
// Uses expo-linking for URL opening

import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
```

**~380 lines total**

---

## AGENT 5: Mobile — MusicPicker Component

**Creates:**
- `apps/mobile/src/components/story/MusicPicker.tsx`

**MusicPicker.tsx (~350 lines):**
```tsx
// A BottomSheet that lets users search and select audio tracks for stories/reels
// Props: { visible: boolean; onClose: () => void; onSelect: (track: AudioTrack) => void }
//
// UI sections:
//   1. Search bar at top (TextInput with search icon)
//   2. "Trending" section (horizontal scroll of top tracks)
//   3. Search results (FlatList with track items)
//   4. Each track item shows: cover art, title, artist, duration, play preview button
//   5. Selected track has emerald checkmark
//
// Uses:
//   - audioTracksApi.search(query) for search
//   - audioTracksApi.getTrending() for trending
//   - audioTracksApi.getByGenre(genre) for genre filter
//   - expo-av Audio.Sound for preview playback (30sec preview)
//
// State:
//   - searchQuery, results, trending, previewingTrackId, selectedTrack
//   - Preview plays 30sec clip, shows waveform-style progress bar
//   - Genre tabs: "All", "Nasheed", "Ambient", "World", "Islamic"

import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, FlatList, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { Audio } from 'expo-av';
import { Image } from 'expo-image';
import Animated, { FadeIn, FadeOut, withSpring } from 'react-native-reanimated';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { TabSelector } from '@/components/ui/TabSelector';
import { colors, spacing, fontSize, radius } from '@/theme';
import { audioTracksApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import type { AudioTrack } from '@/types';
```

**~350 lines total**

---

## AGENT 6: Mobile — DrawingCanvas Component

**Creates:**
- `apps/mobile/src/components/story/DrawingCanvas.tsx`

**DrawingCanvas.tsx (~400 lines):**
```tsx
// Full-screen overlay drawing canvas using react-native-svg
// Props: {
//   visible: boolean;
//   onClose: () => void;
//   onSave: (paths: DrawPath[]) => void;
//   canvasWidth: number;
//   canvasHeight: number;
// }
//
// Tools (bottom toolbar):
//   1. Pen (default) — smooth freehand, 3px stroke
//   2. Marker — thick semi-transparent, 12px stroke, 0.6 opacity
//   3. Highlighter — wide very transparent, 20px stroke, 0.3 opacity
//   4. Neon — glowing effect (stroke + blur shadow), 4px stroke
//   5. Eraser — removes intersecting paths
//   6. Shapes — circle, rectangle, arrow, line (separate mode)
//
// Controls:
//   - Color picker: 12 color circles (same as TEXT_COLORS + extras)
//   - Stroke size slider (1-30px)
//   - Undo (remove last path)
//   - Clear all
//   - Done (save paths)
//
// Implementation:
//   - Use react-native-svg <Svg> + <Path> for rendering
//   - Track touch points via PanGestureHandler from react-native-gesture-handler
//   - Convert touch coordinates to SVG path d="M x y L x y ..." strings
//   - Each path stored as { d: string, stroke: string, strokeWidth: number, opacity: number }
//   - Neon effect: render path twice — once blurred (wide, low opacity), once sharp
//   - Eraser: on touch, find and remove paths that intersect touch point
//   - Undo: pop from paths array

import { useState, useRef, useCallback } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import Svg, { Path, Circle, Rect, Line } from 'react-native-svg';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, radius } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';

export interface DrawPath {
  d: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  tool: 'pen' | 'marker' | 'highlighter' | 'neon';
}

// ── Color palette ──
const DRAW_COLORS = [
  '#FFFFFF', '#000000', '#0A7B4F', '#C8963E',
  '#F85149', '#58A6FF', '#D2A8FF', '#FFA657',
  '#3FB950', '#F0883E', '#FF7B72', '#79C0FF',
];
```

**IMPORTANT:** This component uses `react-native-svg` which is already included in Expo SDK 52. NO new dependency needed.

**~400 lines total**

---

## AGENT 7: Mobile — TextEffects Component

**Creates:**
- `apps/mobile/src/components/story/TextEffects.tsx`

**TextEffects.tsx (~350 lines):**
```tsx
// Overlay for creating styled text on stories
// Props: {
//   visible: boolean;
//   onClose: () => void;
//   onAdd: (effect: TextEffect) => void;
// }
//
// TextEffect interface:
// {
//   text: string;
//   style: 'classic' | 'modern' | 'neon' | 'typewriter' | 'strong' | 'cursive';
//   color: string;
//   bgColor?: string;      // text background highlight
//   fontSize: number;       // 16-48
//   alignment: 'left' | 'center' | 'right';
//   animation?: 'none' | 'fade-in' | 'typewriter' | 'bounce' | 'slide-up';
// }
//
// UI:
//   1. Full-screen semi-transparent overlay
//   2. Large TextInput in center (auto-focus, multiline)
//   3. Bottom toolbar:
//      a. Font style selector (horizontal scroll of style previews)
//      b. Color picker (same 12 colors as DrawingCanvas)
//      c. Background toggle (none / solid color behind text)
//      d. Alignment toggle (left/center/right)
//      e. Font size slider
//      f. Animation selector (5 options with preview)
//   4. "Done" button adds text to canvas
//
// Style presets:
//   - classic: white text, no bg, default font
//   - modern: gradient text effect (LinearGradient mask), bold
//   - neon: text with glow shadow (textShadowColor + textShadowRadius)
//   - typewriter: monospace font, letter-by-letter animation
//   - strong: large bold, text stroke effect (multiple shadows for outline)
//   - cursive: serif italic, elegant
//
// Animations (Reanimated):
//   - fade-in: opacity 0→1 over 500ms
//   - typewriter: characters appear one-by-one (useAnimatedStyle with slice)
//   - bounce: scale 0→1.2→1 spring
//   - slide-up: translateY from below

import { useState, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, ScrollView, Platform } from 'react-native';
import Animated, {
  FadeIn, FadeOut, useSharedValue, useAnimatedStyle,
  withSpring, withTiming, withRepeat, withSequence,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, fontSize as fontSizes, radius } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';

export interface TextEffect {
  id: string;
  text: string;
  style: 'classic' | 'modern' | 'neon' | 'typewriter' | 'strong' | 'cursive';
  color: string;
  bgColor?: string;
  fontSize: number;
  alignment: 'left' | 'center' | 'right';
  animation: 'none' | 'fade-in' | 'typewriter' | 'bounce' | 'slide-up';
}
```

**~350 lines total**

---

## AGENT 8: Mobile — Wire New Components into create-story.tsx

**Modifies (ONLY):**
- `apps/mobile/app/(screens)/create-story.tsx`

**What to do:**

1. Import the 5 new components at the top:
```tsx
import { MusicPicker } from '@/components/story/MusicPicker';
import { DrawingCanvas, DrawPath } from '@/components/story/DrawingCanvas';
import { TextEffects, TextEffect } from '@/components/story/TextEffects';
import { AddYoursSticker } from '@/components/story/AddYoursSticker';
import { LinkSticker } from '@/components/story/LinkSticker';
```

2. Add new state variables:
```tsx
const [showMusicPicker, setShowMusicPicker] = useState(false);
const [selectedTrack, setSelectedTrack] = useState<AudioTrack | null>(null);
const [showDrawing, setShowDrawing] = useState(false);
const [drawPaths, setDrawPaths] = useState<DrawPath[]>([]);
const [showTextEffects, setShowTextEffects] = useState(false);
const [textEffects, setTextEffects] = useState<TextEffect[]>([]);
const [linkUrl, setLinkUrl] = useState<string | null>(null);
const [addYoursChainId, setAddYoursChainId] = useState<string | null>(null);
```

3. Add new sticker types to the `StickerType` union:
```tsx
type StickerType = 'poll' | 'question' | 'countdown' | 'quiz' | 'location' | 'mention' | 'hashtag' | 'slider' | 'add-yours' | 'link';
```

4. Add toolbar buttons in the existing right-side toolbar (find the toolbar section with sticker/text/filter buttons):
   - Music note icon button → `setShowMusicPicker(true)`
   - Pencil icon button → `setShowDrawing(true)`
   - Text "Aa" button → `setShowTextEffects(true)`
   - Link icon button → prompt for URL via Alert.prompt
   - "Add Yours" button → create chain sticker

5. Render the new components at the bottom of the JSX (before closing SafeAreaView):
```tsx
<MusicPicker
  visible={showMusicPicker}
  onClose={() => setShowMusicPicker(false)}
  onSelect={(track) => { setSelectedTrack(track); setShowMusicPicker(false); }}
/>
<DrawingCanvas
  visible={showDrawing}
  onClose={() => setShowDrawing(false)}
  onSave={(paths) => { setDrawPaths(paths); setShowDrawing(false); }}
  canvasWidth={SCREEN_W}
  canvasHeight={CANVAS_H}
/>
<TextEffects
  visible={showTextEffects}
  onClose={() => setShowTextEffects(false)}
  onAdd={(effect) => { setTextEffects(prev => [...prev, effect]); setShowTextEffects(false); }}
/>
```

6. Render draw paths on the canvas (inside the media preview area):
```tsx
{drawPaths.length > 0 && (
  <Svg style={StyleSheet.absoluteFill} width={SCREEN_W} height={CANVAS_H}>
    {drawPaths.map((p, i) => (
      <Path key={i} d={p.d} stroke={p.stroke} strokeWidth={p.strokeWidth}
        opacity={p.opacity} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    ))}
  </Svg>
)}
```

7. Render text effects on the canvas:
```tsx
{textEffects.map((te) => (
  <Animated.Text key={te.id} entering={FadeIn}
    style={[styles.textEffect, { color: te.color, fontSize: te.fontSize, textAlign: te.alignment,
      ...(te.bgColor ? { backgroundColor: te.bgColor, paddingHorizontal: spacing.sm } : {}),
    }]}>
    {te.text}
  </Animated.Text>
))}
```

8. Include `selectedTrack?.id` as `audioTrackId` in the story creation mutation payload.

9. Show selected track indicator (small bar at bottom when track selected):
```tsx
{selectedTrack && (
  <Animated.View entering={FadeIn} style={styles.selectedTrackBar}>
    <Icon name="volume-x" size="sm" color={colors.emerald} />
    <Text style={styles.selectedTrackText} numberOfLines={1}>
      {selectedTrack.title} — {selectedTrack.artist}
    </Text>
    <Pressable onPress={() => setSelectedTrack(null)}>
      <Icon name="x" size="sm" color={colors.text.secondary} />
    </Pressable>
  </Animated.View>
)}
```

10. Add needed imports at top: `import Svg, { Path } from 'react-native-svg';`

**~100-150 lines added/changed**

---

## AGENT 9: Mobile — Reel Templates Screen + Reel Remix Screen

**Creates:**
- `apps/mobile/app/(screens)/reel-templates.tsx`
- `apps/mobile/app/(screens)/reel-remix.tsx`
- `apps/mobile/src/services/reelTemplatesApi.ts`
- `apps/mobile/src/types/reelTemplates.ts`

**types/reelTemplates.ts (~30 lines):**
```tsx
export interface ReelTemplateSegment {
  startMs: number;
  endMs: number;
  text?: string;
}

export interface ReelTemplate {
  id: string;
  name: string;
  sourceReelId: string;
  sourceReel?: { id: string; thumbnailUrl: string; user: { username: string; avatarUrl: string } };
  segments: ReelTemplateSegment[];
  useCount: number;
  createdAt: string;
}
```

**reelTemplatesApi.ts (~40 lines):**
```tsx
import { api } from './api';
import type { ReelTemplate } from '@/types/reelTemplates';

export const reelTemplatesApi = {
  browse: (cursor?: string, trending?: boolean) =>
    api.get<{ data: ReelTemplate[]; meta: { cursor: string | null; hasMore: boolean } }>(
      `/reel-templates?${trending ? 'trending=true&' : ''}${cursor ? `cursor=${cursor}` : ''}`
    ),
  getById: (id: string) => api.get<ReelTemplate>(`/reel-templates/${id}`),
  create: (data: { sourceReelId: string; segments: { startMs: number; endMs: number }[]; name: string }) =>
    api.post<ReelTemplate>('/reel-templates', data),
  use: (id: string) => api.post(`/reel-templates/${id}/use`),
  delete: (id: string) => api.delete(`/reel-templates/${id}`),
};
```

**reel-templates.tsx (~500 lines):**
```
Screen layout:
1. GlassHeader with "Reel Templates" title + back arrow
2. TabSelector: "Trending" | "Recent" | "My Templates"
3. Grid of template cards (2 columns):
   - Each card: source reel thumbnail, template name, useCount badge, creator avatar
   - Tap → preview overlay showing segment timeline
4. Preview overlay:
   - Video preview with segment markers on timeline
   - "Use This Template" GradientButton → navigate to create-reel with templateId param
   - Segment list with timing (e.g., "0:00-0:03 • 0:05-0:08")
5. FAB "+" button for creating templates from existing reels
6. Pull-to-refresh, cursor pagination, EmptyState, Skeleton loading
```

**reel-remix.tsx (~500 lines):**
```
Screen layout (reaction video):
1. GlassHeader "Remix" + back
2. Original reel plays in small window (top-right corner, 30% width)
3. Camera preview fills remaining space
4. Layout toggle: "Corner" (PiP) | "Side by Side" | "Green Screen" (original as background)
5. Recording controls:
   - Record button (red circle, same pattern as duet-create)
   - Timer countdown (3, 2, 1...)
   - Camera flip button
   - Flash toggle
6. Post-recording:
   - Preview of combined video
   - Caption input + hashtags
   - "Post Remix" GradientButton → create reel with isRemix: true, originalReelId
7. Original reel info card (creator name, avatar, caption preview)

Uses: expo-camera for recording, expo-av for original playback
Pattern: Follow duet-create.tsx UI patterns closely
```

**~1070 lines total**

---

## AGENT 10: Mobile — Wire Duet/Stitch/Green Screen to Camera

**Modifies (ONLY):**
- `apps/mobile/app/(screens)/duet-create.tsx`
- `apps/mobile/app/(screens)/stitch-create.tsx`
- `apps/mobile/app/(screens)/green-screen-editor.tsx`

**Current state:** All 3 screens have complete UI but use mock recording state (setInterval timers, no camera).

**What to do for ALL 3 files:**

1. Add camera imports at top:
```tsx
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Audio } from 'expo-av';
```

2. Add camera permission state:
```tsx
const [permission, requestPermission] = useCameraPermissions();
const [audioPermission, setAudioPermission] = useState(false);
const cameraRef = useRef<CameraView>(null);
```

3. Add permission request in useEffect:
```tsx
useEffect(() => {
  (async () => {
    const audioStatus = await Audio.requestPermissionsAsync();
    setAudioPermission(audioStatus.granted);
  })();
}, []);
```

4. Replace the mock "camera preview" placeholder `<View>` with actual `<CameraView>`:
```tsx
<CameraView
  ref={cameraRef}
  style={styles.cameraPreview}
  facing={facing}
  mode="video"
/>
```

5. Replace mock recording logic (the `setInterval` timer) with real recording:
```tsx
const handleRecord = async () => {
  if (isRecording) {
    cameraRef.current?.stopRecording();
    setIsRecording(false);
  } else {
    setIsRecording(true);
    const video = await cameraRef.current?.recordAsync({ maxDuration: 60 });
    if (video?.uri) {
      setRecordedUri(video.uri);
    }
    setIsRecording(false);
  }
};
```

6. Add `recordedUri` state and update the "preview" section to show the actual recorded video.

7. Add permission denied screen:
```tsx
if (!permission?.granted) {
  return (
    <SafeAreaView style={styles.container}>
      <EmptyState icon="camera" title={t('camera.permissionRequired')}
        subtitle={t('camera.permissionMessage')} actionLabel={t('camera.grantPermission')}
        onAction={requestPermission} />
    </SafeAreaView>
  );
}
```

**Per-file specifics:**

**duet-create.tsx:**
- The camera occupies one half of the split view (layout dependent: left/right or top/bottom)
- Original video plays in the other half via `<Video>` from expo-av
- Both audio tracks need to be mixed (for now, just record camera audio; mixing is post-processing)

**stitch-create.tsx:**
- The original video clip plays first (user-selected duration: 1/2/3/5 sec)
- Camera records the response portion after
- `recordedUri` combines with original clip URI (actual composition deferred — store both URIs)

**green-screen-editor.tsx:**
- Camera has transparent/overlay background
- Selected background image/gradient renders behind the camera view
- Use `expo-image` for background, `CameraView` overlay with `position: absolute`

**~150-200 lines changed across 3 files**

---

## AGENT 11: Mobile — Photo with Music Screen + Disposable Camera Screen

**Creates:**
- `apps/mobile/app/(screens)/photo-music.tsx`
- `apps/mobile/app/(screens)/disposable-camera.tsx`

**photo-music.tsx (~450 lines):**
```
Photo carousel with background audio track — like Instagram's "Photo Mode with Music"

Screen layout:
1. GlassHeader "Photo Mode" + back + post button
2. Image carousel editor (horizontal scroll of selected images, max 10)
   - Add image button at end (+ icon)
   - Remove image button on each (x icon overlay)
   - Reorder via drag (or just left/right arrows)
3. Music selection bar:
   - Tap to open MusicPicker component (import from @/components/story/MusicPicker)
   - Shows selected track with play/pause preview
   - Duration selector: how long each photo shows (2s, 3s, 5s, 7s)
4. Caption input with CharCountRing (500 chars)
5. Hashtag/mention autocomplete
6. Preview mode: auto-plays images as slideshow with selected music
7. Post button: creates a reel with postType: 'photo-music', mediaUrls, audioTrackId

Uses:
- expo-image-picker for multi-image selection
- expo-av Audio.Sound for music preview
- MusicPicker component from Agent 5
- storiesApi or reelsApi to create
- Standard patterns: useTranslation, ScreenErrorBoundary, GlassHeader, etc.
```

**disposable-camera.tsx (~400 lines):**
```
BeReal-style daily prompt camera — ephemeral, authentic content

Screen layout:
1. GlassHeader "Disposable" + back + timer badge showing remaining time
2. Dual camera view:
   - Main: rear camera (full width)
   - Small circle: front camera selfie (top-right, 80px)
   - Tap small circle to swap which is main/small
3. Capture button (large red circle, no filters)
4. Timer system:
   - Daily notification at random time between 10am-8pm
   - 2-minute capture window after notification
   - Countdown timer shown prominently
   - If timer expires, camera closes
5. Post-capture:
   - Both photos shown (front + back)
   - No editing, no filters — authenticity is the point
   - "Share" button posts as story with special "Disposable" badge
   - Optional: react to friends' disposable posts
6. Late posting penalty: "Posted X minutes late" label

Uses:
- CameraView from expo-camera
- useCameraPermissions for permissions
- storiesApi.create with tag 'disposable'
- Timer: useEffect with Date.now() comparison
```

**~850 lines total**

---

## AGENT 12: Mobile — Video Reply Component + Wire Music to create-reel.tsx

**Creates:**
- `apps/mobile/src/components/VideoReplySheet.tsx`

**Modifies (ONLY):**
- `apps/mobile/app/(screens)/create-reel.tsx`

**VideoReplySheet.tsx (~300 lines):**
```tsx
// Bottom sheet for recording a video reply to a comment
// Props: {
//   visible: boolean;
//   onClose: () => void;
//   commentId: string;
//   commentType: 'post' | 'reel';
//   commentText: string;
//   commentAuthor: { username: string; avatarUrl: string };
// }
//
// UI:
// 1. Comment preview card at top (original comment text + author)
// 2. Camera preview (60% of sheet height)
// 3. Record button (max 60 seconds)
// 4. After recording: preview + "Post Reply" button
// 5. Posts via reelsApi.create with isVideoReply flag
//
// Uses: CameraView, expo-av for preview, reelsApi

import { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Video, ResizeMode } from 'expo-av';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { reelsApi, uploadApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
```

**create-reel.tsx modifications:**

1. Import MusicPicker:
```tsx
import { MusicPicker } from '@/components/story/MusicPicker';
```

2. Add state:
```tsx
const [showMusicPicker, setShowMusicPicker] = useState(false);
const [selectedTrack, setSelectedTrack] = useState<AudioTrack | null>(null);
```

3. Find the disabled music button (around line 451-459, look for the audio/music related button that is disabled) and enable it:
```tsx
// Replace the disabled music button with:
<TouchableOpacity style={styles.toolButton} onPress={() => setShowMusicPicker(true)}>
  <Icon name="volume-x" size="md" color={colors.text.primary} />
  <Text style={styles.toolLabel}>{t('reel.music')}</Text>
</TouchableOpacity>
```

4. Render MusicPicker at bottom:
```tsx
<MusicPicker
  visible={showMusicPicker}
  onClose={() => setShowMusicPicker(false)}
  onSelect={(track) => { setSelectedTrack(track); setShowMusicPicker(false); }}
/>
```

5. Show selected track indicator below video preview (similar to create-story).

6. Include `audioTrackId: selectedTrack?.id` in the reel creation mutation.

**~350-400 lines total**

---

## FILE → AGENT CONFLICT MAP (zero overlaps)

| Agent | Files | Type |
|-------|-------|------|
| 1 | modules/reel-templates/ (3 NEW) | Backend |
| 2 | modules/story-chains/ (3 NEW) | Backend |
| 3 | modules/video-replies/ (3 NEW) | Backend |
| 4 | components/story/AddYoursSticker.tsx, LinkSticker.tsx (2 NEW) | Mobile |
| 5 | components/story/MusicPicker.tsx (1 NEW) | Mobile |
| 6 | components/story/DrawingCanvas.tsx (1 NEW) | Mobile |
| 7 | components/story/TextEffects.tsx (1 NEW) | Mobile |
| 8 | create-story.tsx (MODIFY — wire components) | Mobile |
| 9 | reel-templates.tsx, reel-remix.tsx, reelTemplatesApi.ts, types/reelTemplates.ts (4 NEW) | Mobile |
| 10 | duet-create.tsx, stitch-create.tsx, green-screen-editor.tsx (MODIFY — camera) | Mobile |
| 11 | photo-music.tsx, disposable-camera.tsx (2 NEW) | Mobile |
| 12 | VideoReplySheet.tsx (1 NEW) + create-reel.tsx (MODIFY — music) | Mobile |

**ZERO file conflicts between any agents.**

---

## POST-BATCH TASKS

1. Register new modules in `app.module.ts`: `ReelTemplatesModule`, `StoryChainsModule`, `VideoRepliesModule`
2. Add Prisma models if needed: `ReelTemplate` (id, name, sourceReelId, segments Json, useCount Int, userId, createdAt), `StoryChain` (id, prompt, coverUrl, participantCount, createdById, createdAt)
3. Run `npx prisma db push` after schema changes
4. Add i18n keys to `en.json` and `ar.json` for all new screens
5. Verify `react-native-svg` is available (should be — included in Expo SDK 52)
6. Test camera permissions on real device (simulator has no camera)
7. Test audio playback in MusicPicker on device

---

## ESTIMATED TOTALS

| Metric | Count |
|--------|-------|
| New backend files | 9 |
| New mobile files | 12 |
| Modified files | 5 |
| Total new lines | ~4,500-5,000 |
| Backend endpoints | 14 new |
| New components | 6 |
| New screens | 4 |
