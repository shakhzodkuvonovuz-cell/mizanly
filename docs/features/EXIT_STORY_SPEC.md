# Exit Story — Design Spec

> Created: March 21, 2026  
> Status: Design finalized, ready for implementation  
> Prototype: `design-samples/exit-story-v2.jsx`

---

## Concept

After a user imports their data from Instagram/TikTok/X, Mizanly generates a personalized story image that the user can optionally share on their old platform to announce their move. The story is designed to feel like something the user wrote themselves — not an ad.

## Technical Approach

We **cannot** auto-post to Instagram/TikTok stories via API (Instagram Graph API doesn't support story publishing for personal accounts; TikTok has no story API at all).

Instead:
1. Mizanly generates a story image (rendered server-side or via canvas on client)
2. Presents it with a "Share your move" screen
3. User taps "Share" → OS share sheet opens → Instagram/TikTok story composer loads with the image pre-loaded
4. User posts with one tap from the native app

This is more effective than auto-posting because it feels intentional, doesn't violate any ToS, and looks organic to followers.

---

## Final Wording Decisions

### Lead Line
> **"I found where I actually want to be online."**

Why: Sounds like something a real person would say. Not a tagline. Implies "this is better" without saying anything negative about the old platform. Creates curiosity.

### 5-in-1 Concept
> **Not mentioned explicitly.**

Why: "5 spaces" means nothing to a viewer. The lead line already implies "I found THE place" — the viewer's curiosity drives the tap. No feature list needed.

### Islamic Identity
> **"Designed with our values in mind."**

Why: Secondary to the main pitch. Sits under the Mizanly name in the app card. "Our values" resonates with the Muslim audience without being exclusionary. Doesn't lead with religion — leads with the personal experience.

### What the Story Does NOT Include
- ✕ No feature list ("Quran rooms, prayer times..." — this is a story, not a spec sheet)
- ✕ No negativity about the old platform ("Instagram is toxic" — this isn't a breakup post)
- ✕ No QR code (ugly and unnecessary when you have a short URL)
- ✕ No "download now" language (the CTA is just the URL, not a command)
- ✕ No pricing or subscription mention (this is a vibe, not a sales page)
- ✕ No "5 spaces" or technical terminology (viewers don't know what that means)

---

## Story Anatomy (5 Layers)

Every template follows this structure:

| Layer | Content | Purpose |
|-------|---------|---------|
| **1. Platform badge** | "Leaving Instagram" | Tiny, top corner. Sets context instantly. |
| **2. Lead line** | "I found where I actually want to be online." | The hook. Feels personal, not promotional. |
| **3. Personal proof** | "3 years and 487 posts later — I'm moving everything to one place." | AI fills from import data. Proves commitment. |
| **4. Mizanly card** | Logo + name + "Designed with our values in mind." | One sentence. No feature dump. |
| **5. Single CTA** | `mizanly.app` + App Store / Google Play | Universal link that auto-routes to the right store. |

---

## Three Templates

### Template 1: "The Reflective"
- **Aesthetic**: Dark background, serif lead line, emerald glow, warm
- **Best for**: Most users. Feels like a journal entry.
- **Key visual**: User avatar, subtle geometric pattern overlay, gold divider

### Template 2: "The Bold"  
- **Aesthetic**: Black background, heavy sans-serif typography, high contrast
- **Best for**: Power users with impressive numbers (2,000+ posts, 5+ years)
- **Key visual**: Line-broken hero text with "online." in emerald, compact stats pill (487 posts / 3 years / 1 new home)

### Template 3: "The Light"
- **Aesthetic**: Cream (#FEFCF7) background, clean serif, minimal
- **Best for**: Users with curated/minimal aesthetic accounts
- **Key visual**: Small gold accent line, lots of whitespace, subtle dot pattern

---

## Personalization (AI-Generated)

The personal proof line is generated from import analysis:

**Inputs available from import:**
- Total posts/reels/threads imported
- Years active (first post date → now)
- Top content themes (from hashtag analysis)
- Source platform

**Example outputs:**
- "After 3 years and 487 posts sharing my calligraphy journey here, I'm moving everything to one place."
- "6 years. 2,340 posts. Every memory, now in one place."
- "3 years of sharing recipes, faith reflections, and daily life — all coming with me."

**AI prompt for generation:**
```
Write a single sentence (max 25 words) for a social media story. 
The user is leaving {platform} after {years} years and {posts} posts.
Their top content themes were: {themes}.
Tone: personal, warm, forward-looking. NOT negative about the old platform.
Do not mention Mizanly by name — that comes later in the story.
```

---

## User Flow

```
Import completes successfully
         ↓
Screen: "487 posts imported successfully! Your memories are safe."
         ↓
Screen: "Want to let your followers know where to find you?"
         [Share my move]  [Skip]     ← Skip is prominent, no pressure
         ↓ (if Share)
Screen: Choose template (3 options shown as story previews)
         AI pre-fills personal message from import analysis
         User can edit the message text
         ↓
Screen: Full-screen preview with "Edit" and "Share" buttons
         ↓ (Share)
OS share sheet opens → select Instagram/TikTok → story composer loads
         ↓
User posts with one tap from native app
```

---

## Implementation Notes

### Image Generation
Two approaches:
1. **Client-side**: Render the template as a React Native view → capture with `react-native-view-shot` → save to camera roll → open share sheet
2. **Server-side**: Render with Puppeteer/Sharp → return image URL → client downloads and shares

Recommend **client-side** for v1 (simpler, no server dependency, faster iteration on templates).

### Deep Link in Story
The `mizanly.app` URL should:
- On iOS: Redirect to App Store if app not installed, open app if installed (Universal Links)
- On Android: Redirect to Play Store if not installed, open app if installed (App Links)  
- On desktop: Show landing page with download buttons

### Analytics
Track:
- `exit_story_shown` — how many users see the prompt
- `exit_story_skipped` — how many skip
- `exit_story_template_selected` — which template is most popular
- `exit_story_shared` — how many actually share (cannot track if they posted, only if they opened share sheet)
- `exit_story_edited` — how many edit the AI message

---

## Design Files

- `design-samples/exit-story-v2.jsx` — Interactive React prototype with all 3 templates
- Switch between Instagram/TikTok/X modes
- Shows story anatomy breakdown
