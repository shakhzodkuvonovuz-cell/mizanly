# Mobile Messaging & Calls Architecture

Extraction scope: All 12 screens in Risalah (messaging) space + call system.
Total lines across all files: **7,408 lines**.

---

## File Inventory

| File | Lines | Purpose |
|------|-------|---------|
| `conversation/[id].tsx` | 2,429 | Main chat screen (2nd largest in app) |
| `conversation-info.tsx` | 1,057 | Chat info / group management |
| `call/[id].tsx` | 652 | Active call screen (voice + video) |
| `new-conversation.tsx` | 397 | Start new DM (search + recent contacts) |
| `create-group.tsx` | 391 | Create group chat |
| `chat-lock.tsx` | 388 | Biometric lock per-conversation |
| `dm-note-editor.tsx` | 373 | DM notes (Instagram-style status notes) |
| `starred-messages.tsx` | 360 | Starred/bookmarked messages viewer |
| `chat-folders.tsx` | 346 | Telegram-style chat folders + quick filters |
| `call-history.tsx` | 292 | Call log with infinite scroll |
| `pinned-messages.tsx` | 260 | Pinned messages viewer |
| `chat-export.tsx` | 463 | Export chat (text/JSON format) |

---

## 1. Conversation Screen (`conversation/[id].tsx` -- 2,429 lines)

### 1.1 Imports & Dependencies

```
react, react-native (View, Text, FlatList, KeyboardAvoidingView, Pressable, TextInput, LayoutAnimation)
react-native-gesture-handler (Swipeable, PanGestureHandler)
react-native-reanimated (useSharedValue, useAnimatedStyle, withSpring, withTiming, FadeIn, FadeOut)
expo-image-picker, expo-av (Audio), expo-clipboard
@react-native-async-storage/async-storage
expo-linear-gradient
socket.io-client (io, Socket)
@tanstack/react-query (useQuery, useInfiniteQuery, useMutation, useQueryClient)
@clerk/clerk-expo (useAuth, useUser)
date-fns (format, isToday, isYesterday, isSameDay, differenceInMinutes, formatDistanceToNowStrict)
```

### 1.2 Key Internal Imports

- `messagesApi, uploadApi, aiApi, SOCKET_URL` from `@/services/api`
- `encryptionService` from `@/services/encryption`
- `TypingIndicator` from `@/components/risalah/TypingIndicator`
- `ImageLightbox` from `@/components/ui/ImageLightbox`
- `RichText` from `@/components/ui/RichText`
- `ProgressiveImage` from `@/components/ui/ProgressiveImage`
- RTL utilities: `rtlFlexRow, rtlTextAlign, rtlArrow, rtlMargin, rtlBorderStart`

### 1.3 Types & Constants

```ts
interface TenorGifResult {
  id: string;
  media_formats: { gif: { url: string } };
}

interface EncryptedMessage extends Message {
  isEncrypted?: boolean;
  encNonce?: string | null;
}

type PendingMessage = {
  id: string;
  content: string;
  createdAt: string;
  status: 'pending' | 'failed';
  replyToId?: string;
};

type ListItem =
  | { type: 'date'; label: string; key: string }
  | { type: 'msg'; message: Message; isGroupStart: boolean; isGroupEnd: boolean; key: string }
  | { type: 'pending'; pending: PendingMessage; key: string };

const QUICK_REACTION_EMOJIS = ['heart', 'thumbsup', 'laugh', 'surprised', 'cry', 'dua-hands'];
const GROUP_GAP_MS = 2 * 60 * 1000; // 2 min gap breaks a message group
```

### 1.4 Socket.io Integration (Conversation Screen)

**Connection setup** (lines 898-990):
- Connects to `SOCKET_URL` with Clerk JWT auth via `getToken()`
- Transport: `websocket` only
- Reconnection: enabled, 10 attempts, 1000ms delay
- On `connect_error`: refreshes token via `getToken({ skipCache: true })` and re-sets `socket.auth`

**Events EMITTED:**

| Event | Payload | When |
|-------|---------|------|
| `join_conversation` | `{ conversationId }` | On socket connect |
| `leave_conversation` | `{ conversationId }` | On unmount cleanup |
| `send_message` | `{ conversationId, content, messageType, clientId, replyToId?, isEncrypted?, encNonce?, isSpoiler?, isViewOnce?, mediaUrl?, mediaType? }` | Text send (after 5s undo window), voice send, GIF send, forward |
| `typing` | `{ conversationId, isTyping: boolean }` | On text input change (true), after 2s idle (false) |

**Events LISTENED:**

| Event | Payload | Handler |
|-------|---------|---------|
| `new_message` | `Message & { clientId?: string }` | Appends to query cache, removes matching pending message, scrolls to end, marks as new for animation |
| `delivery_receipt` | `{ messageId, deliveredAt, deliveredTo }` | Adds messageId to `deliveredMessages` Set |
| `user_typing` | `{ userId, isTyping: boolean }` | Sets `otherTyping` state, auto-clears after 5 seconds |

**Reconnect behavior:**
- On `connect`: re-emits `join_conversation`, invalidates messages query, retries all pending messages
- Pending message retry also triggers on `isOffline` state change

### 1.5 Message Rendering

**Message grouping** (`buildMessageList` function):
- Groups consecutive messages from same sender within 2-minute window
- Inserts date separators when day changes (Today / Yesterday / full date)
- Each message marked with `isGroupStart` and `isGroupEnd` booleans

**Corner radius system** (WhatsApp-style):
- Own messages: left always `radius.lg`, right varies (start: `radius.xl`, grouped: `4px`, end: `4px`)
- Other messages: right always `radius.lg`, left varies similarly

**Message types handled in `MessageBubble` (memo'd component):**

| Type | Rendering |
|------|-----------|
| `SYSTEM` | Centered bubble with lock/bell icon, tertiary text |
| Deleted (`isDeleted`) | Italic "Message deleted" text |
| `VOICE` + mediaUrl | `VoicePlayer` component (play/pause, deterministic sine waveform bars) |
| Spoiler (`isSpoiler`) | Tap-to-reveal overlay with `eye-off` icon, animated opacity fade |
| View-once (`isViewOnce`) | Clock icon badge, "View once" / "Opened" label |
| Forwarded (`isForwarded`) | Share icon + "Forwarded" italic label |
| Reply (`replyTo`) | Reply preview block with emerald border, sender name, content preview |
| Image (`mediaUrl` without voice) | `ProgressiveImage` 200x200, tappable to open `ImageLightbox` |
| Text (`content`) | `RichText` for normal display, or `highlightSearchText` with gold background during search |
| GIF | Sent via socket as messageType `GIF` with mediaUrl |

**Inline features in bubble:**
- **Inline translation**: Tap "Translate" link calls `aiApi.translate()`, shows italic translated text with "Show original" toggle
- **Edit indicator**: Shows "edited" label when `editedAt` exists
- **Timestamp**: HH:mm for today, "Yesterday HH:mm", "MMM d, HH:mm" otherwise
- **Read receipts**: Single check (sent), double check (delivered), emerald double check (read). Shows up to 3 reader avatars with "+N" overflow
- **Disappearing timer**: Shows countdown via `formatDistanceToNowStrict(expiresAt)`
- **Reactions**: Grouped emoji chips with count, own reactions highlighted with emerald border. Tap to toggle add/remove reaction

### 1.6 E2E Encryption

- Initializes via `encryptionService.initialize()` on mount
- Checks `encryptionService.hasConversationKey(id)` to set `isEncrypted` state
- When encrypting: `encryptionService.encryptMessage(id, content)` returns `{ ciphertext, nonce }`
- When decrypting: `encryptionService.decryptMessage(id, content, nonce)` called for each incoming encrypted message
- Decrypted contents cached in `Map<string, string>` state to avoid re-decryption
- Green banner shown at top when encryption is active
- Context menu option to enable encryption: calls `encryptionService.setupConversationEncryption(id, memberIds)`

### 1.7 Voice Recording

- Uses `expo-av` `Audio.Recording` with `HIGH_QUALITY` preset
- Flow: `onPressIn` starts recording, `onPressOut` stops and uploads
- Recording timer tracks seconds with `setInterval`
- **Slide-to-cancel**: `PanGestureHandler` tracks horizontal drag. If `translationX < -60`, recording is cancelled
- Upload: presigned URL from `uploadApi.getPresignUrl('audio/m4a', 'messages')`, then PUT blob, then emit `send_message` with `messageType: 'VOICE'`
- Audio mode toggled: `allowsRecordingIOS: true` on start, `false` on stop
- Recording ref cleaned up on unmount

### 1.8 GIF Picker

- Built-in `GifPicker` component (BottomSheet, 400px snap)
- Uses **Tenor API** via `EXPO_PUBLIC_TENOR_API_KEY`
- Endpoints: `/v2/search` (with query) or `/v2/featured` (trending)
- 30 results, 2-column grid with `ProgressiveImage`
- Selected GIF sent via socket as `messageType: 'GIF'`

### 1.9 Undo Send

- 5-second undo window after pressing send
- Optimistic: pending message shown immediately
- `undoPending` state holds payload + timer
- Undo bar appears with "Sending..." + "Undo" button
- If new message sent before timer expires, previous message committed immediately
- Timer cleared on unmount

### 1.10 Context Menu (BottomSheet)

Actions available on long-press:

| Action | Condition | Implementation |
|--------|-----------|----------------|
| Quick reactions | Always | 6 emoji buttons in top bar |
| Copy | Has content | `Clipboard.setStringAsync()` |
| Reply | Always | Sets replyTo, focuses input |
| Forward | Always | Opens forward picker (lists conversations) |
| Pin/Unpin | Always | `messagesApi.pin()` / `messagesApi.unpin()` |
| Star/Unstar | Always | `messagesApi.toggleStar()` |
| React | Always | Opens full reaction picker sheet |
| Enable encryption | Not encrypted | `encryptionService.setupConversationEncryption()` |
| Edit | Own message, < 15 min old | Sets editingMsg, prefills input |
| Delete for everyone | Own message, < 15 min old | `messagesApi.deleteMessage()` |
| Delete | Own message, > 15 min old | `messagesApi.deleteMessage()` |

### 1.11 Input Bar Features

- **Attach media**: `ImagePicker.launchImageLibraryAsync()`, presigned upload, `messagesApi.sendMessage()` with `messageType: 'IMAGE'`
- **Spoiler toggle**: Sets `sendAsSpoiler` boolean, displayed as tag in bar
- **View-once toggle**: Sets `sendAsViewOnce` boolean, displayed as tag in bar
- **GIF button**: Opens GifPicker BottomSheet
- **Sticker button**: Navigates to `/(screens)/sticker-browser`
- **Text input**: Multiline, max 2000 chars, rounded pill style
- **Send button**: Animated scale (spring) appears when text non-empty. Emerald circle with send icon
- **Mic button**: Appears when text empty. PanGestureHandler for slide-to-cancel

### 1.12 Other Features

- **Message search**: Toggle search mode, filters messages client-side, highlights matches with gold background
- **Chat theme**: Loads from AsyncStorage key `chat-theme:{id}`, 12 background color presets (midnight, purple, forest, charcoal, navy, etc.)
- **Pinned message banner**: Shows first pinned message at top, tap scrolls to it
- **Scroll-to-bottom FAB**: Appears when >200px from bottom
- **Reply banner**: Shows when replying, with @username and content preview
- **Edit banner**: Shows when editing, with original content preview
- **Typing indicator**: Shared `<TypingIndicator />` component shown under name in header
- **Online status**: Avatar shows online indicator in header
- **Infinite pagination**: `useInfiniteQuery` with cursor-based pagination, `onEndReached` loads more
- **Mark as read**: `messagesApi.markRead(id)` called on mount

### 1.13 State Variables (35+)

```
text, sendAsSpoiler, sendAsViewOnce, replyTo, pendingMessages, deliveredMessages,
pinnedMessage, isTyping, otherTyping, showScrollToBottom, uploadingMedia,
isRecording, uploadingVoice, recordingTime, slideOffset, cancelled,
contextMenuMsg, forwardMsg, editingMsg, showReactionPicker, showGifPicker,
gifSearchQuery, gifResults, gifLoading, searchMode, searchQuery, refreshing,
chatThemeBg, isEncrypted, encryptionReady, decryptedContents, isSending,
undoPending, lightboxImage (in MessageBubble), spoilerRevealed (in MessageBubble),
translatedText (in MessageBubble), isTranslating (in MessageBubble)
```

---

## 2. Conversation Info Screen (`conversation-info.tsx` -- 1,057 lines)

### 2.1 Queries & Mutations

| Query/Mutation | API Call | Purpose |
|---------------|----------|---------|
| `convoQuery` | `messagesApi.getConversation(id)` | Load conversation details |
| `memberSearchQuery` | `searchApi.search(query)` | Search users to add to group |
| `leaveGroupMutation` | `messagesApi.leaveGroup(id)` | Leave group chat |
| `updateGroupMutation` | `messagesApi.updateGroup(id, data)` | Update name/avatar |
| `addMembersMutation` | `messagesApi.addMembers(id, memberIds)` | Add members |
| `removeMemberMutation` | `messagesApi.removeMember(id, targetUserId)` | Remove member |
| `muteMutation` | `messagesApi.mute(id, muted)` | Toggle mute |

### 2.2 Group Management UI

- **Hero card**: Avatar (tappable for creator to change), name (tappable to edit), member count
- **Admin actions**: Add members button (only for creator)
- **Group invite link**: Share/Copy deeplink `mizanly://group/{id}/invite`
- **Members list**: Each member with avatar, name, verified badge, creator badge, custom tag. Long-press opens action sheet (remove from group, view profile)
- **Avatar upload**: `ImagePicker` -> presigned R2 upload -> `updateGroup`

### 2.3 Chat Options (Navigation Links)

| Link | Destination |
|------|------------|
| Starred messages | `/(screens)/starred-messages?conversationId=` |
| Pinned messages | `/(screens)/pinned-messages?conversationId=` |
| Media | `/(screens)/conversation-media?id=` |
| Export chat | `/(screens)/chat-export?conversationId=` |
| Disappearing messages | `/(screens)/disappearing-settings?conversationId=` |
| Wallpaper | `/(screens)/chat-wallpaper?conversationId=` |
| Theme | `/(screens)/chat-theme-picker?conversationId=` |
| Chat lock | `/(screens)/chat-lock?conversationId=` |
| E2E encryption | `/(screens)/verify-encryption?conversationId=` |

### 2.4 Destructive Actions

- **Leave group** (non-creator): Alert confirmation -> `leaveGroupMutation` -> redirect to Risalah tab
- **Block user** (1:1 only): Alert confirmation -> `blocksApi.block(userId)` -> redirect to Risalah tab
- **Remove member** (creator only): Alert confirmation -> `removeMemberMutation`

### 2.5 Bottom Sheets

1. **Edit group name**: TextInput with CharCountRing (max 50), Save button
2. **Add members**: Search input, selected chips with remove, search results list, Add button with count
3. **Member actions**: Remove from group (creator, destructive), View profile

---

## 3. Call Screen (`call/[id].tsx` -- 652 lines)

### 3.1 Architecture

```
Call data: useQuery(['call', id]) -> api.get(`/calls/${id}`)
ICE config: useQuery(['ice-servers']) -> callsApi.getIceServers(), 5-min staleTime
WebRTC: useWebRTC hook with socketRef, iceServers, isInitiator flag
```

### 3.2 Types

```ts
type CallType = 'voice' | 'video';
type CallStatus = 'ringing' | 'connected' | 'ended' | 'missed' | 'declined';

interface Call {
  id, callerId, calleeId, type, status, startedAt?, endedAt?,
  caller?: { id, username, displayName, avatarUrl? },
  callee?: { id, username, displayName, avatarUrl? }
}
```

### 3.3 Socket.io Integration (Call Screen)

**Connection**: Same pattern as conversation -- JWT auth, websocket transport, 10 reconnection attempts, token refresh on `connect_error`.

**Events LISTENED:**

| Event | Handler |
|-------|---------|
| `call_answered` | Set status to 'connected' |
| `call_ended` | Set status to 'ended', clear interval, auto-navigate back after 2s |
| `incoming_call` | Set status to 'ringing' |
| `call_rejected` | Set status to 'missed' |

**Events NOT EMITTED from mobile** (critical bug documented in CLAUDE.md):
- `call_initiate`, `call_answer`, `call_end` -- these socket emits are MISSING. Calls rely only on REST API mutations (`callsApi.answer`, `callsApi.end`, `callsApi.decline`) which do not trigger socket events for the other party.

### 3.4 WebRTC Hook Usage (`useWebRTC`)

```ts
const webrtc = useWebRTC({
  socketRef,
  socketReady,
  targetUserId: targetUser ?? '',
  callType: (call?.type ?? 'voice') as 'voice' | 'video',
  iceServers: iceConfig?.iceServers ?? [],
  isInitiator: !isIncomingCall,
  onConnected: () => setCallStatus('connected'),
  onDisconnected: () => setCallStatus('ended'),
  onFailed: () => { setCallStatus('ended'); showToast error },
});
```

**Hook API used:**
- `webrtc.start()` -- called on answer (incoming) or when socket+ICE ready (outgoing)
- `webrtc.hangup()` -- called before endCallMutation
- `webrtc.toggleMute()` -- mute button
- `webrtc.flipCamera()` -- flip camera button (video only)
- `webrtc.isMuted` -- mute state
- `webrtc.isFrontCamera` -- camera facing for RTCView mirror prop
- `webrtc.localStream` -- local camera for PiP
- `webrtc.remoteStream` -- remote stream for main view

### 3.5 Call UI

**Ringing state:**
- Pulsing ring animation: `withRepeat(withTiming(1.4, 1500ms), -1, true)` on scale + opacity
- Avatar with `size="3xl"`, ring color gold
- Incoming: Decline (red gradient) + Answer (emerald-gold gradient) buttons
- Outgoing: Mute + Speaker + End Call buttons

**Connected state:**
- Avatar ring color emerald
- Duration timer (setInterval, formatted MM:SS)
- Status text emerald colored
- Controls: Mute, Speaker, Flip Camera (video only), End Call

**Video rendering:**
- Remote: `RTCView` full-width 4:3 aspect ratio, objectFit cover
- Local PiP: 100x140 absolute positioned top-right, border, zOrder 1, mirror when front camera
- Fallback: gradient placeholder with "Connecting video..." when no remote stream

**Known issue:** Speaker toggle is UI-only (`setIsSpeakerOn` state). Needs `react-native-incall-manager` for actual audio routing.

### 3.6 REST API Mutations

| Mutation | API | Side effects |
|----------|-----|-------------|
| `answerMutation` | `callsApi.answer(id)` | Set connected, haptic success |
| `endCallMutation` | `callsApi.end(id)` | Set ended, haptic delete, router.back |
| `declineMutation` | `callsApi.decline(id)` | Set declined, haptic delete, router.back |

---

## 4. useWebRTC Hook (Summary)

File: `apps/mobile/src/hooks/useWebRTC.ts`

- Uses `react-native-webrtc` v124
- Pattern B: Manual `addTrack` to MediaStream for remote streams
- `pc.ontrack` (not `addEventListener`) per RN-WebRTC docs
- Callback refs to prevent stale closures in PC event handlers
- `startingRef` mutex prevents double-start
- ICE trickle with candidate queue (max 200) for candidates arriving before remote description
- `stream.release()` on cleanup for native resource management
- Camera flip via `applyConstraints` (not stop+restart track pattern)
- `mountedRef` prevents state updates after unmount

---

## 5. Call History Screen (`call-history.tsx` -- 292 lines)

### 5.1 Data Flow

- `useInfiniteQuery(['call-history'])` with `callsApi.getHistory(cursor)`
- Cursor-based pagination with `onEndReached` at 0.5 threshold

### 5.2 UI Per Call Entry

- Avatar + display name of other party
- Call type icon (phone/video) with gradient background
- Status text: missed/declined/ringing/connected/duration
- Missed calls: red colored name + status
- Relative time: `formatDistanceToNowStrict` with locale
- Action button: gradient circle linking to call detail screen
- Staggered entrance: `FadeInUp.delay(index * 50)`

---

## 6. New Conversation Screen (`new-conversation.tsx` -- 397 lines)

### 6.1 Data Sources

| Query | API | Purpose |
|-------|-----|---------|
| `dm-search` | `searchApi.search(query)` | Search people (debounced 350ms, min 2 chars) |
| `recent-conversations` | `messagesApi.getConversations()` | Extract recent contacts |
| `dm-suggestions` | `followsApi.suggestions()` | Suggested contacts (when not searching) |

### 6.2 Contact Extraction

- `extractContact(convo, myId)`: Gets other user from 1:1 conversation, supports both `convo.otherUser` and `convo.members` patterns
- `RecentContact` extends `User` with `lastMessageText`, `lastMessageAt`, `conversationId`
- Deduped by user ID, sorted by recent message

### 6.3 UI Layout

- `SectionList` when not searching: "Recent Contacts" + "Suggestions" sections
- `FlatList` when searching: filtered people results
- Each row: Avatar, name (with verified badge), last message (recent) or @username (new)
- Tap recent contact: navigate to existing conversation
- Tap new person: `dmMutation` creates DM then `router.replace` to conversation

---

## 7. Create Group Screen (`create-group.tsx` -- 391 lines)

### 7.1 Flow

1. Enter group name (TextInput, max 50, CharCountRing)
2. Pick avatar (optional, ImagePicker 1:1 crop)
3. Search and add members (min 2)
4. Create button -> `createMutation` -> avatar upload (R2 presigned) -> `messagesApi.createGroup()` -> navigate to conversation

### 7.2 UI

- Member chips: avatar + name + remove X button, wrapped flexbox
- Search: debounced 350ms, excludes self and already-selected
- Results: user rows with plus icon
- Validation: error message when < 2 members
- GradientButton for create action

---

## 8. Pinned Messages Screen (`pinned-messages.tsx` -- 260 lines)

- Query: `messagesApi.getPinned(conversationId)`
- Cards: emerald left border, pin icon, sender name, timestamp, content/media placeholder
- Unpin action: `messagesApi.unpin(conversationId, messageId)` with toast feedback
- Staggered entrance: `FadeInUp.delay(index * 80)`

---

## 9. Starred Messages Screen (`starred-messages.tsx` -- 360 lines)

- Query: `messagesApi.getStarredMessages()` (global, filtered client-side by conversationId if provided)
- Conversation header: name + starred count with gold bookmark icon
- Cards: gold left border, avatar, sender name, timestamp, content/media, reaction chips
- Unstar action: `messagesApi.toggleStar(conversationId, messageId)` with toast feedback
- Star emoji reaction rendered with gold gradient background

---

## 10. Chat Folders Screen (`chat-folders.tsx` -- 346 lines)

### 10.1 Predefined Quick Filters

| Filter | Icon | Color | Logic |
|--------|------|-------|-------|
| Unread | bell | blue | `unreadCount > 0` |
| Groups | users | emerald | `isGroup === true` |
| Channels | globe | gold | `isChannel === true` |
| Personal | user | purple | `!isGroup && !isChannel` |

### 10.2 Custom Folders CRUD

- **API**: `api.get/post/patch/delete('/chat-folders')`
- **Create**: Name input (max 50) + icon picker (8 icons: users, heart, globe, layers, bell, bookmark, flag, lock)
- **Edit**: Same form, pre-populated from folder data
- **Delete**: BottomSheet destructive action
- **8 folder colors**: emerald, gold, blue, purple, red, pink, orange, teal

### 10.3 Navigation

- Folder tap -> `/(screens)/chat-folder-view?filter=folder&folderId=`
- Quick filter tap -> `/(screens)/chat-folder-view?filter={key}`

---

## 11. Chat Lock Screen (`chat-lock.tsx` -- 388 lines)

### 11.1 Hook

Uses `useChatLock()` hook which provides:
- `isLocked(conversationId)` -- checks AsyncStorage
- `lockConversation(conversationId)` -- sets lock, returns boolean
- `unlockConversation(conversationId)` -- removes lock, returns boolean
- `isBiometricAvailable()` -- checks device capability

### 11.2 UI

- Lock icon: emerald gradient when locked, surface gradient when unlocked
- Toggle switch: Lock/unlock with biometric auth
- Info cards: notification preview hidden, biometric availability
- Remove lock button: red, with Alert confirmation
- Explanation section: 4 bullet points explaining behavior

---

## 12. DM Note Editor Screen (`dm-note-editor.tsx` -- 373 lines)

### 12.1 Feature

Instagram-style DM notes (short status messages visible to contacts).

### 12.2 Data

- Query: `messagesApi.getMyDMNote()` -- hydrates content on load
- Create: `messagesApi.createDMNote(content, expiryHours)`
- Delete: `messagesApi.deleteDMNote()`

### 12.3 UI

- Text input with CharCountRing (max 60 characters)
- Expiry picker: BottomSheet with 6 options (1h, 4h, 12h, 24h, 48h, 72h)
- Live preview bubble
- GradientButton for post/update
- Ghost button for delete (with Alert confirmation)
- Current note info card

---

## 13. Chat Export Screen (`chat-export.tsx` -- 463 lines)

### 13.1 Data

- Stats: `chatExportApi.getStats(conversationId)` returns `{ name, isGroup, memberCount, messageCount, mediaCount }`
- Export: `chatExportApi.generateExport(conversationId, { format, includeMedia })` returns `{ url, filename }`

### 13.2 UI

- Stats card: icon circle, name, group/direct label, stats grid (members, messages, media)
- Format selector: radio buttons for Text (.txt) or JSON (.json)
- Include media toggle: Switch for media links
- Export button: GradientButton with loading state, triggers `Share.share()`
- Privacy footer: lock icon + explanation text

---

## 14. Cross-Cutting Patterns

### 14.1 Shared UI Components Used Across All Screens

| Component | Usage |
|-----------|-------|
| `GlassHeader` | Every screen (back button + title) |
| `ScreenErrorBoundary` | Wraps every screen export |
| `Avatar` | Conversation headers, member lists, message bubbles |
| `Icon` | All action icons (44 valid names) |
| `Skeleton.*` | Loading states (Circle, Rect, PostCard, ConversationItem, ProfileHeader) |
| `EmptyState` | Empty lists, error states |
| `BottomSheet` + `BottomSheetItem` | Context menus, pickers, actions |
| `BrandedRefreshControl` | All FlatLists/ScrollViews |
| `showToast` | Mutation feedback (success/error) |
| `LinearGradient` | Cards, buttons, icon backgrounds |

### 14.2 Theming

- All screens use `useThemeColors()` hook (`tc.bg`, `tc.text.primary`, etc.)
- No hardcoded `colors.dark.*` in JSX
- Staggered entrance animations on all list items (`FadeInUp.delay(index * N)`)

### 14.3 Haptic Patterns

- `haptic.tick()` -- toggle actions (mute, search)
- `haptic.like()` -- reactions
- `haptic.send()` -- message send
- `haptic.success()` -- uploads, answers
- `haptic.error()` -- mutation errors
- `haptic.delete()` -- end call, decline, remove
- `haptic.longPress()` -- context menu, voice start, member actions
- `haptic.follow()` -- add member
- `haptic.navigate()` -- folder navigation, refresh

### 14.4 i18n

All screens fully i18n'd via `useTranslation()`. Key namespaces:
- `messages.*`, `risalah.*`, `conversation.*`, `calls.*`, `groups.*`
- `dmNotes.*`, `chatLock.*`, `chatExport.*`
- `common.*`, `errors.*`, `accessibility.*`
- `screens.pinned-messages.*`, `screens.starred-messages.*`

### 14.5 Accessibility

- `accessibilityRole="button"` on all pressables
- `accessibilityLabel` on all interactive elements
- `accessibilityState` on disabled/selected elements
- RTL support via utility functions throughout

---

## 15. API Service Methods Used

### 15.1 messagesApi

| Method | Used In |
|--------|---------|
| `getConversation(id)` | conversation, conversation-info, starred-messages |
| `getConversations()` | new-conversation, conversation (forward picker) |
| `getMessages(id, cursor)` | conversation (infinite query) |
| `sendMessage(id, { messageType, mediaUrl, replyToId })` | conversation (media send) |
| `markRead(id)` | conversation (on mount) |
| `editMessage(id, msgId, content)` | conversation (edit mode) |
| `deleteMessage(id, msgId)` | conversation (context menu) |
| `reactToMessage(id, msgId, emoji)` | conversation (reactions) |
| `removeReaction(id, msgId, emoji)` | conversation (remove reaction) |
| `pin(id, msgId)` | conversation (context menu) |
| `unpin(id, msgId)` | conversation, pinned-messages |
| `getPinned(id)` | conversation, pinned-messages |
| `toggleStar(id, msgId)` | conversation, starred-messages |
| `getStarredMessages()` | starred-messages |
| `createDM(targetUserId)` | new-conversation |
| `createGroup(name, memberIds, avatarUrl?)` | create-group |
| `leaveGroup(id)` | conversation-info |
| `updateGroup(id, { groupName?, groupAvatarUrl? })` | conversation-info |
| `addMembers(id, memberIds)` | conversation-info |
| `removeMember(id, targetUserId)` | conversation-info |
| `mute(id, muted)` | conversation-info |
| `getMyDMNote()` | dm-note-editor |
| `createDMNote(content, expiryHours)` | dm-note-editor |
| `deleteDMNote()` | dm-note-editor |

### 15.2 callsApi

| Method | Used In |
|--------|---------|
| `getHistory(cursor)` | call-history |
| `getIceServers()` | call/[id] |
| `answer(id)` | call/[id] |
| `end(id)` | call/[id] |
| `decline(id)` | call/[id] |

### 15.3 Other APIs

| API | Method | Used In |
|-----|--------|---------|
| `searchApi.search(query)` | conversation-info (add members), new-conversation |
| `followsApi.suggestions()` | new-conversation |
| `uploadApi.getPresignUrl(mimeType, folder)` | conversation (media/voice), conversation-info (avatar), create-group (avatar) |
| `aiApi.translate(content, 'auto')` | conversation (inline translation) |
| `blocksApi.block(userId)` | conversation-info |
| `chatExportApi.getStats(id)` | chat-export |
| `chatExportApi.generateExport(id, options)` | chat-export |

---

## 16. Known Issues & Technical Debt

1. **WebRTC calls non-functional end-to-end**: 3 missing socket emits (`call_initiate`, `call_answer`, `call_end`) from mobile. REST mutations fire but don't notify the other party via socket.
2. **CallType enum mismatch**: Socket DTO validates 'AUDIO'/'VIDEO' but mobile sends 'voice'/'video' (lowercase).
3. **Speaker routing is UI-only**: `isSpeakerOn` state toggles but no `react-native-incall-manager` wired for actual audio route changes.
4. **Waveform is cosmetic**: VoicePlayer uses deterministic sine wave bars, not actual audio peaks.
5. **Tenor GIF API**: Uses direct API key in env var. GIPHY SDK exists elsewhere but this screen uses Tenor.
6. **Conversation screen is 2,429 lines**: Candidate for decomposition (extract VoiceRecorder, GifPicker, MessageBubble, InputBar, ContextMenu into separate files).
7. **Chat theme**: Background colors loaded from AsyncStorage, but only 12 hardcoded presets. Custom colors not supported.
8. **Forward message**: Sends via socket emit (not REST) without forwarded flag being set server-side.
9. **Message search**: Client-side filter only, no server-side search endpoint used.
10. **Pending message dedup**: Matches by clientId OR (content + 30s window), which could false-match repeated messages.
