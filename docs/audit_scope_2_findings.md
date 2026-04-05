# Scope 2 Audit Report: Realtime & WebRTC
**Target Areas:** `apps/livekit-server` & `apps/mobile/src/hooks/useLiveKitCall.ts`

## 1. Go LiveKit Server (`apps/livekit-server`)

### Handlers (`handler.go`)
- **Key finding (Trust Model Limitations):** The codebase proactively acknowledges that SFrame E2EE here is **server-mediated**. Because the server dynamically generates the 32-byte session key via `crypto/rand` and passes it back in the creation token, it is fully capable of decrypting the call if the Mizanly infrastructure is compromised. It does successfully protect against the Livekit SFU inspecting traffic. 
- **Room Lifecycle Hygiene:** Room deletion paths strictly authorize only the caller to use `/delete` (closing the call for all), relegating standard members to use the `/leave` endpoint. If participants leave reducing a group call to 2 people, the remaining participant becomes eligible to end it. Room names are derived securely via an HMAC SHA-256 hash preventing brute forcing of 32-bit user IDs.
- **Resource Limits:** Queries passing parameters like `cursor` strictly check lengths preventing unbound memory allocations that bypass default `maxBodySize` constraints in standard POST routing. Egress (Recordings) explicitly validates `isCaller` and fails out gracefully if recording is unavailable.

## 2. React Native Logic (`useLiveKitCall.ts`)

### E2EE Manager and Lifecycle
- **Abort on Encryption Failure:** If E2EE setup fails to negotiate, the hook forcibly aborts the call instead of silently downgrading to an unencrypted stream (`keyBytes.fill(0)`, error thrown). 
- **Memory Management:** Key bytes acquired off the token response are properly converted using a polyfilled bitwise byte allocator (preventing standard string immutable issues) and passed to `RNKeyProvider` via JSI, followed by forced `.fill(0)`.
- **Global Handlers:** `registerActiveRoomCleanup` establishes a global hook ensuring `CallKit` (which operates on a system level even when the app is in the background) can correctly unmount and disconnect `roomRef` natively, bypassing React lifecycle constraints on disconnected component trees. 
- **Graceful degradation:** Fails gracefully for Mic and Camera rejections but permits the room connection to complete. 

## Summary Status
Scope 2 operates as intended. The server-mediated encryption is a known factor. Memory and rate-limits are aggressively and successfully bounded.
