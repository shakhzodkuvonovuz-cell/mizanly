import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TwoFactorGuard } from './two-factor.guard';
import { TwoFactorService } from '../../modules/two-factor/two-factor.service';

describe('TwoFactorGuard', () => {
  let guard: TwoFactorGuard;
  let twoFactorService: jest.Mocked<TwoFactorService>;

  const mockUserId = 'user-123';
  const mockSessionId = 'sess_abc';

  function createMockContext(user: Record<string, unknown> | null): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwoFactorGuard,
        {
          provide: TwoFactorService,
          useValue: {
            getStatus: jest.fn(),
            isTwoFactorVerified: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get(TwoFactorGuard);
    twoFactorService = module.get(TwoFactorService) as jest.Mocked<TwoFactorService>;
  });

  afterEach(() => jest.clearAllMocks());

  it('should allow through when user has no 2FA enabled', async () => {
    twoFactorService.getStatus.mockResolvedValue(false);

    const context = createMockContext({ id: mockUserId, sessionId: mockSessionId });
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(twoFactorService.getStatus).toHaveBeenCalledWith(mockUserId);
    expect(twoFactorService.isTwoFactorVerified).not.toHaveBeenCalled();
  });

  it('should allow through when user has 2FA enabled and session is verified', async () => {
    twoFactorService.getStatus.mockResolvedValue(true);
    twoFactorService.isTwoFactorVerified.mockResolvedValue(true);

    const context = createMockContext({ id: mockUserId, sessionId: mockSessionId });
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(twoFactorService.getStatus).toHaveBeenCalledWith(mockUserId);
    expect(twoFactorService.isTwoFactorVerified).toHaveBeenCalledWith(mockUserId, mockSessionId);
  });

  it('should throw ForbiddenException when user has 2FA enabled but session is NOT verified', async () => {
    twoFactorService.getStatus.mockResolvedValue(true);
    twoFactorService.isTwoFactorVerified.mockResolvedValue(false);

    const context = createMockContext({ id: mockUserId, sessionId: mockSessionId });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(context)).rejects.toThrow('2FA verification required');
  });

  it('should throw ForbiddenException when no user is attached to request', async () => {
    const context = createMockContext(null);

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(context)).rejects.toThrow('Authentication required before 2FA check');
  });

  it('should throw ForbiddenException when user object has no id', async () => {
    const context = createMockContext({ sessionId: mockSessionId });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('should pass sessionId from request.user to isTwoFactorVerified', async () => {
    twoFactorService.getStatus.mockResolvedValue(true);
    twoFactorService.isTwoFactorVerified.mockResolvedValue(true);

    const specificSessionId = 'sess_specific_device';
    const context = createMockContext({ id: mockUserId, sessionId: specificSessionId });
    await guard.canActivate(context);

    // Verify the session-bound check uses the correct sessionId
    expect(twoFactorService.isTwoFactorVerified).toHaveBeenCalledWith(mockUserId, specificSessionId);
  });

  it('should handle undefined sessionId (edge case)', async () => {
    twoFactorService.getStatus.mockResolvedValue(true);
    twoFactorService.isTwoFactorVerified.mockResolvedValue(true);

    const context = createMockContext({ id: mockUserId });
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(twoFactorService.isTwoFactorVerified).toHaveBeenCalledWith(mockUserId, undefined);
  });

  it('should not cross-verify: 2FA verified on session A does not grant access on session B', async () => {
    twoFactorService.getStatus.mockResolvedValue(true);

    // Session A is verified
    twoFactorService.isTwoFactorVerified.mockImplementation(
      async (_userId: string, sessionId?: string) => sessionId === 'sess_A',
    );

    const contextA = createMockContext({ id: mockUserId, sessionId: 'sess_A' });
    const resultA = await guard.canActivate(contextA);
    expect(resultA).toBe(true);

    const contextB = createMockContext({ id: mockUserId, sessionId: 'sess_B' });
    await expect(guard.canActivate(contextB)).rejects.toThrow(ForbiddenException);
  });
});
