# Design: Add 3 Missing Service Spec Files

**Date:** 2026-03-07
**Batch:** 10, Step 7
**Author:** Claude Code
**Approved:** Yes

## Overview

Add 3 missing service specification files to the backend test suite as specified in ARCHITECT_INSTRUCTIONS.md Step 7.

## Files to Create

1. `apps/api/src/modules/profile-links/profile-links.service.spec.ts`
2. `apps/api/src/modules/settings/settings.service.spec.ts`
3. `apps/api/src/modules/upload/upload.service.spec.ts`

## Design Details

### 1. profile-links.service.spec.ts

**Service Methods to Test:**
- `getLinks(userId: string)` - returns user's links ordered by position
- `addLink(userId: string, data: CreateProfileLinkDto)` - creates new link
- `updateLink(userId: string, linkId: string, data: UpdateProfileLinkDto)` - updates existing link (with ownership check)
- `deleteLink(userId: string, linkId: string)` - deletes link (with ownership check)
- `reorderLinks(userId: string, linkIds: string[])` - updates link positions

**Mock Pattern:**
```typescript
const mockPrisma = {
  profileLink: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    updateMany: jest.fn(),
  },
};
```

**Test Coverage:**
- Happy path for each method
- Ownership validation tests
- Error cases (not found, forbidden)
- Ordering verification

### 2. settings.service.spec.ts

**Service Methods to Test:**
- `getSettings(userId: string)` - returns user settings
- `updatePrivacy(userId: string, data: UpdatePrivacySettingsDto)` - updates privacy settings
- `updateNotifications(userId: string, data: UpdateNotificationSettingsDto)` - updates notification settings
- Other public methods found in service file

**Mock Pattern:**
```typescript
const mockPrisma = {
  userSetting: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    // Add other methods as needed
  },
};
```

**Test Coverage:**
- Default settings creation
- Settings updates
- Validation of input data

### 3. upload.service.spec.ts

**Service Methods to Test:**
- `generatePresignedUrl(userId: string, filename: string, contentType: string)` - generates S3 presigned URL
- Content type validation logic

**Mock Pattern:**
Mock AWS S3 client instead of Prisma:
```typescript
const mockS3Client = {
  send: jest.fn(),
};
```

**Test Coverage:**
- Presigned URL generation
- Content type validation
- Error handling for invalid content types
- S3 client interactions

## Implementation Approach

1. **Read each service file** to identify all public methods
2. **Reference existing spec** (`blocks.service.spec.ts`) for test structure patterns
3. **Create each spec file** with:
   - Proper imports (Test, TestingModule, jest)
   - Mock definitions as per ARCHITECT_INSTRUCTIONS.md
   - beforeEach setup
   - Test suites for each method
4. **Run verification**: `cd apps/api && npx jest --passWithNoTests`

## Success Criteria

- All 3 spec files created with proper test coverage
- Tests follow the mock pattern from ARCHITECT_INSTRUCTIONS.md
- `npx jest --passWithNoTests` runs successfully with 0 failures
- No compilation errors in TypeScript

## Notes

- Use `as any` for mocks in test files (allowed per CLAUDE.md rule 13)
- Follow existing test patterns for assertions and error checking
- Ensure each test suite is independent and cleans up mocks