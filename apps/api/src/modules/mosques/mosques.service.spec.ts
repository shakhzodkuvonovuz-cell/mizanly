import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MosquesService } from './mosques.service';
import { PrismaService } from '../../config/prisma.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('MosquesService', () => {
  let service: MosquesService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        MosquesService,
        {
          provide: PrismaService,
          useValue: {
            mosqueCommunity: {
              create: jest.fn().mockResolvedValue({ id: 'mosque-1', name: 'Test Mosque', memberCount: 1 }),
              findMany: jest.fn().mockResolvedValue([]),
              findUnique: jest.fn().mockResolvedValue({
                id: 'mosque-1', name: 'Test Mosque', memberCount: 5,
                memberships: [], posts: [],
              }),
              update: jest.fn().mockResolvedValue({}),
            },
            mosqueMembership: {
              create: jest.fn().mockResolvedValue({}),
              findUnique: jest.fn().mockResolvedValue(null),
              delete: jest.fn().mockResolvedValue({}),
            },
            mosquePost: {
              create: jest.fn().mockResolvedValue({ id: 'post-1', content: 'Test' }),
              findMany: jest.fn().mockResolvedValue([]),
            },
            $executeRaw: jest.fn().mockResolvedValue(1),
          },
        },
      ],
    }).compile();

    service = module.get(MosquesService);
    prisma = module.get(PrismaService) as any;
  });

  it('should find nearby mosques', async () => {
    const result = await service.findNearby(40.71, -74.0, 10);
    expect(Array.isArray(result)).toBe(true);
  });

  it('should create a mosque community', async () => {
    const result = await service.create('u1', {
      name: 'Test Mosque', address: '123 St', city: 'NYC',
      country: 'USA', latitude: 40.71, longitude: -74.0,
    });
    expect(result.name).toBe('Test Mosque');
  });

  it('should get mosque by ID', async () => {
    const result = await service.getById('mosque-1');
    expect(result.name).toBe('Test Mosque');
  });

  it('should throw NotFoundException for missing mosque', async () => {
    prisma.mosqueCommunity.findUnique.mockResolvedValueOnce(null);
    await expect(service.getById('invalid')).rejects.toThrow(NotFoundException);
  });

  it('should join a mosque community', async () => {
    const result = await service.join('u1', 'mosque-1');
    expect(result).toBeDefined();
  });
});
