# Mobile Architecture — Profile, Settings & Account Screens

> Extracted 2026-03-25 by architecture agent. Covers all profile display, edit, settings, and account management screens.

---

## File Inventory

| File | Lines | Purpose |
|------|-------|---------|
| `app/(screens)/profile/[username].tsx` | 1,193 | User profile display with tabs, parallax, follow, block, mute |
| `app/(screens)/edit-profile.tsx` | 812 | Edit profile form (avatar, cover, bio, links, privacy) |
| `app/(screens)/settings.tsx` | 1,531 | Master settings hub — 14 section categories, 70+ rows, search |
| `app/(screens)/account-settings.tsx` | 489 | Account info, data export, cache clear, deactivate, delete |
| `app/(screens)/followers/[userId].tsx` | 217 | Followers list with follow/unfollow per user |
| `app/(screens)/following/[userId].tsx` | 217 | Following list with follow/unfollow per user |
| `app/(screens)/theme-settings.tsx` | 408 | Dark/Light/System theme picker with preview swatches |
| `app/(screens)/content-settings.tsx` | 521 | Feed preferences, content filters, blocked keywords, daily reminder |
| `app/(screens)/parental-controls.tsx` | 859 | PIN-gated parental controls with child cards, age rating, DM restriction, activity digest |
| `app/(screens)/profile-customization.tsx` | 699 | Gamification profile customization (accent color, layout, font, badges, background, music) |
| `app/(screens)/close-friends.tsx` | 494 | Close friends circle management with search, toggle per follower |
| `app/(screens)/blocked.tsx` | 215 | Blocked users list with unblock action |
| `app/(screens)/muted.tsx` | 211 | Muted users list with unmute action |

**Total: 7,866 lines across 13 files**

---

## 1. Profile Screen (`profile/[username].tsx` — 1,193 lines)

### Route & Params
- Route: `/(screens)/profile/[username]`
- Param: `username` (string) from `useLocalSearchParams`
- Own profile detection: `clerkUser?.username === username`

### API Calls (10 queries + 3 mutations)

| Query Key | API Call | Condition |
|-----------|----------|-----------|
| `['profile', username]` | `usersApi.getProfile(username)` | Always |
| `['mutual-followers', username]` | `usersApi.getMutualFollowers(username)` | Not own profile |
| `['user-posts', username]` | `usersApi.getUserPosts(username, cursor)` | `activeTab === 'posts'` |
| `['user-threads', username]` | `usersApi.getUserThreads(username, cursor)` | `activeTab === 'threads'` |
| `['user-reels', username]` | `reelsApi.getUserReels(username, cursor)` | `activeTab === 'reels'` |
| `['liked-posts', username]` | `usersApi.getLikedPosts(cursor)` | Own profile + `activeTab === 'liked'` |
| `['pinned-threads', username]` | `usersApi.getUserThreads(username)` filtered `.isPinned` | Profile loaded |
| `['highlights', profile.id]` | `storiesApi.getHighlights(profile.id)` | Profile loaded |

| Mutation | API Call | Optimistic Update |
|----------|----------|-------------------|
| `followMutation` | `followsApi.follow(id)` / `followsApi.unfollow(id)` | Yes — updates `isFollowing` + `followersCount` in query cache |
| `blockMutation` | `blocksApi.block(id)` | No — navigates back on success |
| `muteMutation` | `mutesApi.mute(id)` | No — shows toast |

### Profile Tabs (4 for own, 3 for others)

| Tab Key | Content | View Mode | Columns |
|---------|---------|-----------|---------|
| `posts` | User's posts | Grid (3-col) or List (PostCard) | Toggleable |
| `threads` | User's threads | List only | 1 |
| `reels` | User's reels | Grid (3-col) | 3 |
| `liked` | Own liked posts (own profile only) | Grid or List | Toggleable |

- Tab component: `<TabSelector>` with `onTabChange` + haptic tick
- View toggle: grid/list icon button for posts/liked tabs
- Sticky tabs: `useAnimatedScrollHandler` tracks scroll position, shows fixed `<TabSelector>` when original tabs scroll out of view

### State Management
```
activeTab: 'posts' | 'threads' | 'reels' | 'liked'
postViewMode: 'grid' | 'list'
showMenu: boolean (BottomSheet for block/mute/report)
showShareSheet: boolean (BottomSheet for share/QR)
loadingHighlightId: string | null
```

### UI Architecture
- **Parallax cover**: `useAnimatedScrollHandler` + `interpolate` on `scrollY` for cover translateY + scale
- **Avatar row**: Emerald ring border (`borderColor: colors.emerald`), positioned -40px overlap
- **Stats card**: Followers / Following / Posts with `formatCount()`, tappable to navigate
- **Mutual followers**: Stacked avatars (up to 3) with -10px overlap, navigates to `mutual-followers` screen
- **Pinned threads**: Horizontal `ScrollView`, max 3, with bookmark badge
- **Story highlights**: Horizontal `ScrollView`, emerald ring, tap loads album via `storiesApi.getHighlightById`
- **Grid items**: `memo`-ized `GridItem` + `ReelGridItem` components with spring press animation

### Header Actions (own profile)
- Back, Share, Saved, Archive, Settings

### Header Actions (other profile)
- Back, Share, More (opens BottomSheet)

### BottomSheet Menus
1. **Profile menu** (other users): Send Tip, Mute, Block, Report
2. **Share sheet**: Share Profile (via `Share.share`), QR Code

### Report Flow
- `Alert.alert` with 3 options: Spam, Impersonation, Inappropriate
- Calls `usersApi.report(profileId, reason)`

### RTL Support
- Uses `rtlFlexRow`, `rtlTextAlign`, `rtlArrow`, `rtlMargin` utilities throughout
- Cover, avatar row, stats, name section, mutual followers — all RTL-aware

### Skeleton Loading
- `<Skeleton.ProfileHeader />` for initial load
- `<Skeleton.ThreadCard />` for threads tab loading
- 9-cell `<Skeleton.Rect>` grid for posts tab loading

---

## 2. Edit Profile Screen (`edit-profile.tsx` — 812 lines)

### Route
- Route: `/(screens)/edit-profile`

### API Calls (3 queries + 3 mutations)

| Query Key | API Call |
|-----------|----------|
| `['me']` | `usersApi.getMe()` |
| `['profile-links']` | `profileLinksApi.getLinks()` |

| Mutation | API Call |
|----------|----------|
| `saveMutation` | Uploads avatar/cover to R2 via `uploadApi.getPresignUrl`, then `usersApi.updateMe(payload)` |
| `addLinkMutation` | `profileLinksApi.create({ title, url })` |
| `deleteLinkMutation` | `profileLinksApi.delete(id)` |

### Edit Fields

| Field | Type | Max Length | Notes |
|-------|------|-----------|-------|
| `displayName` | TextInput | 50 | Icon: user (emerald) |
| Username | Read-only text | — | Displayed as `@username`, grayed out card |
| `bio` | TextInput multiline | 150 | `<CharCountRing>` indicator |
| `website` | TextInput (url keyboard) | 100 | Icon: globe (gold) |
| `location` | TextInput | 100 | Icon: map-pin (emerald), inline icon |
| `isPrivate` | Custom toggle | — | Emerald gradient toggle |
| Pronouns/Birthday | — | — | Commented out — "not supported by backend DTO/schema yet" |

### Profile Links Section
- Max 5 links
- Display: glassmorphism cards with link icon, title, URL, delete (x) button
- Add form: title + URL inputs, cancel + save actions
- Dashed border "Add Link" button when < 5 links

### Image Upload Flow
1. `ImagePicker.launchImageLibraryAsync` (avatar: 1:1, cover: 3:1)
2. `uploadApi.getPresignUrl(contentType, folder)` — folder is 'avatars' or 'covers'
3. `fetch(uri)` → blob → `fetch(uploadUrl, PUT, blob)`
4. Returns `publicUrl` included in save payload

### UpdateProfilePayload Type
```ts
{
  displayName?: string;
  bio?: string;
  website?: string;
  location?: string;
  isPrivate?: boolean;
  avatarUrl?: string;
  coverUrl?: string;
}
```

### UI Design
- **GlassHeader** with X close + GradientButton save overlay
- **Cover photo**: ProgressiveImage with gradient overlay, or emerald-gold gradient placeholder with camera icon
- **Avatar**: Overlaps cover by -40px, emerald gradient camera edit badge
- **Form cards**: `LinearGradient` glassmorphism cards (`rgba(45,53,72,0.35)` → `rgba(28,35,51,0.2)`)
- **Focus state**: Input text turns emerald when focused
- **Entry animations**: `FadeInUp` with staggered delays (100ms, 200ms)
- **Refresh**: `<BrandedRefreshControl>` on ScrollView

---

## 3. Settings Screen (`settings.tsx` — 1,531 lines)

### Route
- Route: `/(screens)/settings`

### API Calls

| Query Key | API Call |
|-----------|----------|
| `['settings']` | `settingsApi.get()` |

| Mutation | API Call |
|----------|----------|
| `privacyMutation` | `settingsApi.updatePrivacy({ isPrivate })` |
| `notifMutation` | `settingsApi.updateNotifications({ ... })` |
| `accessibilityMutation` | `settingsApi.updateAccessibility({ reducedMotion })` |
| `wellbeingMutation` | `settingsApi.updateWellbeing({ sensitiveContent })` |
| `deactivateMutation` | `usersApi.deactivate()` → `signOut()` |
| `deleteAccountMutation` | `usersApi.deleteAccount()` → `signOut()` |

### Local State (mirrors fetched settings)
```
isPrivate: boolean
notifyLikes: boolean
notifyComments: boolean
notifyFollows: boolean
notifyMentions: boolean
notifyMessages: boolean
sensitiveContent: boolean
reducedMotion: boolean
readReceipts: boolean (AsyncStorage, not API)
searchQuery: string
```

### Settings Sections (14 categories, 70+ rows)

#### 1. Content (6 rows)
| Row | Icon | Navigation |
|-----|------|-----------|
| Content Preferences | settings (emerald) | `content-settings` |
| Drafts | clock (gold) | `drafts` |
| Archive | bookmark (emerald) | `archive` |
| Watch History | play (gold) | `watch-history` |
| Downloads | layers (emerald) | `downloads` |
| Nasheed Mode | mic (gold) | `nasheed-mode` |

#### 2. Appearance (2 rows)
| Row | Icon | Navigation |
|-----|------|-----------|
| Appearance | eye (emerald) | `theme-settings` |
| Saved | bookmark-filled (gold) | `saved` |

#### 3. Profile (1 row)
| Row | Icon | Navigation |
|-----|------|-----------|
| Share Profile | share (emerald) | `share-profile` |

#### 4. Privacy (6 rows)
| Row | Icon | Type |
|-----|------|------|
| Private Account | lock (emerald) | Toggle (`isPrivate`) |
| Follow Requests | users (gold) | Navigate → `follow-requests` |
| Blocked Keywords | slash (error) | Navigate → `blocked-keywords` |
| Biometric Lock | lock (emerald) | Navigate → `biometric-lock` |
| Parental Controls | users (gold) | Navigate → `parental-controls` |
| Read Receipts | check-check (emerald) | Toggle (AsyncStorage) |

#### 5. Notifications (6 rows)
| Row | Icon | Type |
|-----|------|------|
| Likes | heart (error) | Toggle (`notifyLikes`) |
| Comments | message-circle (emerald) | Toggle (`notifyComments`) |
| New Followers | user-plus (gold) | Toggle (`notifyFollows`) |
| Mentions | at-sign (emerald) | Toggle (`notifyMentions`) |
| Messages | mail (gold) | Toggle (`notifyMessages`) |
| Notification Tones | bell (emerald) | Navigate → `notification-tones` |

#### 6. Wellbeing (6 rows)
| Row | Icon | Navigation/Toggle |
|-----|------|-------------------|
| Filter Sensitive Content | eye-off (emerald) | Toggle (`sensitiveContent`) |
| Quiet Mode | volume-x (emerald) | Navigate → `quiet-mode` |
| Screen Time | clock (gold) | Navigate → `screen-time` |
| Nasheed Mode | volume-x (gold) | Navigate → `nasheed-mode` |
| Content Filter | filter (emerald) | Navigate → `content-filter-settings` |
| Auto Play Settings | play (emerald) | Navigate → `media-settings` |

#### 7. Islamic (21 rows)
| Row | Icon | Navigation |
|-----|------|-----------|
| Prayer Times | clock (emerald) | `prayer-times` |
| Qibla | map-pin (gold) | `qibla-compass` |
| Hijri Calendar | calendar (emerald) | `islamic-calendar` |
| Dhikr | heart (gold) | `dhikr-counter` |
| Quran Plan | bookmark (emerald) | `quran-reading-plan` |
| Hadith | bookmark (gold) | `hadith` |
| Mosque Finder | map-pin (emerald) | `mosque-finder` |
| Hajj Companion | globe (gold) | `hajj-companion` |
| Zakat Calculator | heart (emerald) | `zakat-calculator` |
| Eid Cards | smile (gold) | `eid-cards` |
| Scholar Verification | check-circle (emerald) | `scholar-verification` |
| Quran Room | bookmark (gold) | `quran-room` |
| Charity Campaign | heart (emerald) | `charity-campaign` |
| Ramadan Mode | globe (gold) | `ramadan-mode` |
| Dua Collection | heart (emerald) | `dua-collection` |
| Fasting Tracker | clock (gold) | `fasting-tracker` |
| Halal Finder | map-pin (emerald) | `halal-finder` |
| Hifz Tracker | layers (gold) | `hifz-tracker` |
| Morning Briefing | bell (emerald) | `morning-briefing` |
| Names of Allah | globe (gold) | `names-of-allah` |
| Wind Down | volume-x (emerald) | `wind-down` |

#### 8. Accessibility (1 row)
| Row | Icon | Type |
|-----|------|------|
| Reduce Motion | clock (gold) | Toggle (`reducedMotion`) |

#### 9. Blocked & Muted (5 rows)
| Row | Icon | Navigation |
|-----|------|-----------|
| Blocked Accounts | x (error) | `blocked` |
| Muted Accounts | volume-x (tertiary) | `muted` |
| Restricted Accounts | eye-off (tertiary) | `restricted` |
| Collab Requests | users (gold) | `collab-requests` |
| Appeal Moderation | flag (secondary) | `appeal-moderation` |

#### 10. Close Friends (1 row)
| Row | Icon | Navigation |
|-----|------|-----------|
| Circles | users (emerald) | `circles` |

#### 11. AI (2 rows)
| Row | Icon | Navigation |
|-----|------|-----------|
| AI Assistant | loader (emerald) | `ai-assistant` |
| AI Avatar | user (gold) | `ai-avatar` |

#### 12. Creator (8 rows)
| Row | Icon | Navigation |
|-----|------|-----------|
| Analytics | bar-chart-2 (gold) | `analytics` |
| Broadcast Channels | radio (emerald) | `broadcast-channels` |
| My Reports | flag (error) | `my-reports` |
| Creator Dashboard | bar-chart-2 (emerald) | `creator-dashboard` |
| Revenue | trending-up (gold) | `revenue` |
| Creator Storefront | briefcase (emerald) | `creator-storefront` |
| Enable Tips | heart (gold) | `enable-tips` |
| Membership Tiers | users (emerald) | `membership-tiers` |

#### 13. Community (10 rows)
| Row | Icon | Navigation |
|-----|------|-----------|
| Local Boards | map-pin (emerald) | `local-boards` |
| Mentorship | users (gold) | `mentorship` |
| Fatwa Q&A | alert-circle (emerald) | `fatwa-qa` |
| Waqf Endowments | heart (gold) | `waqf` |
| Watch Parties | play (emerald) | `watch-party` |
| Voice Post | mic (gold) | `voice-post-create` |
| Volunteer Board | heart (emerald) | `volunteer-board` |
| Events | calendar (gold) | `create-event` |
| Gift Shop | heart (emerald) | `gift-shop` |
| Followed Topics | hash (gold) | `followed-topics` |

#### 14. Gamification (6 rows)
| Row | Icon | Navigation |
|-----|------|-----------|
| Streaks | trending-up (emerald) | `streaks` |
| Achievements | check-circle (gold) | `achievements` |
| Leaderboard | bar-chart-2 (emerald) | `leaderboard` |
| Challenges | flag (gold) | `challenges` |
| XP History | star (emerald) | `xp-history` |
| Profile Customization | user (gold) | `profile-customization` |

#### Account Section (11 rows)
| Row | Icon | Type |
|-----|------|------|
| Account | user (emerald) | Navigate → `account-settings` |
| Two-Factor | lock (gold) | Navigate → `2fa-setup` |
| Account Switcher | users (emerald) | Navigate → `account-switcher` |
| Contact Sync | phone (gold) | Navigate → `contact-sync` |
| Close Friends | heart (emerald) | Navigate → `close-friends` |
| Status Privacy | eye-off (gold) | Navigate → `status-privacy` |
| Disappearing Default | clock (emerald) | Navigate → `disappearing-default` |
| Storage Management | settings (emerald) | Navigate → `storage-management` |
| Manage Data | layers (gold) | Navigate → `manage-data` |
| Deactivate Account | x (error) | Destructive alert → `usersApi.deactivate()` |
| Delete Account | trash (error) | Double confirm alert → `usersApi.deleteAccount()` |

#### About Section (4 rows)
| Row | Icon | Action |
|-----|------|--------|
| Version | — | Shows "1.0.0" |
| Terms of Service | file-text (secondary) | `Linking.openURL('https://mizanly.app/terms')` |
| Privacy Policy | shield (secondary) | `Linking.openURL('https://mizanly.app/privacy')` |
| Licenses | layers (secondary) | `Linking.openURL('https://mizanly.app/licenses')` |

### Search Feature
- `searchQuery` state with `matchesSearch(label)` function
- Each section and row conditionally rendered based on search match
- Search bar: glass container with search icon, TextInput, clear button
- Case-insensitive match on row labels

### Custom Components (defined in file)
- `PremiumToggle`: Animated toggle with `useSharedValue`, `withSpring`, `withSequence` for thumb + scale
- `Row`: Icon gradient bg + label + hint + toggle/chevron/rightText
- `SectionHeader`: Gold icon badge + emerald→gold accent bar + uppercase label

### Entry Animations
- Staggered `FadeInUp` with springify, delays from 0ms to 900ms (60ms increments per section)

### Sign Out Flow
- `Alert.alert` confirmation
- Calls `storeLogout()` (Zustand), `queryClient.clear()`, `signOut()` (Clerk)

### Deactivate Flow
- `Alert.alert` → confirmation → `deactivateMutation.mutate()` → `signOut()`

### Delete Account Flow
- `Alert.alert` → second `Alert.alert` confirmation → `deleteAccountMutation.mutateAsync()` → `signOut()`

---

## 4. Account Settings (`account-settings.tsx` — 489 lines)

### Route
- Route: `/(screens)/account-settings`

### API Calls

| Query Key | API Call |
|-----------|----------|
| `['user', 'me']` | `usersApi.getMe()` |

| Mutation | API Call |
|----------|----------|
| `deactivateMutation` | `usersApi.deactivate()` → `signOut()` |
| `requestDeletionMutation` | `usersApi.requestAccountDeletion()` → `signOut()` |
| `exportDataMutation` | `usersApi.exportData()` → `Share.share()` |

### Sections (3)

1. **Account Info** (read-only)
   - Email (masked: `sh***@example.com`)
   - Phone (masked: `+1 2****5678`)
   - Joined date (formatted with `toLocaleDateString`)

2. **Data & Privacy**
   - Download My Data → export as text, shared via `Share.share`
   - Storage → shows cache size (`FileSystem.getInfoAsync`), clear cache option

3. **Account Actions**
   - Deactivate Account → double confirmation alert
   - Delete Account → double confirmation alert + biometric auth (`expo-local-authentication`)

### Data Export Format
- Text-based export (not JSON) with sections: Profile, Posts, Threads, Thread Replies, Comments, Reels, Videos, Stories, Messages (count only), Following, Bookmarks
- Max 50 items per section, truncated at 120 chars

### Cache Management
- `FileSystem.cacheDirectory` → `getInfoAsync` for size
- Clear: `FileSystem.deleteAsync(cacheDirectory, { idempotent: true })`

### Delete Account Security
- Double `Alert.alert` confirmation
- Biometric authentication via `expo-local-authentication` (dynamic import)
- Falls back to deletion without biometric if hardware unavailable

---

## 5. Followers Screen (`followers/[userId].tsx` — 217 lines)

### Route & Params
- Route: `/(screens)/followers/[userId]`
- Param: `userId` (string)

### API Calls

| Query | API Call |
|-------|----------|
| `['followers', userId]` | `followsApi.getFollowers(userId, cursor)` — `useInfiniteQuery` |

| Mutation | API Call |
|----------|----------|
| `followMutation` | `followsApi.follow(id)` / `followsApi.unfollow(id)` |

### UI Pattern
- `FlatList` with `UserRow` components
- Each row: `Avatar` (md) + name + `VerifiedBadge` + handle + `GradientButton` (Follow/Following)
- Following state: emerald gradient background, emerald ring on avatar, name turns emerald
- Skeleton: 8 rows with circle + rect placeholders
- Pagination: `onEndReachedThreshold={0.4}`, cursor-based
- Staggered entry: `FadeInUp.delay(index * 20).duration(300)`

---

## 6. Following Screen (`following/[userId].tsx` — 217 lines)

### Identical structure to Followers screen except:
- Query key: `['following', userId]`
- API: `followsApi.getFollowing(userId, cursor)`
- Title: `t('profile.following')`

---

## 7. Theme Settings (`theme-settings.tsx` — 408 lines)

### Route
- Route: `/(screens)/theme-settings`

### State Management
- Reads `theme` from Zustand store (`useStore`)
- Calls `setTheme(option)` on selection
- `useColorScheme()` for system theme detection

### Theme Options
| Value | Label | Icon |
|-------|-------|------|
| `dark` | Dark | moon |
| `light` | Light | sun |
| `system` | System | settings |

### UI Architecture
- **Preview card**: 4 color swatches showing effective theme colors (bg, bgElevated, bgCard, surface)
- **ThemeRadio**: Glassmorphism card with icon gradient bg, label, description, emerald→gold check icon
- **Swatches**: Gradient border (`emerald→gold`) around color preview squares
- **Note text**: Centered at bottom

### Loading
- 100ms delay before showing content (`isReady` state) to allow store hydration
- `ThemeSettingsSkeleton` component during loading

---

## 8. Content Settings (`content-settings.tsx` — 521 lines)

### Route
- Route: `/(screens)/content-settings`

### API Calls

| Query Key | API Call |
|-----------|----------|
| `['settings']` | `settingsApi.get()` |

| Mutation | API Call |
|----------|----------|
| `wellbeingMutation` | `settingsApi.updateWellbeing({ sensitiveContent })` |

### Sections (4)

1. **Feed Preferences**
   - Saf Default Feed: BottomSheet picker → Following / For You (Zustand store)
   - Majlis Default Feed: BottomSheet picker → For You / Following / Trending (Zustand store)

2. **Content Filters**
   - Filter Sensitive Content: Toggle → API mutation
   - Hide Reposted Content: Toggle (disabled, "Coming soon") — not persisted

3. **Blocked Keywords**
   - Navigate → `blocked-keywords` screen

4. **Digital Wellbeing**
   - Daily Reminder: BottomSheet picker → Off / 30min / 1h / 2h (AsyncStorage only, no backend)

### BottomSheets (3)
- Saf feed picker
- Majlis feed picker
- Daily reminder picker
- All use `<BottomSheet>` + `<BottomSheetItem>` with check icon for active option

---

## 9. Parental Controls (`parental-controls.tsx` — 859 lines)

### Route
- Route: `/(screens)/parental-controls`

### API Calls

| Query Key | API Call | Condition |
|-----------|----------|-----------|
| `['parental-children']` | `parentalApi.getChildren()` | After PIN verified |

| Mutation | API Call |
|----------|----------|
| `unlinkMutation` | `parentalApi.unlinkChild(childId, pin)` |
| `changePinMutation` | `parentalApi.changePin(childId, currentPin, newPin)` |
| `updateMutation` (per card) | `parentalApi.updateControls(childUserId, dto)` |

### PIN Gate
- 4-digit PIN pad with dot indicators
- PIN verification: `parentalApi.verifyPin(childUserId, pin)`
- Max 5 attempts, then locked out
- Auto-skip PIN for first-time setup (no children linked)

### Child Card Controls (per linked child)
| Control | Type | Options |
|---------|------|---------|
| Restricted Mode | Toggle | on/off |
| Age Rating | Radio chips | G, PG, PG-13, R |
| DM Restriction | Radio chips | None, Contacts Only, Disabled |
| Can Go Live | Toggle | on/off |
| Can Post | Toggle | on/off |
| Can Comment | Toggle | on/off |
| Activity Digest | Toggle | on/off |

### Activity Digest Card
- Query: `parentalApi.getDigest(childId)`
- Shows: Posts count, Messages count, Screen time (minutes)
- Bar chart: Daily breakdown (7 days), emerald→gold gradient bars

### Custom Components (5)
- `PinPad`: 4-digit with haptic ticks, auto-submit on 4th digit
- `AgeRatingSelector`: 4 chip buttons
- `DmRestrictionSelector`: 3 chip buttons
- `ToggleRow`: Label + custom toggle track
- `DigestCard`: Stats + bar chart

### BottomSheets (2)
- Unlink PIN confirmation
- Change PIN flow (current PIN → new PIN, two-step)

---

## 10. Profile Customization (`profile-customization.tsx` — 699 lines)

### Route
- Route: `/(screens)/profile-customization`

### API Calls

| Query Key | API Call |
|-----------|----------|
| `['profile-customization']` | `gamificationApi.getProfileCustomization()` |

| Mutation | API Call |
|----------|----------|
| `saveMutation` | `gamificationApi.updateProfileCustomization(dto)` |

### Customization Options

1. **Accent Color** (12 presets)
   - Colors: emerald, #0D9B63, blue, purple, gold, #F85149, #FF7B72, #D29922, greenBright, #F778BA, #79C0FF, #D2A8FF
   - UI: Color grid, circle with check icon for selected

2. **Layout Style** (4 options)
   - Default, Grid, Magazine, Minimal
   - UI: 2x2 card grid with icon + label

3. **Bio Font** (4 options)
   - Default (DMSans), Serif (PlayfairDisplay), Mono, Arabic (NotoNaskhArabic)
   - UI: 2x2 card grid with "Aa" preview + label

4. **Toggles** (3)
   - Show Badges, Show Level, Show Streak

5. **Background Image** — Upload via `ImagePicker` + R2 presigned URL

6. **Music URL** — TextInput for profile music URL (validated with `isValidUrl`)

### Save Payload
```ts
{
  accentColor: string;
  layoutStyle: string;
  bioFont: string;
  showBadges: boolean;
  showLevel: boolean;
  showStreak: boolean;
  backgroundImageUrl?: string;
  profileMusicUrl?: string;
}
```

---

## 11. Close Friends (`close-friends.tsx` — 494 lines)

### Route
- Route: `/(screens)/close-friends`

### API Calls

| Query Key | API Call | Purpose |
|-----------|----------|---------|
| `['user', 'me']` | `usersApi.getMe()` | Get backend user ID |
| `['my-circles']` | `circlesApi.getMyCircles()` | Find "Close Friends" circle |
| `['circle-members', circleId]` | `circlesApi.getMembers(circleId)` | Current close friends |
| `['followers', userId]` | `followsApi.getFollowers(userId, cursor)` | List of followers to toggle |

| Mutation | API Call |
|----------|----------|
| `createCircleMutation` | `circlesApi.create('Close Friends')` — auto-creates on first visit |
| `toggleMemberMutation` | `circlesApi.addMembers(id, [userId])` / `circlesApi.removeMembers(id, [userId])` |

### Architecture
- Uses Circle model (backend) with hardcoded name `'Close Friends'`
- Auto-creates circle on first visit if not exists (`useEffect` + `creationAttempted` ref to prevent duplicate)
- Followers list with `Switch` toggle per user
- Search: client-side filter on `displayName` and `username`

### Stats Bar
- Shows "X shown of Y" followers + "Z close friends" with emerald/gold accents

### UI Elements
- Search bar with glassmorphism gradient
- `UserRow` with: Avatar (emerald ring for close friends), name (emerald for close friends), heart badge, Switch + remove button
- `<Badge>` component showing member count in header

---

## 12. Blocked Screen (`blocked.tsx` — 215 lines)

### Route
- Route: `/(screens)/blocked`

### API Calls

| Query | API Call |
|-------|----------|
| `['blocked']` | `blocksApi.getBlocked(cursor)` — `useInfiniteQuery` |

| Mutation | API Call |
|----------|----------|
| `unblockMutation` | `blocksApi.unblock(userId)` |

### UI
- `FlatList` with red-tinted gradient rows (`rgba(248,81,73,0.08)`)
- Avatar with error ring color
- Slash icon badge next to username
- `GradientButton` "Unblock" with loading state
- Unblock confirmation via `Alert.alert`
- `EmptyState` with slash icon

---

## 13. Muted Screen (`muted.tsx` — 211 lines)

### Route
- Route: `/(screens)/muted`

### API Calls

| Query | API Call |
|-------|----------|
| `['muted']` | `mutesApi.getMuted(cursor)` — `useInfiniteQuery` |

| Mutation | API Call |
|----------|----------|
| `unmuteMutation` | `mutesApi.unmute(userId)` |

### UI
- `FlatList` with dark gradient rows (`colors.gradient.cardDark`)
- Volume-x icon badge next to username
- `GradientButton` "Unmute" (secondary variant)
- Unmute confirmation via `Alert.alert`
- `EmptyState` with volume-x icon

---

## Cross-Cutting Patterns

### Shared UI Components Used
| Component | Usage Count (across 13 files) |
|-----------|-------------------------------|
| `GlassHeader` | 13 (every screen) |
| `Icon` | 13 (every screen) |
| `Skeleton.*` | 12 |
| `LinearGradient` | 12 |
| `EmptyState` | 11 |
| `ScreenErrorBoundary` | 12 |
| `Avatar` | 8 |
| `BrandedRefreshControl` | 10 |
| `GradientButton` | 7 |
| `BottomSheet` | 4 |
| `VerifiedBadge` | 4 |
| `ProgressiveImage` | 2 |
| `RichText` | 1 (profile bio) |
| `TabSelector` | 1 (profile tabs) |
| `CharCountRing` | 1 (edit profile bio) |
| `Badge` | 1 (close friends count) |

### Shared Hooks Used
| Hook | Usage |
|------|-------|
| `useThemeColors()` | Every screen |
| `useTranslation()` | Every screen |
| `useRouter()` | Every screen |
| `useContextualHaptic()` | 6 screens (profile, settings, profile-customization, parental-controls, close-friends, account-settings) |
| `useAnimatedPress()` | 1 (profile stats) |
| `useAnimatedIcon()` | 1 (follow button pulse) |
| `useUser()` (Clerk) | 4 (profile, followers, following, close-friends) |
| `useClerk()` | 2 (settings, account-settings — for signOut) |

### State Management Patterns
| Pattern | Where |
|---------|-------|
| React Query (`useQuery`) | All API data fetching |
| React Query (`useInfiniteQuery`) | Paginated lists (followers, following, blocked, muted, user posts/threads/reels) |
| React Query (`useMutation`) | All write operations |
| Zustand (`useStore`) | Theme, feed type, storyViewer data |
| AsyncStorage | Read receipts, daily reminder, status privacy |
| `useState` local | Form fields, UI toggles, search, bottom sheets |

### Pagination Pattern
- All paginated lists use `useInfiniteQuery` with cursor-based pagination
- `getNextPageParam: (last) => last.meta.hasMore ? last.meta.cursor : undefined`
- `onEndReachedThreshold={0.4}` on FlatList
- Footer component shows skeleton while fetching next page

### Error Handling Pattern
- `isError` → `EmptyState` with retry button (`onAction → refetch`)
- `isLoading` → `Skeleton` components (specific to content type)
- Mutations: `onError` → `showToast({ variant: 'error' })`

### Animation Patterns
- Entry: `FadeInUp` with staggered delays (20-100ms per item in lists, 60ms per section in settings)
- Press: `withSpring` scale 0.96 on press in / 1.0 on press out (grid items)
- Follow pulse: `useAnimatedIcon('pulse')` triggered on successful follow
- Cover parallax: `interpolate(scrollY, [-200, 0, 200], [-100, 0, -100])` for translateY
- Toggle thumb: `withSpring` translateX 0↔20 with damping 15, stiffness 200

### Glassmorphism Pattern
Used extensively across all screens:
- Cards: `LinearGradient colors={['rgba(45,53,72,0.35)', 'rgba(28,35,51,0.2)']}`
- Active states: `LinearGradient colors={['rgba(10,123,79,0.15)', 'rgba(10,123,79,0.05)']}`
- Row icon backgrounds: `LinearGradient colors={['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.1)']}`
- Borders: `borderColor: colors.active.white6` or `'rgba(255,255,255,0.08)'`

### API Services Referenced
| Service | Screens |
|---------|---------|
| `usersApi` | profile, edit-profile, settings, account-settings, close-friends |
| `followsApi` | profile, followers, following, close-friends |
| `postsApi` | (imported but content queries go through usersApi) |
| `threadsApi` | (imported but content queries go through usersApi) |
| `reelsApi` | profile |
| `storiesApi` | profile (highlights) |
| `blocksApi` | profile, blocked |
| `mutesApi` | profile, muted |
| `settingsApi` | settings, content-settings |
| `profileLinksApi` | edit-profile |
| `uploadApi` | edit-profile, profile-customization |
| `circlesApi` | close-friends |
| `gamificationApi` | profile-customization |
| `parentalApi` | parental-controls |
| `messagesApi` | profile (lazy import for DM creation) |

### Clerk Integration Points
| Screen | Clerk Usage |
|--------|-------------|
| profile | `useUser()` — own profile detection, viewer ID for PostCard |
| settings | `useClerk().signOut()` — sign out + deactivate + delete |
| account-settings | `useClerk().signOut()`, `useUser()` — email/phone from Clerk user object |
| followers | `useUser()` — hide follow button for self |
| following | `useUser()` — hide follow button for self |
| close-friends | `useUser()` — fallback ID if backend user not loaded |

### Navigation Map (from these screens)

```
profile/[username]
├── edit-profile
├── archive
├── flipside
├── conversation/[id] (DM)
├── new-conversation
├── followers/[userId]
├── following/[userId]
├── mutual-followers
├── story-viewer (highlights)
├── post/[id]
├── thread/[id]
├── reel/[id]
├── send-tip
├── settings
├── saved
├── qr-code
└── channel/[handle]

settings
├── content-settings
├── drafts
├── archive
├── watch-history
├── downloads
├── nasheed-mode
├── theme-settings
├── saved
├── share-profile
├── follow-requests
├── blocked-keywords
├── biometric-lock
├── parental-controls
├── quiet-mode
├── screen-time
├── content-filter-settings
├── media-settings
├── prayer-times
├── qibla-compass
├── islamic-calendar
├── dhikr-counter
├── quran-reading-plan
├── hadith
├── mosque-finder
├── hajj-companion
├── zakat-calculator
├── eid-cards
├── scholar-verification
├── quran-room
├── charity-campaign
├── ramadan-mode
├── dua-collection
├── fasting-tracker
├── halal-finder
├── hifz-tracker
├── morning-briefing
├── names-of-allah
├── wind-down
├── blocked
├── muted
├── restricted
├── collab-requests
├── appeal-moderation
├── circles
├── ai-assistant
├── ai-avatar
├── analytics
├── broadcast-channels
├── my-reports
├── creator-dashboard
├── revenue
├── creator-storefront
├── enable-tips
├── membership-tiers
├── local-boards
├── mentorship
├── fatwa-qa
├── waqf
├── watch-party
├── voice-post-create
├── volunteer-board
├── create-event
├── gift-shop
├── followed-topics
├── streaks
├── achievements
├── leaderboard
├── challenges
├── xp-history
├── profile-customization
├── account-settings
├── 2fa-setup
├── account-switcher
├── contact-sync
├── close-friends
├── status-privacy
├── disappearing-default
├── storage-management
├── manage-data
├── notification-tones
└── (external links: terms, privacy, licenses)
```
