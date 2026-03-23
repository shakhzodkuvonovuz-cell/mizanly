import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ChannelsService } from './channels.service';
import { globalMockProviders } from '../../common/test/mock-providers';
import { NotificationsService } from '../notifications/notifications.service';

describe('ChannelsService — authorization matrix', () => {
  let service: ChannelsService;
  let prisma: any;
  const userA = 'user-a';
  const userB = 'user-b';
  const mockChannelByA = { id: 'ch-1', handle: 'test', userId: userA, name: 'Test Channel' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        ChannelsService,
        {
          provide: PrismaService,
          useValue: {
            channel: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), delete: jest.fn() },
            subscription: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn(), count: jest.fn().mockResolvedValue(0) },
            video: { findMany: jest.fn().mockResolvedValue([]) },
            $transaction: jest.fn(),
            $executeRaw: jest.fn(),
          },
        },
        { provide: NotificationsService, useValue: { create: jest.fn().mockResolvedValue({ id: 'n-1' }) } },
        { provide: 'REDIS', useValue: { get: jest.fn().mockResolvedValue(null), setex: jest.fn(), del: jest.fn() } },
      ],
    }).compile();

    service = module.get<ChannelsService>(ChannelsService);
    prisma = module.get(PrismaService);
  });

  it('should allow owner to update channel', async () => {
    prisma.channel.findUnique.mockResolvedValue(mockChannelByA);
    prisma.channel.update.mockResolvedValue({ ...mockChannelByA, name: 'Updated' });
    const result = await service.update('test', userA, { name: 'Updated' } as any);
    expect(result.name).toBe('Updated');
  });

  it('should throw ForbiddenException when non-owner updates', async () => {
    prisma.channel.findUnique.mockResolvedValue(mockChannelByA);
    await expect(service.update('test', userB, { name: 'Hacked' } as any))
      .rejects.toThrow(ForbiddenException);
  });

  it('should allow owner to delete channel', async () => {
    prisma.channel.findUnique.mockResolvedValue(mockChannelByA);
    prisma.channel.delete.mockResolvedValue({});
    const result = await service.delete('test', userA);
    expect(result.deleted).toBe(true);
  });

  it('should throw ForbiddenException when non-owner deletes', async () => {
    prisma.channel.findUnique.mockResolvedValue(mockChannelByA);
    await expect(service.delete('test', userB)).rejects.toThrow(ForbiddenException);
  });

  it('should throw BadRequestException when owner subscribes to own channel', async () => {
    prisma.channel.findUnique.mockResolvedValue(mockChannelByA);
    await expect(service.subscribe('test', userA)).rejects.toThrow(BadRequestException);
  });

  it('should allow any user to subscribe to another user channel', async () => {
    prisma.channel.findUnique.mockResolvedValue(mockChannelByA);
    prisma.subscription.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockResolvedValue([{}, {}]);
    const result = await service.subscribe('test', userB);
    expect(result.subscribed).toBe(true);
  });

  it('should throw ConflictException when already subscribed', async () => {
    prisma.channel.findUnique.mockResolvedValue(mockChannelByA);
    prisma.subscription.findUnique.mockResolvedValue({ userId: userB });
    await expect(service.subscribe('test', userB)).rejects.toThrow(ConflictException);
  });

  it('should throw NotFoundException for non-existent channel', async () => {
    prisma.channel.findUnique.mockResolvedValue(null);
    await expect(service.getByHandle('nonexistent')).rejects.toThrow(NotFoundException);
  });

  it('should allow owner to view analytics', async () => {
    prisma.channel.findUnique.mockResolvedValue(mockChannelByA);
    prisma.video.findMany.mockResolvedValue([]);
    prisma.subscription.findMany.mockResolvedValue([]);
    const result = await service.getAnalytics('test', userA);
    expect(result).toBeDefined();
    expect(result).toHaveProperty('totalViews');
  });

  it('should throw ForbiddenException when non-owner views analytics', async () => {
    prisma.channel.findUnique.mockResolvedValue(mockChannelByA);
    await expect(service.getAnalytics('test', userB)).rejects.toThrow(ForbiddenException);
  });
});
