import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { UploadService } from './upload.service';
import { v4 as uuidv4 } from 'uuid';
import { globalMockProviders } from '../../common/test/mock-providers';

jest.mock('@aws-sdk/s3-request-presigner');
jest.mock('@aws-sdk/client-s3', () => {
  const mockSend = jest.fn();

  // Create mock constructors that can be used with instanceof
  const MockPutObjectCommand = jest.fn().mockImplementation(function(params) {
    this.input = params;
  });

  const MockDeleteObjectCommand = jest.fn().mockImplementation(function(params) {
    this.input = params;
  });

  return {
    S3Client: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    PutObjectCommand: MockPutObjectCommand,
    DeleteObjectCommand: MockDeleteObjectCommand,
    // Export the mock send so we can access it in tests
    __mockSend: mockSend,
  };
});
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-123'),
}));

describe('UploadService', () => {
  let service: UploadService;
  let mockConfigService: any;
  let mockS3Send: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Create a mock send function that will be used by the S3Client instance
    mockS3Send = jest.fn();

    mockConfigService = {
      get: jest.fn((key) => {
        switch (key) {
          case 'R2_ACCOUNT_ID': return 'account-123';
          case 'R2_ACCESS_KEY_ID': return 'access-key';
          case 'R2_SECRET_ACCESS_KEY': return 'secret-key';
          case 'R2_BUCKET_NAME': return 'test-bucket';
          case 'R2_PUBLIC_URL': return 'https://media.test.com';
          default: return null;
        }
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        UploadService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<UploadService>(UploadService);
  });

  describe('getPresignedUrl', () => {
    it('should generate presigned URL for valid image type', async () => {
      const userId = 'user-123';
      const contentType = 'image/jpeg';
      const folder = 'avatars';
      const mockUrl = 'https://s3.presigned.url/upload';
      (getSignedUrl as jest.Mock).mockResolvedValue(mockUrl);

      const result = await service.getPresignedUrl(userId, contentType, folder);

      expect(getSignedUrl).toHaveBeenCalled();
      const command = (getSignedUrl as jest.Mock).mock.calls[0][1];
      expect(command).toBeInstanceOf(PutObjectCommand);
      expect(command.input).toMatchObject({
        Bucket: 'test-bucket',
        Key: expect.stringContaining('avatars/user-123/mock-uuid-123.jpg'),
        ContentType: 'image/jpeg',
      });
      expect(result).toEqual(expect.objectContaining({
        uploadUrl: mockUrl,
        key: expect.stringContaining('avatars/user-123/mock-uuid-123.jpg'),
        publicUrl: expect.stringContaining('https://media.test.com/avatars/user-123/mock-uuid-123.jpg'),
        expiresIn: 300,
      }));
    });

    it('should generate presigned URL for valid video type', async () => {
      const userId = 'user-123';
      const contentType = 'video/mp4';
      const folder = 'videos';
      (getSignedUrl as jest.Mock).mockResolvedValue('https://presigned.url');

      await service.getPresignedUrl(userId, contentType, folder);

      const command = (getSignedUrl as jest.Mock).mock.calls[0][1];
      expect(command.input.Key).toContain('.mp4');
    });

    it('should throw BadRequestException for unsupported content type', async () => {
      const userId = 'user-123';
      const contentType = 'application/pdf';
      const folder = 'misc';

      await expect(service.getPresignedUrl(userId, contentType, folder)).rejects.toThrow(BadRequestException);
    });

    it('should allow custom expiresIn', async () => {
      const userId = 'user-123';
      const contentType = 'image/png';
      const folder = 'posts';
      (getSignedUrl as jest.Mock).mockResolvedValue('https://presigned.url');

      await service.getPresignedUrl(userId, contentType, folder, 600);

      expect(getSignedUrl).toHaveBeenCalledWith(expect.anything(), expect.anything(), { expiresIn: 600 });
    });
  });

  describe('deleteFile', () => {
    it('should delete file from S3', async () => {
      const key = 'avatars/user-123/file.jpg';
      const { __mockSend } = require('@aws-sdk/client-s3');
      __mockSend.mockResolvedValue({});

      const result = await service.deleteFile(key);

      expect(__mockSend).toHaveBeenCalledWith(expect.any(DeleteObjectCommand));
      const command = __mockSend.mock.calls[0][0];
      expect(command.input).toEqual({
        Bucket: 'test-bucket',
        Key: key,
      });
      expect(result).toEqual({ deleted: true, key });
    });
  });

  describe('validateContentType', () => {
    it('should allow all image types', () => {
      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      validTypes.forEach((type) => {
        expect(() => (service as any).validateContentType(type)).not.toThrow();
      });
    });

    it('should allow all video types', () => {
      const validTypes = ['video/mp4', 'video/quicktime', 'video/webm'];
      validTypes.forEach((type) => {
        expect(() => (service as any).validateContentType(type)).not.toThrow();
      });
    });

    it('should allow all audio types', () => {
      const validTypes = ['audio/mpeg', 'audio/wav', 'audio/mp4'];
      validTypes.forEach((type) => {
        expect(() => (service as any).validateContentType(type)).not.toThrow();
      });
    });

    it('should throw for invalid types', () => {
      expect(() => (service as any).validateContentType('text/plain')).toThrow(BadRequestException);
      expect(() => (service as any).validateContentType('application/json')).toThrow(BadRequestException);
    });
  });

  describe('getExtension', () => {
    it('should return correct extensions', () => {
      const serviceAsAny = service as any;
      expect(serviceAsAny.getExtension('image/jpeg')).toBe('jpg');
      expect(serviceAsAny.getExtension('image/png')).toBe('png');
      expect(serviceAsAny.getExtension('video/mp4')).toBe('mp4');
      expect(serviceAsAny.getExtension('video/quicktime')).toBe('mov');
      expect(serviceAsAny.getExtension('audio/mpeg')).toBe('mp3');
      expect(serviceAsAny.getExtension('unknown/type')).toBe('bin');
    });

    it('should return correct audio extensions', () => {
      const serviceAsAny = service as any;
      expect(serviceAsAny.getExtension('audio/wav')).toBe('wav');
      expect(serviceAsAny.getExtension('audio/mp4')).toBe('m4a');
    });
  });

  describe('getPresignedUrl — folder restrictions', () => {
    it('should reject video type in avatars folder', async () => {
      await expect(
        service.getPresignedUrl('user-123', 'video/mp4', 'avatars'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject audio type in reels folder', async () => {
      await expect(
        service.getPresignedUrl('user-123', 'audio/mpeg', 'reels'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject oversized maxFileSize', async () => {
      (getSignedUrl as jest.Mock).mockResolvedValue('https://presigned.url');
      await expect(
        service.getPresignedUrl('user-123', 'image/jpeg', 'avatars', 300, 100 * 1024 * 1024),
      ).rejects.toThrow(BadRequestException);
    });

    it('should include image variants for image uploads', async () => {
      (getSignedUrl as jest.Mock).mockResolvedValue('https://presigned.url');
      const result = await service.getPresignedUrl('user-123', 'image/jpeg', 'posts');
      expect(result).toHaveProperty('variants');
    });

    it('should not include variants for video uploads', async () => {
      (getSignedUrl as jest.Mock).mockResolvedValue('https://presigned.url');
      const result = await service.getPresignedUrl('user-123', 'video/mp4', 'posts');
      expect(result).not.toHaveProperty('variants');
    });
  });
});