# Content Licensing Strategy — What's Legal, What's Not, What to Do

> Created: March 30, 2026
> Status: Research complete, strategy decided
> Priority: Must understand before launch — wrong move = lawsuit

---

## Summary

Mizanly uses music, GIFs, fonts, and user-generated content. Each has different licensing rules. The strategy: **launch with what's free and legal, add licensed catalogs post-revenue, negotiate major label deals at scale.**

Instagram didn't have music in stories until 2018 — 8 years after launch, 1 billion users. Don't let licensing block launch.

---

## Music Licensing

### How Instagram/TikTok Do It
Meta and ByteDance pay **hundreds of millions per year** in licensing deals with Universal Music Group, Sony Music, and Warner Music. Multi-year contracts negotiated by legal teams. These cover:
- Personal/creator accounts: full catalog (pop, hip-hop, everything)
- Business accounts: restricted library (commercially-cleared only)
- Reels/Stories: 15-90 second clips, not full songs

**Mizanly cannot replicate this at launch.** Major labels won't negotiate with apps under 10M MAU. Minimum guarantees start at $5M+/yr.

### Tier 1: Launch (Free, Zero Licensing Risk)

| Source | Tracks | License | Cost | Integration |
|--------|--------|---------|------|-------------|
| Royalty-free libraries (Pixabay, FMA, CC0) | 15,000+ | Creative Commons / CC0 | Free | Curate + host on R2 |
| User-uploaded audio | Unlimited | User owns, user's responsibility | Free | Already built (audio recording) |
| Nasheed partnerships | 500+ | Direct partnership with artists | Free or revenue share | Reach out to artists/labels |
| Quran recitations | 100+ reciters | Public domain text, partner for recordings | Partnership | Quran.com API or direct |
| Islamic ambient / nature sounds | 200+ | CC0 or purchased | $0-500 one-time | Curate library |

**Nasheed partnerships are the unique play.** There is no Muslim social platform offering distribution to nasheed artists today. Pitch: "Your music in our app, your profile verified, we send you listeners, you give us catalog access." Artists like Maher Zain, Sami Yusuf, Omar Esa, Siedd, or their labels would likely agree — it's free distribution to their exact audience.

**Quran recitations** are NOT copyrighted (the Quran text is public domain). Individual reciters' recordings may have copyright — partner with:
- Quran.com (already using their API for text)
- Individual reciters (many would welcome the reach)
- Tarteel AI (Quran recognition technology)

### Tier 2: Post-Revenue ($500-5,000/mo)

| Service | Catalog Size | What They Offer | Cost | Best For |
|---------|-------------|----------------|------|----------|
| **Epidemic Sound** | 40,000+ tracks | Pre-cleared for social, API integration, mood/genre search | $2,000-5,000/mo platform license | Best quality catalog |
| **Artlist** | 30,000+ tracks | One license covers all use cases, API available | $1,000-3,000/mo | Budget-friendly |
| **Soundstripe** | 20,000+ tracks | Business license, API integration | $500-2,000/mo | Cheapest entry |
| **Feed.fm** | Varies | SDK for apps, pre-cleared, handles royalty reporting | Custom (startup-friendly) | Purpose-built for apps |

Integrate via API → users search/preview/add to reel/story inside the app. Professional quality, not top 40 charts.

### Tier 3: Major Label Deals (50M+ Users)

| Label | Minimum MAU | Estimated Cost | Reality |
|-------|------------|---------------|---------|
| Merlin (indie labels) | 1M+ | $100K+/yr | Most startup-friendly, represents thousands of indies |
| Warner Music | 10M+ | $5M+/yr | Will talk at scale |
| Sony Music | 10M+ | $5M+/yr | Will talk at scale |
| Universal Music Group | 10M+ | $10M+/yr | Hardest to deal with |

Requirements for major deals:
- Legal team experienced in music licensing
- Royalty reporting infrastructure (per-play tracking, quarterly reports)
- Content ID / audio fingerprinting system
- Minimum guarantee (annual payment regardless of plays)
- 2+ years of negotiation timeline

### Music Licensing Risks to Avoid

| Risk | What Happens | How to Avoid |
|------|-------------|-------------|
| Users upload copyrighted songs | DMCA takedown, potential lawsuit | Audio fingerprinting (ACRCloud or Audible Magic) — check uploads against known catalog |
| Using "royalty-free" music that isn't actually free | License dispute | Only use CC0, verify license of every track in curated library |
| Nasheed artist revokes permission | Music suddenly unlicensed | Written agreement (even a simple email) before adding to library |
| Playing music in live streams | Performance rights issue | Live streams use only cleared library, not user uploads |
| Business accounts using music | Instagram restricts this, you should too | Consider similar personal vs business rules |

### Audio Fingerprinting (Content ID equivalent)

To catch copyrighted music in user uploads:
- **ACRCloud** — audio recognition API, identifies songs in seconds, free tier for startups
- **Audible Magic** — industry standard, used by YouTube/Meta
- **Custom pHash** — perceptual hash of audio waveform, compare against known catalog

Implement post-launch when user uploads reach volume where risk is real. Not needed at 1K users.

---

## GIF Licensing

| Provider | Status | License | Cost | Notes |
|----------|--------|---------|------|-------|
| **GIPHY** | Integrated (`giphyService.ts`, SDK configured) | Free for apps | $0 | GIPHY monetizes through branded GIFs, not API fees. PG-13 content filter enabled. |
| **Tenor** | Not integrated | Free for apps (Google-owned) | $0 | Alternative if GIPHY terms change |

**No licensing risk.** GIPHY SDK is free, integrated, and configured with content filtering.

---

## Font Licensing

All fonts currently used in Mizanly:

| Font | License | Commercial Use | Status |
|------|---------|---------------|--------|
| Outfit | SIL Open Font License 1.1 | Yes, free | Safe |
| DM Sans | SIL OFL 1.1 | Yes, free | Safe |
| Amiri | SIL OFL 1.1 | Yes, free | Safe |
| Playfair Display | SIL OFL 1.1 | Yes, free | Safe |
| Inter | SIL OFL 1.1 | Yes, free | Safe |
| Noto Naskh Arabic | SIL OFL 1.1 | Yes, free | Safe |

**Zero licensing risk.** All fonts are SIL Open Font License — free for commercial use, modification, and redistribution.

If adding fonts for Profile Theming (5 approved fonts), ensure all are SIL OFL or similarly permissive.

---

## Sticker & Emoji Licensing

| Content | Source | License | Risk |
|---------|--------|---------|------|
| App emoji (system) | iOS/Android native emoji | Platform-provided | Zero |
| Custom Islamic stickers | Created by Mizanly | Owned by Mizanly | Zero |
| GIPHY stickers | GIPHY SDK | Free for apps | Zero |
| User-created stickers | User uploads | User owns | Low (moderate for NSFW) |

**No licensing risk** if stickers are either system emoji, GIPHY (free), or original Mizanly designs.

---

## User-Generated Content (UGC) Licensing

### What Users Upload
- Photos, videos, text posts, voice messages, stories
- These remain the user's intellectual property
- Mizanly needs a **license to display, distribute, and store** their content (standard TOS clause)

### Required TOS Clause
```
By posting content on Mizanly, you grant Mizanly a non-exclusive, worldwide,
royalty-free license to use, display, reproduce, modify (for formatting/compression),
and distribute your content on the Mizanly platform. You retain all ownership rights.
You can delete your content at any time, which terminates this license
(except for copies already shared by other users).
```

This is standard — Instagram, TikTok, X all have identical clauses.

### UGC Copyright Issues
- **User uploads someone else's copyrighted content** → DMCA takedown process needed
- **User uploads CSAM** → immediate removal + NCMEC report (legal requirement)
- **User reposts/forwards copyrighted music in videos** → audio fingerprinting catches this

### DMCA Process (Required for US)
1. Copyright holder sends takedown notice (email or form)
2. Mizanly removes content within 24 hours
3. Notify uploader with counter-notice option
4. If counter-notice filed, restore after 14 days unless lawsuit
5. Repeat infringers: 3-strike account termination policy

**Must have a DMCA agent registered with US Copyright Office.** Cost: $6 filing fee. Required before launch if serving US users.

---

## Image Licensing

| Content | Source | Risk |
|---------|--------|------|
| User photos | User-uploaded, user's IP | Zero (covered by TOS) |
| Stock photos in app UI | None currently used | N/A |
| Blurhash placeholders | Algorithmically generated | Zero |
| App screenshots/marketing | Your own app | Zero |
| Islamic geometric patterns | Create original or use public domain | Low — verify source |

---

## Third-Party SDK Licensing

| SDK | License | Commercial OK | Notes |
|-----|---------|--------------|-------|
| React Native | MIT | Yes | Free |
| Expo | MIT | Yes | Free |
| LiveKit | Apache 2.0 | Yes | Free |
| @noble/* (crypto) | MIT | Yes | Cure53-audited |
| FFmpeg (video editor) | GPL | Yes, with conditions | Must use full-GPL build, app must comply with GPL (distribute source of FFmpeg modifications) |
| GIPHY SDK | Proprietary (free) | Yes | Free for apps, must show GIPHY attribution |
| Clerk | Proprietary (paid) | Yes | Covered by subscription |
| Stripe | Proprietary (free SDK) | Yes | Free SDK, pay per transaction |

**FFmpeg GPL note:** Using `ffmpeg-kit-react-native-full-gpl` means the FFmpeg binary is GPL-licensed. Your app code is NOT required to be GPL (FFmpeg runs as a separate process). But if you modify FFmpeg source code, you must make modifications available. Standard practice — TikTok, Instagram, and most video apps use FFmpeg.

---

## Implementation Checklist

### Before Launch
- [ ] Register DMCA agent with US Copyright Office ($6)
- [ ] Add music/content license clause to Terms of Service
- [ ] Add UGC license clause to Terms of Service
- [ ] Curate 500+ royalty-free tracks (CC0/Pixabay/FMA)
- [ ] Verify all font licenses are SIL OFL
- [ ] Add GIPHY attribution where required (SDK handles this)
- [ ] Document FFmpeg GPL compliance
- [ ] Contact 5-10 nasheed artists for partnership conversations
- [ ] Add "Report Copyright Violation" button in app

### Post-Launch (When Revenue Allows)
- [ ] Integrate Epidemic Sound or Artlist API ($2-5K/mo)
- [ ] Implement audio fingerprinting (ACRCloud) for upload scanning
- [ ] Negotiate Merlin (indie label) deal at 1M+ MAU
- [ ] Hire IP lawyer for ongoing licensing management

### At Scale (10M+ MAU)
- [ ] Negotiate major label deals (UMG, Sony, Warner)
- [ ] Build in-house Content ID system
- [ ] Establish music licensing legal team
- [ ] Annual royalty reporting infrastructure

---

## Key Decision

**Launch without licensed popular music.** Royalty-free + nasheeds + user sounds + Quran recitations is enough. Users don't come to a Muslim social app for Drake — they come for Islamic content, community, and features Instagram doesn't have. Add licensed music when revenue justifies $2-5K/mo for Epidemic Sound. Add major label music when scale justifies $5M+/yr.

This is not a compromise — this is strategy. Instagram, TikTok, and Snapchat all launched without music features and added them years later.
