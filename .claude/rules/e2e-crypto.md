---
description: Signal Protocol E2E encryption rules
globs: apps/mobile/src/services/signal/**,apps/e2e-server/**
---

# E2E Encryption Rules

- NEVER log key material, session state, plaintext, or nonces
- NEVER include crypto data in Sentry breadcrumbs
- NEVER use `Math.random()` — use CSPRNG (`generateRandomBytes`)
- NEVER declare audit findings "acceptable" — fix ALL findings
- All DH outputs MUST be checked for all-zeros (small-subgroup protection)
- Session state mutations require clone-before-decrypt (AEAD can fail)
- Sender signing private keys go in SecureStore (hardware-backed), NOT MMKV
- All MMKV values for sessions/keys/identity MUST use aeadSet/aeadGet
- Message content MUST be padded before encryption (padMessage/unpadMessage)
- Push notifications: generic body for ALL messages (no encryption status leak)

## Architecture
- Protocol: Signal (X3DH + Double Ratchet + Sender Keys)
- Cipher: XChaCha20-Poly1305 (AEAD)
- Primitives: @noble/* (MIT, Cure53-audited)
- Key server: Go microservice at apps/e2e-server/
- Storage: identity keys in SecureStore, sessions in MMKV with AEAD
