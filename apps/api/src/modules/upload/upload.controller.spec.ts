import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('UploadController', () => {
  let controller: UploadController;
  let service: jest.Mocked<UploadService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadController],
      providers: [
        ...globalMockProviders,
        {
          provide: UploadService,
          useValue: {
            getPresignedUrl: jest.fn(),
            deleteFile: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(UploadController);
    service = module.get(UploadService) as jest.Mocked<UploadService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('getPresignedUrl', () => {
    it('should call uploadService.getPresignedUrl with correct args', async () => {
      service.getPresignedUrl.mockResolvedValue({ url: 'https://r2.example.com/presigned', key: 'posts/user-123/abc.jpg' } as any);

      await controller.getPresignedUrl(userId, { contentType: 'image/jpeg', folder: 'posts' } as any);

      expect(service.getPresignedUrl).toHaveBeenCalledWith(userId, 'image/jpeg', 'posts', 300, undefined);
    });

    it('should pass maxFileSize when provided', async () => {
      service.getPresignedUrl.mockResolvedValue({ url: 'https://r2.example.com/presigned', key: 'videos/user-123/abc.mp4' } as any);

      await controller.getPresignedUrl(userId, { contentType: 'video/mp4', folder: 'videos', maxFileSize: 52428800 } as any);

      expect(service.getPresignedUrl).toHaveBeenCalledWith(userId, 'video/mp4', 'videos', 300, 52428800);
    });
  });

  describe('deleteFile', () => {
    it('should call uploadService.deleteFile when user owns the file', async () => {
      service.deleteFile.mockResolvedValue({ deleted: true } as any);

      await controller.deleteFile('posts/user-123/abc.jpg', userId);

      expect(service.deleteFile).toHaveBeenCalledWith('posts/user-123/abc.jpg');
    });

    it('should throw ForbiddenException when user does not own the file', () => {
      expect(() => controller.deleteFile('posts/other-user/abc.jpg', userId)).toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when key has insufficient segments', () => {
      expect(() => controller.deleteFile('nouser', userId)).toThrow(ForbiddenException);
    });
  });
});
