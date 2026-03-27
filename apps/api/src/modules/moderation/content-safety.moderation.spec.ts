import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PostsService } from '../posts/posts.service';
import { ContentSafetyService } from './content-safety.service';
import { globalMockProviders } from '../../common/test/mock-providers';

/**
 * #210/#212: Test that content safety moderation BLOCKS creation when flagged.
 * These tests override the default safe:true mock to verify the rejection path.
 */
describe('Content Safety — Unsafe Content Rejection', () => {
  let postsService: PostsService;
  let contentSafety: ContentSafetyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [...globalMockProviders, PostsService],
    }).compile();

    postsService = module.get(PostsService);
    contentSafety = module.get(ContentSafetyService);
  });

  it('should throw BadRequestException when post content is flagged as hate speech', async () => {
    (contentSafety.moderateText as jest.Mock).mockResolvedValueOnce({
      safe: false,
      flags: ['HATE_SPEECH'],
      suggestion: 'Please remove hateful language.',
    });

    await expect(
      postsService.create('user-1', { postType: 'TEXT', content: 'hateful content' } as any),
    ).rejects.toThrow(BadRequestException);

    expect(contentSafety.moderateText).toHaveBeenCalledWith('hateful content');
  });

  it('should throw BadRequestException when flagged as violence', async () => {
    (contentSafety.moderateText as jest.Mock).mockResolvedValueOnce({
      safe: false,
      flags: ['VIOLENCE'],
    });

    await expect(
      postsService.create('user-1', { postType: 'TEXT', content: 'violent content' } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException when flagged as nudity', async () => {
    (contentSafety.moderateText as jest.Mock).mockResolvedValueOnce({
      safe: false,
      flags: ['NUDITY'],
    });

    await expect(
      postsService.create('user-1', { postType: 'TEXT', content: 'inappropriate' } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('should include flag names in error message', async () => {
    (contentSafety.moderateText as jest.Mock).mockResolvedValueOnce({
      safe: false,
      flags: ['HATE_SPEECH', 'VIOLENCE'],
      suggestion: 'Revise your content.',
    });

    try {
      await postsService.create('user-1', { postType: 'TEXT', content: 'bad' } as any);
      fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).message).toContain('HATE_SPEECH');
      expect((err as BadRequestException).message).toContain('VIOLENCE');
    }
  });

  it('should verify moderateText is called with the exact content string', async () => {
    (contentSafety.moderateText as jest.Mock).mockResolvedValueOnce({
      safe: false,
      flags: ['SPAM'],
    });

    await expect(
      postsService.create('user-1', { postType: 'TEXT', content: 'buy cheap watches now!!!' } as any),
    ).rejects.toThrow(BadRequestException);

    // Verify the exact string passed to moderation
    expect(contentSafety.moderateText).toHaveBeenCalledWith('buy cheap watches now!!!');
  });
});
