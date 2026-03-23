# Video Editor — FFmpeg-kit Integration Design

**Date:** 2026-03-23
**Status:** Approved (from session 2 brainstorm)
**Priority:** #1 for session 3

## Problem

`video-editor.tsx` has a complete UI (6 tool tabs, preview, timeline, export button) but:
- Trim handles are static (not draggable)
- Filter selection stores name but doesn't map to FFmpeg color curves
- Music track is hardcoded "Summer Vibes" — no picker
- Volume sliders don't have gesture interaction
- Export output path uses string replace on input URI (won't work on device)
- No cancel support during export
- Split-at-playhead button is a no-op

The FFmpeg pipeline in `handleExport()` is partially correct but needs fixes for device paths, audio filter chaining, and proper quality presets.

## Design

### Phase 1: Core Engine (this session)

**1. Fix FFmpeg export pipeline:**
- Use `expo-file-system` `cacheDirectory` for output path
- Map quality presets: 720p → `-vf scale=-2:720 -crf 28`, 1080p → `-crf 23`, 4K → `-vf scale=-2:2160 -crf 18`
- Chain audio filters properly (speed + volume in single `-af` instead of conflicting flags)
- Map filter names to FFmpeg color curves (warm/cool/bw/vintage/vivid/dramatic/fade)
- Add cancel support via `FFmpegKit.cancel(sessionId)`
- Return exported file URI for upload or navigation

**2. Draggable trim handles:**
- Replace static trim handle Views with `PanGestureHandler` from react-native-gesture-handler
- Map gesture x-position to time based on waveform width
- Constrain: left handle < right handle, minimum 1s gap
- Update `startTime`/`endTime` state as handles move
- Seek video preview to handle position on release

**3. Interactive volume sliders:**
- Replace static slider Views with `PanGestureHandler`
- Map x-position to 0-100% range
- Real-time video volume update via `videoRef.setVolumeAsync()`

**4. Split at playhead:**
- Wire split button to create two segments at `currentTime`
- Store segments as `{ start: number, end: number }[]`
- Timeline renders segment gaps
- FFmpeg concat segments on export

### Phase 2: Filters + Text (next batch)

**Filter FFmpeg commands:**
| Filter | FFmpeg |
|--------|--------|
| warm | `curves=r='0/0 0.5/0.6 1/1':g='0/0 0.5/0.5 1/0.9':b='0/0 0.5/0.4 1/0.8'` |
| cool | `curves=r='0/0 0.5/0.4 1/0.85':g='0/0 0.5/0.5 1/0.95':b='0/0 0.5/0.6 1/1'` |
| bw | `hue=s=0` |
| vintage | `curves=r='0/0.1 0.5/0.55 1/0.9':g='0/0.05 0.5/0.45 1/0.85':b='0/0 0.5/0.35 1/0.7',vignette` |
| vivid | `eq=saturation=1.5:contrast=1.1` |
| dramatic | `eq=contrast=1.3:brightness=-0.05:saturation=1.2,vignette=PI/4` |
| fade | `eq=saturation=0.5:contrast=0.9:brightness=0.05` |

**Text overlay:** Already builds drawtext filter. Needs font file path resolution for Arabic support.

### Phase 3: Delight (future session)
- Music picker from device library
- Multi-clip concat with transitions
- Thumbnail filmstrip from video frames
- Undo/redo stack
- Auto-captions via Whisper API

## Files Changed
- `apps/mobile/app/(screens)/video-editor.tsx` — main rewrite
- `apps/mobile/src/services/ffmpegEngine.ts` — new: FFmpeg command builder + executor

## Testing
- Backend tests unaffected (video editor is client-only)
- Manual test: record video → trim → apply filter → export → verify output file
