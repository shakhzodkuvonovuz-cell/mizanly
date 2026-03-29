# Coding Conventions

**Analysis Date:** 2026-03-30

## Naming Patterns

**Files (API - NestJS):**
- Modules: `{feature}.module.ts` (e.g., `posts.module.ts`)
- Controllers: `{feature}.controller.ts` (e.g., `posts.controller.ts`)
- Services: `{feature}.service.ts` (e.g., `posts.service.ts`)
- DTOs: `{verb}-{feature}.dto.ts` in `dto/` subdirectory (e.g., `dto/create-post.dto.ts`)
- Guards: `{name}.guard.ts` in `src/common/guards/` (e.g., `clerk-auth.guard.ts`)
- Filters: `{name}.filter.ts` in `src/common/filters/`
- Interceptors: `{name}.interceptor.ts` in `src/common/interceptors/`
- Pipes: `{name}.pipe.ts` in `src/common/pipes/`
- Utils: `{name}.ts` in `src/common/utils/` (e.g., `sanitize.ts`, `hashtag.ts`)
- Tests: co-located as `{name}.spec.ts` next to the source file
- Integration tests: `{name}.integration.spec.ts` in `src/integration/`
- DB integration tests: `{name}.integration-db.spec.ts` in `test/integration-db/`

**Files (Mobile - React Native):**
- Screens: kebab-case in `app/(screens)/` (e.g., `bookmark-folders.tsx`, `audio-room.tsx`)
- Tab screens: `app/(tabs)/{name}.tsx` (e.g., `saf.tsx`, `majlis.tsx`, `risalah.tsx`)
- Components: PascalCase in `src/components/ui/` (e.g., `EmptyState.tsx`, `BottomSheet.tsx`)
- Hooks: camelCase with `use` prefix in `src/hooks/` (e.g., `useThemeColors.ts`, `useContextualHaptic.ts`)
- Services: camelCase with `Api` suffix in `src/services/` (e.g., `api.ts`, `livekit.ts`, `callkit.ts`)
- Signal Protocol: `src/services/signal/{name}.ts` (e.g., `crypto.ts`, `x3dh.ts`, `double-ratchet.ts`)
- Tests: `__tests__/{name}.test.ts` in dedicated `__tests__/` directories

**Files (Go - E2E Server & LiveKit Server):**
- Packages: `internal/{package}/` (e.g., `internal/handler/`, `internal/store/`, `internal/middleware/`)
- Entry point: `cmd/server/main.go`
- Tests: `{name}_test.go` co-located in the same package
- Models: `internal/model/types.go`
- Store interface: `internal/store/iface.go`
- Store implementation: `internal/store/store.go`

**Functions:**
- API (NestJS): camelCase (e.g., `getFeed`, `notifyScheduledPostsPublished`)
- Mobile (React): camelCase for hooks and utils, PascalCase for components (e.g., `EmptyState`, `useThemeColors`)
- Go: PascalCase for exported, camelCase for unexported (e.g., `HandleCreateRoom`, `writeJSON`, `decodeBody`)

**Variables:**
- TypeScript: camelCase (e.g., `userId`, `postsCount`, `mockService`)
- Go: camelCase local, PascalCase exported (e.g., `userID`, `LiveKitAPIKey`)
- Constants (TS): UPPER_SNAKE_CASE (e.g., `POST_SELECT`, `CATEGORY_KEYS`)
- Constants (Go): PascalCase exported, camelCase unexported (e.g., `maxBodySize`, `tokenTTL`)

**Types:**
- TypeScript interfaces: PascalCase (e.g., `AppState`, `EmptyStateProps`, `Response<T>`)
- Go structs: PascalCase (e.g., `CallSession`, `Handler`, `E2EEMaterial`)
- Go struct tags: JSON camelCase (e.g., `json:"callType"`, `json:"livekitRoomName"`)
- DTOs: PascalCase with Dto suffix (e.g., `CreatePostDto`, `WsSendMessageDto`)

## Code Style

**Formatting:**
- Prettier for TypeScript (root `.prettierrc`)
- Settings: single quotes, trailing commas, 100 char print width, 2-space tabs, semicolons, always parens on arrows
- Go: standard `gofmt` (no custom config)

**Linting:**
- ESLint with `@typescript-eslint` (root `.eslintrc.json`)
- `@typescript-eslint/no-explicit-any`: **error** in production code
- `@typescript-eslint/no-unused-vars`: warn (ignore `_` prefixed args)
- `no-console`: warn (allow `console.warn`, `console.error`)
- Test files MAY use `as any` for mock objects (the only exception to no-any)
- NEVER use `@ts-ignore` or `@ts-expect-error`

**TypeScript Strictness:**
- API (`apps/api/tsconfig.json`): `strictNullChecks`, `noImplicitAny`, `strictBindCallApply`, `noFallthroughCasesInSwitch`
- Mobile (`apps/mobile/tsconfig.json`): `strict: true` (extends `expo/tsconfig.base`)
- Target: ES2021 (API), ESNext (mobile)

## Import Organization

**Order (API - NestJS):**
1. NestJS framework imports (`@nestjs/common`, `@nestjs/config`, etc.)
2. Third-party libraries (`@clerk/backend`, `ioredis`, `@sentry/node`, `@prisma/client`)
3. Config/infrastructure (`../../config/prisma.service`)
4. Common utilities (`../../common/guards/`, `../../common/utils/`)
5. Sibling module services (`../notifications/notifications.service`)
6. Local DTOs (`./dto/create-post.dto`)
7. Local service (`./posts.service`)

**Order (Mobile - React Native):**
1. React/React Native (`react`, `react-native`)
2. Expo packages (`expo-router`, `expo-haptics`, `expo-av`)
3. Third-party (`@tanstack/react-query`, `react-native-reanimated`)
4. UI components (`@/components/ui/...`)
5. Hooks (`@/hooks/...`)
6. Services/utils (`@/services/...`, `@/utils/...`)
7. Theme (`@/theme`)
8. Types (`@/types`)

**Order (Go):**
1. Standard library (`context`, `encoding/json`, `net/http`)
2. Third-party (`github.com/redis/go-redis/v9`, `github.com/livekit/...`)
3. Internal packages (`github.com/mizanly/livekit-server/internal/...`)

**Path Aliases (TypeScript):**
- API: `@/*` maps to `src/*`
- Mobile: `@/*`, `@components/*`, `@hooks/*`, `@services/*`, `@store/*`, `@theme/*`, `@utils/*`, `@types/*`, `@screens/*`

## Error Handling

**API (NestJS):**
- Use NestJS built-in exceptions: `NotFoundException`, `ForbiddenException`, `BadRequestException`, `ConflictException`, `UnauthorizedException`
- Global `HttpExceptionFilter` at `apps/api/src/common/filters/http-exception.filter.ts` catches all exceptions
- 5xx errors captured in Sentry; production hides internal error details
- Error response format:
```json
{
  "success": false,
  "statusCode": 400,
  "errorCode": "BAD_REQUEST",
  "error": "Bad Request",
  "message": "Human-readable message",
  "path": "/api/v1/...",
  "timestamp": "2026-03-30T..."
}
```
- Error codes derived from status + message: `DUPLICATE_CONTENT`, `CONTENT_FLAGGED`, `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL_ERROR`
- Cron job errors: catch, log via `this.logger.error(...)`, capture in `Sentry.captureException(error)`, never crash the process

**Go Servers:**
- Early-return pattern: validate input, return error immediately if invalid
- `writeError(w, http.StatusBadRequest, "message")` for client errors
- `writeError(w, http.StatusInternalServerError, "internal error")` for server errors (never expose internal details)
- Log internal errors with `h.logger.Error("context", "error", err, "requestId", reqID)`
- Use `errors.As` for typed error handling (e.g., `store.ErrUserInCall`)
- DB errors are opaque to clients (always "internal error")

**Mobile:**
- API calls wrapped with try/catch, errors shown via `showToast()` (never `Alert.alert` for non-destructive feedback)
- Network errors handled by `useNetworkStatus` hook and `OfflineBanner` component

## Response Envelope

**API Response Format (via TransformInterceptor at `apps/api/src/common/interceptors/transform.interceptor.ts`):**
- All successful responses: `{ success: true, data: T, timestamp: string }`
- Paginated responses: `{ success: true, data: T[], meta: { cursor?, hasMore }, timestamp }`
- Null/undefined normalized to `{ success: true, data: {}, timestamp }`

**Go Server Response Format:**
- Success: `writeJSON(w, status, map[string]interface{}{...})` with custom JSON
- Error: `{"error": "message", "success": false}`

## Authentication Pattern

**API:**
- `@UseGuards(ClerkAuthGuard)` on protected routes
- `@UseGuards(OptionalClerkAuthGuard)` on routes that work with or without auth (e.g., public feed)
- `@CurrentUser('id')` decorator extracts user ID from request (ALWAYS include `'id'`, never bare `@CurrentUser()`)
- Guard at `apps/api/src/common/guards/clerk-auth.guard.ts`: verifies Clerk JWT, looks up user in DB, checks ban/deactivation status
- Banned user auto-unban on temp ban expiry

**Go Servers:**
- Clerk middleware injects `userId` into `context.Context`
- `middleware.UserIDFromContext(r.Context())` extracts user ID
- Rate limiting via `middleware.RateLimiter` with Redis-backed sliding window

## Validation Pattern

**API DTOs:**
- Use `class-validator` decorators: `@IsString()`, `@IsOptional()`, `@IsEnum([...])`, `@MaxLength(N)`, `@IsUrl()`, `@IsNumber()`, `@Min()`, `@Max()`, `@ArrayMaxSize(N)`, `@IsDateString()`, `@IsBoolean()`
- Use `@ApiProperty()` from `@nestjs/swagger` on every field for Swagger documentation
- Global `ValidationPipe` enabled in `apps/api/src/main.ts`
- Inline DTOs (in controller file) acceptable for simple request bodies (e.g., `ReactDto`, `ShareDto`)

**Go Servers:**
- Manual validation in handler functions (no validation library)
- `decodeBody(r, &req)` parses JSON body with `io.LimitReader` (max 64KB)
- Input sanitization: `validatePathParam()` checks length, rejects control characters

## Logging

**API:**
- `Logger` from `@nestjs/common` with named context: `private readonly logger = new Logger(PostsService.name);`
- `nestjs-pino` + `pino` for structured logging
- Sentry for error monitoring (`@sentry/nestjs`)
- NEVER log key material, session state, plaintext, or nonces

**Go:**
- `log/slog` with JSON handler: `slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))`
- Structured fields: `h.logger.Error("context message", "error", err, "requestId", reqID)`
- Sentry for error monitoring (`getsentry/sentry-go`)

## Comments and Documentation

**When to Comment:**
- Package-level doc comment in Go files (e.g., `// Package handler implements HTTP handlers for...`)
- Function-level doc comments for exported Go functions (e.g., `// HandleHealth returns 200 if the service is healthy.`)
- JSDoc on TypeScript hooks explaining purpose and usage patterns (see `useContextualHaptic`)
- Audit finding references in comments (e.g., `// Finding #360: ...`, `// [F2 TRUST MODEL]`, `// [H6]`)
- Security model documentation at top of sensitive files (e.g., Go handler encryption threat model)

## Module Design (API)

**Standard NestJS Module Pattern:**
```typescript
// posts.module.ts
@Module({
  imports: [NotificationsModule, GamificationModule, AiModule, ModerationModule],
  controllers: [PostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
```

- Each feature gets a module directory under `apps/api/src/modules/{feature}/`
- Module contains: `{feature}.module.ts`, `{feature}.controller.ts`, `{feature}.service.ts`, `dto/` directory
- Global modules (PrismaModule, RedisModule) use `@Global()` decorator
- Services inject `PrismaService`, `Redis`, and other services via constructor
- Controller routes: `@Controller('{feature}')` with Swagger tags `@ApiTags('{Feature}')`

**Service Pattern:**
```typescript
@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    @Inject('REDIS') private redis: Redis,
  ) {}
}
```

## Go Module Design

**Interface-Based Dependencies (Dependency Injection):**
```go
// store/iface.go — defines the interface
type Querier interface {
    Health(ctx context.Context) error
    CreateCallSession(ctx context.Context, ...) (*model.CallSession, error)
    // ...
}

// handler/handler.go — depends on interface
type Handler struct {
    db     store.Querier  // Interface, not concrete type
    cfg    *config.Config
    logger *slog.Logger
}

// handler/mock_store_test.go — compile-time interface check
var _ store.Querier = (*mockStore)(nil)
```

- `internal/store/iface.go`: interface definition
- `internal/store/store.go`: PostgreSQL implementation
- `internal/handler/mock_store_test.go`: in-memory mock for testing
- Constructor function: `func New(...) *Handler` returns pointer to struct

## Mobile State Management

**Zustand Store (single global store at `apps/mobile/src/store/index.ts`):**
```typescript
export const useStore = create<AppState>()(
  persist({...}, { name: 'app-storage', storage: createJSONStorage(() => AsyncStorage) })
);

// Usage in components:
const theme = useStore(s => s.theme);
```

**React Query for Server State:**
- `@tanstack/react-query` for API data fetching
- `useQuery` for reads, `useMutation` for writes
- `useInfiniteQuery` for paginated feeds

## Theme and Styling (Mobile)

**Theme tokens from `apps/mobile/src/theme/index.ts`:**
```typescript
import { colors, spacing, fontSize, radius, lineHeight } from '@/theme';
```

**Theme-aware colors via hook:**
```typescript
const tc = useThemeColors();
// tc.bg, tc.text, tc.border, tc.surface, etc.
```

**Brand colors (never hardcode):**
- `colors.emerald` = #0A7B4F (primary brand)
- `colors.gold` = #C8963E (secondary brand)
- `spacing`: xs=4, sm=8, md=12, base=16, lg=20, xl=24, 2xl=32
- `fontSize`: xs=11, sm=13, base=15, md=17, lg=20, xl=24
- `radius`: sm=6, md=10, lg=16, full=9999

**Required UI Components (never raw equivalents):**
- `<BottomSheet>` (never RN `Modal`)
- `<Icon name="..." />` (never text emoji)
- `<EmptyState>` (never bare "No items" text)
- `<BrandedRefreshControl>` (never raw `<RefreshControl>`)
- `<ProgressiveImage>` (never raw `<Image>`)
- `<Skeleton>` for loading (not `<ActivityIndicator>` except buttons)
- `showToast()` for mutation feedback (not `Alert.alert` for non-destructive)
- `useContextualHaptic()` (never bare `useHaptic()`)

## Internationalization (Mobile)

**8 languages:** en, ar, tr, ur, bn, fr, id, ms
- Translation files: `apps/mobile/src/i18n/{lang}.json`
- Framework: `i18next` + `react-i18next`
- Hook: `useTranslation()` from `@/hooks/useTranslation`
- ALL new screens MUST have keys in ALL 8 language files
- NEVER use `sed` for i18n key injection -- use Node JSON parse/write

## Prisma Conventions

- Schema file: `apps/api/prisma/schema.prisma` (~5000 lines, ~200 models)
- Field names are FINAL -- never rename
- All models use `userId` (NOT `authorId`), `user` relation (NOT `author`)
- Message model: `content` (NOT `caption`), `messageType`, `senderId`
- Conversation model: `isGroup: boolean` + `groupName?` (no `type` or `name`)
- Counter fields use non-negative CHECK constraints at DB level
- `$executeRaw` tagged template literals are SAFE -- do not replace them
- SELECT objects defined as constants at service file top (e.g., `POST_SELECT`)

## Crypto Conventions (Signal Protocol)

- NEVER use `Math.random()` -- use CSPRNG (`generateRandomBytes`)
- NEVER log key material, session state, plaintext, or nonces
- All DH outputs MUST be checked for all-zeros (small-subgroup protection via `assertNonZeroDH`)
- Signing keys in SecureStore (hardware-backed), NOT MMKV
- Session/key data in MMKV with AEAD encryption (`aeadSet`/`aeadGet`)
- Message content padded before encryption (`padMessage`/`unpadMessage`)
- Push notifications: generic body for ALL messages (no encryption status leak)

---

*Convention analysis: 2026-03-30*
