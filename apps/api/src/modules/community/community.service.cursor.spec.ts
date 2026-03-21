import { Test, TestingModule } from '@nestjs/testing';
import { CommunityService } from './community.service';
import { PrismaService } from '../../config/prisma.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('CommunityService — cursor pagination fixes', () => {
  let service: CommunityService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        CommunityService,
        {
          provide: PrismaService,
          useValue: {
            localBoard: { findMany: jest.fn().mockResolvedValue([]) },
            studyCircle: { findMany: jest.fn().mockResolvedValue([]) },
            fatwaQuestion: { findMany: jest.fn().mockResolvedValue([]) },
            volunteerOpportunity: { findMany: jest.fn().mockResolvedValue([]) },
            islamicEvent: { findMany: jest.fn().mockResolvedValue([]) },
            voicePost: { findMany: jest.fn().mockResolvedValue([]) },
            waqfFund: { findMany: jest.fn().mockResolvedValue([]) },
            user: { findUnique: jest.fn() },
          },
        },
      ],
    }).compile();

    service = module.get(CommunityService);
    prisma = module.get(PrismaService) as any;
  });

  it('getBoards should use Prisma cursor pagination', async () => {
    await service.getBoards(undefined, undefined, 'cursor-id');
    expect(prisma.localBoard.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { id: 'cursor-id' }, skip: 1 }),
    );
  });

  it('getStudyCircles should use Prisma cursor pagination', async () => {
    await service.getStudyCircles(undefined, 'cursor-id');
    expect(prisma.studyCircle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { id: 'cursor-id' }, skip: 1 }),
    );
  });

  it('getFatwaQuestions should use Prisma cursor pagination', async () => {
    // getFatwaQuestions(status?, madhab?, cursor?, limit?)
    await (service as any).getFatwaQuestions(undefined, undefined, 'cursor-id', 20);
    expect(prisma.fatwaQuestion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { id: 'cursor-id' }, skip: 1 }),
    );
  });

  it('getEvents should use Prisma cursor pagination', async () => {
    // getEvents(eventType?, cursor?, limit?)
    await (service as any).getEvents(undefined, 'cursor-id', 20);
    expect(prisma.islamicEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { id: 'cursor-id' }, skip: 1 }),
    );
  });

  it('getVoicePosts should use Prisma cursor pagination', async () => {
    await (service as any).getVoicePosts('cursor-id');
    expect(prisma.voicePost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { id: 'cursor-id' }, skip: 1 }),
    );
  });

  it('getWaqfFunds should use Prisma cursor pagination', async () => {
    await (service as any).getWaqfFunds('cursor-id');
    expect(prisma.waqfFund.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { id: 'cursor-id' }, skip: 1 }),
    );
  });

  it('should not include cursor when no cursor provided', async () => {
    await service.getBoards();
    const call = prisma.localBoard.findMany.mock.calls[0][0];
    expect(call.cursor).toBeUndefined();
    expect(call.skip).toBeUndefined();
  });
});
