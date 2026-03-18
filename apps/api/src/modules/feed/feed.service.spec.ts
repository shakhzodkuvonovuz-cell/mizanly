import { Test } from '@nestjs/testing';
import { FeedService } from './feed.service';
import { PrismaService } from '../../config/prisma.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('FeedService', () => {
  let service: FeedService;
  let prisma: Record<string, any>;
  beforeEach(async () => {
    prisma = { feedInteraction: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() }, feedDismissal: { upsert: jest.fn(), findMany: jest.fn(), delete: jest.fn() } };
    const module = await Test.createTestingModule({ providers: [
        ...globalMockProviders,FeedService, { provide: PrismaService, useValue: prisma }] }).compile();
    service = module.get(FeedService);
  });
  it('logs interaction', async () => {
    prisma.feedInteraction.findFirst.mockResolvedValue(null);
    prisma.feedInteraction.create.mockResolvedValue({ id: 'fi1' });
    await service.logInteraction('u1', { postId: 'p1', space: 'SAF', viewed: true });
    expect(prisma.feedInteraction.create).toHaveBeenCalled();
  });
  it('dismisses content', async () => {
    prisma.feedDismissal.upsert.mockResolvedValue({});
    await service.dismiss('u1', 'p1', 'post');
    expect(prisma.feedDismissal.upsert).toHaveBeenCalled();
  });
  it('returns dismissed IDs', async () => {
    prisma.feedDismissal.findMany.mockResolvedValue([{ contentId: 'p1' }]);
    const ids = await service.getDismissedIds('u1', 'post');
    expect(ids).toEqual(['p1']);
  });
});