import { ConfigService } from '@nestjs/config';
import { OptionalClerkAuthGuard } from './optional-clerk-auth.guard';
import { PrismaService } from '../../config/prisma.service';
import { verifyToken } from '@clerk/backend';

jest.mock('@clerk/backend', () => ({
  verifyToken: jest.fn(),
}));

const mockVerifyToken = verifyToken;

describe('OptionalClerkAuthGuard', () => {
  let guard: OptionalClerkAuthGuard;
  let mockConfigService: { get: jest.Mock };
  let mockPrismaService: {
    user: {
      findUnique: jest.Mock;
    };
  };

  const activeUser = {
    id: 'user-abc-123',
    clerkId: 'clerk_user_abc',
    username: 'testuser',
    displayName: 'Test User',
    isBanned: false,
    isDeactivated: false,
    isDeleted: false,
  };

  function createMockContext(headers: Record<string, string> = {}) {
    const request: any = { headers };
    return {
      context: {
        switchToHttp: () => ({
          getRequest: () => request,
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as any,
      request,
    };
  }

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn().mockReturnValue('test-clerk-secret-key'),
    };

    mockPrismaService = {
      user: {
        findUnique: jest.fn(),
      },
    };

    guard = new OptionalClerkAuthGuard(
      mockConfigService as unknown as ConfigService,
      mockPrismaService as unknown as PrismaService,
    );

    jest.clearAllMocks();
    mockConfigService.get.mockReturnValue('test-clerk-secret-key');
  });

  describe('canActivate', () => {
    it('should return true and attach user when valid token provided', async () => {
      (mockVerifyToken as jest.Mock).mockResolvedValue({ sub: 'clerk_user_abc' });
      mockPrismaService.user.findUnique.mockResolvedValue({ ...activeUser });

      const { context, request } = createMockContext({
        authorization: 'Bearer valid-jwt-token',
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockVerifyToken).toHaveBeenCalledWith('valid-jwt-token', {
        secretKey: 'test-clerk-secret-key',
      });
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { clerkId: 'clerk_user_abc' },
        select: {
          id: true,
          clerkId: true,
          username: true,
          displayName: true,
          isBanned: true,
          isDeactivated: true,
          isDeleted: true,
        },
      });
      expect(request.user).toEqual(activeUser);
    });

    it('should return true with NO user when no Authorization header', async () => {
      const { context, request } = createMockContext({});

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(request.user).toBeUndefined();
      expect(mockVerifyToken).not.toHaveBeenCalled();
      expect(mockPrismaService.user.findUnique).not.toHaveBeenCalled();
    });

    it('should return true with NO user when token is invalid (verifyToken throws)', async () => {
      (mockVerifyToken as jest.Mock).mockRejectedValue(new Error('Invalid JWT'));

      const { context, request } = createMockContext({
        authorization: 'Bearer bad-token',
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(request.user).toBeUndefined();
    });

    it('should return true with NO user when user not found in DB', async () => {
      (mockVerifyToken as jest.Mock).mockResolvedValue({ sub: 'clerk_ghost' });
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const { context, request } = createMockContext({
        authorization: 'Bearer valid-jwt-token',
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(request.user).toBeUndefined();
    });

    it('should return true with NO user when user is banned', async () => {
      (mockVerifyToken as jest.Mock).mockResolvedValue({ sub: 'clerk_user_abc' });
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...activeUser,
        isBanned: true,
      });

      const { context, request } = createMockContext({
        authorization: 'Bearer valid-jwt-token',
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(request.user).toBeUndefined();
    });

    it('should return true with NO user when user is deactivated', async () => {
      (mockVerifyToken as jest.Mock).mockResolvedValue({ sub: 'clerk_user_abc' });
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...activeUser,
        isDeactivated: true,
      });

      const { context, request } = createMockContext({
        authorization: 'Bearer valid-jwt-token',
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(request.user).toBeUndefined();
    });

    it('should return true with NO user when user is deleted', async () => {
      (mockVerifyToken as jest.Mock).mockResolvedValue({ sub: 'clerk_user_abc' });
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...activeUser,
        isDeleted: true,
      });

      const { context, request } = createMockContext({
        authorization: 'Bearer valid-jwt-token',
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(request.user).toBeUndefined();
    });

    it('should log warning for expired tokens specifically', async () => {
      const loggerSpy = jest.spyOn(guard['logger'], 'warn');
      (mockVerifyToken as jest.Mock).mockRejectedValue(
        new Error('Token has expired'),
      );

      const { context, request } = createMockContext({
        authorization: 'Bearer expired-jwt-token',
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(request.user).toBeUndefined();
      expect(loggerSpy).toHaveBeenCalledWith(
        'Expired token on optional route — client should refresh JWT',
      );
    });

    it('should NOT log warning for non-expired token errors', async () => {
      const loggerSpy = jest.spyOn(guard['logger'], 'warn');
      (mockVerifyToken as jest.Mock).mockRejectedValue(
        new Error('Malformed token payload'),
      );

      const { context } = createMockContext({
        authorization: 'Bearer malformed-token',
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(loggerSpy).not.toHaveBeenCalled();
    });

    it('should return true with NO user when auth scheme is not Bearer', async () => {
      const { context, request } = createMockContext({
        authorization: 'Basic some-basic-token',
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(request.user).toBeUndefined();
      expect(mockVerifyToken).not.toHaveBeenCalled();
    });

    it('should return true with NO user when user has multiple flags set', async () => {
      (mockVerifyToken as jest.Mock).mockResolvedValue({ sub: 'clerk_user_abc' });
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...activeUser,
        isBanned: true,
        isDeactivated: true,
        isDeleted: true,
      });

      const { context, request } = createMockContext({
        authorization: 'Bearer valid-jwt-token',
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(request.user).toBeUndefined();
    });

    it('should pass CLERK_SECRET_KEY from ConfigService to verifyToken', async () => {
      mockConfigService.get.mockReturnValue('my-specific-secret-key');
      (mockVerifyToken as jest.Mock).mockResolvedValue({ sub: 'clerk_user_abc' });
      mockPrismaService.user.findUnique.mockResolvedValue({ ...activeUser });

      const { context } = createMockContext({
        authorization: 'Bearer valid-jwt-token',
      });

      await guard.canActivate(context);

      expect(mockConfigService.get).toHaveBeenCalledWith('CLERK_SECRET_KEY');
      expect(mockVerifyToken).toHaveBeenCalledWith('valid-jwt-token', {
        secretKey: 'my-specific-secret-key',
      });
    });
  });

  describe('extractToken (private method, tested through canActivate)', () => {
    it('should extract token from valid "Bearer <token>" format', async () => {
      (mockVerifyToken as jest.Mock).mockResolvedValue({ sub: 'clerk_user_abc' });
      mockPrismaService.user.findUnique.mockResolvedValue({ ...activeUser });

      const { context } = createMockContext({
        authorization: 'Bearer my-special-token-123',
      });

      await guard.canActivate(context);

      expect(mockVerifyToken).toHaveBeenCalledWith('my-special-token-123', {
        secretKey: 'test-clerk-secret-key',
      });
    });

    it('should return undefined for non-Bearer auth schemes — no verifyToken call', async () => {
      for (const scheme of ['Token abc', 'Basic abc', 'Digest abc', 'abc']) {
        jest.clearAllMocks();
        const { context, request } = createMockContext({ authorization: scheme });

        const result = await guard.canActivate(context);

        expect(result).toBe(true);
        expect(request.user).toBeUndefined();
        expect(mockVerifyToken).not.toHaveBeenCalled();
      }
    });

    it('should return undefined when authorization header is just "Bearer" with no token', async () => {
      const { context, request } = createMockContext({
        authorization: 'Bearer',
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(request.user).toBeUndefined();
      expect(mockVerifyToken).not.toHaveBeenCalled();
    });

    it('should return undefined when authorization header is "Bearer " (trailing space, empty token)', async () => {
      const { context, request } = createMockContext({
        authorization: 'Bearer ',
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(request.user).toBeUndefined();
      // Empty string is falsy, so extractToken returns undefined
      expect(mockVerifyToken).not.toHaveBeenCalled();
    });
  });
});
