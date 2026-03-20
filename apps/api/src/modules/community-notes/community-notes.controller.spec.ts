import { Test, TestingModule } from '@nestjs/testing';
import { CommunityNotesController } from './community-notes.controller';
import { CommunityNotesService } from './community-notes.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('CommunityNotesController', () => {
  let controller: CommunityNotesController;
  let service: jest.Mocked<CommunityNotesService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommunityNotesController],
      providers: [
        ...globalMockProviders,
        {
          provide: CommunityNotesService,
          useValue: {
            createNote: jest.fn(),
            getNotesForContent: jest.fn(),
            getHelpfulNotes: jest.fn(),
            rateNote: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: OptionalClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(CommunityNotesController);
    service = module.get(CommunityNotesService) as jest.Mocked<CommunityNotesService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('createNote', () => {
    it('should call communityNotesService.createNote with all params', async () => {
      const dto = { contentType: 'post', contentId: 'post-1', note: 'This is misleading' };
      service.createNote.mockResolvedValue({ id: 'note-1', ...dto } as any);

      const result = await controller.createNote(userId, dto as any);

      expect(service.createNote).toHaveBeenCalledWith(userId, 'post', 'post-1', 'This is misleading');
      expect(result).toEqual(expect.objectContaining({ id: 'note-1' }));
    });
  });

  describe('getNotesForContent', () => {
    it('should call communityNotesService.getNotesForContent with contentType and contentId', async () => {
      const mockNotes = [{ id: 'note-1', note: 'Context needed' }];
      service.getNotesForContent.mockResolvedValue(mockNotes as any);

      const result = await controller.getNotesForContent('post', 'post-1');

      expect(service.getNotesForContent).toHaveBeenCalledWith('post', 'post-1');
      expect(result).toEqual(mockNotes);
    });
  });

  describe('getHelpfulNotes', () => {
    it('should call communityNotesService.getHelpfulNotes with contentType and contentId', async () => {
      service.getHelpfulNotes.mockResolvedValue([{ id: 'note-1', status: 'HELPFUL' }] as any);

      const result = await controller.getHelpfulNotes('thread', 'thread-1');

      expect(service.getHelpfulNotes).toHaveBeenCalledWith('thread', 'thread-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('rateNote', () => {
    it('should call communityNotesService.rateNote with userId, noteId, and rating', async () => {
      service.rateNote.mockResolvedValue({ rated: true } as any);

      const result = await controller.rateNote(userId, 'note-1', { rating: 'helpful' } as any);

      expect(service.rateNote).toHaveBeenCalledWith(userId, 'note-1', 'helpful');
      expect(result).toEqual({ rated: true });
    });
  });
});
