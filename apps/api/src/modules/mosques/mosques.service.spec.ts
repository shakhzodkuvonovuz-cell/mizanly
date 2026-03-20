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
    expect(prisma.mosqueMembership.create).toHaveBeenCalled();
    expect(result).toHaveProperty('joined', true);
  });

  describe('leave', () => {
    it('should leave mosque community', async () => {
      prisma.mosqueMembership.findUnique.mockResolvedValue({ userId: 'u1', mosqueId: 'mosque-1' });
      prisma.mosqueMembership.delete.mockResolvedValue({});
      prisma.$executeRaw.mockResolvedValue(1);

      const result = await service.leave('u1', 'mosque-1');
      expect(result).toEqual({ left: true });
    });

    it('should return left true even when not a member (graceful)', async () => {
      prisma.mosqueMembership.delete.mockRejectedValue(new Error('Record not found'));
      const result = await service.leave('u1', 'mosque-1');
      expect(result).toEqual({ left: true });
    });
  });

  describe('getFeed', () => {
    it('should return mosque posts with pagination', async () => {
      prisma.mosquePost.findMany.mockResolvedValue([
        { id: 'post-1', content: 'Announcement', createdAt: new Date() },
      ]);

      const result = await service.getFeed('mosque-1');
      expect(result.data).toHaveLength(1);
    });

    it('should return empty when no posts', async () => {
      prisma.mosquePost.findMany.mockResolvedValue([]);
      const result = await service.getFeed('mosque-1');
      expect(result.data).toEqual([]);
    });
  });

  describe('createPost', () => {
    it('should create mosque post when member', async () => {
      prisma.mosqueMembership.findUnique.mockResolvedValue({ userId: 'u1', mosqueId: 'mosque-1' });
      prisma.mosquePost.create.mockResolvedValue({ id: 'post-1', content: 'New post' });
      const result = await service.createPost('u1', 'mosque-1', 'New post');
      expect(result.content).toBe('New post');
    });

    it('should throw ForbiddenException when not a member', async () => {
      prisma.mosqueMembership.findUnique.mockResolvedValue(null);
      await expect(service.createPost('u1', 'mosque-1', 'content')).rejects.toThrow();
    });
  });

  describe('getMembers', () => {
    it('should return mosque members with pagination', async () => {
      prisma.mosqueMembership.findMany = jest.fn().mockResolvedValue([
        { user: { id: 'u1', username: 'ali', displayName: 'Ali', avatarUrl: null } },
      ]);

      const result = await service.getMembers('mosque-1');
      expect(result.data).toHaveLength(1);
    });
  });

  describe('getMyMosques', () => {
    it('should return user mosque memberships', async () => {
      prisma.mosqueMembership.findMany = jest.fn().mockResolvedValue([
        { mosque: { id: 'mosque-1', name: 'Local Mosque' } },
      ]);

      const result = await service.getMyMosques('u1');
      expect(result).toHaveLength(1);
    });
  });
});
