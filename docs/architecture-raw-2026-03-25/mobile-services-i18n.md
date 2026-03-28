# Mobile Services & i18n — Architecture Extraction

> Agent: mobile-services-i18n | Extracted: 2026-03-25
> Source: `apps/mobile/src/services/` (36 files) + `apps/mobile/src/i18n/` (9 files)

---

## Table of Contents
1. [Base API Client](#1-base-api-client)
2. [Services by Domain](#2-services-by-domain)
3. [Endpoint Inventory Summary](#3-endpoint-inventory-summary)
4. [i18n Architecture](#4-i18n-architecture)
5. [Non-HTTP Service Files](#5-non-http-service-files)

---

## 1. Base API Client

**File:** `apps/mobile/src/services/api.ts` (~1,501 lines)

### ApiClient Class (Singleton)

```
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1'
export const SOCKET_URL = `${API_URL.replace('/api/v1', '')}/chat`
const REQUEST_TIMEOUT_MS = 30000  // 30-second timeout
```

#### Token Management
- `setTokenGetter(getter)` — Registers async function returning Clerk JWT (lazy, called per-request)
- `setForceRefreshTokenGetter(getter)` — Force-refresh getter used on 401 retry
- `setSessionExpiredHandler(handler)` — Callback when token refresh fails (navigates to sign-in)

#### Request Pipeline (`private async request<T>(path, options, retryFlags)`)
1. Get token via `this.getToken()` — failure logged but request proceeds (unauthenticated endpoints still work)
2. AbortController with 30s timeout
3. `fetch(API_URL + path)` with headers: Content-Type (if body), Authorization Bearer (if token)
4. **429 Rate Limited** — Auto-retry once after `Retry-After` header delay (max 120s), shows warning toast
5. **401 Unauthorized** — Force-refresh token via `forceRefreshToken()`, retry once with fresh token. If refresh fails, shows session expired toast, calls `onSessionExpired()`, throws `ApiError(401, SESSION_EXPIRED)`
6. Non-OK: parse error JSON, throw `ApiError(message, status)`
7. 204: return null
8. Unwraps TransformInterceptor envelope: `{ success, data, meta }` → `{ data, meta }` or just `data`
9. Logs slow requests (>2s) in dev

#### Error Classes
- `ApiError` — HTTP-level error. Properties: `status`, `code?`, helpers: `isAuth`, `isForbidden`, `isRateLimited`, `isServerError`, `isNotFound`
- `ApiNetworkError` — Network/DNS/timeout failure

#### HTTP Methods
| Method | Signature |
|--------|-----------|
| `get<T>(path)` | GET, no body |
| `post<T>(path, body?)` | POST, JSON body |
| `patch<T>(path, body?)` | PATCH, JSON body |
| `put<T>(path, body?)` | PUT, JSON body |
| `delete<T>(path, body?)` | DELETE, optional JSON body |

#### Utility Exports
- `withRetry<T>(fn, maxRetries=2, baseDelayMs=1000)` — Exponential backoff for non-React-Query calls. Only retries network errors and 5xx, not 4xx.
- `qs(params)` — Build query string from object, skipping undefined/empty values

### Exported API Objects (from api.ts)

The file exports **39 named API service objects** containing **~370+ endpoint functions**.

---

## 2. Services by Domain

### 2.1 Auth & Identity

#### `authApi` — 5 endpoints
| Function | Method | Path | Params | Return |
|----------|--------|------|--------|--------|
| `register` | POST | `/auth/register` | `{ username, displayName, bio?, avatarUrl? }` | `User` |
| `me` | GET | `/auth/me` | — | `User` |
| `checkUsername` | GET | `/auth/check-username?username=` | `username: string` | `{ available: boolean }` |
| `setInterests` | POST | `/auth/interests` | `{ categories: string[] }` | void |
| `suggestedUsers` | GET | `/auth/suggested-users` | — | `User[]` |

#### `usersApi` — 24 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `getMe` | GET | `/users/me` | `User` |
| `updateMe` | PATCH | `/users/me` | `User` |
| `deactivate` | DELETE | `/users/me/deactivate` | void |
| `deleteAccount` | DELETE | `/users/me` | void |
| `getProfile` | GET | `/users/{username}` | `User` |
| `getUserPosts` | GET | `/users/{username}/posts?cursor=` | `PaginatedResponse<Post>` |
| `getUserThreads` | GET | `/users/{username}/threads?cursor=` | `PaginatedResponse<Thread>` |
| `getSavedPosts` | GET | `/users/me/saved-posts?cursor=` | `PaginatedResponse<Post>` |
| `getSavedThreads` | GET | `/users/me/saved-threads?cursor=` | `PaginatedResponse<Thread>` |
| `getSavedReels` | GET | `/users/me/saved-reels?cursor=` | `PaginatedResponse<Reel>` |
| `getSavedVideos` | GET | `/users/me/saved-videos?cursor=` | `PaginatedResponse<Video>` |
| `getFollowRequests` | GET | `/users/me/follow-requests` | FollowRequest[] |
| `getAnalytics` | GET | `/users/me/analytics` | `{ stats: CreatorStat[] }` |
| `getWatchHistory` | GET | `/users/me/watch-history?cursor=` | `PaginatedResponse<WatchHistoryItem>` |
| `clearWatchHistory` | DELETE | `/users/me/watch-history` | void |
| `getWatchLater` | GET | `/users/me/watch-later?cursor=` | `PaginatedResponse<Video>` |
| `addWatchLater` | POST | `/users/me/watch-later/{videoId}` | void |
| `removeWatchLater` | DELETE | `/users/me/watch-later/{videoId}` | void |
| `report` | POST | `/users/{userId}/report` | void |
| `getArchive` | GET | `/stories/me/archived` | `Story[]` |
| `getMutualFollowers` | GET | `/users/{username}/mutual-followers?cursor=` | `PaginatedResponse<User>` |
| `getLikedPosts` | GET | `/users/me/liked-posts?cursor=` | `PaginatedResponse<Post>` |
| `exportData` | GET | `/users/me/data-export` | full export object |
| `requestAccountDeletion` | POST | `/users/me/delete-account` | void |
| `cancelAccountDeletion` | POST | `/users/me/cancel-deletion` | void |
| `updateDailyReminder` | PATCH | `/settings/notifications` | void |
| `updateNasheedMode` | PATCH | `/users/me/nasheed-mode` | `{ id, nasheedMode }` |
| `syncContacts` | POST | `/users/contacts/sync` | User-like array |

#### `followsApi` — 8 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `follow` | POST | `/follows/{userId}` | void |
| `unfollow` | DELETE | `/follows/{userId}` | void |
| `getFollowers` | GET | `/follows/{userId}/followers?cursor=` | `PaginatedResponse<User>` |
| `getFollowing` | GET | `/follows/{userId}/following?cursor=` | `PaginatedResponse<User>` |
| `getRequests` | GET | `/follows/requests/incoming` | `PaginatedResponse<FollowRequest>` |
| `acceptRequest` | POST | `/follows/requests/{id}/accept` | void |
| `declineRequest` | POST | `/follows/requests/{id}/decline` | void |
| `cancelRequest` | DELETE | `/follows/requests/{id}` | void |

#### `twoFactorApi` — 6 endpoints (separate file)
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `setup` | POST | `/two-factor/setup` | `TwoFactorSetupResponse` |
| `verify` | POST | `/two-factor/verify` | `TwoFactorStatus` |
| `validate` | POST | `/two-factor/validate` | `{ valid: boolean }` |
| `disable` | DELETE | `/two-factor/disable` | void |
| `status` | GET | `/two-factor/status` | `TwoFactorStatus` |
| `backup` | POST | `/two-factor/backup` | `{ success: boolean }` |

#### `altProfileApi` — 8 endpoints (separate file: Flipside profile)
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `get` | GET | `/users/me/alt-profile` | `AltProfile` |
| `create` | POST | `/users/me/alt-profile` | `AltProfile` |
| `update` | PUT | `/users/me/alt-profile` | `AltProfile` |
| `delete` | DELETE | `/users/me/alt-profile` | void |
| `addAccess` | POST | `/users/me/alt-profile/access` | void |
| `removeAccess` | DELETE | `/users/me/alt-profile/access/{userId}` | void |
| `getAccessList` | GET | `/users/me/alt-profile/access` | `AltProfileAccess[]` |
| `getOwnPosts` | GET | `/users/me/alt-profile/posts?cursor=` | `PaginatedResponse<AltPost>` |
| `viewProfile` | GET | `/users/{userId}/alt-profile` | `AltProfile` |
| `viewPosts` | GET | `/users/{userId}/alt-profile/posts?cursor=` | `PaginatedResponse<AltPost>` |

### 2.2 Content — Saf (Instagram Space)

#### `postsApi` — 23 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `getFeed` | GET | `/posts/feed?type=&cursor=` | `PaginatedResponse<Post>` |
| `create` | POST | `/posts` | `Post` |
| `getById` | GET | `/posts/{id}` | `Post` |
| `update` | PATCH | `/posts/{id}` | `Post` |
| `delete` | DELETE | `/posts/{id}` | void |
| `react` | POST | `/posts/{id}/react` | void |
| `unreact` | DELETE | `/posts/{id}/react` | void |
| `save` | POST | `/posts/{id}/save` | void |
| `unsave` | DELETE | `/posts/{id}/save` | void |
| `share` | POST | `/posts/{id}/share` | void |
| `getComments` | GET | `/posts/{id}/comments?cursor=` | `PaginatedResponse<Comment>` |
| `addComment` | POST | `/posts/{id}/comments` | `Comment` |
| `editComment` | PATCH | `/posts/{postId}/comments/{commentId}` | `Comment` |
| `report` | POST | `/posts/{id}/report` | void |
| `dismiss` | POST | `/posts/{id}/dismiss` | void |
| `deleteComment` | DELETE | `/posts/{postId}/comments/{commentId}` | void |
| `likeComment` | POST | `/posts/{postId}/comments/{commentId}/like` | void |
| `unlikeComment` | DELETE | `/posts/{postId}/comments/{commentId}/like` | void |
| `getCommentReplies` | GET | `/posts/{postId}/comments/{commentId}/replies?cursor=` | `PaginatedResponse<Comment>` |
| `archive` | POST | `/posts/{id}/archive` | void |
| `unarchive` | DELETE | `/posts/{id}/archive` | void |
| `getArchived` | GET | `/posts/archived?cursor=` | `PaginatedResponse<Post>` |
| `pinComment` | POST | `/posts/{postId}/comments/{commentId}/pin` | void |
| `unpinComment` | DELETE | `/posts/{postId}/comments/{commentId}/pin` | void |
| `hideComment` | POST | `/posts/{postId}/comments/{commentId}/hide` | void |
| `unhideComment` | DELETE | `/posts/{postId}/comments/{commentId}/hide` | void |
| `getHiddenComments` | GET | `/posts/{postId}/comments/hidden?cursor=` | `PaginatedResponse<Comment>` |
| `getShareLink` | GET | `/posts/{id}/share-link` | `{ url: string }` |
| `shareAsStory` | POST | `/posts/{id}/share-as-story` | void |
| `crossPost` | POST | `/posts/{id}/cross-post` | `Post[]` |

#### `storiesApi` — 17 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `getFeed` | GET | `/stories/feed` | `StoryGroup[]` |
| `create` | POST | `/stories` | `Story` |
| `getById` | GET | `/stories/{id}` | `Story` |
| `delete` | DELETE | `/stories/{id}` | void |
| `markViewed` | POST | `/stories/{id}/view` | `{ viewed: boolean }` |
| `getViewers` | GET | `/stories/{id}/viewers?cursor=` | `PaginatedResponse<User>` |
| `getHighlights` | GET | `/stories/highlights/{userId}` | `StoryHighlightAlbum[]` |
| `getHighlightById` | GET | `/stories/highlights/album/{albumId}` | `StoryHighlightAlbum` |
| `createHighlight` | POST | `/stories/highlights` | `StoryHighlightAlbum` |
| `updateHighlight` | PATCH | `/stories/highlights/{albumId}` | `StoryHighlightAlbum` |
| `deleteHighlight` | DELETE | `/stories/highlights/{albumId}` | void |
| `addToHighlight` | POST | `/stories/highlights/{albumId}/stories/{storyId}` | void |
| `getArchived` | GET | `/stories/me/archived` | `Story[]` |
| `unarchive` | PATCH | `/stories/{id}/unarchive` | `{ unarchived: boolean }` |
| `replyToStory` | POST | `/stories/{storyId}/reply` | `Message` |
| `getReactionSummary` | GET | `/stories/{storyId}/reactions/summary` | `Record<string, number>` |
| `submitStickerResponse` | POST | `/stories/{storyId}/sticker-response` | void |
| `getStickerResponses` | GET | `/stories/{storyId}/sticker-responses?type=` | sticker response array |
| `getStickerSummary` | GET | `/stories/{storyId}/sticker-summary` | nested record |

#### `storiesReactionsApi` — 1 endpoint
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `react` | POST | `/stories/{storyId}/react` | void |

#### `storyChainsApi` — 5 endpoints (separate file)
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `create` | POST | `/story-chains` | `StoryChain` |
| `getTrending` | GET | `/story-chains/trending?cursor=` | `PaginatedResponse<StoryChain>` |
| `getChain` | GET | `/story-chains/{chainId}?cursor=` | `{ chain, entries }` |
| `join` | POST | `/story-chains/{chainId}/join` | `StoryChainEntry` |
| `getStats` | GET | `/story-chains/{chainId}/stats` | `StoryChainStats` |

### 2.3 Content — Bakra (TikTok Space)

#### `reelsApi` — 21 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `getFeed` | GET | `/reels/feed?cursor=` | `PaginatedResponse<Reel>` |
| `getTrending` | GET | `/reels/trending?cursor=&limit=` | `PaginatedResponse<Reel>` |
| `getById` | GET | `/reels/{id}` | `Reel` |
| `create` | POST | `/reels` | `Reel` |
| `delete` | DELETE | `/reels/{id}` | void |
| `deleteComment` | DELETE | `/reels/{reelId}/comments/{commentId}` | void |
| `like` | POST | `/reels/{id}/like` | void |
| `unlike` | DELETE | `/reels/{id}/like` | void |
| `comment` | POST | `/reels/{id}/comment` | void |
| `getComments` | GET | `/reels/{id}/comments?cursor=` | `PaginatedResponse<Comment>` |
| `share` | POST | `/reels/{id}/share` | void |
| `bookmark` | POST | `/reels/{id}/bookmark` | void |
| `unbookmark` | DELETE | `/reels/{id}/bookmark` | void |
| `view` | POST | `/reels/{id}/view` | void |
| `getUserReels` | GET | `/reels/user/{username}?cursor=` | `PaginatedResponse<Reel>` |
| `report` | POST | `/reels/{id}/report` | void |
| `getByAudioTrack` | GET | `/reels/audio/{audioTrackId}?cursor=` | `PaginatedResponse<Reel>` |
| `getDuets` | GET | `/reels/{reelId}/duets?cursor=` | `PaginatedResponse<Reel>` |
| `getStitches` | GET | `/reels/{reelId}/stitches?cursor=` | `PaginatedResponse<Reel>` |
| `archive` | POST | `/reels/{reelId}/archive` | void |
| `unarchive` | POST | `/reels/{reelId}/unarchive` | void |
| `getShareLink` | GET | `/reels/{id}/share-link` | `{ url: string }` |
| `likeComment` | POST | `/reels/{reelId}/comments/{commentId}/like` | void |
| `unlikeComment` | DELETE | `/reels/{reelId}/comments/{commentId}/like` | void |

#### `reelTemplatesApi` — 5 endpoints (separate file)
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `browse` | GET | `/reel-templates?cursor=&trending=` | paginated |
| `getById` | GET | `/reel-templates/{id}` | `ReelTemplate` |
| `create` | POST | `/reel-templates` | `ReelTemplate` |
| `use` | POST | `/reel-templates/{id}/use` | void |
| `delete` | DELETE | `/reel-templates/{id}` | void |

#### `audioTracksApi` — 8 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `browse` | GET | `/audio-tracks?cursor=` | `PaginatedResponse<AudioTrack>` |
| `search` | GET | `/audio-tracks/search?q=` | `AudioTrack[]` |
| `getById` | GET | `/audio-tracks/{id}` | `AudioTrack` |
| `getTrending` | GET | `/audio-tracks/trending` | `AudioTrack[]` |
| `getByGenre` | GET | `/audio-tracks/genre/{genre}` | `AudioTrack[]` |
| `getReelsUsing` | GET | `/audio-tracks/{trackId}/reels?cursor=` | `PaginatedResponse<Reel>` |
| `upload` | POST | `/audio-tracks` | `AudioTrack` |
| `delete` | DELETE | `/audio-tracks/{id}` | void |

#### `videoRepliesApi` — 4 endpoints (separate file)
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `create` | POST | `/video-replies` | `VideoReply` |
| `getByComment` | GET | `/video-replies/comment/{commentId}?cursor=` | `PaginatedResponse<VideoReply>` |
| `getById` | GET | `/video-replies/{id}` | `VideoReply` |
| `delete` | DELETE | `/video-replies/{id}` | void |

### 2.4 Content — Majlis (Twitter Space)

#### `threadsApi` — 20 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `getFeed` | GET | `/threads/feed?type=&cursor=` | `PaginatedResponse<Thread>` |
| `getTrending` | GET | `/threads/trending?cursor=&limit=` | `PaginatedResponse<Thread>` |
| `create` | POST | `/threads` | `Thread` |
| `getById` | GET | `/threads/{id}` | `Thread` |
| `delete` | DELETE | `/threads/{id}` | void |
| `report` | POST | `/threads/{id}/report` | void |
| `dismiss` | POST | `/threads/{id}/dismiss` | void |
| `like` | POST | `/threads/{id}/like` | void |
| `unlike` | DELETE | `/threads/{id}/like` | void |
| `repost` | POST | `/threads/{id}/repost` | `Thread` |
| `unrepost` | DELETE | `/threads/{id}/repost` | void |
| `bookmark` | POST | `/threads/{id}/bookmark` | void |
| `unbookmark` | DELETE | `/threads/{id}/bookmark` | void |
| `getReplies` | GET | `/threads/{id}/replies?cursor=` | `PaginatedResponse<ThreadReply>` |
| `addReply` | POST | `/threads/{id}/replies` | `ThreadReply` |
| `deleteReply` | DELETE | `/threads/{threadId}/replies/{replyId}` | void |
| `likeReply` | POST | `/threads/{threadId}/replies/{replyId}/like` | void |
| `unlikeReply` | DELETE | `/threads/{threadId}/replies/{replyId}/like` | void |
| `votePoll` | POST | `/threads/polls/{optionId}/vote` | void |
| `getUserThreads` | GET | `/threads/user/{username}?cursor=` | `PaginatedResponse<Thread>` |
| `setReplyPermission` | PUT | `/threads/{threadId}/reply-permission` | void |
| `canReply` | GET | `/threads/{threadId}/can-reply` | `{ canReply: boolean }` |
| `getShareLink` | GET | `/threads/{id}/share-link` | `{ url: string }` |
| `isBookmarked` | GET | `/threads/{threadId}/bookmarked` | `{ bookmarked: boolean }` |

#### `majlisListsApi` — 8 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `getLists` | GET | `/majlis-lists` | `MajlisList[]` |
| `create` | POST | `/majlis-lists` | `MajlisList` |
| `getById` | GET | `/majlis-lists/{id}` | `MajlisList` |
| `update` | PATCH | `/majlis-lists/{id}` | void |
| `delete` | DELETE | `/majlis-lists/{id}` | void |
| `getMembers` | GET | `/majlis-lists/{id}/members?cursor=` | `PaginatedResponse<User>` |
| `addMember` | POST | `/majlis-lists/{id}/members` | void |
| `removeMember` | DELETE | `/majlis-lists/{id}/members/{userId}` | void |
| `getTimeline` | GET | `/majlis-lists/{id}/timeline?cursor=` | `PaginatedResponse<Thread>` |

#### `pollsApi` — 3 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `get` | GET | `/polls/{id}` | `Poll` |
| `vote` | POST | `/polls/{id}/vote` | void |
| `retractVote` | DELETE | `/polls/{id}/vote` | void |
| `getVoters` | GET | `/polls/{id}/voters?optionId=&cursor=` | `PaginatedResponse<User>` |

### 2.5 Content — Risalah (WhatsApp Space)

#### `messagesApi` — 35 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `getConversations` | GET | `/messages/conversations` | `Conversation[]` |
| `getConversation` | GET | `/messages/conversations/{id}` | `Conversation` |
| `getMessages` | GET | `/messages/conversations/{id}/messages?cursor=` | `PaginatedResponse<Message>` |
| `sendMessage` | POST | `/messages/conversations/{id}/messages` | `Message` |
| `deleteMessage` | DELETE | `/messages/conversations/{convId}/messages/{messageId}` | void |
| `editMessage` | PATCH | `/messages/conversations/{convId}/messages/{messageId}` | void |
| `reactToMessage` | POST | `/messages/conversations/{convId}/messages/{messageId}/react` | void |
| `removeReaction` | DELETE | `/messages/conversations/{convId}/messages/{messageId}/react` | void |
| `markRead` | POST | `/messages/conversations/{id}/read` | void |
| `mute` | POST | `/messages/conversations/{id}/mute` | void |
| `archive` | POST | `/messages/conversations/{id}/archive` | void |
| `createDM` | POST | `/messages/dm` | `Conversation` |
| `createGroup` | POST | `/messages/groups` | `Conversation` |
| `updateGroup` | PATCH | `/messages/groups/{id}` | `Conversation` |
| `addMembers` | POST | `/messages/groups/{id}/members` | void |
| `removeMember` | DELETE | `/messages/groups/{id}/members/{userId}` | void |
| `leaveGroup` | DELETE | `/messages/groups/{id}/members/me` | void |
| `setMemberTag` | PATCH | `/messages/groups/{groupId}/members/me/tag` | void |
| `setLockCode` | PATCH | `/messages/conversations/{id}/lock-code` | void |
| `verifyLockCode` | POST | `/messages/conversations/{id}/verify-lock` | `{ valid: boolean }` |
| `setHistoryCount` | PATCH | `/messages/groups/{groupId}/history-count` | void |
| `setDisappearingTimer` | PUT | `/messages/conversations/{id}/disappearing` | void |
| `archiveConversation` | POST | `/messages/conversations/{id}/archive` | void |
| `unarchiveConversation` | DELETE | `/messages/conversations/{id}/archive` | void |
| `getArchivedConversations` | GET | `/messages/conversations/archived?cursor=` | `PaginatedResponse<Conversation>` |
| `scheduleMessage` | POST | `/messages/messages/scheduled` | `Message` |
| `getStarredMessages` | GET | `/messages/messages/starred?cursor=` | `PaginatedResponse<Message>` |
| `pin` | POST | `/messages/{convId}/{messageId}/pin` | void |
| `unpin` | DELETE | `/messages/{convId}/{messageId}/pin` | void |
| `toggleStar` | POST | `/messages/{convId}/{messageId}/star` | void |
| `getPinned` | GET | `/messages/{convId}/pinned` | `Message[]` |
| `searchMessages` | GET | `/messages/{convId}/search?q=&cursor=` | `PaginatedResponse<Message>` |
| `forwardMessage` | POST | `/messages/forward/{messageId}` | void |
| `markDelivered` | POST | `/messages/{messageId}/delivered` | void |
| `getMediaGallery` | GET | `/messages/{convId}/media?cursor=` | `PaginatedResponse<Message>` |
| `sendViewOnce` | POST | `/messages/{convId}/view-once` | `Message` |
| `markViewOnceViewed` | POST | `/messages/view-once/{messageId}/viewed` | void |
| `promoteMember` | POST | `/messages/{convId}/members/{userId}/promote` | void |
| `demoteMember` | POST | `/messages/{convId}/members/{userId}/demote` | void |
| `banMember` | POST | `/messages/{convId}/members/{userId}/ban` | void |
| `setWallpaper` | PATCH | `/messages/{convId}/wallpaper` | void |
| `setTone` | PATCH | `/messages/{convId}/tone` | void |
| `createDMNote` | POST | `/messages/notes` | `DMNote` |
| `getMyDMNote` | GET | `/messages/notes/me` | `DMNote | null` |
| `deleteDMNote` | DELETE | `/messages/notes/me` | `{ deleted: boolean }` |
| `getContactDMNotes` | GET | `/messages/notes/contacts` | `DMNote[]` |

#### `chatExportApi` — 2 endpoints (separate file)
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `generateExport` | POST | `/chat-export/{conversationId}` | `ChatExportResult` |
| `getStats` | GET | `/chat-export/{conversationId}/stats` | `ChatExportStats` |

#### `checklistsApi` — 6 endpoints (separate file)
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `create` | POST | `/checklists` | `Checklist` |
| `getByConversation` | GET | `/checklists/conversation/{conversationId}` | `Checklist[]` |
| `addItem` | POST | `/checklists/{checklistId}/items` | `ChecklistItem` |
| `toggleItem` | PATCH | `/checklists/items/{itemId}/toggle` | `ChecklistItem` |
| `deleteItem` | DELETE | `/checklists/items/{itemId}` | void |
| `deleteChecklist` | DELETE | `/checklists/{checklistId}` | void |

#### `encryptionApi` — 8 endpoints (separate file)
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `registerKey` | POST | `/encryption/keys` | `EncryptionKeyInfo` |
| `getPublicKey` | GET | `/encryption/keys/{userId}` | `EncryptionKeyInfo` |
| `getBulkKeys` | POST | `/encryption/keys/bulk` | `EncryptionKeyInfo[]` |
| `storeEnvelope` | POST | `/encryption/envelopes` | void |
| `getEnvelope` | GET | `/encryption/envelopes/{conversationId}` | `KeyEnvelope | null` |
| `rotateKey` | POST | `/encryption/rotate/{conversationId}` | void |
| `getSafetyNumber` | GET | `/encryption/safety-number/{otherUserId}` | `{ safetyNumber: string }` |
| `getEncryptionStatus` | GET | `/encryption/status/{conversationId}` | `{ encrypted, algorithm? }` |

#### `stickersApi` — 10 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `browsePacks` | GET | `/stickers/packs?cursor=` | `PaginatedResponse<StickerPack>` |
| `searchPacks` | GET | `/stickers/packs/search?q=` | `StickerPack[]` |
| `getPack` | GET | `/stickers/packs/{id}` | `StickerPack` |
| `getFeaturedPacks` | GET | `/stickers/packs/featured` | `StickerPack[]` |
| `getMyPacks` | GET | `/stickers/my` | `StickerPack[]` |
| `getRecentStickers` | GET | `/stickers/my/recent` | `StickerItem[]` |
| `addToCollection` | POST | `/stickers/my/{packId}` | void |
| `removeFromCollection` | DELETE | `/stickers/my/{packId}` | void |
| `createPack` | POST | `/stickers/packs` | `StickerPack` |
| `deletePack` | DELETE | `/stickers/packs/{id}` | void |

### 2.6 Content — Minbar (YouTube Space)

#### `channelsApi` — 12 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `create` | POST | `/channels` | `Channel` |
| `getByHandle` | GET | `/channels/{handle}` | `Channel` |
| `update` | PATCH | `/channels/{handle}` | `Channel` |
| `delete` | DELETE | `/channels/{handle}` | void |
| `subscribe` | POST | `/channels/{handle}/subscribe` | void |
| `unsubscribe` | DELETE | `/channels/{handle}/subscribe` | void |
| `getVideos` | GET | `/channels/{handle}/videos?cursor=` | `PaginatedResponse<Video>` |
| `getMyChannels` | GET | `/channels/me/channels` | `Channel[]` |
| `getAnalytics` | GET | `/channels/{channelId}/analytics` | analytics object |
| `getSubscribers` | GET | `/channels/{channelId}/subscribers?cursor=` | `PaginatedResponse<User>` |
| `getRecommended` | GET | `/channels/recommended?limit=` | `Channel[]` |
| `setTrailer` | PUT | `/channels/{handle}/trailer` | void |
| `removeTrailer` | DELETE | `/channels/{handle}/trailer` | void |

#### `videosApi` — 25 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `getFeed` | GET | `/videos/feed?category=&cursor=` | `PaginatedResponse<Video>` |
| `getById` | GET | `/videos/{id}` | `Video` |
| `create` | POST | `/videos` | `Video` |
| `update` | PATCH | `/videos/{id}` | `Video` |
| `delete` | DELETE | `/videos/{id}` | void |
| `like` | POST | `/videos/{id}/like` | void |
| `dislike` | POST | `/videos/{id}/dislike` | void |
| `removeReaction` | DELETE | `/videos/{id}/reaction` | void |
| `comment` | POST | `/videos/{id}/comment` | void |
| `getComments` | GET | `/videos/{id}/comments?cursor=` | `PaginatedResponse<VideoComment>` |
| `bookmark` | POST | `/videos/{id}/bookmark` | void |
| `unbookmark` | DELETE | `/videos/{id}/bookmark` | void |
| `view` | POST | `/videos/{id}/view` | void |
| `updateProgress` | PATCH | `/videos/{id}/progress` | void |
| `report` | POST | `/videos/{id}/report` | void |
| `getRecommended` | GET | `/videos/{videoId}/recommended?limit=` | `Video[]` |
| `getCommentReplies` | GET | `/videos/comments/{commentId}/replies?cursor=` | `PaginatedResponse<VideoComment>` |
| `recordProgress` | PATCH | `/videos/{videoId}/progress` | void |
| `getShareLink` | GET | `/videos/{id}/share-link` | `{ url: string }` |
| `createPremiere` | POST | `/videos/{id}/premiere` | void |
| `getPremiere` | GET | `/videos/{id}/premiere` | premiere data |
| `setPremiereReminder` | POST | `/videos/{id}/premiere/reminder` | void |
| `removePremiereReminder` | DELETE | `/videos/{id}/premiere/reminder` | void |
| `startPremiere` | POST | `/videos/{id}/premiere/start` | void |
| `getPremiereViewers` | GET | `/videos/{id}/premiere/viewers` | viewers array |
| `setEndScreens` | PUT | `/videos/{id}/end-screens` | `EndScreen[]` |
| `getEndScreens` | GET | `/videos/{id}/end-screens` | `EndScreen[]` |
| `deleteEndScreens` | DELETE | `/videos/{id}/end-screens` | void |
| `crossPublish` | POST | `/videos/{id}/cross-publish` | void |

#### `playlistsApi` — 11 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `create` | POST | `/playlists` | `Playlist` |
| `getById` | GET | `/playlists/{id}` | `Playlist` |
| `getByChannel` | GET | `/playlists/channel/{channelId}?cursor=` | `PaginatedResponse<Playlist>` |
| `getItems` | GET | `/playlists/{id}/items?cursor=` | `PaginatedResponse<PlaylistItem>` |
| `update` | PATCH | `/playlists/{id}` | `Playlist` |
| `delete` | DELETE | `/playlists/{id}` | void |
| `addItem` | POST | `/playlists/{id}/items/{videoId}` | void |
| `removeItem` | DELETE | `/playlists/{id}/items/{videoId}` | void |
| `toggleCollaborative` | POST | `/playlists/{id}/collaborative` | void |
| `getCollaborators` | GET | `/playlists/{id}/collaborators` | `{ data: PlaylistCollaborator[] }` |
| `addCollaborator` | POST | `/playlists/{id}/collaborators` | `PlaylistCollaborator` |
| `removeCollaborator` | DELETE | `/playlists/{id}/collaborators/{userId}` | void |
| `updateCollaboratorRole` | PATCH | `/playlists/{id}/collaborators/{userId}` | `PlaylistCollaborator` |

#### `subtitlesApi` — 5 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `list` | GET | `/videos/{videoId}/subtitles` | `SubtitleTrack[]` |
| `upload` | POST | `/videos/{videoId}/subtitles` | void |
| `delete` | DELETE | `/videos/{videoId}/subtitles/{trackId}` | void |
| `generate` | POST | `/videos/{videoId}/subtitles/generate` | `SubtitleTrack` |
| `update` | PATCH | `/videos/{videoId}/subtitles/{trackId}` | `SubtitleTrack` |

#### `clipsApi` — 4 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `create` | POST | `/clips/video/{videoId}` | void |
| `getByVideo` | GET | `/clips/video/{videoId}?cursor=` | paginated |
| `getMine` | GET | `/clips/me?cursor=` | paginated |
| `delete` | DELETE | `/clips/{id}` | void |
| `getShareLink` | GET | `/clips/{id}/share` | `{ url: string }` |

#### `thumbnailsApi` — 5 endpoints (separate file)
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `createVariants` | POST | `/thumbnails/variants` | `ThumbnailVariant[]` |
| `getVariants` | GET | `/thumbnails/variants/{contentType}/{contentId}` | `ThumbnailVariant[]` |
| `serve` | GET | `/thumbnails/serve/{contentType}/{contentId}` | `{ thumbnailUrl }` |
| `trackImpression` | POST | `/thumbnails/impression` | void |
| `trackClick` | POST | `/thumbnails/click` | void |

### 2.7 Real-Time & Calls

#### `callsApi` — 7 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `initiate` | POST | `/calls` | `CallSession` |
| `answer` | POST | `/calls/{id}/answer` | void |
| `decline` | POST | `/calls/{id}/decline` | void |
| `end` | POST | `/calls/{id}/end` | void |
| `getHistory` | GET | `/calls/history?cursor=` | `PaginatedResponse<CallSession>` |
| `getActiveCall` | GET | `/calls/active` | `CallSession | null` |
| `getIceServers` | GET | `/calls/ice-servers` | `{ iceServers: [...] }` |

#### `liveApi` — 18 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `create` | POST | `/live` | `LiveSession` |
| `getById` | GET | `/live/{id}` | `LiveSession` |
| `getActive` | GET | `/live/active` | `LiveSession[]` |
| `getScheduled` | GET | `/live/scheduled` | `LiveSession[]` |
| `startLive` | POST | `/live/{id}/start` | void |
| `endLive` | POST | `/live/{id}/end` | void |
| `cancelLive` | POST | `/live/{id}/cancel` | void |
| `join` | POST | `/live/{id}/join` | `LiveParticipant` |
| `leave` | POST | `/live/{id}/leave` | void |
| `raiseHand` | POST | `/live/{id}/raise-hand` | void |
| `promoteToSpeaker` | POST | `/live/{id}/promote/{userId}` | void |
| `demoteToViewer` | POST | `/live/{id}/demote/{userId}` | void |
| `getParticipants` | GET | `/live/{id}/participants` | `LiveParticipant[]` |
| `getHostSessions` | GET | `/live/my` | `LiveSession[]` |
| `lowerHand` | POST | `/live/{id}/lower-hand` | void |
| `sendChat` | POST | `/live/{id}/chat` | void |
| `inviteSpeaker` | POST | `/live/{id}/invite-speaker/{participantId}` | void |
| `removeParticipant` | DELETE | `/live/{id}/participants/{participantId}` | void |
| `rehearse` | POST | `/live/rehearse` | `LiveSession` |
| `goLiveFromRehearsal` | PATCH | `/live/{id}/go-live` | void |
| `endRehearsal` | PATCH | `/live/{id}/end-rehearsal` | void |

#### `audioRoomsApi` — 10 endpoints (separate file)
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `create` | POST | `/audio-rooms` | `AudioRoom` |
| `list` | GET | `/audio-rooms?cursor=&status=` | `PaginatedResponse<AudioRoom>` |
| `getById` | GET | `/audio-rooms/{id}` | `AudioRoom` |
| `delete` | DELETE | `/audio-rooms/{id}` | void |
| `join` | POST | `/audio-rooms/{roomId}/join` | `AudioRoomParticipant` |
| `leave` | DELETE | `/audio-rooms/{roomId}/leave` | void |
| `changeRole` | PATCH | `/audio-rooms/{roomId}/role` | `AudioRoomParticipant` |
| `toggleHand` | PATCH | `/audio-rooms/{roomId}/hand` | `AudioRoomParticipant` |
| `toggleMute` | PATCH | `/audio-rooms/{roomId}/mute` | `AudioRoomParticipant` |
| `listParticipants` | GET | `/audio-rooms/{roomId}/participants?cursor=&role=` | `PaginatedResponse<AudioRoomParticipant>` |

### 2.8 Discovery & Feed

#### `searchApi` — 8 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `search` | GET | `/search?q=&type=&cursor=` | `SearchResults` |
| `trending` | GET | `/search/trending` | `TrendingHashtag[]` |
| `suggestions` | GET | `/search/suggestions` | `User[]` |
| `hashtagPosts` | GET | `/search/hashtag/{tag}?cursor=` | `PaginatedResponse<Post>` |
| `searchPosts` | GET | `/search/posts?q=&cursor=` | `PaginatedResponse<Post>` |
| `searchThreads` | GET | `/search/threads?q=&cursor=` | `PaginatedResponse<Thread>` |
| `searchReels` | GET | `/search/reels?q=&cursor=` | `PaginatedResponse<Reel>` |
| `getExploreFeed` | GET | `/search/explore?cursor=&category=` | `PaginatedResponse<Post|Reel|Thread>` |
| `getSearchSuggestions` | GET | `/search/suggestions?q=&limit=` | `SearchSuggestion[]` |

#### `hashtagsApi` — 9 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `getTrending` | GET | `/hashtags/trending` | `HashtagInfo[]` |
| `search` | GET | `/hashtags/search?q=` | `HashtagInfo[]` |
| `getByName` | GET | `/hashtags/{name}` | `HashtagInfo` |
| `getPosts` | GET | `/hashtags/{name}/posts?cursor=` | `PaginatedResponse<Post>` |
| `getReels` | GET | `/hashtags/{name}/reels?cursor=` | `PaginatedResponse<Reel>` |
| `getThreads` | GET | `/hashtags/{name}/threads?cursor=` | `PaginatedResponse<Thread>` |
| `follow` | POST | `/hashtags/{hashtagId}/follow` | void |
| `unfollow` | DELETE | `/hashtags/{hashtagId}/follow` | void |
| `getFollowed` | GET | `/hashtags/followed` | `HashtagInfo[]` |

#### `feedApi` — 10 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `dismiss` | POST | `/feed/dismiss/{contentType}/{contentId}` | void |
| `getPersonalized` | GET | `/feed/personalized?space=&cursor=` | personalized feed |
| `getExplore` | GET | `/feed/explore?cursor=` | `PaginatedResponse<Post|Reel|Thread>` |
| `reportNotInterested` | POST | `/feed/dismiss/{contentType}/{contentId}` | void |
| `explainPost` | GET | `/feed/explain/post/{postId}` | `{ reasons, signals? }` |
| `explainThread` | GET | `/feed/explain/thread/{threadId}` | `{ reasons, signals? }` |
| `trackSessionSignal` | POST | `/feed/session-signal` | void |
| `getNearby` | GET | `/feed/nearby?lat=&lng=&radiusKm=&cursor=` | `PaginatedResponse<Post>` |
| `getTrending` | GET | `/feed/trending?cursor=&limit=` | `PaginatedResponse<Post>` |
| `getFeatured` | GET | `/feed/featured?cursor=&limit=` | `PaginatedResponse<Post>` |
| `getSuggestedUsers` | GET | `/feed/suggested-users?limit=` | `SuggestedUser[]` |

#### `recommendationsApi` — 4 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `people` | GET | `/recommendations/people` | `SuggestedUser[]` |
| `posts` | GET | `/recommendations/posts` | `Post[]` |
| `reels` | GET | `/recommendations/reels` | `Reel[]` |
| `channels` | GET | `/recommendations/channels` | `Channel[]` |

### 2.9 Bookmarks & History

#### `bookmarksApi` — 13 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `savePost` | POST | `/bookmarks/posts` | void |
| `unsavePost` | DELETE | `/bookmarks/posts/{postId}` | void |
| `saveThread` | POST | `/bookmarks/threads/{threadId}` | void |
| `unsaveThread` | DELETE | `/bookmarks/threads/{threadId}` | void |
| `saveVideo` | POST | `/bookmarks/videos/{videoId}` | void |
| `unsaveVideo` | DELETE | `/bookmarks/videos/{videoId}` | void |
| `getSavedPosts` | GET | `/bookmarks/posts?collectionName=&cursor=` | `PaginatedResponse<Post>` |
| `getSavedThreads` | GET | `/bookmarks/threads?collectionName=&cursor=` | `PaginatedResponse<Thread>` |
| `getSavedVideos` | GET | `/bookmarks/videos?collectionName=&cursor=` | `PaginatedResponse<Video>` |
| `getCollections` | GET | `/bookmarks/collections` | `BookmarkCollection[]` |
| `moveToCollection` | PATCH | `/bookmarks/posts/{postId}/move` | void |
| `isPostSaved` | GET | `/bookmarks/posts/{postId}/status` | `{ saved: boolean }` |
| `isThreadSaved` | GET | `/bookmarks/threads/{threadId}/status` | `{ saved: boolean }` |
| `isVideoSaved` | GET | `/bookmarks/videos/{videoId}/status` | `{ saved: boolean }` |

#### `watchHistoryApi` — 4 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `recordWatch` | POST | `/watch-history/{videoId}` | void |
| `getHistory` | GET | `/watch-history?cursor=` | `PaginatedResponse<WatchHistoryItem>` |
| `removeFromHistory` | DELETE | `/watch-history/{videoId}` | void |
| `clearHistory` | DELETE | `/watch-history` | void |

#### `draftsApi` — 5 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `getAll` | GET | `/drafts?space=` | draft array |
| `get` | GET | `/drafts/{id}` | draft object |
| `save` | POST | `/drafts` | void |
| `update` | PATCH | `/drafts/{id}` | void |
| `delete` | DELETE | `/drafts/{id}` | void |

### 2.10 Settings & Privacy

#### `settingsApi` — 11 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `get` | GET | `/settings` | `Settings` |
| `updatePrivacy` | PATCH | `/settings/privacy` | `Settings` |
| `updateNotifications` | PATCH | `/settings/notifications` | `Settings` |
| `updateAccessibility` | PATCH | `/settings/accessibility` | `Settings` |
| `updateWellbeing` | PATCH | `/settings/wellbeing` | `Settings` |
| `getBlockedKeywords` | GET | `/settings/blocked-keywords` | `BlockedKeyword[]` |
| `addBlockedKeyword` | POST | `/settings/blocked-keywords` | `BlockedKeyword` |
| `deleteBlockedKeyword` | DELETE | `/settings/blocked-keywords/{id}` | void |
| `getQuietMode` | GET | `/settings/quiet-mode` | quiet mode object |
| `updateQuietMode` | PATCH | `/settings/quiet-mode` | quiet mode object |
| `logScreenTime` | POST | `/settings/screen-time/log` | void |
| `getScreenTimeStats` | GET | `/settings/screen-time/stats` | stats object |
| `setScreenTimeLimit` | PATCH | `/settings/screen-time/limit` | void |
| `getAutoPlay` | GET | `/settings/auto-play` | `{ autoPlaySetting }` |
| `updateAutoPlay` | PATCH | `/settings/auto-play` | void |

#### `blocksApi` — 3 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `getBlocked` | GET | `/blocks?cursor=` | `PaginatedResponse<BlockedUser>` |
| `block` | POST | `/blocks/{userId}` | void |
| `unblock` | DELETE | `/blocks/{userId}` | void |

#### `mutesApi` — 3 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `getMuted` | GET | `/mutes?cursor=` | `PaginatedResponse<MutedUser>` |
| `mute` | POST | `/mutes/{userId}` | void |
| `unmute` | DELETE | `/mutes/{userId}` | void |

#### `restrictsApi` — 3 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `restrict` | POST | `/restricts/{userId}` | void |
| `unrestrict` | DELETE | `/restricts/{userId}` | void |
| `getRestricted` | GET | `/restricts?cursor=` | paginated user list |

#### `privacyApi` — 2 endpoints (separate file)
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `exportData` | GET | `/privacy/export` | `DataExport` |
| `deleteAllData` | DELETE | `/privacy/delete-all` | `{ success: boolean }` |

### 2.11 Moderation & Reporting

#### `notificationsApi` — 5 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `get` | GET | `/notifications?filter=&cursor=` | `PaginatedResponse<Notification>` |
| `getUnreadCount` | GET | `/notifications/unread` | `{ unread: number }` |
| `getUnreadCounts` | GET | `/notifications/unread-counts` | `Record<string, number>` |
| `markRead` | POST | `/notifications/{id}/read` | void |
| `markAllRead` | POST | `/notifications/read-all` | void |
| `delete` | DELETE | `/notifications/{id}` | void |

#### `adminApi` — 6 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `getReports` | GET | `/admin/reports?status=&cursor=` | `PaginatedResponse<Report>` |
| `getReport` | GET | `/admin/reports/{id}` | `Report` |
| `resolveReport` | PATCH | `/admin/reports/{id}` | void |
| `getStats` | GET | `/admin/stats` | `AdminStats` |
| `banUser` | POST | `/admin/users/{id}/ban` | void |
| `unbanUser` | POST | `/admin/users/{id}/unban` | void |

#### `moderationApi` — 3 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `getMyActions` | GET | `/moderation/my-actions?cursor=` | `PaginatedResponse<ModerationLogEntry>` |
| `getMyAppeals` | GET | `/moderation/my-appeals?cursor=` | `PaginatedResponse<ModerationLogEntry>` |
| `submitAppeal` | POST | `/moderation/appeal` | `ModerationLogEntry` |

#### `appealsApi` — 2 endpoints (convenience alias)
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `getHistory` | GET | `/moderation/my-appeals?reportId=` | `ModerationLogEntry | null` |
| `submit` | POST | `/moderation/appeal` | delegates to moderationApi |

#### `reportsApi` — 6 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `create` | POST | `/reports` | `Report` |
| `getMine` | GET | `/reports/mine?cursor=` | `PaginatedResponse<Report>` |
| `getPending` | GET | `/reports/pending?cursor=` | `PaginatedResponse<Report>` |
| `getStats` | GET | `/reports/stats` | stats object |
| `getById` | GET | `/reports/{id}` | `Report` |
| `resolve` | PATCH | `/reports/{id}/resolve` | `Report` |
| `dismiss` | PATCH | `/reports/{id}/dismiss` | void |

#### `communityNotesApi` — 4 endpoints (separate file)
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `create` | POST | `/community-notes` | `CommunityNote` |
| `getForContent` | GET | `/community-notes/{contentType}/{contentId}` | `CommunityNote[]` |
| `getHelpful` | GET | `/community-notes/{contentType}/{contentId}/helpful` | `CommunityNote[]` |
| `rate` | POST | `/community-notes/{noteId}/rate` | `NoteRating` |

### 2.12 Monetization & Payments

#### `paymentsApi` — 5 endpoints (separate file)
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `createPaymentIntent` | POST | `/payments/create-payment-intent` | `PaymentIntent` |
| `createSubscription` | POST | `/payments/create-subscription` | void |
| `cancelSubscription` | DELETE | `/payments/cancel-subscription` | void |
| `getPaymentMethods` | GET | `/payments/payment-methods` | `PaymentMethodsResponse` |
| `attachPaymentMethod` | POST | `/payments/attach-payment-method` | void |

#### `monetizationApi` — 11 endpoints (separate file)
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `sendTip` | POST | `/monetization/tips` | `Tip` |
| `getSentTips` | GET | `/monetization/tips/sent?cursor=` | `PaginatedResponse<Tip>` |
| `getReceivedTips` | GET | `/monetization/tips/received?cursor=` | `PaginatedResponse<Tip>` |
| `getTipStats` | GET | `/monetization/tips/stats` | `TipStats` |
| `createTier` | POST | `/monetization/tiers` | `MembershipTier` |
| `getUserTiers` | GET | `/monetization/tiers/{userId}` | `MembershipTier[]` |
| `updateTier` | PATCH | `/monetization/tiers/{id}` | `MembershipTier` |
| `deleteTier` | DELETE | `/monetization/tiers/{id}` | void |
| `toggleTierActive` | PATCH | `/monetization/tiers/{id}/toggle` | `MembershipTier` |
| `subscribe` | POST | `/monetization/subscribe/{tierId}` | `MembershipSubscription` |
| `unsubscribe` | DELETE | `/monetization/subscribe/{tierId}` | void |
| `getSubscribers` | GET | `/monetization/subscribers?cursor=` | paginated |

#### `giftsApi` — 7 endpoints (separate file)
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `getBalance` | GET | `/gifts/balance` | `GiftBalance` |
| `purchaseCoins` | POST | `/gifts/purchase` | void |
| `sendGift` | POST | `/gifts/send` | void |
| `getCatalog` | GET | `/gifts/catalog` | `GiftCatalogItem[]` |
| `getHistory` | GET | `/gifts/history?cursor=` | paginated |
| `cashout` | POST | `/gifts/cashout` | void |
| `getReceived` | GET | `/gifts/received` | `GiftHistoryItem[]` |

#### `promotionsApi` — 6 endpoints (separate file)
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `boostPost` | POST | `/promotions/boost` | void |
| `getMyPromotions` | GET | `/promotions/mine` | array |
| `cancelPromotion` | POST | `/promotions/{id}/cancel` | void |
| `setReminder` | POST | `/promotions/reminder` | void |
| `removeReminder` | DELETE | `/promotions/reminder/{postId}` | void |
| `markBranded` | POST | `/promotions/branded` | void |
| `removeBranded` | DELETE | `/promotions/branded/{postId}` | void |

### 2.13 Commerce & Marketplace

#### `commerceApi` — 15 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `createProduct` | POST | `/products` | product |
| `getProducts` | GET | `/products?cursor=&category=&search=` | paginated |
| `getProduct` | GET | `/products/{id}` | product |
| `reviewProduct` | POST | `/products/{id}/review` | void |
| `createOrder` | POST | `/orders` | order |
| `getMyOrders` | GET | `/orders/me?cursor=` | paginated |
| `updateOrderStatus` | PATCH | `/orders/{id}/status` | void |
| `createBusiness` | POST | `/businesses` | business |
| `getBusinesses` | GET | `/businesses?cursor=&category=&lat=&lng=` | paginated |
| `reviewBusiness` | POST | `/businesses/{id}/review` | void |
| `createZakatFund` | POST | `/zakat/funds` | fund |
| `getZakatFunds` | GET | `/zakat/funds?cursor=&category=` | paginated |
| `donateZakat` | POST | `/zakat/funds/{fundId}/donate` | void |
| `createTreasury` | POST | `/treasury` | treasury |
| `contributeTreasury` | POST | `/treasury/{id}/contribute` | void |
| `getPremiumStatus` | GET | `/premium/status` | status |
| `subscribePremium` | POST | `/premium/subscribe` | void |
| `cancelPremium` | DELETE | `/premium/cancel` | void |

### 2.14 Community & Social Features

#### `circlesApi` — 6 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `getMyCircles` | GET | `/circles` | `Circle[]` |
| `create` | POST | `/circles` | `Circle` |
| `update` | PATCH | `/circles/{id}` | `Circle` |
| `delete` | DELETE | `/circles/{id}` | void |
| `getMembers` | GET | `/circles/{id}/members` | `CircleMember[]` |
| `addMembers` | POST | `/circles/{id}/members` | void |
| `removeMembers` | DELETE | `/circles/{id}/members` | void |

#### `communitiesApi` — 8 endpoints (separate file)
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `create` | POST | `/communities` | `Community` |
| `list` | GET | `/communities?cursor=&limit=` | `PaginatedResponse<Community>` |
| `getById` | GET | `/communities/{id}` | `Community` |
| `update` | PATCH | `/communities/{id}` | `Community` |
| `delete` | DELETE | `/communities/{id}` | void |
| `join` | POST | `/communities/{id}/join` | `Community` |
| `leave` | DELETE | `/communities/{id}/leave` | `Community` |
| `listMembers` | GET | `/communities/{id}/members?cursor=` | `PaginatedResponse<CommunityMember>` |

#### `collabsApi` — 7 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `invite` | POST | `/collabs/invite` | `PostCollab` |
| `accept` | POST | `/collabs/{id}/accept` | void |
| `decline` | POST | `/collabs/{id}/decline` | void |
| `remove` | DELETE | `/collabs/{id}` | void |
| `getMyPending` | GET | `/collabs/pending` | `PostCollab[]` |
| `getAccepted` | GET | `/collabs/accepted?cursor=` | `PaginatedResponse<PostCollab>` |
| `getPostCollabs` | GET | `/collabs/post/{postId}` | `PostCollab[]` |

#### `broadcastApi` — 16 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `discover` | GET | `/broadcast/discover?cursor=` | `PaginatedResponse<BroadcastChannel>` |
| `getMyChannels` | GET | `/broadcast/my` | `BroadcastChannel[]` |
| `getBySlug` | GET | `/broadcast/{slug}` | `BroadcastChannel` |
| `getById` | GET | `/broadcast/{id}` | `BroadcastChannel` |
| `create` | POST | `/broadcast` | `BroadcastChannel` |
| `subscribe` | POST | `/broadcast/{id}/subscribe` | void |
| `unsubscribe` | DELETE | `/broadcast/{id}/subscribe` | void |
| `mute` | PATCH | `/broadcast/{id}/mute` | void |
| `unmute` | PATCH | `/broadcast/{id}/mute` | void |
| `getMessages` | GET | `/broadcast/{id}/messages?cursor=` | `PaginatedResponse<BroadcastMessage>` |
| `sendMessage` | POST | `/broadcast/{id}/messages` | `BroadcastMessage` |
| `pinMessage` | PATCH | `/broadcast/messages/{messageId}/pin` | void |
| `unpinMessage` | DELETE | `/broadcast/messages/{messageId}/pin` | void |
| `deleteMessage` | DELETE | `/broadcast/messages/{messageId}` | void |
| `getPinnedMessages` | GET | `/broadcast/{id}/pinned` | `BroadcastMessage[]` |
| `promoteToAdmin` | POST | `/broadcast/{channelId}/promote/{userId}` | void |
| `demoteFromAdmin` | POST | `/broadcast/{channelId}/demote/{userId}` | void |
| `removeSubscriber` | DELETE | `/broadcast/{channelId}/subscribers/{userId}` | void |

#### `eventsApi` — 7 endpoints (separate file)
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `create` | POST | `/events` | `Event` |
| `list` | GET | `/events?cursor=&limit=` | `PaginatedResponse<EventWithCounts>` |
| `getById` | GET | `/events/{id}` | `EventWithCounts` |
| `update` | PATCH | `/events/{id}` | `Event` |
| `delete` | DELETE | `/events/{id}` | void |
| `rsvp` | POST | `/events/{eventId}/rsvp` | `EventRSVP` |
| `removeRsvp` | DELETE | `/events/{eventId}/rsvp` | void |
| `listAttendees` | GET | `/events/{eventId}/attendees?cursor=&status=` | `PaginatedResponse<User>` |

#### `channelPostsApi` — 5 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `list` | GET | `/channel-posts/channel/{channelId}?cursor=` | `PaginatedResponse<ChannelPost>` |
| `create` | POST | `/channel-posts/{channelId}` | `ChannelPost` |
| `like` | POST | `/channel-posts/{postId}/like` | void |
| `unlike` | DELETE | `/channel-posts/{postId}/like` | void |
| `delete` | DELETE | `/channel-posts/{postId}` | void |
| `getComments` | GET | `/channel-posts/{postId}/comments?cursor=` | `PaginatedResponse<Comment>` |
| `addComment` | POST | `/channel-posts/{postId}/comments` | void |

### 2.15 Telegram-Style Features

#### `telegramFeaturesApi` — 16 endpoints (separate file)
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `getSavedMessages` | GET | `/saved-messages?cursor=` | `PaginatedResponse<SavedMessage>` |
| `searchSavedMessages` | GET | `/saved-messages/search?q=` | `SavedMessage[]` |
| `saveMessage` | POST | `/saved-messages` | `SavedMessage` |
| `pinSavedMessage` | PATCH | `/saved-messages/{id}/pin` | `SavedMessage` |
| `deleteSavedMessage` | DELETE | `/saved-messages/{id}` | void |
| `getChatFolders` | GET | `/chat-folders` | `ChatFolder[]` |
| `createChatFolder` | POST | `/chat-folders` | `ChatFolder` |
| `updateChatFolder` | PATCH | `/chat-folders/{id}` | `ChatFolder` |
| `deleteChatFolder` | DELETE | `/chat-folders/{id}` | void |
| `reorderChatFolders` | PATCH | `/chat-folders/reorder` | void |
| `setSlowMode` | PATCH | `/conversations/{conversationId}/slow-mode` | void |
| `getAdminLog` | GET | `/conversations/{conversationId}/admin-log?cursor=` | paginated |
| `createTopic` | POST | `/conversations/{conversationId}/topics` | `GroupTopic` |
| `getTopics` | GET | `/conversations/{conversationId}/topics` | `GroupTopic[]` |
| `updateTopic` | PATCH | `/topics/{topicId}` | `GroupTopic` |
| `deleteTopic` | DELETE | `/topics/{topicId}` | void |
| `getMyEmojiPacks` | GET | `/emoji-packs/me` | `EmojiPack[]` |
| `getEmojiPacks` | GET | `/emoji-packs?cursor=` | `PaginatedResponse<EmojiPack>` |
| `createEmojiPack` | POST | `/emoji-packs` | `EmojiPack` |
| `addEmoji` | POST | `/emoji-packs/{packId}/emojis` | `CustomEmoji` |

### 2.16 Discord-Style Features

#### `discordFeaturesApi` — 13 endpoints (separate file)
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `createForumThread` | POST | `/circles/{circleId}/forum` | `ForumThread` |
| `getForumThreads` | GET | `/circles/{circleId}/forum?cursor=` | `PaginatedResponse<ForumThread>` |
| `getForumThread` | GET | `/forum/{threadId}` | `ForumThread` |
| `replyToForumThread` | POST | `/forum/{threadId}/reply` | `ForumReply` |
| `getForumReplies` | GET | `/forum/{threadId}/replies?cursor=` | `PaginatedResponse<ForumReply>` |
| `lockForumThread` | PATCH | `/forum/{threadId}/lock` | `ForumThread` |
| `pinForumThread` | PATCH | `/forum/{threadId}/pin` | `ForumThread` |
| `createWebhook` | POST | `/circles/{circleId}/webhooks` | `Webhook` |
| `getWebhooks` | GET | `/circles/{circleId}/webhooks` | `Webhook[]` |
| `deleteWebhook` | DELETE | `/webhooks/{id}` | void |
| `executeWebhook` | POST | `/webhooks/{token}/execute` | void |
| `createStageSession` | POST | `/circles/{circleId}/stage` | `StageSession` |
| `startStage` | POST | `/stage/{id}/start` | `StageSession` |
| `endStage` | POST | `/stage/{id}/end` | `StageSession` |
| `inviteSpeaker` | POST | `/stage/{stageId}/speaker` | void |
| `getActiveStageSessions` | GET | `/stage/active?circleId=` | `StageSession[]` |

### 2.17 Islamic Features

#### `islamicApi` — 42 endpoints (separate file — largest single service)
| Category | Function | Method | Path |
|----------|----------|--------|------|
| **Prayer** | `getPrayerTimes` | GET | `/islamic/prayer-times?lat=&lng=&method=&date=` |
| | `getPrayerMethods` | GET | `/islamic/prayer-times/methods` |
| | `getCurrentPrayerWindow` | GET | `/islamic/prayer-times/current-window?...` |
| | `getPrayerNotificationSettings` | GET | `/islamic/prayer-notifications/settings` |
| | `updatePrayerNotificationSettings` | PATCH | `/islamic/prayer-notifications/settings` |
| **Quran** | `listSurahs` | GET | `/islamic/quran/chapters` |
| | `getSurah` | GET | `/islamic/quran/chapters/{n}` |
| | `getVerse` | GET | `/islamic/quran/chapters/{s}/verses/{v}?translation=` |
| | `getSurahVerses` | GET | `/islamic/quran/chapters/{n}/verses?translation=` |
| | `searchQuran` | GET | `/islamic/quran/search?q=` |
| | `getJuz` | GET | `/islamic/quran/juz/{n}` |
| | `getRandomAyah` | GET | `/islamic/quran/random-ayah` |
| **Quran Plans** | `createReadingPlan` | POST | `/islamic/quran-plans` |
| | `getActiveReadingPlan` | GET | `/islamic/quran-plans/active` |
| | `getReadingPlanHistory` | GET | `/islamic/quran-plans/history?cursor=` |
| | `updateReadingPlan` | PATCH | `/islamic/quran-plans/{planId}` |
| | `deleteReadingPlan` | DELETE | `/islamic/quran-plans/{planId}` |
| **Hadith** | `getDailyHadith` | GET | `/islamic/hadith/daily` |
| | `getHadith` | GET | `/islamic/hadith/{id}` |
| | `listHadiths` | GET | `/islamic/hadith?cursor=` |
| | `bookmarkHadith` | POST | `/islamic/hadiths/{hadithId}/bookmark` |
| **Dhikr** | `saveDhikrSession` | POST | `/islamic/dhikr/sessions` |
| | `getDhikrStats` | GET | `/islamic/dhikr/stats` |
| | `getDhikrLeaderboard` | GET | `/islamic/dhikr/leaderboard?period=` |
| | `createDhikrChallenge` | POST | `/islamic/dhikr/challenges` |
| | `listDhikrChallenges` | GET | `/islamic/dhikr/challenges?cursor=` |
| | `getDhikrChallenge` | GET | `/islamic/dhikr/challenges/{id}` |
| | `joinDhikrChallenge` | POST | `/islamic/dhikr/challenges/{id}/join` |
| | `contributeToDhikrChallenge` | POST | `/islamic/dhikr/challenges/{id}/contribute` |
| **Duas** | `getDuas` | GET | `/islamic/duas?category=` |
| | `getDuaOfTheDay` | GET | `/islamic/duas/daily` |
| | `getDuaCategories` | GET | `/islamic/duas/categories` |
| | `getDuaById` | GET | `/islamic/duas/{id}` |
| | `bookmarkDua` | POST | `/islamic/duas/{duaId}/bookmark` |
| | `unbookmarkDua` | DELETE | `/islamic/duas/{duaId}/bookmark` |
| | `getBookmarkedDuas` | GET | `/islamic/duas/bookmarked` |
| **Fasting** | `logFast` | POST | `/islamic/fasting/log` |
| | `getFastingLog` | GET | `/islamic/fasting/log?month=` |
| | `getFastingStats` | GET | `/islamic/fasting/stats` |
| **Names** | `getNamesOfAllah` | GET | `/islamic/names-of-allah` |
| | `getDailyNameOfAllah` | GET | `/islamic/names-of-allah/daily` |
| | `getNameOfAllah` | GET | `/islamic/names-of-allah/{num}` |
| **Hifz** | `getHifzProgress` | GET | `/islamic/hifz/progress` |
| | `updateHifzProgress` | PATCH | `/islamic/hifz/progress/{surahNum}` |
| | `getHifzStats` | GET | `/islamic/hifz/stats` |
| | `getHifzReviewSchedule` | GET | `/islamic/hifz/review-schedule` |
| **Charity** | `createCampaign` | POST | `/islamic/charity/campaigns` |
| | `listCampaigns` | GET | `/islamic/charity/campaigns?cursor=` |
| | `getCampaign` | GET | `/islamic/charity/campaigns/{id}` |
| | `donate` | POST | `/islamic/charity/donate` |
| | `getMyDonations` | GET | `/islamic/charity/my-donations?cursor=` |
| **Hajj** | `getHajjGuide` | GET | `/islamic/hajj/guide` |
| | `getHajjProgress` | GET | `/islamic/hajj/progress` |
| | `createHajjProgress` | POST | `/islamic/hajj/progress` |
| | `updateHajjProgress` | PATCH | `/islamic/hajj/progress/{id}` |
| **Tafsir** | `getTafsir` | GET | `/islamic/tafsir/{surah}/{verse}?source=` |
| | `getTafsirSources` | GET | `/islamic/tafsir/sources` |
| **Scholar** | `applyScholarVerification` | POST | `/islamic/scholar-verification/apply` |
| | `getScholarVerificationStatus` | GET | `/islamic/scholar-verification/status` |
| **Content Filter** | `getContentFilterSettings` | GET | `/islamic/content-filter/settings` |
| | `updateContentFilterSettings` | PATCH | `/islamic/content-filter/settings` |
| **Briefing** | `getDailyBriefing` | GET | `/islamic/daily-briefing?lat=&lng=` |
| | `completeDailyTask` | POST | `/islamic/daily-tasks/complete` |
| | `getDailyTasksToday` | GET | `/islamic/daily-tasks/today` |
| **Mosques** | `getMosques` | GET | `/islamic/mosques?lat=&lng=&radius=` |
| **Zakat** | `calculateZakat` | GET | `/islamic/zakat/calculate?...` |
| **Ramadan** | `getRamadanInfo` | GET | `/islamic/ramadan?year=&lat=&lng=` |

#### `halalApi` — 6 endpoints (separate file)
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `findNearby` | GET | `/halal/restaurants?lat=&lng=&...` | `PaginatedResponse<HalalRestaurant>` |
| `getById` | GET | `/halal/restaurants/{id}` | `HalalRestaurant` |
| `create` | POST | `/halal/restaurants` | `HalalRestaurant` |
| `addReview` | POST | `/halal/restaurants/{id}/reviews` | `HalalReview` |
| `getReviews` | GET | `/halal/restaurants/{id}/reviews?cursor=` | `PaginatedResponse<HalalReview>` |
| `verify` | POST | `/halal/restaurants/{id}/verify` | `{ verified: boolean }` |

#### `scholarQaApi` — 8 endpoints (separate file)
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `schedule` | POST | `/scholar-qa` | `ScholarQASession` |
| `getUpcoming` | GET | `/scholar-qa/upcoming` | `ScholarQASession[]` |
| `getRecordings` | GET | `/scholar-qa/recordings` | `ScholarQASession[]` |
| `getById` | GET | `/scholar-qa/{id}` | `ScholarQASession` |
| `submitQuestion` | POST | `/scholar-qa/{sessionId}/questions` | `ScholarQuestion` |
| `voteQuestion` | POST | `/scholar-qa/{sessionId}/questions/{questionId}/vote` | `{ votes: number }` |
| `startSession` | PUT | `/scholar-qa/{sessionId}/start` | `ScholarQASession` |
| `endSession` | PUT | `/scholar-qa/{sessionId}/end` | `ScholarQASession` |
| `markAnswered` | PUT | `/scholar-qa/{sessionId}/questions/{questionId}/answered` | `ScholarQuestion` |

#### `mosquesApi` — 9 endpoints (separate file)
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `findNearby` | GET | `/mosques/nearby?lat=&lng=&radius=` | `Mosque[]` |
| `create` | POST | `/mosques` | `Mosque` |
| `getMyMosques` | GET | `/mosques/my/memberships` | `Mosque[]` |
| `getById` | GET | `/mosques/{id}` | `Mosque` |
| `join` | POST | `/mosques/{mosqueId}/join` | `{ success: boolean }` |
| `leave` | DELETE | `/mosques/{mosqueId}/leave` | void |
| `getFeed` | GET | `/mosques/{mosqueId}/feed?cursor=` | `PaginatedResponse<MosquePost>` |
| `createPost` | POST | `/mosques/{mosqueId}/posts` | `MosquePost` |
| `getMembers` | GET | `/mosques/{mosqueId}/members?cursor=` | `PaginatedResponse<MosqueMember>` |

### 2.18 AI & Intelligence

#### `aiApi` — 12 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `suggestCaptions` | POST | `/ai/suggest-captions` | suggestions |
| `suggestHashtags` | POST | `/ai/suggest-hashtags` | suggestions |
| `suggestPostingTime` | GET | `/ai/suggest-posting-time` | `{ bestTime, reason }` |
| `translate` | POST | `/ai/translate` | `{ translatedText }` |
| `moderate` | POST | `/ai/moderate` | moderation result |
| `smartReplies` | POST | `/ai/smart-replies` | replies array |
| `summarize` | POST | `/ai/summarize` | summary |
| `routeSpace` | POST | `/ai/route-space` | routing suggestion |
| `generateCaptions` | POST | `/ai/videos/{videoId}/captions` | captions |
| `getCaptions` | GET | `/ai/videos/{videoId}/captions?language=` | captions |
| `generateAvatar` | POST | `/ai/avatar` | avatar result |
| `getAvatars` | GET | `/ai/avatars` | avatars array |

#### `creatorApi` — 7 endpoints (separate file)
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `getPostInsights` | GET | `/creator/insights/post/{postId}` | `InsightsData` |
| `getReelInsights` | GET | `/creator/insights/reel/{reelId}` | `InsightsData` |
| `getOverview` | GET | `/creator/analytics/overview` | `OverviewData` |
| `getAudience` | GET | `/creator/analytics/audience` | `AudienceData` |
| `getContent` | GET | `/creator/analytics/content` | `ContentData` |
| `getGrowth` | GET | `/creator/analytics/growth` | `GrowthData` |
| `getRevenue` | GET | `/creator/analytics/revenue` | `RevenueData` |
| `askAI` | POST | `/creator/ask` | `{ answer: string }` |

### 2.19 Gamification

#### `gamificationApi` — 14 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `getStreaks` | GET | `/streaks` | streaks |
| `updateStreak` | POST | `/streaks/{type}` | void |
| `getXP` | GET | `/xp` | XP data |
| `getXPHistory` | GET | `/xp/history?cursor=` | paginated |
| `getAchievements` | GET | `/achievements` | achievements |
| `getLeaderboard` | GET | `/leaderboard?type=&limit=` | leaderboard |
| `getChallenges` | GET | `/challenges?cursor=&category=` | paginated |
| `createChallenge` | POST | `/challenges` | challenge |
| `joinChallenge` | POST | `/challenges/{id}/join` | void |
| `updateProgress` | PATCH | `/challenges/{id}/progress` | void |
| `getMyChallenges` | GET | `/challenges/me` | challenges |
| `createSeries` | POST | `/series` | series |
| `discoverSeries` | GET | `/series/discover?cursor=&category=` | paginated |
| `getSeries` | GET | `/series/{id}` | series |
| `addEpisode` | POST | `/series/{seriesId}/episodes` | episode |
| `followSeries` | POST | `/series/{id}/follow` | void |
| `unfollowSeries` | DELETE | `/series/{id}/follow` | void |
| `getProfileCustomization` | GET | `/profile-customization` | customization |
| `updateProfileCustomization` | PATCH | `/profile-customization` | void |

### 2.20 Miscellaneous

#### `uploadApi` — 1 endpoint
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `getPresignUrl` | POST | `/upload/presign` | `{ uploadUrl, key, publicUrl, expiresIn }` |

#### `devicesApi` — 2 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `register` | POST | `/devices` | void |
| `unregister` | DELETE | `/devices/{pushToken}` | void |

#### `profileLinksApi` — 5 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `getLinks` | GET | `/profile-links` | `ProfileLink[]` |
| `create` | POST | `/profile-links` | `ProfileLink` |
| `update` | PATCH | `/profile-links/{id}` | `ProfileLink` |
| `delete` | DELETE | `/profile-links/{id}` | void |
| `reorder` | PUT | `/profile-links/reorder` | void |

#### `schedulingApi` — 4 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `getScheduled` | GET | `/scheduling/scheduled` | `ScheduledItem[]` |
| `updateSchedule` | PATCH | `/scheduling/{type}/{id}` | void |
| `cancelSchedule` | DELETE | `/scheduling/{type}/{id}` | void |
| `publishNow` | POST | `/scheduling/publish-now/{type}/{id}` | void |

#### `ogApi` — 5 endpoints (separate file)
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `unfurl` | GET | `/og/unfurl?url=` | `OgMetadata` |
| `getPostOg` | GET | `/og/post/{postId}` | HTML string |
| `getReelOg` | GET | `/og/reel/{reelId}` | HTML string |
| `getProfileOg` | GET | `/og/profile/{username}` | HTML string |
| `getThreadOg` | GET | `/og/thread/{threadId}` | HTML string |

#### `accountApi` — 1 endpoint
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `requestDataExport` | GET | `/privacy/export` | export data |

#### `downloadsApi` — 6 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `request` | POST | `/downloads` | void |
| `getAll` | GET | `/downloads?status=&cursor=` | paginated |
| `getUrl` | GET | `/downloads/{id}/url` | `{ url: string }` |
| `updateProgress` | PATCH | `/downloads/{id}/progress` | void |
| `delete` | DELETE | `/downloads/{id}` | void |
| `getStorage` | GET | `/downloads/storage` | `{ usedBytes, count }` |

#### `parentalApi` — 8 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `linkChild` | POST | `/parental-controls/link` | void |
| `unlinkChild` | DELETE | `/parental-controls/link/{childId}` | void |
| `getChildren` | GET | `/parental-controls/children` | children |
| `getParent` | GET | `/parental-controls/parent` | parent |
| `updateControls` | PATCH | `/parental-controls/{childId}` | void |
| `verifyPin` | POST | `/parental-controls/{childId}/pin` | void |
| `changePin` | PATCH | `/parental-controls/{childId}/pin` | void |
| `getRestrictions` | GET | `/parental-controls/{childId}/restrictions` | restrictions |
| `getDigest` | GET | `/parental-controls/{childId}/digest` | digest |

#### `volunteerApi` — 3 endpoints
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `getOpportunities` | GET | `/volunteer?cursor=&category=` | paginated |
| `createOpportunity` | POST | `/volunteer` | opportunity |
| `signUp` | POST | `/volunteer/{id}/signup` | void |

#### `streamApi` — 1 endpoint (separate file)
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `handleWebhook` | POST | `/stream/webhook` | `{ received: boolean }` |

#### `retentionApi` — 1 endpoint (separate file)
| Function | Method | Path | Return |
|----------|--------|------|--------|
| `trackSessionDepth` | POST | `/retention/session-depth` | `{ success: boolean }` |

---

## 3. Endpoint Inventory Summary

| Domain | Service(s) | Endpoint Count |
|--------|-----------|----------------|
| Auth & Identity | authApi, twoFactorApi, altProfileApi | 19 |
| Users & Follows | usersApi, followsApi | 32 |
| Posts (Saf) | postsApi | 23 |
| Stories (Saf) | storiesApi, storiesReactionsApi, storyChainsApi | 23 |
| Reels (Bakra) | reelsApi, reelTemplatesApi, audioTracksApi, videoRepliesApi | 38 |
| Threads (Majlis) | threadsApi, majlisListsApi, pollsApi | 31 |
| Messages (Risalah) | messagesApi, chatExportApi, checklistsApi, encryptionApi, stickersApi | 61 |
| Channels (Minbar) | channelsApi | 12 |
| Videos (Minbar) | videosApi, subtitlesApi, clipsApi, thumbnailsApi | 39 |
| Playlists (Minbar) | playlistsApi | 11 |
| Discovery & Feed | searchApi, hashtagsApi, feedApi, recommendationsApi | 31 |
| Bookmarks & History | bookmarksApi, watchHistoryApi, draftsApi | 22 |
| Settings & Privacy | settingsApi, blocksApi, mutesApi, restrictsApi, privacyApi | 22 |
| Notifications & Moderation | notificationsApi, adminApi, moderationApi, appealsApi, reportsApi, communityNotesApi | 26 |
| Monetization | paymentsApi, monetizationApi, giftsApi, promotionsApi | 29 |
| Commerce | commerceApi | 15 |
| Community | circlesApi, communitiesApi, collabsApi, broadcastApi, eventsApi, channelPostsApi | 49 |
| Telegram Features | telegramFeaturesApi | 16 |
| Discord Features | discordFeaturesApi | 13 |
| Islamic | islamicApi, halalApi, scholarQaApi, mosquesApi | 65 |
| AI & Creator | aiApi, creatorApi | 20 |
| Gamification | gamificationApi | 14 |
| Live & Calls | liveApi, callsApi, audioRoomsApi | 35 |
| Infrastructure | uploadApi, devicesApi, profileLinksApi, schedulingApi, ogApi, accountApi, downloadsApi, parentalApi, volunteerApi, streamApi, retentionApi | 38 |
| **TOTAL** | **39 service objects** | **~574 endpoint functions** |

---

## 4. i18n Architecture

### 4.1 Configuration

**File:** `apps/mobile/src/i18n/index.ts` (58 lines)

| Config | Value |
|--------|-------|
| Library | `i18next` + `react-i18next` |
| Device locale | `expo-localization` → `getLocales()[0].languageTag` |
| Fallback | `en` (English) |
| Loading | **Synchronous** — all 8 JSONs imported at bundle time (no async flash) |
| Key separator | `.` (dot notation: `common.save`) |
| Compatibility | `v4` |
| Escape | Disabled (React handles escaping) |
| `returnNull` | `false` |
| `returnEmptyString` | `false` |

### 4.2 Language Detection

```typescript
function resolveLanguage(locale: string): string {
  if (locale.startsWith('ar')) return 'ar';
  if (locale.startsWith('tr')) return 'tr';
  if (locale.startsWith('ur')) return 'ur';
  if (locale.startsWith('id')) return 'id';
  if (locale.startsWith('bn')) return 'bn';
  if (locale.startsWith('fr')) return 'fr';
  if (locale.startsWith('ms')) return 'ms';
  return 'en';
}
```

Matches by language prefix (e.g., `ar-SA` → `ar`). Falls back to English for any unlisted locale.

### 4.3 Language Files

| File | Language | RTL | Namespaces | Leaf Keys | Translation % |
|------|----------|-----|------------|-----------|---------------|
| `en.json` | English | No | 133 | 3,757 | 100% (source) |
| `ar.json` | Arabic | **Yes** | 133 | 3,752 | ~77% real |
| `tr.json` | Turkish | No | 133 | 3,752 | ~89% real |
| `ur.json` | Urdu | **Yes** | 133 | 3,764 | ~14% real |
| `bn.json` | Bengali | No | 133 | 3,758 | ~14% real |
| `fr.json` | French | No | 133 | 3,758 | ~15% real |
| `id.json` | Indonesian | No | 133 | 3,758 | ~16% real |
| `ms.json` | Malay | No | 133 | 3,758 | ~15% real |

**Note:** All 8 files have 133 top-level namespaces and structurally match at 100%. Translation percentages reflect how many keys have real translated text vs. being English fallback copies.

### 4.4 Top-Level Namespaces (133)

```
common, auth, tabs, saf, bakra, majlis, risalah, minbar, profile, islamic,
prayerNotifications, monetization, notifications, settings, onboarding,
accessibility, gif, compose, community, discover, editProfile, screens,
createReel, createVideo, qibla, nasheed, hijri, eidCards, quranRoom,
quranPlan, hajj, charity, giftShop, audioLibrary, conversationMedia,
tafsir, scholar, contentFilter, dhikr, contactSync, biometric, undoSend,
clearMode, dmNotes, hideReply, muteConversation, crossPost, quietMode,
screenTime, autoPlaySettings, collabPlaylist, channel, channelTrailer,
downloads, shareReceive, widgets, miniPlayer, parentalControls, pip,
ambient, premiere, clips, endScreens, ai, marketplace, orders, series,
gamification, stories, windDown, feed, sessions, storyStickers, translation,
manageData, accountSettings, network, analyticsAI, thumbnails, live,
voicePost, seriesEnhanced, flipside, messages, newConversation, chatFolders,
stickers, encryption, videoEditor, coins, gifts, diamonds, themes,
scholarQA, mosque, prayer, hifz, namesOfAllah, fasting, duas, halal, tts,
autocomplete, dailyBriefing, chatExport, disappearingDefault, cashout,
chatLock, statusPrivacy, contentSettings, camera, voiceRecorder, duet,
stitch, reelTemplates, captionEditor, volunteer, audioRoom, video,
locationPicker, errorBoundary, search, share, communityNotes, forceUpdate,
reactions, analytics, chat, creatorDashboard, createSheet, carousel, calls,
schedule
```

### 4.5 RTL Handling

- RTL languages: **Arabic (ar)**, **Urdu (ur)**
- RTL is handled at the stylesheet level: ~430 `marginLeft/Right` → `marginStart/End` replacements across 134 files (completed in session 2)
- i18n config itself has no RTL-specific settings (handled by React Native's `I18nManager`)
- Remaining: ~50 intentional `left:/right:` skips for physical positions (e.g., absolute positioning in drawing canvas)

---

## 5. Non-HTTP Service Files

These 7 files are **not API clients** — they are local services that don't make HTTP calls to the backend:

### 5.1 `downloadManager.ts` (115 lines)
Local file system download manager using `expo-file-system`.
- **Exports:** `startDownload`, `pauseDownload`, `resumeDownload`, `clearActiveDownload`, `deleteFile`, `getStorageInfo`, `isDownloaded`, `getLocalUri`
- Uses `FileSystem.createDownloadResumable` for resumable downloads
- Stores files at `${documentDirectory}offline-downloads/{contentId}.{ext}`

### 5.2 `pushNotifications.ts` (293 lines)
Push notification service using `expo-notifications` and `expo-device`.
- **Exports:** `registerForPushNotifications`, `configurePushChannels`, `schedulePrayerNotification`, `scheduleRamadanNotification`, `cancelScheduledNotification`, `cancelAllScheduledNotifications`, `getAllScheduledNotifications`, `unregisterPushToken`
- 6 Android notification channels: messages, likes, follows, mentions, live, islamic
- Calls `devicesApi.register()` to register push tokens with backend

### 5.3 `widgetData.ts` (95 lines)
Home screen widget data bridge (AsyncStorage + native module).
- **Exports:** `widgetData.updatePrayerTimes`, `.updateUnreadCounts`, `.getPrayerTimes`, `.getUnreadCounts`
- Stores data in AsyncStorage and pushes to native `WidgetModule` via NativeModules
- Two widget types: PrayerTimes, UnreadCounts

### 5.4 `encryption.ts` (267 lines)
End-to-end encryption service using `tweetnacl` (XSalsa20-Poly1305 + X25519).
- **Exports:** `encryptionService` singleton with methods: `initialize`, `getFingerprint`, `setupConversationEncryption`, `getConversationKey`, `encryptMessage`, `decryptMessage`, `rotateConversationKey`, `clearAllKeys`, `isInitialized`, `hasConversationKey`
- Private key stored in `expo-secure-store`
- Conversation keys cached in `SecureStore` as JSON map

### 5.5 `nsfwCheck.ts` (200 lines)
On-device NSFW content screening using `nsfwjs` + `TensorFlow.js`.
- **Exports:** `initNSFWModel`, `checkImage`, `checkImages`
- Block threshold: 0.6 (Porn/Hentai), 0.8 (Sexy)
- Graceful degradation: returns `{ safe: true, checked: false }` if model not loaded
- Dynamic imports so app never crashes if packages missing

### 5.6 `ffmpegEngine.ts` (673 lines)
FFmpeg command builder and executor for video editor.
- **Exports:** `buildConcatCommand`, `buildCommand`, `executeExport`, `cancelExport`, `isFFmpegAvailable`
- Types: `EditParams` (35+ fields), `FilterName` (13 presets), `QualityPreset`, `VoiceEffect`, `TransitionType`, `AspectRatio`
- 8 transition types for multi-clip concat (xfade)
- 13 color filter presets mapped to FFmpeg filter expressions
- Single concurrent export (activeSessionId tracking)

### 5.7 `giphyService.ts` (191 lines)
Unified GIPHY interface (native SDK + REST API fallback).
- **Exports:** `initGiphy`, `isSDKAvailable`, `showGiphyPicker`, `searchGiphy`, `getTrending`, `searchStickers`, `searchText`, `GIPHY_CATEGORIES`
- SDK: `@giphy/react-native-sdk` for native dialog (GIF, Sticker, Text, Emoji)
- REST fallback: `https://api.giphy.com/v1/{type}/search|trending` with PG rating
- 8 browsing categories including Islamic-specific (ramadan, eid)

---

## Appendix: Request Payload Types (defined in api.ts)

| Type | Used By | Notable Fields |
|------|---------|----------------|
| `UpdateUserPayload` | `usersApi.updateMe` | madhab, interests[] |
| `CreatePostPayload` | `postsApi.create` | commentPermission (EVERYONE/FOLLOWERS/NOBODY), altText, taggedUserIds, collaboratorUsername, brandedContent, remixAllowed, shareToFeed, topics[], scheduledAt |
| `CreateStoryPayload` | `storiesApi.create` | stickerData[], closeFriendsOnly, subscribersOnly, bgGradient |
| `CreateThreadPayload` | `threadsApi.create` | poll object (question, options, duration, allowMultiple), replyPermission, scheduledAt |
| `CreateReelPayload` | `reelsApi.create` | isPhotoCarousel, carouselUrls[], carouselTexts[], isTrial, scheduledAt, commentPermission, topics[] |
| `CreateVideoData` | `videosApi.create` | chapters[] (title + startTime), normalizeAudio |
| `SendMessagePayload` | `messagesApi.sendMessage` | isSpoiler, isViewOnce, voiceDuration |
| `PrivacySettings` | `settingsApi.updatePrivacy` | isPrivate, activityStatus |
| `NotificationSettings` | `settingsApi.updateNotifications` | 5 boolean toggles |
| `AccessibilitySettings` | `settingsApi.updateAccessibility` | reducedMotion, fontSize |
| `WellbeingSettings` | `settingsApi.updateWellbeing` | sensitiveContent, dailyTimeLimit |
