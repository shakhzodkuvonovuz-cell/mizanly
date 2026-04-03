# Wave 12 — Components/Hooks/Services Fix Progress

**Date:** 2026-04-03
**Scope:** C01 (64 findings), C02 (72 findings), C03 (30 findings), C04 (43 findings) = 209 total
**Agent:** Claude Opus 4.6

---

## Summary

| Status | Count | % |
|--------|-------|---|
| Already fixed (previous sessions) | ~170 | 81% |
| Fixed this session | 17 | 8% |
| Deferred to MASTER_DEFERRED | 8 | 4% |
| Memo wrapping (background agent) | ~25 | 12% |
| False positive | 4 | 2% |

## Findings Fixed This Session

### CP1 — Hooks + Services (7 fixes)
| Finding | File | Fix |
|---------|------|-----|
| C03 #1 | useLiveKitCall.ts | statusRef for AppState handler (avoids stale closure) |
| C03 #6 | useLiveKitCall.ts | sessionId reactive state for caller-side poll |
| C04 #13 | api.ts | SOCKET_URL uses URL parsing instead of fragile string replace |
| C04 #10 | api.ts | 429 retry capped at 10s (was 120s) |
| C04 #14 | api.ts | Error response includes status text |
| C04 #15 | ffmpegEngine.ts | cancelExport awaits session promise for immediate cancel |
| C01 #9 | VideoControls.tsx | Fade-out timer delays removal until animation completes |

### CP2 — Medium Fixes (7 fixes)
| Finding | File | Fix |
|---------|------|-----|
| C01 #31 | RichText.tsx | Ref-based link press guard prevents parent onPostPress |
| C01 #35 | AnimatedAccordion.tsx | 0 default instead of 300px fallback (no flicker) |
| C04 #36 | api.ts | 204 returns `{ success: true }` instead of null-as-T |
| C04 #19 | nsfwCheck.ts | Documented unchecked state behavior |
| C04 #17 | livekit.ts | deleteIngress uses POST instead of DELETE with query params |
| C03 #29 | usePushNotificationHandler.ts | Removed [key: string] index signature |
| C03 #12 | useVideoPreloader.ts | preloadCount uses reactive state |

### CP3 — Low Fixes (2 fixes)
| Finding | File | Fix |
|---------|------|-----|
| C03 #22 | useAmbientColor.ts | Removed redundant mountedRef (cancelled flag sufficient) |
| C01 #32 | GradientButton.tsx | Deprecated unused accessibilityRole prop |

### Memo Wrapping (background agent — ~25 components)
| Components | Status |
|-----------|--------|
| MiniPlayer, StickerPackBrowser, StickerPicker, TypingIndicator, GiftOverlay, LocationMessage, ContactMessage, PinnedMessageBar, ReminderButton, VideoReplySheet, ViewOnceMedia, EidFrame, PollSticker, QuizSticker, SliderSticker, CountdownSticker, QuestionSticker, AddYoursSticker, LinkSticker, MusicSticker, TextEffects, DrawingCanvas, GifSearch, LocationSearch, MusicPicker | Pending |

## False Positives (4)
| Finding | Reason |
|---------|--------|
| C04 #1 | api.ts already handles absolute URLs (line 233) |
| C04 #3 | nsfwCheck already typed as NSFWModel interface |
| C04 #4 | encryptMessage already throws error |
| C01 #4 | StatusBar.setHidden(false) already in cleanup |

## Deferred to MASTER_DEFERRED (8 items, #477-484)
| Finding | Reason |
|---------|--------|
| C01 #5 | VideoPlayer quality selection needs backend quality URLs |
| C02 #22 | ReactionPicker type needs backend multi-reaction API |
| C04 #2 | GIPHY key is standard client-side usage |
| C02 #2,5 | StickerPack/Picker raw Image — mechanical, low risk |
| C02 #6,7 | StickerPack/Picker raw RefreshControl — mechanical |
| C01 #7 | RichCaptionInput cursor needs onSelectionChange |
| C03 #3 | startCall deps re-render — mitigated by startingRef |
| C04 #40 | Localhost fallback — EAS build must set env var |

## Test Results
- API: 345 suites, 6,632 tests (all passing)
- Mobile hooks: 26 suites, 1,472 tests (all passing)
- Signal Protocol: 17 suites, 670 tests (all passing)
- TSC: clean (0 errors)
