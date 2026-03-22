# Testing Foundation Design — Mizanly Backend

## Overview
Implement Jest-based testing for the NestJS backend, covering unit tests for services and integration tests for API endpoints. This establishes a foundation for future test coverage.

## Current State
- Jest, @nestjs/testing, ts-jest already installed as dev dependencies in `apps/api/package.json`
- No `jest.config.ts` file exists
- No test files exist in the project
- Backend services are complete and stable

## Design

### 4.1 Backend Unit Test Setup
- Create `apps/api/jest.config.ts` with configuration matching NestJS + TypeScript
- Root directory: `src`, test regex: `.*\\.spec\\.ts$`
- Transform with ts-jest, collect coverage from all TypeScript files
- Test environment: node

### 4.2 Users Service Tests (`users.service.spec.ts`)
**Test Cases:**
1. `getProfile()` — returns user data for existing username
2. `getProfile()` — throws NotFoundException for non-existent user
3. `updateProfile()` — validates input and updates user
4. `reportUser()` — creates a report record
5. Edge cases: blocked users, private accounts, follow relationships

**Mocking Strategy:**
- Mock PrismaService using `@prisma/client/testing` or manual jest mocks
- Simulate database responses
- Verify correct query construction and error handling

### 4.3 Posts Service Tests (`posts.service.spec.ts`)
**Test Cases:**
1. `createPost()` — creates post and increments user's postsCount
2. `deletePost()` — soft-deletes and decrements count
3. `likePost()` — creates like record and increments likesCount
4. `unlikePost()` — removes like record and decrements count
5. Feed generation — excludes blocked users and respects visibility settings

**Mocking Strategy:**
- Mock PrismaService with complex relation queries
- Test pagination cursor logic
- Validate business logic around post visibility (PUBLIC, FOLLOWERS, PRIVATE)

### 4.4 API Integration Test Example (`posts.e2e-spec.ts`)
**Test Flow:**
1. Create a testing module with full NestJS application
2. Authenticate using mock Clerk user
3. Test full request cycle:
   - `POST /api/v1/posts` → 201 Created with post data
   - `GET /api/v1/posts/:id` → 200 OK with same post
   - `DELETE /api/v1/posts/:id` → 200 OK, soft-deletes post
   - `GET /api/v1/posts/:id` → 404 Not Found (soft-deleted)

**Infrastructure:**
- Use `Test.createTestingModule()` with real modules except external services
- Mock Prisma, Redis, Meilisearch, S3 clients
- Clean up after each test

## Implementation Order
1. Create Jest configuration
2. Write Users service tests (simpler, less dependencies)
3. Write Posts service tests (more complex, includes feed logic)
4. Write integration test example (demonstrates full HTTP layer)

## Success Criteria
- All tests pass (`npm test` in apps/api)
- Coverage report generated (target >70% for tested services)
- Tests are maintainable with clear mocking patterns
- Integration test demonstrates realistic API usage

## Constraints
- Use existing dev dependencies (no new packages)
- Follow project TypeScript/ESLint conventions
- Mock external services (Redis, Meilisearch, S3) to avoid network calls
- Keep test data realistic but minimal

## Out of Scope
- Frontend/React Native testing
- End-to-end tests with mobile app
- Load/performance testing
- CI/CD pipeline integration

---

*Approved by user directive: "finish step 4" — 2026-03-06*