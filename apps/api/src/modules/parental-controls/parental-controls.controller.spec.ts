import { Test, TestingModule } from '@nestjs/testing';
import { ParentalControlsController } from './parental-controls.controller';
import { ParentalControlsService } from './parental-controls.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('ParentalControlsController', () => {
  let controller: ParentalControlsController;
  let service: jest.Mocked<ParentalControlsService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ParentalControlsController],
      providers: [
        ...globalMockProviders,
        {
          provide: ParentalControlsService,
          useValue: {
            linkChild: jest.fn(),
            unlinkChild: jest.fn(),
            getMyChildren: jest.fn(),
            getParentInfo: jest.fn(),
            updateControls: jest.fn(),
            verifyPin: jest.fn(),
            changePin: jest.fn(),
            getRestrictions: jest.fn(),
            getActivityDigest: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(ParentalControlsController);
    service = module.get(ParentalControlsService) as jest.Mocked<ParentalControlsService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('linkChild', () => {
    it('should call parentalControlsService.linkChild with parentUserId and dto', async () => {
      const dto = { childUserId: 'kid-123', pin: '1234' };
      service.linkChild.mockResolvedValue({ linked: true } as any);

      const result = await controller.linkChild(userId, dto as any);

      expect(service.linkChild).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual({ linked: true });
    });
  });

  describe('unlinkChild', () => {
    it('should call parentalControlsService.unlinkChild with parentUserId, childId, and pin', async () => {
      service.unlinkChild.mockResolvedValue({ unlinked: true } as any);

      await controller.unlinkChild(userId, 'child-1', { pin: '1234' } as any);

      expect(service.unlinkChild).toHaveBeenCalledWith(userId, 'child-1', '1234');
    });
  });

  describe('getMyChildren', () => {
    it('should call parentalControlsService.getMyChildren with parentUserId', async () => {
      service.getMyChildren.mockResolvedValue([{ id: 'child-1' }] as any);

      const result = await controller.getMyChildren(userId);

      expect(service.getMyChildren).toHaveBeenCalledWith(userId);
      expect(result).toHaveLength(1);
    });
  });

  describe('getParentInfo', () => {
    it('should call parentalControlsService.getParentInfo with childUserId', async () => {
      service.getParentInfo.mockResolvedValue({ parentId: 'parent-1' } as any);

      await controller.getParentInfo(userId);

      expect(service.getParentInfo).toHaveBeenCalledWith(userId);
    });
  });

  describe('updateControls', () => {
    it('should call parentalControlsService.updateControls with parentUserId, childId, and dto', async () => {
      const dto = { screenTimeLimit: 120, contentFilter: 'strict' };
      service.updateControls.mockResolvedValue({ updated: true } as any);

      await controller.updateControls(userId, 'child-1', dto as any);

      expect(service.updateControls).toHaveBeenCalledWith(userId, 'child-1', dto);
    });
  });

  describe('verifyPin', () => {
    it('should call parentalControlsService.verifyPin with parentUserId, childId, and pin', async () => {
      service.verifyPin.mockResolvedValue({ valid: true } as any);

      await controller.verifyPin(userId, 'child-1', { pin: '1234' } as any);

      expect(service.verifyPin).toHaveBeenCalledWith(userId, 'child-1', '1234');
    });
  });

  describe('changePin', () => {
    it('should call parentalControlsService.changePin with parentUserId, childId, currentPin, newPin', async () => {
      service.changePin.mockResolvedValue({ changed: true } as any);

      await controller.changePin(userId, 'child-1', { currentPin: '1234', newPin: '5678' } as any);

      expect(service.changePin).toHaveBeenCalledWith(userId, 'child-1', '1234', '5678');
    });
  });

  describe('getRestrictions', () => {
    it('should call parentalControlsService.getRestrictions with childId and parentId', async () => {
      service.getRestrictions.mockResolvedValue({ dmDisabled: true } as any);

      await controller.getRestrictions('parent-1', 'child-1');

      expect(service.getRestrictions).toHaveBeenCalledWith('child-1', 'parent-1');
    });
  });

  describe('getActivityDigest', () => {
    it('should call parentalControlsService.getActivityDigest with parentUserId and childId', async () => {
      service.getActivityDigest.mockResolvedValue({ screenTime: 120, postsCreated: 5 } as any);

      await controller.getActivityDigest(userId, 'child-1');

      expect(service.getActivityDigest).toHaveBeenCalledWith(userId, 'child-1');
    });
  });
});
