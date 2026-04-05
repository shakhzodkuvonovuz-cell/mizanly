# A29 — Upload Module Hostile Audit

**Scope:** `apps/api/src/modules/upload/` (all 7 files)
**Auditor:** Opus 4.6 (hostile, paranoid)
**Date:** 2026-04-05

---

## Files Reviewed

| File | Lines | Read |
|------|-------|------|
| `upload.controller.ts` | 89 | FULL |
| `upload.service.ts` | 264 | FULL |
| `upload-cleanup.service.ts` | 227 | FULL |
| `upload.module.ts` | 11 | FULL |
| `upload.controller.spec.ts` | 97 | FULL |
| `upload.service.spec.ts` | 318 | FULL |
| `upload-cleanup.service.spec.ts` | 261 | FULL |

---

## Checklist Results

### 1. Path Traversal

| # | Severity | Finding | Location |
|---|----------|---------|----------|
| U-01 | **Info** | Path traversal checks are implemented in both controller (L78) and service (L170). Both reject `..`, `//`, and enforce regex `/^[a-zA-Z0-9\/_.-]+$/`. This is solid. | `upload.controller.ts:78`, `upload.service.ts:170` |

**Verdict:** PASS. Path traversal is properly guarded at two layers (controller + service).

### 2. Size Enforcement

| # | Severity | Finding | Location |
|---|----------|---------|----------|
| U-02 | **Medium** | **Presigned PUT URL carries no `Content-Length` constraint.** R2 does not support presigned POST policies with `content-length-range`. The code documents this (service L163-164) and relies on post-upload `verifyUpload` to check actual size via `HeadObject`. **However, the client MUST call `verifyUpload` after upload -- the server has no enforcement that this actually happens.** An attacker can get a presigned URL, upload a 1GB file, skip the verify call, and the oversized file persists in R2 indefinitely. Only the nightly cleanup cron (24h later) would catch it, and only if the key is not referenced in any content table. | `upload.service.ts:121-128` |
| U-03 | **Low** | **PresignDto `maxFileSize` defaults allow up to 100MB via DTO `@Max` (L29).** The `@Max(104857600)` validator on the DTO allows the client to request up to 100MB for ANY folder. The service then checks against `FOLDER_MAX_SIZE[folder]` (L112-114), which correctly rejects sizes exceeding folder limits. This is properly handled -- but the DTO validation is looser than needed (client can pass `maxFileSize: 100MB` for an avatars upload, and the service rejects it). Not a vulnerability, but the DTO could be tighter. | `upload.controller.ts:29`, `upload.service.ts:112` |

### 3. MIME Validation

| # | Severity | Finding | Location |
|---|----------|---------|----------|
| U-04 | **Medium** | **Content-Type is validated at presign time, but NOT enforced at upload time.** The presigned URL's `ContentType` header is set (L123), but S3 PutObject with presigned URLs does not enforce that the client actually uploads data matching that Content-Type. A client can request a presigned URL for `image/jpeg` but upload an executable binary. The `verifyUpload` endpoint (L200-207) does check the actual `ContentType` from `HeadObject`, but this relies on the `Content-Type` header the client sent during the PUT -- which they control. **R2/S3 stores whatever Content-Type the client sends, not what the presigned URL specified.** There is no magic-byte validation of actual file content. | `upload.service.ts:121-128, 200-207` |
| U-05 | **Low** | **MIME regex allows broad patterns.** The DTO regex `^(image|video|audio)\/[a-z0-9+.-]+$` (controller L20) accepts any subtype like `image/x-custom-malware`. The service's `validateContentType` (L240-247) provides a strict allowlist that catches this, so the regex alone is not the last line of defense. But the regex gives a false sense of security. | `upload.controller.ts:20` |

### 4. Rate Limit

| # | Severity | Finding | Location |
|---|----------|---------|----------|
| U-06 | **High** | **DELETE endpoint has NO rate limit.** The `presign` and `verify` endpoints have `@Throttle({ default: { limit: 20, ttl: 60000 } })`, but the `@Delete(':key(*)')` endpoint (L71-88) has NO `@Throttle` decorator. An attacker who owns files (or guesses keys matching their userId) can spam DELETE requests to cause excessive R2 API calls and potentially DoS the R2 connection or rack up costs. | `upload.controller.ts:71` |

### 5. Auth

| # | Severity | Finding | Location |
|---|----------|---------|----------|
| U-07 | **Info** | Auth is properly enforced. The controller has `@UseGuards(ClerkAuthGuard)` at class level (L41), and all endpoints use `@CurrentUser('id')`. Delete enforces ownership at L82-85. Verify enforces ownership at L179. | `upload.controller.ts:41, 82-85` |

**Verdict:** PASS.

### 6. Cleanup

| # | Severity | Finding | Location |
|---|----------|---------|----------|
| U-08 | **Medium** | **Orphan cleanup does N+7 sequential DB queries per R2 object.** For each object older than 24h, `isMediaReferenced` runs 7 separate Prisma `findFirst` queries (post, story, thread, reel, video, user, message) sequentially (L156-225). At 1000 objects per folder * 9 folders = up to 9000 objects * 7 queries = 63,000 DB queries per cron run. This will time out or overload the DB at scale. Should batch-check keys. | `upload-cleanup.service.ts:154-226` |
| U-09 | **Low** | **Cleanup checks `fileUrl` but not all content tables store full URLs.** Some tables may store the `key` path rather than the full public URL. The `isMediaReferenced` function constructs the URL as `${publicUrl}/${obj.Key}` (L124) and searches DB for that full URL. If any content table stores a relative key instead of the full URL, the cleanup will delete actively-used files as false-positive orphans. | `upload-cleanup.service.ts:124-127` |
| U-10 | **Info** | **Cleanup only processes 1000 objects per folder per run.** If a folder has 50,000 orphans, it would take 50 days to clean them all. This is by design (L106) to avoid timeout, but could leave massive orphan backlogs. | `upload-cleanup.service.ts:106` |

### 7. Folder Validation

| # | Severity | Finding | Location |
|---|----------|---------|----------|
| U-11 | **Info** | Folder is validated via `@IsIn` in the DTO (controller L23) with a strict allowlist of 9 folders. The service also has `FOLDER_MAX_SIZE` and `FOLDER_ALLOWED_TYPES` keyed by the same enum. Consistent and correct. | `upload.controller.ts:23, upload.service.ts:15-37` |

**Verdict:** PASS.

### 8. Post-Upload Verify

| # | Severity | Finding | Location |
|---|----------|---------|----------|
| U-12 | **High** | **`verifyUpload` is optional -- no server-side enforcement.** The presign endpoint returns the key, and the client is expected to call `verifyUpload` after uploading. But nothing prevents the client from using the key directly in a post/story/message creation endpoint without calling verify first. The content creation endpoints should check a "verified" flag or call verify themselves before accepting a media key. Currently, unverified (potentially oversized, wrong-type) files can be referenced in content. | `upload.service.ts:166, upload.controller.ts:64-69` |
| U-13 | **Low** | **`verifyUpload` does not set any "verified" flag.** It returns `{ verified: true, contentLength, contentType }` to the client but does not persist this verification in DB or cache. The client could lie about verification status. A server-side `verified_uploads` table or Redis set would close this gap. | `upload.service.ts:210` |
| U-14 | **Low** | **`verifyUpload` accepts folder from the key path without strict validation.** The folder is extracted via `segments[0] as UploadFolder` (L177) with a type assertion. If a key like `unknown-folder/user-123/file.jpg` is passed, the `FOLDER_MAX_SIZE[folder]` lookup returns `undefined` and line 184 catches it. But the cast `as UploadFolder` is a type lie -- the runtime value may not match the type. | `upload.service.ts:177` |

---

## Additional Findings

| # | Severity | Finding | Location |
|---|----------|---------|----------|
| U-15 | **Medium** | **`getSignedDownloadUrl` has no SSRF protection.** The method accepts any `publicUrl` string (L224). If the `publicUrl` doesn't match the configured `this.publicUrl`, it returns the URL as-is (L232-233). But when it DOES match, it extracts a key and creates a presigned GET URL. An attacker who can control `publicUrl` values in the DB could potentially get the server to generate signed URLs for arbitrary R2 keys (beyond their own files). This method is not exposed via controller (internal use), but other services calling it should be audited. | `upload.service.ts:224-238` |
| U-16 | **Low** | **No file count limit per user.** There's no per-user cap on how many files can be uploaded. A user could upload millions of small files (each under the size limit) to exhaust R2 storage. The rate limit (20 presign/min) provides some throttling, but a persistent attacker could upload ~28,800 files per day. | `upload.controller.ts:46-53` |
| U-17 | **Info** | **Presigned URL expiry is hardcoded to 300s (5 min).** This is reasonable. No issue. | `upload.controller.ts:53` |
| U-18 | **Info** | **UUID v4 key generation prevents key collision.** File keys use `uuidv4()` (service L119), making key prediction infeasible. | `upload.service.ts:119` |
| U-19 | **Low** | **Error message in `ensureR2Configured` leaks env var names.** The error message at L85-86 tells an attacker exactly which environment variables to target: `R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY`. This is a minor information leak. | `upload.service.ts:84-86` |

---

## Summary

| Severity | Count |
|----------|-------|
| High | 2 (U-06, U-12) |
| Medium | 3 (U-02, U-04, U-08) |
| Low | 5 (U-03, U-05, U-09, U-13, U-14, U-16, U-19) |
| Info | 4 (U-01, U-07, U-10, U-11, U-17, U-18) |

### Critical Path

The most exploitable attack chain: Get presigned URL -> upload 1GB binary disguised as image/jpeg -> skip `verifyUpload` -> reference the key in a post -> server stores the post with an unverified, oversized, wrong-content-type file. The DELETE endpoint can then be spammed without rate limit.
