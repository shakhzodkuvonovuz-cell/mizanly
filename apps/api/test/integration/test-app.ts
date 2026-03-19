import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ClerkAuthGuard } from '../../src/common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../src/common/guards/optional-clerk-auth.guard';
import { TransformInterceptor } from '../../src/common/interceptors/transform.interceptor';

// Authenticated mock guard — always attaches the provided user to the request
function createAuthGuard(userId: string) {
  return {
    canActivate: jest.fn().mockImplementation((context) => {
      const req = context.switchToHttp().getRequest();
      req.user = { id: userId, clerkId: `clerk_${userId}` };
      return true;
    }),
  };
}

// Unauthenticated mock guard — no user attached, request proceeds (for optional routes)
const unauthGuard = {
  canActivate: jest.fn().mockImplementation((context) => {
    const req = context.switchToHttp().getRequest();
    req.user = null;
    return true;
  }),
};

// Mock guard that rejects — for testing 401 scenarios
const rejectGuard = {
  canActivate: jest.fn().mockReturnValue(false),
};

interface TestAppOptions {
  /** Module imports to include */
  imports: any[];
  /** Override providers (e.g., mock Prisma, Redis) */
  providers?: any[];
  /** User ID for authenticated requests (default: 'test-user-1') */
  userId?: string;
  /** Whether to simulate unauthenticated requests */
  unauthenticated?: boolean;
}

/**
 * Creates a configured NestJS test application with mocked auth guards
 * and standard interceptors/pipes.
 */
export async function createTestApp(options: TestAppOptions): Promise<INestApplication> {
  const {
    imports,
    providers = [],
    userId = 'test-user-1',
    unauthenticated = false,
  } = options;

  const builder = Test.createTestingModule({
    imports,
    providers,
  });

  if (unauthenticated) {
    builder
      .overrideGuard(ClerkAuthGuard)
      .useValue(rejectGuard)
      .overrideGuard(OptionalClerkAuthGuard)
      .useValue(unauthGuard);
  } else {
    const authGuard = createAuthGuard(userId);
    builder
      .overrideGuard(ClerkAuthGuard)
      .useValue(authGuard)
      .overrideGuard(OptionalClerkAuthGuard)
      .useValue(authGuard);
  }

  const moduleFixture: TestingModule = await builder.compile();
  const app = moduleFixture.createNestApplication();

  app.setGlobalPrefix('/api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new TransformInterceptor());

  await app.init();
  return app;
}

/**
 * Creates a test app configured for unauthenticated requests.
 */
export async function createUnauthTestApp(options: Omit<TestAppOptions, 'unauthenticated'>): Promise<INestApplication> {
  return createTestApp({ ...options, unauthenticated: true });
}
