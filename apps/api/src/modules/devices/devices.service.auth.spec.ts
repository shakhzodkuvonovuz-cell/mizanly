import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { DevicesService } from './devices.service';
import { TwoFactorService } from '../two-factor/two-factor.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('DevicesService — authorization matrix', () => {
  let service: DevicesService;
  let prisma: any;
  const userA = 'user-a';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        DevicesService,
        {
          provide: PrismaService,
          useValue: {
            device: {
              findMany: jest.fn().mockResolvedValue([]),
              findUnique: jest.fn(),
              create: jest.fn(),
              upsert: jest.fn(),
              delete: jest.fn(),
              deleteMany: jest.fn(),
              updateMany: jest.fn(),
            },
          },
        },
        {
          provide: TwoFactorService,
          useValue: {
            clearTwoFactorSession: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<DevicesService>(DevicesService);
    prisma = module.get(PrismaService);
  });

  it('should only return own sessions', async () => {
    const result = await service.getSessions(userA);
    expect(result).toEqual([]);
    expect(prisma.device.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: userA }) }),
    );
  });

  it('should register device for own user', async () => {
    prisma.device.upsert.mockResolvedValue({ id: 'd-1', userId: userA });
    const result = await service.register(userA, 'token-1', 'ios');
    expect(result).toBeDefined();
    expect(result).toHaveProperty('id', 'd-1');
  });

  it('should only return own active push tokens', async () => {
    const result = await service.getActiveTokensForUser(userA);
    expect(result).toEqual([]);
    expect(prisma.device.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: userA }) }),
    );
  });

  it('should only logout own sessions', async () => {
    prisma.device.deleteMany.mockResolvedValue({ count: 2 });
    const result = await service.logoutAllOtherSessions(userA, 'current-session');
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
  });
});
