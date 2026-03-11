import { Test } from '@nestjs/testing';
import { ChannelPostsService } from './channel-posts.service';
import { PrismaService } from '../../config/prisma.service';
import { ForbiddenException } from '@nestjs/common';

describe('ChannelPostsService', () => {
  let service: ChannelPostsService;
  let prisma: Record<string, any>;
  beforeEach(async () => {
    prisma = {
      channel: { findUnique: jest.fn() },
      channelPost: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      $executeRaw: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [ChannelPostsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(ChannelPostsService);
  });

  it('creates post for channel owner', async () => {
    prisma.channel.findUnique.mockResolvedValue({ id: 'ch1', userId: 'user1' });
    prisma.channelPost.create.mockResolvedValue({ id: 'cp1' });
    const result = await service.create('ch1', 'user1', { content: 'Hello' });
    expect(result.id).toBe('cp1');
  });

  it('rejects non-owner', async () => {
    prisma.channel.findUnique.mockResolvedValue({ id: 'ch1', userId: 'other' });
    await expect(service.create('ch1', 'user1', { content: 'Hello' })).rejects.toThrow(ForbiddenException);
  });
});