import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('AuthController', () => {
  let controller: AuthController;
  let service: jest.Mocked<AuthService>;

  const userId = 'user-123';
  const clerkId = 'clerk_abc';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        ...globalMockProviders,
        {
          provide: AuthService,
          useValue: {
            register: jest.fn(),
            getMe: jest.fn(),
            checkUsername: jest.fn(),
            setInterests: jest.fn(),
            getSuggestedUsers: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(AuthController);
    service = module.get(AuthService) as jest.Mocked<AuthService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('register', () => {
    it('should call authService.register with clerkId and dto', async () => {
      const dto = { username: 'testuser', displayName: 'Test User' };
      const mockUser = { id: userId, username: 'testuser', displayName: 'Test User' };
      service.register.mockResolvedValue(mockUser as any);

      const result = await controller.register(clerkId, dto as any);

      expect(service.register).toHaveBeenCalledWith(clerkId, dto);
      expect(result).toEqual(expect.objectContaining({ username: 'testuser' }));
    });

    it('should propagate BadRequestException for duplicate username', async () => {
      service.register.mockRejectedValue(new BadRequestException('Username taken'));

      await expect(controller.register(clerkId, { username: 'taken' } as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('me', () => {
    it('should call authService.getMe with userId', async () => {
      const mockUser = { id: userId, username: 'testuser', followersCount: 10 };
      service.getMe.mockResolvedValue(mockUser as any);

      const result = await controller.me(userId);

      expect(service.getMe).toHaveBeenCalledWith(userId);
      expect(result).toEqual(expect.objectContaining({ id: userId }));
    });
  });

  describe('checkUsername', () => {
    it('should call authService.checkUsername with username', async () => {
      service.checkUsername.mockResolvedValue({ available: true } as any);

      const result = await controller.checkUsername('newuser');

      expect(service.checkUsername).toHaveBeenCalledWith('newuser');
      expect(result).toEqual({ available: true });
    });

    it('should return unavailable for taken username', async () => {
      service.checkUsername.mockResolvedValue({ available: false } as any);

      const result = await controller.checkUsername('takenuser');

      expect(result).toEqual({ available: false });
    });
  });

  describe('setInterests', () => {
    it('should call authService.setInterests with userId and dto', async () => {
      const dto = { interests: ['ISLAMIC', 'TECHNOLOGY', 'SPORTS'] };
      service.setInterests.mockResolvedValue({ updated: true } as any);

      const result = await controller.setInterests(userId, dto as any);

      expect(service.setInterests).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual({ updated: true });
    });
  });

  describe('suggestedUsers', () => {
    it('should call authService.getSuggestedUsers with userId', async () => {
      const mockUsers = [{ id: 'user-2', username: 'suggested1' }, { id: 'user-3', username: 'suggested2' }];
      service.getSuggestedUsers.mockResolvedValue(mockUsers as any);

      const result = await controller.suggestedUsers(userId);

      expect(service.getSuggestedUsers).toHaveBeenCalledWith(userId);
      expect(result).toHaveLength(2);
    });
  });
});
