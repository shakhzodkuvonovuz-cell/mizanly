# Mizanly Code Quality & Type Safety Issues
**Audit Date:** 2026-03-06

## Type Safety Violations

### 1. Excessive `as any` Type Casting (18+ instances)
**Rule Violated:** TypeScript best practices, CLAUDE.md type safety
**Severity:** High

**File References:**
- `apps/mobile/app/(tabs)/_layout.tsx:80` - `router.push(path as any);`
- `apps/mobile/src/components/ui/Skeleton.tsx:38` - `width: width as any,`
- `apps/api/src/modules/posts/posts.service.ts:122` - `postType: dto.postType as any,`
- `apps/api/src/modules/posts/posts.service.ts:124` - `visibility: (dto.visibility as any) ?? 'PUBLIC',`
- `apps/api/src/modules/messages/messages.service.ts:145` - `messageType: (data.messageType as any) ?? 'TEXT',`
- `apps/api/src/modules/search/search.controller.ts:14` - `type as any`
- `apps/api/src/modules/notifications/notifications.service.ts:113` - `type: params.type as any,`

**Issue:** Bypasses TypeScript's type system, leading to potential runtime errors.
**Fix:** Define proper enum types and use type guards:
```typescript
// Instead of `as any`
enum PostType { IMAGE = 'IMAGE', VIDEO = 'VIDEO', TEXT = 'TEXT' }
enum Visibility { PUBLIC = 'PUBLIC', PRIVATE = 'PRIVATE', CIRCLE = 'CIRCLE' }

// Use type assertion only when necessary with proper validation
const postType = Object.values(PostType).includes(dto.postType)
  ? dto.postType as PostType
  : PostType.TEXT;
```

### 2. Missing Type Definitions for API Responses
**Files:** Various API client calls
**Issue:** Incomplete TypeScript interfaces for API responses.
**Fix:** Generate/complete TypeScript interfaces from Swagger/OpenAPI schema.

## CLAUDE.md Rule Violations

### 3. Hardcoded BorderRadius Values
**Rule Violated:** CLAUDE.md Rule #8 - "Round radius → `radius.full` from theme — NEVER hardcoded `borderRadius: 20`"
**Severity:** Medium

**File References:**
- `apps/mobile/app/onboarding/username.tsx:118` - `borderRadius: 2`
- `apps/mobile/app/onboarding/profile.tsx:138` - `borderRadius: 4`
- `apps/mobile/app/onboarding/profile.tsx:149` - `borderRadius: 48`
- `apps/mobile/app/(tabs)/_layout.tsx:213` - `borderRadius: 2`
- `apps/mobile/app/(screens)/create-story.tsx:220` - `borderRadius: 14`

**Issue:** Inconsistent styling, difficult to maintain theme changes.
**Fix:** Use theme radius tokens:
```typescript
import { radius } from '@/theme';
// Instead of borderRadius: 2
borderRadius: radius.sm  // 6
// Instead of borderRadius: 48
borderRadius: radius.full  // 9999
```

### 4. Font Loading Mismatch
**Rule Violated:** CLAUDE.md Critical Stub #6 - Fonts not loaded
**File:** `apps/mobile/app/_layout.tsx:82-89`
**Issue:** Fonts imported but theme references different font names.
**Fix:** Ensure font names in theme match loaded fonts, or update theme to use loaded fonts.

### 5. Missing Error Boundaries in Screens
**Rule Violated:** React best practices
**Issue:** Only root ErrorBoundary exists, individual screens lack error handling.
**Fix:** Add error boundaries to critical screens or implement screen-level error handling.

## Code Quality Issues

### 6. Inconsistent Error Handling Patterns
**Files:** Multiple service files
**Issue:** Mix of try/catch, .catch(), and unhandled promises.
**Examples:**
- `users.service.ts:456` - `.catch((err) => this.logger.error('Failed to save report', err))`
- `follows.service.ts:74` - `.catch((err) => this.logger.error('Failed to create notification', err))`
- Many async operations without error handling

**Fix:** Standardize error handling with NestJS interceptors or consistent try/catch patterns.

### 7. Missing Input Validation
**Files:** DTO classes, controller endpoints
**Issue:** Reliance on TypeScript types without runtime validation.
**Fix:** Add class-validator decorators to all DTOs:
```typescript
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePostDto {
  @IsEnum(PostType)
  postType: PostType;

  @IsString()
  @MaxLength(500)
  content: string;

  @IsEnum(Visibility)
  @IsOptional()
  visibility?: Visibility;
}
```

### 8. Code Duplication Across Services
**Files:** Similar logic in posts.service.ts, threads.service.ts, stories.service.ts
**Issue:** Repeated count update logic, notification creation, permission checks.
**Fix:** Extract common functionality into shared service classes or utility functions.

### 9. Missing Test Coverage
**Files:** Entire codebase
**Issue:** No unit tests, integration tests, or end-to-end tests.
**Severity:** High for production readiness.
**Fix:** Implement testing strategy:
- Unit tests for services, utilities
- Integration tests for API endpoints
- E2E tests for critical user flows

### 10. Inconsistent Naming Conventions
**Files:** Various
**Issue:** Mix of camelCase, PascalCase, inconsistent abbreviations.
**Fix:** Establish and enforce naming conventions via ESLint rules.

## Architecture & Design Issues

### 11. Tight Coupling Between Layers
**Files:** Controllers directly using services with complex logic
**Issue:** Difficult to test, refactor, or replace components.
**Fix:** Implement proper separation of concerns, dependency injection patterns.

### 12. Missing Documentation
**Files:** Complex business logic, API endpoints
**Issue:** Lack of JSDoc comments, API documentation gaps.
**Fix:** Add comprehensive documentation:
- JSDoc for complex functions
- OpenAPI/Swagger annotations
- Architecture decision records

### 13. Magic Numbers and Strings
**Files:** Multiple files with hardcoded values
**Issue:** `borderRadius: 2`, `height: 52`, status strings like `'PUBLIC'`.
**Fix:** Extract to constants or configuration:
```typescript
// Constants file
export const UI_CONSTANTS = {
  BUTTON_HEIGHT: 52,
  AVATAR_SIZE: 96,
  BORDER_RADIUS_SM: 2,
};

// Enum for status values
export enum Visibility {
  PUBLIC = 'PUBLIC',
  PRIVATE = 'PRIVATE',
  CIRCLE = 'CIRCLE'
}
```

### 14. Incomplete Feature Implementations
**Files:** Referenced in CLAUDE.md Critical Stubs
**Issue:** Buttons with empty `onPress`, missing functionality.
**Fix:** Complete all stubbed features per CLAUDE.md specifications.

## Mobile-Specific Quality Issues

### 15. Missing Accessibility Support
**Files:** Mobile app components
**Issue:** Lack of accessibility labels, roles, traits.
**Fix:** Add accessibility props to all interactive elements:
```typescript
<Pressable
  accessible={true}
  accessibilityLabel="Like post"
  accessibilityRole="button"
  accessibilityHint="Double tap to like this post"
>
```

### 16. No RTL (Right-to-Left) Testing
**Files:** Arabic language support
**Issue:** RTL layout may have issues despite `I18nManager.allowRTL(true)`.
**Fix:** Comprehensive RTL testing with Arabic content.

## Backend-Specific Quality Issues

### 17. Missing Transaction Boundaries
**Files:** Services with multiple database operations
**Issue:** Related operations not wrapped in transactions.
**Risk:** Data inconsistency on partial failures.
**Fix:** Use Prisma transactions for atomic operations:
```typescript
await this.prisma.$transaction(async (tx) => {
  await tx.post.create({ ... });
  await tx.user.update({ ... });
});
```

### 18. No Health Checks
**Files:** API infrastructure
**Issue:** Missing `/health` endpoint for monitoring.
**Fix:** Implement health check endpoint with dependency status.

## Recommendations by Priority

### Critical (Must Fix):
1. Remove all `as any` casts with proper typing
2. Fix hardcoded borderRadius violations
3. Complete stubbed features from CLAUDE.md

### High Priority:
1. Implement comprehensive error handling
2. Add input validation to all DTOs
3. Start test coverage implementation

### Medium Priority:
1. Reduce code duplication
2. Improve documentation
3. Add accessibility support

### Low Priority:
1. Standardize naming conventions
2. Add health checks
3. Implement RTL testing