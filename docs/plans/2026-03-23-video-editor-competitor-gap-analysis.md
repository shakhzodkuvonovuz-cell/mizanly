# Video Editor — Competitor Gap Analysis

**Date:** 2026-03-23
**Sources:** TikTok, Instagram Reels, YouTube Shorts, YouTube Studio, CapCut

## What Mizanly Has (13 features)

| Feature | Status |
|---------|--------|
| Trim with gesture handles | Done |
| Split at playhead | Done |
| Speed control (0.25x–3x) | Done |
| 13 color filters (incl. emerald/golden/night/soft/cinematic) | Done |
| Text overlay with font/color | Done |
| Music picker (genre search, preview, 449-line component) | Done |
| Volume sliders (original + music) | Done |
| Voiceover recording | Done |
| Quality presets (720p/1080p/4K) | Done |
| FFmpeg export with progress + cancel | Done |
| Caption editor (SRT, Whisper auto-generate) — separate screen | Done |
| Export return to caller (returnTo param) | Done |
| Wired into both create-reel + create-video | Done |

## Table Stakes Missing (TikTok/Instagram minimum — P0)

| Feature | TikTok | Instagram | Impact | Effort |
|---------|--------|-----------|--------|--------|
| Text timing (appear/disappear) | Yes | Yes | HIGH | Medium |
| Multi-clip recording | Yes | Yes | HIGH | High |
| Auto-captions button in editor | Yes | Yes | HIGH | Low (link to caption-editor) |
| Countdown timer for recording | Yes | Yes | MEDIUM | Low |
| Sticker overlays | Yes | Yes | MEDIUM | Medium |
| Voice effects/changer | Yes | No | MEDIUM | Medium (FFmpeg) |
| Text-to-speech | Yes | No | MEDIUM | Medium (API) |
| Transitions between clips | Minimal | None | LOW | High |

## High-Impact CapCut Features (P1 — differentiation)

| Feature | CapCut | YouTube Shorts | Effort |
|---------|--------|----------------|--------|
| Auto-captions inline (not separate screen) | Yes | Yes (Expressive) | Medium |
| Background removal (AI) | Yes | Yes (Green Screen) | High (needs ML) |
| Noise reduction | Yes | Yes (Enhance Speech) | Medium (FFmpeg) |
| Beat sync (auto-detect music beats) | Yes | Yes (AI sync) | High |
| Aspect ratio selector | Yes (all ratios) | Fixed 9:16 | Low |
| Undo/redo | Yes (unlimited) | No | Low |
| Reverse clip | Yes | No | Low (FFmpeg) |
| Freeze frame | Yes | No | Low (FFmpeg) |
| Video stabilization | Yes | No | Medium (FFmpeg vidstab) |

## YouTube-Specific (Minbar Space — P1)

| Feature | YouTube Studio | YouTube Shorts | Our Status |
|---------|---------------|----------------|------------|
| End screen editor | Yes | No | Missing |
| Chapter markers | Yes | No | Missing |
| Subtitle track editor | Yes (manual + auto) | Yes | Done (caption-editor) |
| Blur faces/regions | Yes (auto-detect) | No | Missing |
| Thumbnail editor | No (just pick) | No | Partial (filmstrip) |
| Schedule premiere | Yes | No | Done (video-premiere.tsx) |
| Analytics in editor | No | No | Missing |

## Build Priority (Session 3 Continuation)

### Now (Low Effort, High Impact)
1. Undo/redo stack
2. Aspect ratio selector (9:16, 16:9, 1:1, 4:5)
3. Reverse clip (FFmpeg: `-vf reverse -af areverse`)
4. Auto-captions button linking to caption-editor
5. Freeze frame at playhead

### Next Session
6. Text timing (appear/disappear on timeline)
7. Voice effects via FFmpeg (robot, echo, deep, chipmunk)
8. Noise reduction (`-af "arnndn"` or `highpass/lowpass`)
9. Video stabilization (FFmpeg `vidstab` — we have full-gpl)
10. Sticker overlay system

### Month 2+
11. Multi-clip recording + timeline
12. Beat sync with music
13. Transitions library
14. Background removal (needs TFLite/ML model)
15. Speed curves (custom bezier)
