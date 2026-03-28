---
description: NestJS API patterns and conventions
globs: apps/api/**
---

# API Module Rules

- `@CurrentUser('id')` — ALWAYS include `'id'`, never bare `@CurrentUser()`
- `$executeRaw` tagged template literals are SAFE — do NOT replace them
- All responses: `{ data: T, success: true, timestamp }` via TransformInterceptor
- Pagination: `?cursor=<id>` → `{ data: T[], meta: { cursor?, hasMore } }`
- Auth: `Authorization: Bearer <clerk_jwt>` on all endpoints
- Base: `/api/v1/`
- All models: `userId` (NOT authorId), `user` relation (NOT `author`)
- Message: `content` (NOT caption), `messageType`, `senderId` (optional for system)
- Conversation: `isGroup: boolean` + `groupName?` — NO `type` or `name`
- E2E fields on Message: `encryptedContent Bytes?`, `e2eVersion Int?`, `e2eSenderDeviceId`, `e2eSenderRatchetKey`, `e2eCounter`, `e2ePreviousCounter`, `e2eSenderKeyId`
- NEVER change Prisma schema field names — they are final
- NEVER suppress errors with `@ts-ignore` or `@ts-expect-error`
