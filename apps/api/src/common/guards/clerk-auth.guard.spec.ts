import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClerkAuthGuard } from './clerk-auth.guard';
import { PrismaService } from '../../config/prisma.service';
import { verifyToken } from '@clerk/backend';

jest.mock('@clerk/backend', () => ({
  verifyToken: jest.fn(),
}));

const mockVerifyToken = verifyToken;

describe('ClerkAuthGuard', () => {
  let guard: ClerkAuthGuard;
  let mockConfigService: { get: jest.Mock };
  let mockPrismaService: {
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
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
    banExpiresAt: null,
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
        update: jest.fn(),
      },
    };

    guard = new ClerkAuthGuard(
      mockConfigService as unknown as ConfigService,
      mockPrismaService as unknown as PrismaService,
    );

    jest.clearAllMocks();
    mockConfigService.get.mockReturnValue('test-clerk-secret-key');
  });

  describe('canActivate', () => {
    it('should allow request with valid token and active user', async () => {
      mockVerifyToken.mockResolvedValue({ sub: 'clerk_user_abc' } as any);
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
          banExpiresAt: true,
          deactivatedAt: true,
        },
      });
      expect(request.user).toEqual(activeUser);
    });

    it('should reject request with no Authorization header — throw UnauthorizedException', async () => {
      const { context } = createMockContext({});

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        'No authorization token provided',
      );
      expect(mockVerifyToken).not.toHaveBeenCalled();
    });

    it('should reject request with malformed token (no Bearer prefix) — throw UnauthorizedException', async () => {
      const { context } = createMockContext({
        authorization: 'Basic some-basic-token',
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        'No authorization token provided',
      );
      expect(mockVerifyToken).not.toHaveBeenCalled();
    });

    it('should reject request with empty Bearer token — throw UnauthorizedException', async () => {
      // "Bearer " with nothing after it => split gives ['Bearer', '']
      // '' is falsy, so extractToken returns undefined
      const { context } = createMockContext({
        authorization: 'Bearer ',
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockVerifyToken).not.toHaveBeenCalled();
    });

    it('should reject when Clerk verifyToken fails (invalid/expired JWT) — throw UnauthorizedException', async () => {
      mockVerifyToken.mockRejectedValue(new Error('Token has expired'));

      const { context } = createMockContext({
        authorization: 'Bearer expired-jwt-token',
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow('Invalid token');
    });

    it('should reject when user not found in database by clerkId — throw UnauthorizedException', async () => {
      mockVerifyToken.mockResolvedValue({ sub: 'clerk_nonexistent' } as any);
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const { context } = createMockContext({
        authorization: 'Bearer valid-jwt-token',
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        'User not found',
      );
    });

    it('should reject permanently banned user (isBanned=true, banExpiresAt=null) — throw ForbiddenException', async () => {
      mockVerifyToken.mockResolvedValue({ sub: 'clerk_user_abc' } as any);
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...activeUser,
        isBanned: true,
        banExpiresAt: null,
      });

      const { context } = createMockContext({
        authorization: 'Bearer valid-jwt-token',
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Account has been banned',
      );
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });

    it('should reject temp banned user with ACTIVE ban (banExpiresAt > now) — throw ForbiddenException', async () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
      mockVerifyToken.mockResolvedValue({ sub: 'clerk_user_abc' } as any);
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...activeUser,
        isBanned: true,
        banExpiresAt: futureDate,
      });

      const { context } = createMockContext({
        authorization: 'Bearer valid-jwt-token',
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Account has been banned',
      );
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });

    it('should AUTO-UNBAN and ALLOW temp banned user with EXPIRED ban (banExpiresAt < now)', async () => {
      const pastDate = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      mockVerifyToken.mockResolvedValue({ sub: 'clerk_user_abc' } as any);
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...activeUser,
        isBanned: true,
        banExpiresAt: pastDate,
      });
      mockPrismaService.user.update.mockResolvedValue({
        ...activeUser,
        isBanned: false,
        banExpiresAt: null,
      });

      const { context, request } = createMockContext({
        authorization: 'Bearer valid-jwt-token',
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-abc-123' },
        data: { isBanned: false, banExpiresAt: null, isDeactivated: false },
      });
      // User object is attached (even with the stale isBanned=true from findUnique,
      // the guard still allows access after unbanning)
      expect(request.user).toBeDefined();
      expect(request.user.id).toBe('user-abc-123');
    });

    it('should reject deactivated user (isDeactivated=true) — throw ForbiddenException', async () => {
      mockVerifyToken.mockResolvedValue({ sub: 'clerk_user_abc' } as any);
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...activeUser,
        isDeactivated: true,
      });

      const { context } = createMockContext({
        authorization: 'Bearer valid-jwt-token',
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Account has been deactivated',
      );
    });

    it('should reject deleted user (isDeleted=true) — throw ForbiddenException', async () => {
      mockVerifyToken.mockResolvedValue({ sub: 'clerk_user_abc' } as any);
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...activeUser,
        isDeleted: true,
      });

      const { context } = createMockContext({
        authorization: 'Bearer valid-jwt-token',
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Account has been deactivated',
      );
    });

    it('should attach userId to request.user on success', async () => {
      mockVerifyToken.mockResolvedValue({ sub: 'clerk_user_abc' } as any);
      mockPrismaService.user.findUnique.mockResolvedValue({ ...activeUser });

      const { context, request } = createMockContext({
        authorization: 'Bearer valid-jwt-token',
      });

      await guard.canActivate(context);

      expect(request.user).toEqual(activeUser);
      expect(request.user.id).toBe('user-abc-123');
      expect(request.user.clerkId).toBe('clerk_user_abc');
      expect(request.user.username).toBe('testuser');
    });

    it('should pass CLERK_SECRET_KEY from ConfigService to verifyToken', async () => {
      mockConfigService.get.mockReturnValue('my-specific-secret-key');
      mockVerifyToken.mockResolvedValue({ sub: 'clerk_user_abc' } as any);
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

    it('should reject when authorization header is just "Bearer" with no token', async () => {
      // "Bearer" alone => split gives ['Bearer'] => token is undefined
      const { context } = createMockContext({
        authorization: 'Bearer',
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockVerifyToken).not.toHaveBeenCalled();
    });

    it('should reject user who is both deactivated and deleted — ForbiddenException', async () => {
      mockVerifyToken.mockResolvedValue({ sub: 'clerk_user_abc' } as any);
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...activeUser,
        isDeactivated: true,
        isDeleted: true,
      });

      const { context } = createMockContext({
        authorization: 'Bearer valid-jwt-token',
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should not check ban/deactivated status when user is not found', async () => {
      mockVerifyToken.mockResolvedValue({ sub: 'clerk_ghost' } as any);
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const { context } = createMockContext({
        authorization: 'Bearer valid-jwt-token',
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      // Throws before reaching ban check
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });
  });

  describe('extractToken (private method, tested through canActivate)', () => {
    it('should extract token from valid "Bearer <token>" format', async () => {
      mockVerifyToken.mockResolvedValue({ sub: 'clerk_user_abc' } as any);
      mockPrismaService.user.findUnique.mockResolvedValue({ ...activeUser });

      const { context } = createMockContext({
        authorization: 'Bearer my-special-token-123',
      });

      await guard.canActivate(context);

      expect(mockVerifyToken).toHaveBeenCalledWith('my-special-token-123', {
        secretKey: 'test-clerk-secret-key',
      });
    });

    it('should return undefined for non-Bearer auth schemes (Token, Basic, etc.)', async () => {
      for (const scheme of ['Token abc', 'Basic abc', 'Digest abc', 'abc']) {
        const { context } = createMockContext({ authorization: scheme });

        await expect(guard.canActivate(context)).rejects.toThrow(
          UnauthorizedException,
        );
      }
      // None of these should have reached verifyToken
      expect(mockVerifyToken).not.toHaveBeenCalled();
    });
  });
});
