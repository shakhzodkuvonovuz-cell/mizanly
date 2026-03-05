# Mizanly Security Findings & Vulnerabilities
**Audit Date:** 2026-03-06  
**Severity Scale:** Critical/High/Medium/Low

## Critical Security Issues

### 1. SQL Injection Risk in Raw SQL Queries
**File:** `apps/api/src/modules/follows/follows.service.ts:123-127`  
**Severity:** High  
**Issue:** Multiple `$executeRaw` queries with string interpolation instead of parameterized queries
```typescript
this.prisma.$executeRaw`UPDATE "User" SET "followingCount" = GREATEST("followingCount" - 1, 0) WHERE id = ${currentUserId}`
```
**Risk:** If `currentUserId` contains malicious SQL, it could lead to SQL injection attacks.  
**Fix:** Use Prisma's parameterized queries or built-in `increment/decrement` operations:
```typescript
await this.prisma.user.update({
  where: { id: currentUserId },
  data: { followingCount: { decrement: 1 } }
})
```

**Affected Files:**
- `apps/api/src/modules/follows/follows.service.ts` (lines 123, 127)
- `apps/api/src/modules/posts/posts.service.ts` (lines 210, 261, 290, 440, 480)
- `apps/api/src/modules/threads/threads.service.ts` (lines 235, 279, 333, 369, 438, 481)
- `apps/api/src/modules/blocks/blocks.service.ts` (lines 63-70)

### 2. Missing Input Validation on Webhook Endpoints
**File:** `apps/api/src/modules/auth/webhooks.controller.ts:44`  
**Severity:** Medium  
**Issue:** Raw body access without proper signature verification
```typescript
const rawBody = (req as any).rawBody as Buffer;
```
**Risk:** Potential webhook spoofing if signature verification is incomplete.  
**Fix:** Implement proper Clerk webhook signature verification using `@clerk/backend`.

### 3. Type Casting Bypasses Type Safety
**File:** Multiple files with `as any` casts  
**Severity:** Medium  
**Issue:** 18+ instances of `as any` bypass TypeScript's type safety
```typescript
postType: dto.postType as any,  // posts.service.ts:122
visibility: (dto.visibility as any) ?? 'PUBLIC',  // posts.service.ts:124
router.push(path as any);  // _layout.tsx:80
```
**Risk:** Runtime errors, data corruption, security bypass if invalid values are passed.  
**Fix:** Define proper enum types and use type guards.

### 4. Insecure Error Handling Exposes Stack Traces
**File:** `apps/api/src/common/filters/http-exception.filter.ts`  
**Severity:** Medium  
**Issue:** Global exception filter may expose sensitive information in production.  
**Risk:** Information disclosure through error messages.  
**Fix:** Implement environment-based error reporting - detailed errors in development, generic messages in production.

## High Security Issues

### 5. Missing Rate Limiting on Critical Endpoints
**Files:** All controller endpoints  
**Severity:** High  
**Issue:** While global throttle exists (100 req/min), no endpoint-specific rate limiting.  
**Risk:** Brute force attacks on authentication, spam on posting endpoints.  
**Fix:** Implement NestJS `@Throttle()` decorator on sensitive endpoints (login, registration, posting).

### 6. No CSRF Protection for State-Changing Operations
**Files:** All POST/PUT/DELETE endpoints  
**Severity:** Medium  
**Issue:** No CSRF tokens or same-site cookie policies.  
**Risk:** Cross-site request forgery attacks.  
**Fix:** Implement CSRF protection middleware or use SameSite=Strict cookies.

### 7. Missing Content Security Policy Headers
**Files:** API responses  
**Severity:** Medium  
**Issue:** No CSP headers set on API responses.  
**Risk:** XSS attacks if API responses are rendered in web context.  
**Fix:** Add `Content-Security-Policy` headers to all responses.

## Medium Security Issues

### 8. Insecure Direct Object References (IDOR) Potential
**Files:** Services with user ID checks  
**Severity:** Medium  
**Issue:** Some endpoints may not properly validate user ownership before operations.  
**Risk:** Users may access/modify other users' data.  
**Fix:** Implement comprehensive ownership checks in all service methods.

### 9. Missing Audit Logging
**Files:** All service methods  
**Severity:** Medium  
**Issue:** No logging of sensitive operations (deletes, updates, admin actions).  
**Risk:** Inability to trace malicious activities.  
**Fix:** Implement structured audit logging for all data modifications.

### 10. JWT Token Management Issues
**File:** `apps/mobile/app/_layout.tsx:33-40`  
**Severity:** Medium  
**Issue:** Token storage in SecureStore but no token refresh strategy.  
**Risk:** Token expiration causing poor UX, potential re-authentication attacks.  
**Fix:** Implement token refresh with Clerk SDK.

## Security Best Practices Violations

### OWASP Top 10 2021 Violations:
- **A01:2021-Broken Access Control:** Missing ownership checks (potential IDOR)
- **A03:2021-Injection:** SQL injection risk in raw queries
- **A05:2021-Security Misconfiguration:** Missing security headers
- **A07:2021-Identification and Authentication Failures:** Weak rate limiting

### Recommendations:
1. **Immediate:** Fix SQL injection vulnerabilities by removing raw queries
2. **High Priority:** Implement proper input validation and type safety
3. **Medium Priority:** Add security headers and CSRF protection
4. **Ongoing:** Implement comprehensive audit logging
