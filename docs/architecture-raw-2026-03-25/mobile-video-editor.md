# Mobile Video Editor — Complete Architecture Extraction

> **Files:** `apps/mobile/app/(screens)/video-editor.tsx` (~2,606 lines), `apps/mobile/src/services/ffmpegEngine.ts` (~680 lines)

---

## 1. File Overview

### video-editor.tsx (2,606 lines)
- **Lines 1-22:** Imports (React, RN, Reanimated, Gesture Handler, expo-av, expo-speech, ffmpegEngine)
- **Lines 24-66:** Type definitions, constants (filters, fonts, colors, speed options, EditSnapshot type)
- **Lines 68-200:** Component state declarations (35+ state variables), undo/redo system, cleanup useEffect
- **Lines 200-297:** Trim gesture system (leftTrimGesture, rightTrimGesture), volume slider gestures, waveform data, animated export bar
- **Lines 298-534:** Playback controls, export pipeline (FFmpeg + fallback), cancel export
- **Lines 536-1361:** renderToolPanel() switch — all 9 tool tab UIs
- **Lines 1363-1702:** Main JSX return — quick actions bar, video preview, timeline, tools tab bar, tool panel, quality selector, bottom action bar, emoji picker, music picker
- **Lines 1705-2606:** StyleSheet.create() — ~900 lines of styles

### ffmpegEngine.ts (680 lines)
- **Lines 1-15:** Module docblock
- **Lines 17-128:** Type definitions (FilterName, QualityPreset, AspectRatio, VoiceEffect, TransitionType, EditParams interface — 43 fields, ExportResult, ProgressCallback)
- **Lines 130-168:** Filter map (13 filters), voice effects map (6 effects)
- **Lines 170-181:** Quality presets map (720p, 1080p, 4K)
- **Lines 183-217:** FFmpeg availability check with lazy import, reset, and caching
- **Lines 219-242:** buildAtempoChain() helper for speed values below 0.5
- **Lines 244-542:** buildCommand() — full FFmpeg command construction (~300 lines)
- **Lines 544-634:** executeExport() — async execution with progress, boomerang post-processing
- **Lines 636-644:** cancelExport() — session cancellation
- **Lines 646-680:** getVideoInfo() — FFprobe wrapper for video metadata

---

## 2. All State Variables (35 EditSnapshot fields + ~15 UI state)

### EditSnapshot Fields (35 — all tracked in undo/redo)

| # | Variable | Type | Default | Description |
|---|----------|------|---------|-------------|
| 1 | `startTime` | `number` | `0` | Trim start (seconds) |
| 2 | `endTime` | `number` | `0` (set to duration on load) | Trim end (seconds) |
| 3 | `speed` (playbackSpeed) | `SpeedOption` (0.25\|0.5\|1\|1.5\|2\|3) | `1` | Constant speed multiplier |
| 4 | `speedCurve` | `SpeedCurve` | `'none'` | Variable speed curve preset |
| 5 | `filter` (selectedFilter) | `FilterName` | `'original'` | Color filter preset |
| 6 | `captionText` | `string` | `''` | Text overlay content (max 200 chars) |
| 7 | `originalVolume` | `number` (0-100) | `80` | Original audio volume percentage |
| 8 | `musicVolume` | `number` (0-100) | `60` | Background music volume percentage |
| 9 | `isReversed` | `boolean` | `false` | Reverse playback |
| 10 | `voiceEffect` | `VoiceEffect` | `'none'` | Audio voice effect |
| 11 | `stabilize` | `boolean` | `false` | Video stabilization (deshake) |
| 12 | `noiseReduce` | `boolean` | `false` | Audio noise reduction |
| 13 | `freezeFrameAt` | `number \| null` | `null` | Freeze frame position (seconds) |
| 14 | `textStartTime` | `number` | `0` | When caption appears |
| 15 | `textEndTime` | `number` | `0` (0 = full duration) | When caption disappears |
| 16 | `aspectRatio` | `'9:16' \| '16:9' \| '1:1' \| '4:5'` | `'9:16'` | Output aspect ratio |
| 17 | `brightness` | `number` (-100 to +100) | `0` | Color grading brightness |
| 18 | `contrast` | `number` (-100 to +100) | `0` | Color grading contrast |
| 19 | `saturation` | `number` (-100 to +100) | `0` | Color grading saturation |
| 20 | `temperature` | `number` (-100 to +100) | `0` | Color temperature (warm/cool shift) |
| 21 | `fadeIn` | `number` (seconds) | `0` | Video + audio fade in duration |
| 22 | `fadeOut` | `number` (seconds) | `0` | Video + audio fade out duration |
| 23 | `rotation` | `0 \| 90 \| 180 \| 270` | `0` | Clockwise rotation degrees |
| 24 | `sharpen` | `boolean` | `false` | Sharpen filter (unsharp mask) |
| 25 | `vignetteOn` | `boolean` | `false` | Standalone vignette effect |
| 26 | `grain` | `boolean` | `false` | Film grain noise effect |
| 27 | `audioPitch` | `number` (-12 to +12) | `0` | Audio pitch shift in semitones |
| 28 | `flipH` | `boolean` | `false` | Horizontal flip (mirror) |
| 29 | `flipV` | `boolean` | `false` | Vertical flip |
| 30 | `glitch` | `boolean` | `false` | RGB channel split glitch effect |
| 31 | `letterbox` | `boolean` | `false` | Cinematic 2.35:1 black bars |
| 32 | `boomerang` | `boolean` | `false` | Forward + reverse loop |
| 33 | `textSize` | `number` | `48` | Font size for text overlay |
| 34 | `textBg` | `boolean` | `false` | Dark background box behind text |
| 35 | `textShadow` | `boolean` | `false` | Drop shadow on text |

### UI-Only State (not in EditSnapshot)

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `isPlaying` | `boolean` | `false` | Video playback state |
| `currentTime` | `number` | `0` | Current playback position |
| `totalDuration` | `number` | `0` | Video total duration |
| `selectedTool` | `ToolTab` | `'trim'` | Active tool tab |
| `selectedQuality` | `QualityOption` | `'1080p'` | Export quality preset |
| `selectedFont` | `string` | `'default'` | Font style for text overlay |
| `selectedTextColor` | `string` | `'#FFFFFF'` | Text overlay color |
| `voiceoverUri` | `string \| null` | `null` | Recorded voiceover file URI |
| `isRecordingVoiceover` | `boolean` | `false` | Active voiceover recording |
| `showMusicPicker` | `boolean` | `false` | Music picker visibility |
| `selectedTrack` | `AudioTrack \| null` | `null` | Selected background music track |
| `showEmojiPicker` | `boolean` | `false` | Emoji picker visibility |
| `isSpeaking` | `boolean` | `false` | TTS preview active |
| `isExporting` | `boolean` | `false` | Export in progress |
| `exportProgress` | `number` | `0` | Export progress percentage |
| `videoLoaded` | `boolean` | `false` | Video loaded flag |
| `undoStack` | `EditSnapshot[]` | `[]` | Undo history (max 20) |
| `redoStack` | `EditSnapshot[]` | `[]` | Redo history |

### Refs

| Ref | Type | Purpose |
|-----|------|---------|
| `videoRef` | `Video` | expo-av Video player reference |
| `recordingRef` | `Audio.Recording \| null` | Active voiceover recording reference |
| `timelineWidth` | `number` | Timeline container width for gesture calculations |
| `volumeSliderWidth` | `number` | Volume slider width for gesture calculations |
| `volumeSliderX` | `number` | Volume slider absolute X position |
| `volumeSliderRef` | `View` | Volume slider view reference for measureInWindow |

### Reanimated Shared Values

| Value | Purpose |
|-------|---------|
| `leftHandlePos` | Left trim handle position (0-1 fraction) |
| `rightHandlePos` | Right trim handle position (0-1 fraction) |
| `leftHandleStartPos` | Left handle initial position at gesture start (prevents compounding) |
| `rightHandleStartPos` | Right handle initial position at gesture start |
| `exportProgressAnim` | Animated export progress bar width |

---

## 3. All 9 Tool Tabs

The `ToolTab` type defines 9 tabs: `'trim' | 'speed' | 'filters' | 'adjust' | 'text' | 'music' | 'volume' | 'voiceover' | 'effects'`

Note: The type definition says 9 but the CLAUDE.md says 10. The actual tab bar renders 9 items:

| # | Tab ID | Icon | Label Key | Description |
|---|--------|------|-----------|-------------|
| 1 | `trim` | scissors | `videoEditor.trim` | Trim start/end, split at playhead, reset trim |
| 2 | `speed` | fast-forward | `videoEditor.speed` | 6 speed presets + 5 speed curves |
| 3 | `filters` | sliders | `videoEditor.filters` | 13 color filter presets in 3-column grid |
| 4 | `adjust` | sun | `videoEditor.adjust` | Brightness, contrast, saturation, temperature sliders + fade in/out |
| 5 | `text` | type | `videoEditor.text` | Text overlay, timing, font, color, size, bg, shadow, TTS, emoji |
| 6 | `music` | music | `videoEditor.music` | Background music picker, track display, remove |
| 7 | `volume` | volume-2 | `videoEditor.volume` | Original audio + music volume sliders with gesture |
| 8 | `effects` | sliders | `videoEditor.effects` | Voice effects, pitch, noise reduction, stabilization, freeze frame, visual effects grid (sharpen, vignette, grain, rotation, flip H/V, glitch, letterbox, boomerang) |
| 9 | `voiceover` | mic | `videoEditor.voiceover` | Record voiceover (Audio.Recording), playback sync, delete |

### Tool Tab Details

#### Tab 1: Trim
- Start/End time inputs (read-only, formatted MM:SS)
- **Split at Playhead:** Sets endTime to current playhead position (requires 1s gap both sides)
- **Delete/Reset:** Resets trim to full duration (0 to totalDuration)
- Gesture-based drag handles on waveform timeline

#### Tab 2: Speed
- **6 Speed Presets:** 0.25x, 0.5x, 1x, 1.5x, 2x, 3x (displayed in 3-column grid)
- **5 Speed Curves** (CapCut-style, horizontal scroll):
  - `none` — constant speed
  - `montage` — fast-slow-fast (2x edges, 0.5x middle)
  - `hero` — normal bookends, 2.5x slow in middle
  - `bullet` — extreme slow-mo in middle 40-60%
  - `flashIn` — starts 3.3x fast, decelerates to normal
  - `flashOut` — normal speed, accelerates to 3.3x

#### Tab 3: Filters
- 13 filters in FadeInUp staggered grid (50ms delay per item)
- Each filter: color circle preview + label

#### Tab 4: Adjust (Color Grading)
- **4 Sliders** (each -100 to +100, centered at 0):
  - Brightness (icon: sun)
  - Contrast (icon: circle-plus)
  - Saturation (icon: layers)
  - Temperature (icon: hash)
- Each slider has: icon, label, value display, visual slider track with center line, fill, thumb
- **Quick presets:** -50, -25, 0, +25, +50 for each slider
- **Fade In/Out:** Off, 0.5s, 1s, 2s buttons for each

#### Tab 5: Text
- **TextInput** — multiline, 200 char max, character count display
- **Text Timing** (appears when text entered):
  - "Appears at" — taps to set to current playhead
  - "Disappears at" — taps to set to current playhead
  - Hint text explaining tap-to-set behavior
- **Font Style:** 3 options — default, bold, handwritten (horizontal scroll)
- **Text Color:** 6 options — #FFFFFF, #D4A94F, #0A7B4F, #C8963E, #F85149, colors.extended.blue
- **Text Size:** 5 presets — 24, 36, 48, 64, 80
- **Text Style Toggles:** Background box, Drop shadow
- **TTS Preview:** expo-speech with language map (en→en-US, ar→ar-SA, etc.)
- **Emoji Picker:** Opens EmojiPicker bottom sheet, appends emoji to caption

#### Tab 6: Music
- **Library Button** — opens MusicPicker (449-line component with genre search, preview)
- **Current Track Card** — shows title, artist, gold music icon, remove button
- **No Track Hint** — empty state with music icon

#### Tab 7: Volume
- **Original Audio** — gesture-based slider (0-100%), uses absoluteX - volumeSliderX for position
- **Background Music** — same gesture slider pattern
- Both display icon, label, and percentage value

#### Tab 8: Effects
- **Voice Effects** (horizontal scroll, 6 options): none, robot, echo, deep, chipmunk, telephone
- **Audio Pitch** — semitone presets: -6, -3, 0, +3, +6
- **Enhancement Toggles** (switch-style):
  - Noise Reduction — with description text
  - Stabilization — with description text
- **Freeze Frame** — toggle to freeze at playhead position (displays "Frozen at MM:SS")
- **Visual Effects Grid** (9 toggles in flex wrap):
  - Sharpen
  - Vignette
  - Film Grain
  - Rotation (cycles: 0 -> 90 -> 180 -> 270 -> 0)
  - Flip Horizontal
  - Flip Vertical
  - Glitch (RGB split)
  - Letterbox (cinematic bars)
  - Boomerang (forward + reverse loop)

#### Tab 9: Voiceover
- **Record Button** — starts Audio.Recording (HIGH_QUALITY preset)
  - Syncs with video playback (plays from trim start)
  - Sets audio mode for iOS recording
  - Stops and saves URI on second press
  - Resets audio mode after recording for iOS
- **Recorded Indicator** — check-circle + "Voiceover ready" + delete button

---

## 4. Undo/Redo System

### Implementation
- **Stack depth:** 20 (undo), unlimited (redo) — undo clips via `.slice(-19)` to keep max 20
- **captureSnapshot():** Creates EditSnapshot from all 35 state fields
- **applySnapshot(s):** Restores all 35 state fields from snapshot
- **pushUndo():** Captures current state, pushes to undo stack, clears redo stack
- **handleUndo():** Pops from undo stack, pushes current to redo, applies popped snapshot
- **handleRedo():** Pops from redo stack, pushes current to undo, applies popped snapshot
- **All edit actions call pushUndo() before modifying state**
- **Haptic feedback:** `haptic.tick()` on undo/redo

### captureSnapshot Dependencies Array (all 35 fields)
```
startTime, endTime, playbackSpeed, speedCurve, selectedFilter, captionText,
originalVolume, musicVolume, isReversed, voiceEffect, stabilize, noiseReduce,
freezeFrameAt, textStartTime, textEndTime, aspectRatio, brightness, contrast,
saturation, temperature, fadeIn, fadeOut, rotation, sharpen, vignetteOn, grain,
audioPitch, flipH, flipV, glitch, letterbox, boomerang, textSize, textBg, textShadow
```

---

## 5. All 13 Filters (FFmpeg Filter Map)

| # | Filter ID | FFmpeg Command | Description |
|---|-----------|---------------|-------------|
| 1 | `original` | (empty — no filter) | No color change |
| 2 | `warm` | `curves=r='0/0 0.5/0.6 1/1':g='0/0 0.5/0.5 1/0.9':b='0/0 0.5/0.4 1/0.8'` | Warm tone (boost red, reduce blue) |
| 3 | `cool` | `curves=r='0/0 0.5/0.4 1/0.85':g='0/0 0.5/0.5 1/0.95':b='0/0 0.5/0.6 1/1'` | Cool tone (boost blue, reduce red) |
| 4 | `bw` | `hue=s=0` | Black & white (zero saturation) |
| 5 | `vintage` | `curves=r='0/0.1 0.5/0.55 1/0.9':g='0/0.05 0.5/0.45 1/0.85':b='0/0 0.5/0.35 1/0.7',vignette` | Vintage tones + vignette |
| 6 | `vivid` | `eq=saturation=1.5:contrast=1.1` | High saturation + slight contrast boost |
| 7 | `dramatic` | `eq=contrast=1.3:brightness=-0.05:saturation=1.2,vignette=PI/4` | High contrast, slight dark, vignette |
| 8 | `fade` | `eq=saturation=0.5:contrast=0.9:brightness=0.05` | Desaturated, low contrast, slight bright |
| 9 | `emerald` | `curves=r='0/0 0.5/0.3 1/0.7':g='0/0 0.5/0.6 1/1':b='0/0 0.5/0.35 1/0.75'` | Green-tinted (brand color) |
| 10 | `golden` | `curves=r='0/0 0.5/0.6 1/1':g='0/0 0.5/0.5 1/0.85':b='0/0 0.5/0.3 1/0.6',eq=brightness=0.03` | Golden warm + slight brightness |
| 11 | `night` | `eq=brightness=-0.1:contrast=1.2:saturation=0.7,curves=b='0/0 0.5/0.55 1/0.9'` | Dark, contrasty, blue-shifted |
| 12 | `soft` | `eq=saturation=0.8:contrast=0.9:brightness=0.06,gblur=sigma=0.5` | Soft glow with slight blur |
| 13 | `cinematic` | `eq=contrast=1.15:saturation=0.9,curves=r='0/0.05 0.5/0.45 1/0.9':b='0/0 0.5/0.4 1/0.85',vignette=PI/5` | Film-like with vignette |

### Filter UI Colors (preview circles)
| Filter | Preview Color |
|--------|--------------|
| original | #FFFFFF |
| warm | #D4A94F |
| cool | colors.extended.blue |
| bw | #8B949E |
| vintage | #C8963E |
| vivid | #0A7B4F |
| dramatic | #F85149 |
| fade | #6E7781 |
| emerald | #0A7B4F |
| golden | #C8963E |
| night | #1C2333 |
| soft | #E8D5B7 |
| cinematic | #2D3548 |

---

## 6. All 6 Voice Effects

| # | Effect ID | FFmpeg Audio Filter | Technique |
|---|-----------|-------------------|-----------|
| 1 | `none` | (empty) | No effect |
| 2 | `robot` | `asetrate=44100*0.8,aresample=44100,atempo=1.25` | Pitch down 20% + speed up to compensate duration |
| 3 | `echo` | `aecho=0.8:0.88:60:0.4` | Echo with 60ms delay, 0.4 decay |
| 4 | `deep` | `asetrate=44100*0.75,aresample=44100,atempo=1.333` | Pitch down 25% + speed up |
| 5 | `chipmunk` | `asetrate=44100*1.5,aresample=44100,atempo=0.667` | Pitch up 50% + speed down |
| 6 | `telephone` | `highpass=f=300,lowpass=f=3400` | Band-pass 300-3400 Hz |

### Voice Effect + Pitch Conflict Resolution
- If a voice effect is active AND audioPitch is non-zero, **audioPitch is skipped**
- Both use `asetrate` — they are incompatible
- Code: `if (params.audioPitch && params.audioPitch !== 0 && !voiceEffectFilter)`

---

## 7. All 5 Speed Curves (Variable PTS)

Speed curves use `setpts=` expressions with the clip duration (D) substituted since FFmpeg's `setpts` does not have a DURATION variable.

| # | Curve ID | PTS Expression | Behavior |
|---|----------|---------------|----------|
| 1 | `montage` | `if(lt(T,0.3*D),0.5*PTS,if(gt(T,0.7*D),0.5*PTS,2.0*PTS))` | Fast-slow-fast: 2x speed at edges (0-30% and 70-100%), 0.5x in middle |
| 2 | `hero` | `if(lt(T,0.2*D),PTS,if(gt(T,0.8*D),PTS,2.5*PTS))` | Normal bookends, 2.5x slow in middle 20-80% |
| 3 | `bullet` | `if(between(T,0.4*D,0.6*D),3.0*PTS,0.8*PTS)` | Extreme 3x slow-mo in middle 40-60%, 0.8x (slightly fast) elsewhere |
| 4 | `flashIn` | `(0.3+0.7*T/D)*PTS` | Starts at 3.3x speed (0.3), linearly decelerates to 1x by end |
| 5 | `flashOut` | `(1.0-0.7*T/D)*PTS` | Starts at 1x, linearly accelerates to 3.3x by end |

### Speed Curve + Constant Speed Interaction
- When a speed curve is active, constant `atempo` is **skipped** for audio
- Audio stays at 1x to avoid desync with variable-speed video
- Code: `if (speed !== 1 && !params.speedCurve)`

---

## 8. Text Overlay System

### Text Input
- Max 200 characters, multiline (3 lines)
- Character count displayed when text entered

### Text Timing
- `textStartTime`: Set to current playhead on tap (relative to video)
- `textEndTime`: Set to current playhead on tap (0 = full duration)
- FFmpeg `enable='between(t,start,end)'` expression
- Times are adjusted relative to trim start: `txtStart = max(0, rawTxtStart - startTime)`

### Text Style Options
- **Font styles:** default, bold, handwritten (3 options, horizontal scroll)
  - NOTE: Font selection has no effect on FFmpeg export (known limitation — drawtext doesn't resolve platform font paths)
- **Colors:** 6 options — #FFFFFF, #D4A94F, #0A7B4F, #C8963E, #F85149, colors.extended.blue
- **Sizes:** 5 presets — 24pt, 36pt, 48pt (default), 64pt, 80pt
- **Background box:** `box=1:boxcolor=black@0.6:boxborderw=12`
- **Drop shadow:** `shadowcolor=black@0.5:shadowx=3:shadowy=3`

### FFmpeg Text Escaping
```typescript
captionText
  .replace(/\\/g, '\\\\\\\\')   // backslash
  .replace(/'/g, "'\\\\\\''")    // single quote
  .replace(/:/g, '\\:')          // colon (FFmpeg option separator)
  .replace(/%/g, '%%')           // percent (FFmpeg time code)
  .replace(/\[/g, '\\[')         // brackets
  .replace(/\]/g, '\\]');
```

### FFmpeg drawtext Command Structure
```
drawtext=text='ESCAPED':fontsize=SIZE:fontcolor=COLOR:x=(w-text_w)/2:y=h-th-80:borderw=2:bordercolor=black@0.5[:box=1:boxcolor=black@0.6:boxborderw=12][:shadowcolor=black@0.5:shadowx=3:shadowy=3]:enable='between(t,START,END)'
```
- Position: horizontally centered, near bottom (y=h-th-80)
- Always has black border stroke (borderw=2, bordercolor=black@0.5)

### TTS Preview
- Uses `expo-speech` — preview only, NOT burned into export
- Language mapping: en->en-US, ar->ar-SA, tr->tr-TR, ur->ur-PK, bn->bn-BD, fr->fr-FR, id->id-ID, ms->ms-MY
- Toggle play/stop with `Speech.speak()` / `Speech.stop()`

---

## 9. Music System

### MusicPicker Component
- 449-line component (imported from `@/components/story/MusicPicker`)
- Genre search, preview playback
- Returns `AudioTrack` type: `{ id, title, artist, audioUrl, ... }`

### Audio Mixing
- Original audio volume: 0-100% (default 80%)
- Music volume: 0-100% (default 60%)
- When music is present, FFmpeg uses `-filter_complex` with `amix`
- Music input added as separate `-i` to command

---

## 10. Voiceover Recording

### Recording Flow
1. Set `Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true })`
2. Create recording with `Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY)`
3. Store in `recordingRef.current`
4. Play video from trim start (sync playback)
5. On stop: `stopAndUnloadAsync()`, get URI, reset audio mode
6. URI stored in `voiceoverUri` state

### Cleanup on Unmount
```typescript
useEffect(() => {
  return () => {
    if (recordingRef.current) {
      recordingRef.current.stopAndUnloadAsync().catch(() => {});
      recordingRef.current = null;
    }
    Speech.stop();
    Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
  };
}, []);
```

---

## 11. Export Flow

### Two Export Paths

#### Path 1: FFmpeg Available (Real Export)
1. Construct `EditParams` object with all 43 fields
2. Call `executeExport(editParams, progressCallback)`
3. Progress updates via statistics callback (time-based estimation)
4. On success: navigate back with `result.outputUri` (or to `returnTo` route)
5. On cancel: show info toast
6. On error: show error toast

#### Path 2: FFmpeg Unavailable (Fallback Metadata Upload)
1. Construct `editMetadata` object with all 35 edit fields
2. Get presigned R2 upload URL via `uploadApi.getPresignUrl('video/mp4', 'videos')`
3. Fetch original video as blob
4. Upload with `x-amz-meta-edit` header containing JSON-serialized metadata
5. Progress: manual steps (5% -> 15% -> 30% -> 100%)
6. Server is expected to process edits later

### Fallback Metadata Fields (35 — mirrors all EditSnapshot fields)
```typescript
{
  trimStart, trimEnd, speed, speedCurve, filter,
  caption, captionColor, captionFont,
  textStartTime, textEndTime, textSize, textBg, textShadow,
  volume, musicVolume, musicTrackId,
  voiceEffect, audioPitch, noiseReduce,
  quality, isReversed, aspectRatio,
  stabilize, brightness, contrast, saturation, temperature,
  fadeIn, fadeOut, rotation, sharpen, vignette, grain,
  flipH, flipV, glitch, letterbox, boomerang, freezeFrameAt,
}
```
- Non-default values are set to `undefined` to save bandwidth (e.g., `speedCurve !== 'none' ? speedCurve : undefined`)

### Export Quality Presets

| Preset | Scale | CRF | Encoder Preset | Audio Bitrate |
|--------|-------|-----|---------------|---------------|
| 720p | `scale=-2:720` | 28 | fast | 128k |
| 1080p | (original) | 23 | fast | 192k |
| 4K | `scale=-2:2160` | 18 | medium | 256k |

### Encoding Settings (always applied)
- Codec: `libx264`
- Audio codec: `aac`
- Flag: `-movflags +faststart` (web-optimized MP4)
- Output: `-y` (overwrite)

---

## 12. ffmpegEngine.ts — buildCommand() Full Logic

### Input Handling
```
-ss START -to END -i "INPUT"         # Fast seek (when trimming, NOT reversing)
-i "INPUT"                            # No seek (when reversing, since reverse needs full decode)
-i "MUSIC_URI"                        # Optional music input
-i "VOICEOVER_URI"                    # Optional voiceover input
```

### Video Filter Chain Order (vFilters array, applied in sequence)

1. **Reverse trim** (when reversed + trimmed): `trim=start=S:end=E,setpts=PTS-STARTPTS`
2. **Reverse**: `reverse` (capped at MAX_REVERSE_DURATION = 300s / 5 minutes)
3. **Speed** (one of):
   - Speed curve: `setpts='...'` (variable PTS expression with clip duration D)
   - Constant speed: `setpts=FACTOR*PTS` (where FACTOR = 1/speed)
4. **Color filter**: From FILTER_MAP (see section 5)
5. **Quality scale**: `scale=-2:720` or `scale=-2:2160` (1080p = no scale)
6. **Aspect ratio crop**: Center crop using `min()` to prevent overflow
   - `16:9`: `crop=min(iw\,ih*16/9):min(ih\,iw*9/16)`
   - `1:1`: `crop=min(iw\,ih):min(iw\,ih)`
   - `4:5`: `crop=min(iw\,ih*4/5):min(ih\,iw*5/4)`
   - `9:16`: (default — no crop)
7. **Text overlay**: `drawtext=...` with escaping and enable expression
8. **Color grading** (eq filter): `eq=brightness=X:contrast=Y:saturation=Z`
   - Brightness: -100..+100 mapped to -0.3..+0.3 (divide by 333)
   - Contrast: -100..+100 mapped to 0.5..1.5 (1 + value/200)
   - Saturation: -100..+100 mapped to 0.0..2.0 (max(0, 1 + value/100))
9. **Temperature**: `colorbalance=rs=SHIFT:gs=0:bs=-SHIFT:rm=SHIFT:gm=0:bm=-SHIFT`
   - Shift: value/200, range -0.5 to +0.5
10. **Stabilization**: `deshake=rx=32:ry=32`
11. **Fade in**: `fade=t=in:st=0:d=DURATION`
12. **Fade out**: `fade=t=out:st=START:d=DURATION` (start = clipDuration - fadeOut)
13. **Rotation**:
    - 90: `transpose=1` (clockwise)
    - 180: `transpose=1,transpose=1`
    - 270: `transpose=2` (counter-clockwise)
14. **Sharpen**: `unsharp=5:5:1.0:5:5:0.0`
15. **Vignette**: `vignette=PI/4`
16. **Film grain**: `noise=alls=20:allf=t`
17. **Horizontal flip**: `hflip`
18. **Vertical flip**: `vflip`
19. **Glitch**: `rgbashift=rh=5:bh=-5:rv=-3:bv=3`
20. **Letterbox**: `drawbox=x=0:y=0:w=iw:h=ih*0.12:color=black:t=fill,drawbox=x=0:y=ih*0.88:w=iw:h=ih*0.12:color=black:t=fill`
21. **Freeze frame**: `tpad=stop_mode=clone:stop_duration=2` (appends 2s freeze at end)

### Audio Filter Chain Order (origChain array)

1. **Reverse trim** (when reversed + trimmed): `atrim=start=S:end=E,asetpts=PTS-STARTPTS`
2. **Audio reverse**: `areverse` (capped at MAX_REVERSE_DURATION)
3. **Speed** (constant only, skipped when speed curve active): `buildAtempoChain(speed)`
4. **Volume**: `volume=FACTOR` (originalVolume/100)
5. **Voice effect**: From VOICE_EFFECT_MAP (see section 6)
6. **Audio pitch** (only when NO voice effect active): `asetrate=44100*RATIO,aresample=44100`
   - Ratio: `2^(semitones/12)`
7. **Noise reduction**: `highpass=f=80,lowpass=f=12000,afftdn=nf=-20`
8. **Audio fade in**: `afade=t=in:st=0:d=DURATION`
9. **Audio fade out**: `afade=t=out:st=START:d=DURATION`

### buildAtempoChain() — Handling Speed < 0.5
FFmpeg `atempo` only supports 0.5-100 range. For values below 0.5:
```
0.25x = atempo=0.5,atempo=0.5 (0.5*0.5=0.25)
0.3x  = atempo=0.5,atempo=0.6 (0.5*0.6=0.3)
```
Algorithm: repeatedly divide by 2 (prepend `atempo=0.5`) until remaining >= 0.5, then append remainder.

### Audio Mixing (Complex Filter Graph)

When music and/or voiceover are present, uses `-filter_complex` instead of `-af`:

```
[0:a]origChain[a0];                          # Process original audio
[1:a]volume=MUSIC_VOL[amusic];               # (if music) Scale music volume
[2:a]volume=1.0[avoice];                     # (if voiceover) Voiceover at full volume
[a0][amusic][avoice]amix=inputs=N:duration=first[aout]
```
- Input indices: 0=video, 1=music (if present), next=voiceover (if present)
- `amix` with `duration=first` — output duration matches original audio
- Maps: `-map 0:v -map "[aout]"`

When no music or voiceover: uses simple `-af "origChain"` instead.

---

## 13. Boomerang Post-Processing

Boomerang is NOT part of the main filter chain. It is handled as a **post-processing step** after the main export:

1. Main export completes to `outputPath`
2. Build boomerang command:
```
-i "OUTPUT" -filter_complex
  "[0:v]split[vfwd][vrev];[vrev]reverse[vrvid];[vfwd][vrvid]concat=n=2:v=1:a=0[outv];
   [0:a]asplit[afwd][arev];[arev]areverse[arvid];[afwd][arvid]concat=n=2:v=0:a=1[outa]"
-map "[outv]" -map "[outa]" -c:v libx264 -preset fast -crf 23 -c:a aac -y "BOOM_OUTPUT"
```
3. Splits BOTH video and audio
4. Reverses the copies
5. Concatenates forward + reversed for both streams
6. On success: deletes original, returns boomerang path
7. On failure: returns original export path as fallback

---

## 14. Multi-Clip Concat (buildConcatCommand)

### Exported Function (for create-reel.tsx)
```typescript
buildConcatCommand(
  clips: { uri: string; duration: number }[],
  outputPath: string,
  transition: TransitionType = 'none',
  transitionDuration: number = 0.5,
): string
```

### 8 Transition Types
`'none' | 'fade' | 'dissolve' | 'wipeleft' | 'wiperight' | 'slideup' | 'slidedown' | 'circleopen' | 'circleclose'`

### Concat Without Transitions (transition='none')
```
-i "clip0" -i "clip1" ... -filter_complex "[0:v][0:a][1:v][1:a]...concat=n=N:v=1:a=1[outv][outa]"
```

### Concat With Transitions (xfade + acrossfade)
- Video: `xfade=transition=TYPE:duration=DUR:offset=OFFSET`
- Audio: `acrossfade=d=DUR`
- Transition duration clamped: min 0.1s, max 2.0s
- Offset calculation: cumulative duration of previous clips minus transition duration

### Single Clip Optimization
If only 1 clip: `-i "clip" -c copy -y "output"` (stream copy, no re-encoding)

---

## 15. Aspect Ratio Crop

| Ratio | FFmpeg Crop Filter | Description |
|-------|-------------------|-------------|
| 9:16 | (none — default) | Portrait (no crop) |
| 16:9 | `crop=min(iw\,ih*16/9):min(ih\,iw*9/16)` | Landscape center crop |
| 1:1 | `crop=min(iw\,ih):min(iw\,ih)` | Square center crop |
| 4:5 | `crop=min(iw\,ih*4/5):min(ih\,iw*5/4)` | Instagram portrait crop |

- Uses `min()` to prevent crop dimensions exceeding input dimensions (fix from session 3)
- Backslash-escaped commas for FFmpeg filter syntax

---

## 16. Quick Actions Bar

Located above the video preview. Contains:

| # | Action | Icon | Behavior |
|---|--------|------|----------|
| 1 | Undo | arrow-left | Pops undo stack (disabled at 0, opacity 0.3) |
| 2 | Redo | arrow-left (scaleX: -1) | Pops redo stack (disabled at 0) |
| 3 | (divider) | — | Visual separator |
| 4 | Reverse | repeat | Toggles isReversed (green highlight when active) |
| 5 | Aspect Ratio | layers + text | Cycles through 9:16 -> 16:9 -> 1:1 -> 4:5 |
| 6 | (divider) | — | Visual separator |
| 7 | Auto Captions | edit + text | Navigates to `/(screens)/caption-editor` with videoUri |

---

## 17. Trim Gesture System

### Gesture Pattern (Fix for compounding bug)
```
onStart: capture initial position → leftHandleStartPos.value = leftHandlePos.value
onUpdate: use absolute offset → leftHandleStartPos.value + translationX / timelineWidth
```
This prevents the compounding issue where `leftHandlePos.value` was read during update (it was already being modified).

### Constraints
- Minimum trim gap: 1 second (`MIN_TRIM_GAP = 1`)
- Left handle: `max(0, min(rightHandlePos - 1s/duration, initial + dx/width))`
- Right handle: `min(1, max(leftHandlePos + 1s/duration, initial + dx/width))`
- On left handle release: seeks video to start time
- Updates state via `runOnJS(setStartTime/setEndTime)(fraction * totalDuration)`

### Timeline Waveform
- 40 bars, deterministic sine wave pattern (no Math.random)
- Formula: `10 + 15 * |sin(t * PI * 4)| + 8 * |sin(t * PI * 7)|`
- Cosmetic only — does NOT represent actual audio data (known limitation)

---

## 18. Video Preview Area

### Layout
- Height: `screenHeight * 0.42`
- Gradient background: `rgba(28,35,51,0.8)` to `rgba(13,17,23,0.9)`
- Border: 1px `colors.active.white6`

### Overlays
- **Timestamp Badge** (top-right): `MM:SS / MM:SS` (current/total)
- **Speed Badge** (top-left): `Nx` — tappable, cycles through 0.5x/1x/1.5x/2x
- **Play/Pause Button** (center): 64x64 circle, emerald gradient

### Video Player
- `expo-av` Video component with `ResizeMode.CONTAIN`
- `shouldPlay={false}`, `isLooping={false}`
- `onPlaybackStatusUpdate` tracks position, duration, playing state
- Speed applied via `videoRef.current.setRateAsync(speed, true)` (pitch-corrected)
- Volume applied via `videoRef.current.setVolumeAsync(volume/100)`

---

## 19. Bottom Action Bar

- **Cancel button** (left): navigates back
- **Export button** (right, when not exporting): emerald gradient, check icon + "Export" text
- **Cancel Export button** (right, when exporting): red gradient, ActivityIndicator + percentage

### Export Progress Animation
- `exportProgressAnim` shared value animated with `withTiming(percent, { duration: 80 })`
- Visual progress bar in export button gradient

---

## 20. EditParams Interface (ffmpegEngine.ts — 43 fields)

```typescript
export interface EditParams {
  inputUri: string;           // Source video file URI
  startTime: number;          // Trim start (seconds)
  endTime: number;            // Trim end (seconds)
  totalDuration: number;      // Original video duration
  speed: number;              // 0.25-3
  filter: FilterName;         // Color filter preset
  captionText: string;        // Text overlay content
  captionColor: string;       // Text color hex
  captionFont: string;        // Font style name
  textStartTime?: number;     // When caption appears
  textEndTime?: number;       // When caption disappears (0=end)
  originalVolume: number;     // 0-100
  musicVolume: number;        // 0-100
  musicUri?: string;          // Background music file URI
  voiceoverUri?: string;      // Voiceover recording URI
  quality: QualityPreset;     // '720p' | '1080p' | '4K'
  speedCurve?: string;        // Variable speed curve preset
  isReversed?: boolean;       // Reverse playback
  aspectRatio?: AspectRatio;  // Output aspect ratio
  voiceEffect?: VoiceEffect;  // Audio voice effect
  stabilize?: boolean;        // Video stabilization
  noiseReduce?: boolean;      // Audio noise reduction
  freezeFrameAt?: number | null; // Freeze frame position
  brightness?: number;        // -100 to +100
  contrast?: number;          // -100 to +100
  saturation?: number;        // -100 to +100
  temperature?: number;       // -100 to +100
  fadeIn?: number;            // Fade in duration (seconds)
  fadeOut?: number;           // Fade out duration (seconds)
  rotation?: 0|90|180|270;    // Clockwise rotation
  sharpen?: boolean;          // Sharpen filter
  vignette?: boolean;         // Standalone vignette
  grain?: boolean;            // Film grain
  audioPitch?: number;        // -12 to +12 semitones
  flipH?: boolean;            // Horizontal flip
  flipV?: boolean;            // Vertical flip
  glitch?: boolean;           // RGB split glitch
  letterbox?: boolean;        // Cinematic bars
  boomerang?: boolean;        // Forward+reverse loop
  textSize?: number;          // Font size override
  textBg?: boolean;           // Text background box
  textShadow?: boolean;       // Text drop shadow
}
```

---

## 21. executeExport() Implementation

### Flow
1. Check FFmpeg availability (lazy import)
2. Validate reverse duration (max 5 minutes)
3. Generate output path: `${cacheDirectory}video_export_${Date.now()}.mp4`
4. Build command via `buildCommand(params, outputPath)`
5. Calculate estimated export duration: `(trimDuration / speed) * reverseFactor * 1000`
6. Execute async via `FFmpegKit.executeAsync(command, completeCallback, logCallback, statsCallback)`
7. Track `activeSessionId` for cancel support

### Progress Estimation
```typescript
const timeMs = statistics.getTime();
const percent = Math.min(99, Math.round((timeMs / exportDurationMs) * 100));
```
- Caps at 99% until complete callback fires
- Reverse factor (2x) accounts for slower reverse processing

### Session Management
- `activeSessionId` is a module-level variable (single export at a time)
- Set from `sessionPromise.then()` with race guard
- Reset to `null` on complete/cancel

### Cancel
```typescript
export async function cancelExport(): Promise<void> {
  if (kit && activeSessionId !== null) {
    await kit.FFmpegKit.cancel(activeSessionId);
    activeSessionId = null;
  }
}
```

---

## 22. getVideoInfo() — FFprobe Wrapper

```typescript
export async function getVideoInfo(uri: string): Promise<VideoInfo | null>
```

Returns:
```typescript
interface VideoInfo {
  duration: number;    // seconds
  width: number;       // pixels
  height: number;      // pixels
  bitrate?: number;    // bps
  codec?: string;      // e.g., "h264"
}
```

Uses `FFprobeKit.getMediaInformation(uri)` to extract video stream metadata.

---

## 23. URI Normalization

```typescript
function normalizeUri(uri: string): string {
  return uri.startsWith('file://') ? uri.replace('file://', '') : uri;
}
```
- Android requires raw paths for FFmpeg (not `file://` URIs)
- Applied to `inputUri`, `musicUri`, and `voiceoverUri`

---

## 24. FFmpeg Availability Detection

### Lazy Import Pattern
```typescript
let _ffmpegKit: typeof import('ffmpeg-kit-react-native') | null = null;
let _loadFailed = false;

async function getFFmpegKit() {
  if (_ffmpegKit) return _ffmpegKit;       // Cached success
  if (_loadFailed) return null;             // Cached failure (no retry)
  try {
    _ffmpegKit = await import('ffmpeg-kit-react-native');
    return _ffmpegKit;
  } catch {
    _loadFailed = true;
    return null;
  }
}
```

- `isFFmpegAvailable()` — public boolean check
- `resetFFmpegCheck()` — clears cache for retry (e.g., after hot reload)
- Only one retry per app session unless explicitly reset

---

## 25. Known Design Limitations

1. **Waveform is cosmetic** — deterministic sine wave, not from actual audio peaks. Needs FFprobeKit audio peak extraction.
2. **Font selection has no effect on export** — FFmpeg drawtext doesn't resolve platform font paths. Needs iOS/Android `fontfile=` resolution.
3. **Music mixing uses CDN URL directly** — works but adds network latency. Should pre-download to cache.
4. **No real-time filter preview** — expo-av Video doesn't support shaders. User only sees filter effect after export. Would need OpenGL/expo-gl.
5. **iOS config plugin uses monkey-patched pre_install** — documented community approach, fragile across CocoaPods versions.
6. **Freeze frame only at end of clip** — uses `tpad=stop_mode=clone:stop_duration=2`. Mid-clip freeze would require splitting the video (complex filter graph, deferred to v2).
7. **Speed curves skip audio speed adjustment** — audio stays at 1x when speed curve active to avoid desync.
8. **Voice effect + pitch are mutually exclusive** — both use asetrate, incompatible.

---

## 26. Dependencies

### video-editor.tsx Imports
| Import | From | Purpose |
|--------|------|---------|
| useState, useCallback, useRef, useEffect, useMemo | react | State management |
| View, Text, StyleSheet, ScrollView, Pressable, Dimensions, TextInput, ActivityIndicator | react-native | UI components |
| useRouter, useLocalSearchParams | expo-router | Navigation |
| SafeAreaView | react-native-safe-area-context | Safe area insets |
| Animated, FadeInUp, useSharedValue, useAnimatedStyle, withTiming, runOnJS | react-native-reanimated | Animations |
| Gesture, GestureDetector | react-native-gesture-handler | Trim + volume gestures |
| LinearGradient | expo-linear-gradient | Gradient backgrounds |
| Video, Audio, ResizeMode, AVPlaybackStatus | expo-av | Video playback + recording |
| Icon, IconName | @/components/ui/Icon | Iconography |
| GlassHeader | @/components/ui/GlassHeader | Header bar |
| colors, spacing, radius, fontSize, fonts | @/theme | Design tokens |
| useTranslation | @/hooks/useTranslation | i18n |
| ScreenErrorBoundary | @/components/ui/ScreenErrorBoundary | Error boundary |
| useContextualHaptic | @/hooks/useContextualHaptic | Haptic feedback |
| useThemeColors | @/hooks/useThemeColors | Theme colors |
| showToast | @/components/ui/Toast | Toast notifications |
| MusicPicker | @/components/story/MusicPicker | Music selection |
| uploadApi | @/services/api | Presigned URL upload |
| AudioTrack | @/types | Type for music track |
| executeExport, cancelExport, isFFmpegAvailable, EditParams | @/services/ffmpegEngine | FFmpeg engine |
| Speech | expo-speech | TTS preview |
| EmojiPicker | @/components/ui/EmojiPicker | Emoji selection |

### ffmpegEngine.ts Imports
| Import | From | Purpose |
|--------|------|---------|
| FileSystem | expo-file-system | Cache directory path, file deletion |
| ffmpeg-kit-react-native | (dynamic import) | FFmpegKit, FFprobeKit |

---

## 27. Route Parameters

```typescript
useLocalSearchParams<{
  videoUri?: string;    // Primary video URI
  uri?: string;         // Alternate video URI param
  returnTo?: string;    // Route to navigate to after export with exported URI
}>()
```

- `videoUri || uri || null` — fallback chain
- `returnTo` used by create-reel to receive edited video back

---

## 28. Haptic Usage

| Action | Haptic Type |
|--------|------------|
| Toggle playback | `haptic.navigate()` |
| Speed change | `haptic.tick()` |
| Filter select | (via pushUndo) |
| Adjust presets | `haptic.tick()` |
| Text timing set | `haptic.tick()` |
| Voice effect select | `haptic.tick()` |
| Visual effect toggle | `haptic.tick()` |
| Export start | `haptic.send()` |
| Cancel export | `haptic.delete()` |
| Split at playhead | `haptic.tick()` |
| Reset trim | `haptic.delete()` |
| Undo/redo | `haptic.tick()` |
| Reverse toggle | `haptic.tick()` |
| Aspect ratio cycle | `haptic.tick()` |
| Voiceover record | `haptic.tick()` |
| Delete voiceover | `haptic.delete()` |
| Emoji select | `haptic.tick()` |
| Music select | `haptic.tick()` |

---

## 29. Style Architecture

- **Total styles:** ~120 style definitions in `createStyles(tc)`
- **Theme-aware:** Uses `tc` (ThemeColors) for backgrounds, borders, text colors
- **Layout pattern:** Full-screen SafeAreaView with ScrollView content, absolute-positioned bottom bar
- **Gradient usage:** LinearGradient on every interactive element (buttons, cards, panels)
- **Active states:** Emerald-tinted gradients (`rgba(10,123,79,0.4/0.2)`) for selected items
- **Glassmorphism:** Glass-style header, gradient overlays, border with white6 opacity
- **Grid patterns:** 3-column filter grid, flex-wrap effects grid, horizontal scroll for effects/curves
- **Responsive:** `screenWidth` and `screenHeight` from Dimensions for preview area and filter column width
