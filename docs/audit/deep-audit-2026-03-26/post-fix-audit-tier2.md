# Post-Fix Deep Audit: Tier 2 (8 Fixes)

## 1 Critical, 8 Important, 4 Suggestions

### CRITICAL

**C1: CoinTransaction DELETED despite being a financial record**
- privacy.service.ts:490 — `tx.coinTransaction.deleteMany({ where: { userId } })`
- CoinTransaction documents purchase, gift, tip, cashout history — needed for tax/audit
- Schema has onDelete: Cascade (userId not nullable) so SetNull not possible without migration
- **FIX NEEDED:** Remove the deleteMany call. Leave CoinTransaction records intact (they reference userId which gets anonymized).

### IMPORTANT

**I1: Export doesn't indicate truncation (GDPR compliance gap)**
- 10,000 cap applied but no `truncated: true` or `totalCount` in response
- User with 50K posts gets 10K with no indication 40K were omitted

**I2: Export missing ~10 data categories**
- VoicePost, HifzProgress, HajjProgress, ForumThread, ForumReply, ScholarQuestion, ChannelPost, DuaBookmark, BusinessReview, HalalRestaurantReview

**I3: processExpiredMessages — no error handling + metadata not cleared**
- No try/catch. fileName, voiceDuration, transcription fields left intact.
- R2 media for expired messages not deleted (storage leak)

**I4: R2 media collection missing fields**
- Missing: Reel.carouselUrls[], Reel.hlsUrl, Reel.dashUrl, VoicePost.audioUrl, Message.mediaUrl (before anonymization)
- These files orphaned in R2 forever

**I5: SSRF DNS TOCTOU (inherent limitation)**
- DNS resolved once, checked, then fetch resolves again internally
- DNS rebinding could return different IP on second resolution
- Known limitation of DNS-based SSRF prevention — acceptable

**I6: No batch concurrency limit on R2 deletes**
- User with 10K posts × 5 media = 50K concurrent delete requests via Promise.allSettled
- Should batch in chunks of 50

### VERIFIED CORRECT
- Fix 2.1 unified deletion: ~70 tables, proper financial preservation, idempotent ✓
- Fix 2.2 R2 extraction: URL parsing correct, trailing slash handled ✓
- Fix 2.4 EXIF: All 30 picker calls covered (cosmetic fix — acknowledged) ✓
- Fix 2.6 message anonymization: All PII fields cleared ✓
- Fix 2.8 SSRF: Excellent CIDR coverage, fail-closed, redirect validation ✓
