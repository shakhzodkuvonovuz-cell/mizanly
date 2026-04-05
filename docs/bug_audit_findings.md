# Phase 2: Codebase Bug Audit Findings (Deep Dive)

This document contains a structured list of bugs, logic flaws, and potential edge cases found during the deep codebase review corresponding to the 4 architectural scopes.

---

### Scope 1: Authentication, Access Control & Safety
**1. Search Suggestions Privacy Leak (Block Bypass)**
- **Location:** `apps/api/src/modules/search/search.service.ts` -> `getSuggestions()`
- **Issue:** The universal `search()` endpoint uses `getExcludedUserIds` to ensure blocked and muted accounts do NOT show up in the results. However, the `getSuggestions()` method used for the search bar auto-complete entirely omits the `userId` parameter and the `getExcludedUserIds` filter. 
- **Impact:** If a user searches for a name, the profile of a user they have blocked (or someone who has blocked them) will still appear in the autocomplete dropdown because it queries all non-banned users indiscriminately.

### Scope 2: Data Integrity & Concurrency
**1. `cashout` Missing ACID Transaction (Database Corruption Vector)**
- **Location:** `apps/api/src/modules/gifts/gifts.service.ts` -> `cashout()`
- **Issue:** Unlike the `sendGift()` method which rigorously wraps balance updates and transaction logs inside `this.prisma.$transaction`, the `cashout()` method does not. It deducts the diamond balance using `updateMany`, runs Javascript-level bounds checks (to verify the balance didn't go negative), and then creates the `CoinTransaction`.
- **Impact:** If the Node.js process crashes or the database connection drops immediately after the `updateMany` step but before the `CoinTransaction` is created, the diamonds are deducted from the user forever with no auditable log trail or recovery mechanism.

### Scope 3: Media, Real-Time & WebRTC
**1. Socket.io Trust Flaws in Quran Room Initialization**
- **Location:** `apps/api/src/gateways/chat.gateway.ts` -> `handleJoinQuranRoom()`
- **Issue:** The `handleJoinQuranRoom` event securely checks against rate-limits, but blindly trusts the provided `roomId` string to create a Redis hash (`quran:room:${roomId}`). It does not perform a database lookup (`this.prisma.audioRoom.findUnique`) to verify that the room actually exists or was sanctioned by the server.
- **Impact:** An authenticated user can spawn unlimited ghost/zombie rooms in Redis by submitting arbitrary string IDs. While mitigated by a 1-hour Redis TTL, highly active spam could temporarily exhaust Redis memory limits, acting as a limited Denial of Service vector.
- **Secondary Flaw:** The `QURAN_ROOM_TTL` is only refreshed on the participants list size key, not the room state key. If a room stays active over 1 hour, the room's Surah/Verse state vanishes while the list of participants remains intact.

### Scope 4: Mobile Client Logic (React Native / Expo)
**1. API 401 Expiry Thundering Herd (Rate Limit Crash)**
- **Location:** `apps/mobile/src/services/api.ts` & `apps/mobile/app/_layout.tsx`
- **Issue:** The `api.ts` client correctly intercepts `401 Unauthorized` responses and fires `this.forceRefreshToken()` to recover the session from Clerk. However, there is no Promise deduplication/locking mechanism. 
- **Impact:** If the auth token expires and the app mounts a new screen with 20 asynchronous requests (common in feed lists), 20 concurrent 401 errors will trigger 20 parallel calls to `getToken({ skipCache: true })`. This hammers the Clerk authentication SDK, potentially locking the UI thread and causing unnecessary rate limit hits.

**2. Auth State Hydration Flash**
- **Location:** `apps/mobile/src/store/index.ts`
- **Issue:** The `mizanly-store` uses Zustand's `persist` middleware. Everything is cached locally (theme, feed type, settings, role) except `user` and `isAuthenticated`. 
- **Impact:** Since the app doesn't cache the user profile in AsyncStorage, every time the app opens, it falls back to `{ isAuthenticated: false, user: null }` unconditionally until Clerk spins up, reads the secure token, and reactivates the session, causing minor flashes.
