# Scope 1 Audit Report: Security & E2E
**Target Areas:** `apps/e2e-server` & `apps/mobile/src/services/signal`

## 1. Go E2E Server (`apps/e2e-server`)

### Handlers (`handler.go`)
- **Key finding:** A robust webhook failure recovery loop exists in `notifyIdentityChanged`. It catches panics avoiding thread crashes. It avoids SSRF via setting a `webhookClient` with `http.ErrUseLastResponse` on redirect follow, a critical fix for server-invoked requests.
- **HMAC Signatures:** Outbound webhooks to NestJS are verified by constant-time `hmac.New(sha256.New, ...)`.
- **DDoS Rate Limiting Mitigation:** `CheckBundleFetch` uses an atomic Lua script replacing old unprotected INCR/EXPIRE steps that could deadlock/permanently crash limit keys if redis failed midway. 

### Database Logic (`postgres.go`)
- **Neon Optimization:** `pgx` is correctly configured strictly into `QueryExecModeSimpleProtocol` for Neon pooler compatibility.
- **Merkle Transparency Tree:** `buildMerkleProof` pads correctly to a power of 2, and domain separates internal (0x01) versus leaf (0x00) nodes which thwarts second-preimage collision attacks. Rebuilds are write-locked using `sync.RWMutex`, which protects concurrent read lookups of the cache from fetching corrupted tree state during an identity rotation.

## 2. React Native Signal Protocol (`apps/mobile/src/services/signal`)

### Hardware Constraints (`native-crypto-adapter.ts` & `crypto.ts`)
- **JSI Implementation:** Fallbacks for primitives gracefully drop down from C++ JSI (`react-native-quick-crypto`) to Javascript (`@noble/curves`). 
- **Timing Safe Equivalencies:** In pure JS mode, `constantTimeEqual` pre-pads sequences to identical bounds (`padA` and `padB`) bypassing JS out-of-bounds nullish coalescing execution path leaks.
- **Memory Zeroing:** Because strings are immutable in Javascript engines (V8/Hermes), base64 string allocations bypass the intermediate binary loop via an immediate `Buffer.from()` native allocation, which is directly `fill(0)` wiped.
- **Double Ratchet Mechanism:** A single message cannot cause an OOM/blocking DoS by triggering extensive ratchet skips since `MAX_SKIP_PER_RATCHET = 500` bounds the maximum loop length of continuous HMAC skips. Additionally, there is a hard eviction cap of 200 via `HARD_SKIPPED_KEY_CAP`. Low-order curve points are actively manually asserted against `LOW_ORDER_POINTS` preventing subgroup confinement attacks.

## Summary Status
Scope 1 appears highly mature against cryptographic failures (time-side-channels, state-machine vulnerabilities, or memory leaks). 
The only real vulnerability dictates what is stated in CLAUDE.md: zero runtime testing on a real device. The logical execution passes all inspections.
