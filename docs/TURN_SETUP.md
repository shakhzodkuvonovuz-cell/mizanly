# TURN Server Setup for Mizanly

WebRTC calls require STUN servers (free, included) for NAT traversal and TURN servers (paid) for relay when direct connections fail (~10-15% of calls).

## Current STUN Servers (Built-in, Free)
- `stun:stun.l.google.com:19302`
- `stun:stun1.l.google.com:19302`
- `stun:stun.cloudflare.com:3478`

## Adding a TURN Server

Set these environment variables:

```
TURN_SERVER_URL=turn:your-server.com:3478
TURN_USERNAME=your-username
TURN_CREDENTIAL=your-credential
```

## Recommended TURN Providers

### Option 1: Twilio Network Traversal (Recommended)
- Managed service, no server maintenance
- Pay-per-use pricing (~$0.0004/min)
- Dashboard: https://console.twilio.com/us1/develop/voice/manage/turn
- Generate time-limited credentials via Twilio API for security

### Option 2: Self-hosted coturn
- Open source, run on any VPS
- Install: `apt install coturn`
- Config: `/etc/turnserver.conf`
```
listening-port=3478
tls-listening-port=5349
fingerprint
use-auth-secret
static-auth-secret=YOUR_SECRET
realm=mizanly.app
cert=/etc/letsencrypt/live/turn.mizanly.app/fullchain.pem
pkey=/etc/letsencrypt/live/turn.mizanly.app/privkey.pem
```
- Minimum server: 1 vCPU, 1GB RAM, high bandwidth

### Option 3: Cloudflare Calls (Preview)
- Built into Cloudflare Workers platform
- Currently in beta: https://developers.cloudflare.com/calls/

## Testing
1. Set TURN env vars
2. Call `GET /api/v1/calls/ice-servers` — should include TURN server in response
3. Test a call between two users behind strict NAT (e.g., mobile carrier networks)
