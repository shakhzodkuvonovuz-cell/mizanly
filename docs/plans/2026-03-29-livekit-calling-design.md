# LiveKit Calling System — Design Document

**Date:** 2026-03-29
**Scope:** Replace custom P2P WebRTC with LiveKit SFU. Telegram-level feature parity.
**Status:** Approved

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Infrastructure | LiveKit Cloud | Zero ops, free tier, self-hostable escape hatch |
| Backend | Go microservice (`apps/livekit-server/`) | LiveKit Go SDK is reference impl, webhooks are high-throughput |
| E2EE | SFrame (IETF RFC 9605) | Industry standard. Signal the company uses SFrame for calls. |
| Mobile SDK | `@livekit/react-native` + Expo plugin | Official SDK, requires expo-dev-client |
| Noise suppression | Krisp via `@livekit/react-native-krisp-noise-filter` | Runs locally, no audio sent to Krisp |
| CallKit/ConnectionService | `react-native-callkeep` | Bridge for native call UI |
| Recording storage | Cloudflare R2 (S3-compatible) | Already configured for media |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      LiveKit Cloud (SFU)                     │
│  Handles: media routing, simulcast, TURN, SFrame E2EE       │
│  Webhooks → apps/livekit-server                              │
└──────────┬──────────────────────────────────┬────────────────┘
           │ WebRTC (media)                   │ Webhooks (HTTPS)
           │                                  │
┌──────────▼──────────┐          ┌────────────▼───────────────┐
│   apps/mobile        │          │   apps/livekit-server (Go) │
│   @livekit/react-    │◄─token──│   - Token generation        │
│   native + Expo      │         │   - Room management         │
│   react-native-      │         │   - Webhook processing      │
│   callkeep           │         │   - Egress (recording)      │
│   Krisp noise filter │         │   - Ingress (broadcast)     │
│   SFrame E2EE        │         │   - Call session DB (pgx)   │
└──────────────────────┘         │   - Clerk JWT verification  │
                                  └────────────┬───────────────┘
                                               │ pgx (raw SQL)
                                  ┌────────────▼───────────────┐
                                  │   Neon PostgreSQL           │
                                  │   (existing DB, same schema)│
                                  └────────────────────────────┘
```

## Go Service: `apps/livekit-server/`

### Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/calls/token` | POST | Generate LiveKit JWT |
| `/api/v1/calls/rooms` | POST | Create room (1:1, group, broadcast) |
| `/api/v1/calls/rooms/:id` | DELETE | Force-close room |
| `/api/v1/calls/rooms/:id/participants` | GET | List participants |
| `/api/v1/calls/rooms/:id/participants/:id` | DELETE | Kick participant |
| `/api/v1/calls/rooms/:id/mute` | POST | Server-side mute |
| `/api/v1/calls/history` | GET | Paginated call history |
| `/api/v1/calls/active` | GET | User's active call |
| `/api/v1/calls/egress/start` | POST | Start recording to R2 |
| `/api/v1/calls/egress/stop` | POST | Stop recording |
| `/api/v1/calls/ingress/create` | POST | Create RTMP/WHIP ingress |
| `/api/v1/calls/ingress/:id` | DELETE | End broadcast ingress |
| `/api/v1/webhooks/livekit` | POST | LiveKit webhook receiver |

### Stack

- Go 1.26, `chi` router, `pgx` for PostgreSQL
- `github.com/livekit/server-sdk-go/v2` (token, room, egress, ingress)
- `github.com/livekit/protocol` (auth, webhook, types)
- Clerk JWT verification via `golang-jwt`
- Deployment: Railway (same pattern as `apps/e2e-server`)

### Env Vars

```
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
LIVEKIT_HOST=wss://your-project.livekit.cloud
DATABASE_URL=postgres://...  (same Neon DB)
CLERK_JWT_PUBLIC_KEY=...
R2_ACCESS_KEY=...
R2_SECRET_KEY=...
R2_BUCKET=mizanly-media
R2_ENDPOINT=...
PORT=8081
```

## Mobile SDK Stack

| Package | Purpose |
|---------|---------|
| `@livekit/react-native` | Core SDK (hooks, components) |
| `@livekit/react-native-webrtc` | LiveKit's WebRTC fork |
| `@livekit/react-native-expo-plugin` | Expo config plugin |
| `livekit-client` | Platform-agnostic JS client |
| `react-native-callkeep` | CallKit (iOS) + ConnectionService (Android) |
| `react-native-voip-push-notification` | PushKit VoIP push (iOS) |
| `@livekit/react-native-krisp-noise-filter` | Krisp noise suppression |

Requires `expo-dev-client`. Not compatible with Expo Go.

## E2EE

- SFrame encryption (IETF RFC 9605)
- Shared key model with ratcheting for forward secrecy
- Key derived per-room, distributed via Go service
- Emoji verification: SAS derived from shared key, displayed as emoji grid
- LiveKit SFU sees only encrypted media

```tsx
const { e2eeManager, keyProvider } = useRNE2EEManager({
  sharedKey: roomKey,
  keyProviderOptions: {
    ratchetSalt: salt,
    ratchetWindowSize: 16,
    failureTolerance: 10,
  },
});
```

## Call Flows

### 1:1 Voice/Video

```
Caller                    Go Server              LiveKit Cloud           Callee
  │                          │                        │                    │
  ├─POST /calls/rooms───────►│                        │                    │
  │  {targetUserId, type}    ├─CreateRoom────────────►│                    │
  │                          ├─Insert CallSession DB  │                    │
  │◄─{roomName, token}──────┤                        │                    │
  │                          ├─Push notification──────┼───────────────────►│
  │                          │  (FCM/PushKit)         │    CallKit shows   │
  │                          │                        │    native call UI  │
  │  Connect to room         │                        │                    │
  ├─WebRTC─────────────────────────────────────────►│                    │
  │                          │                        │         User taps  │
  │                          │◄─POST /calls/token─────┼────────────────────┤
  │                          ├─{token}────────────────┼───────────────────►│
  │                          │                        │◄────WebRTC─────────┤
  │◄═══════════════════════ SFrame E2EE media ═══════════════════════════►│
  │                          │◄─webhook: participant_ │                    │
  │                          │  joined (both)         │                    │
  │                          ├─Update DB: ACTIVE      │                    │
```

### Group (30 video + unlimited audio viewers)

Same as 1:1 but:
- Room created with `MaxParticipants` based on group size
- All group members get push notification
- Participants join/leave independently
- Simulcast: 3 quality layers auto-negotiated per subscriber bandwidth
- Dynacast: pauses unused video layers

### Broadcast/Livestream

```
Broadcaster              Go Server              LiveKit Cloud           Viewers
  │                          │                        │                    │
  ├─POST /calls/rooms───────►│                        │                    │
  │  {type: BROADCAST}       ├─CreateRoom────────────►│                    │
  │                          ├─CreateIngress─────────►│                    │
  │◄─{roomName, token,       │                        │                    │
  │   ingressUrl, streamKey} │                        │                    │
  │                          │                        │                    │
  │  Mobile SDK or OBS/RTMP  │                        │                    │
  ├─media──────────────────────────────────────────►│                    │
  │                          │                        │◄─viewer connects───┤
  │                          │                        ├─media (view-only)─►│
```

## Recording

- Egress to Cloudflare R2 (S3-compatible, `ForcePathStyle: true`)
- Room composite (full call) or track composite (per-participant)
- H264 720p/1080p @ 30fps, MP4 format
- Webhook `egress_ended` → update DB with R2 URL, notify participants

## Schema Changes

Existing `CallSession` + `CallParticipant` models stay. Add:

```prisma
model CallSession {
  // ... existing fields ...
  livekitRoomName    String?   // LiveKit room identifier
  livekitRoomSid     String?   // LiveKit room SID
  recordingUrl       String?   // R2 URL after egress
  broadcastType      String?   // 'rtmp' | 'whip' | null
  ingressId          String?   // LiveKit ingress ID
}
```

## Data Channels (In-Call Features)

| Feature | Topic | Mode | Payload |
|---------|-------|------|---------|
| Raise hand | `raise-hand` | Reliable | `{raised: true}` |
| Emoji reaction | `reactions` | Lossy | `{emoji: '...'}` |
| In-call chat | `chat` | Reliable | `{text: '...'}` |

## What Gets Removed

| File | Lines | Replaced By |
|------|-------|-------------|
| `apps/mobile/src/hooks/useWebRTC.ts` | 383 | LiveKit `<LiveKitRoom>` + hooks |
| `apps/api/src/gateways/chat.gateway.ts` lines 741-873 | ~130 | Go server + webhooks |
| `apps/api/src/modules/calls/calls.service.ts` | 281 | Go server |
| `apps/api/src/modules/calls/calls.controller.ts` | 91 | Go server |
| `apps/api/src/modules/calls/calls.module.ts` | ~30 | Go server |
| `apps/api/src/modules/calls/dto/*` | ~50 | Go server |
| **Total TS removed** | **~965 lines** | |

**Kept:** Call UI screen (rewritten with LiveKit components), call history screen (reads same DB).

## Phases

### Phase 1 — Complete Calling Product
- Go service: all endpoints, webhook handler, Clerk auth, pgx
- Mobile: LiveKit SDK, call screen rewrite, `<LiveKitRoom>`
- CallKit (iOS) + ConnectionService (Android)
- PushKit VoIP push (iOS) + FCM (Android)
- Bluetooth/speaker/AirPods routing
- SFrame E2EE with emoji verification
- Group calls (30 video + unlimited audio)
- Simulcast + adaptive bitrate + dynacast
- Call quality indicator
- PiP (navigate app during call)
- Noise suppression (Krisp)
- Screen sharing (in-app + iOS broadcast extension)
- Raise hand (data channel)

### Phase 2 — Broadcast + Recording
- Egress: room composite recording to R2
- Ingress: RTMP/WHIP for external broadcasters
- Livestream to unlimited audience
- Scheduled calls
- Recording playback UI

### Phase 3 — Chat-Integrated Media
- Video messages (round bubbles in chat)
- Ringtone customization

## Cost

| Users | Monthly cost |
|-------|-------------|
| 0-1K | $0 (free tier: 5,000 WebRTC min/mo) |
| 1K-10K | ~$120/mo |
| 10K-50K | ~$600/mo |
| 50K+ | Self-host (Apache 2.0, $0 software) |

## Constraints

- Requires `expo-dev-client` (not Expo Go)
- Requires Apple Developer enrollment for EAS builds
- CallKit/ConnectionService only work on real devices
- iOS broadcast extension needs App Group configuration
- Krisp requires LiveKit Cloud (not available self-hosted)
