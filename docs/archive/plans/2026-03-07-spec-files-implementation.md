# Step 7: Add 3 Missing Service Spec Files Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create 3 missing service specification files (profile-links.service.spec.ts, settings.service.spec.ts, upload.service.spec.ts) with proper test coverage for all public methods.

**Architecture:** Follow the mock pattern from ARCHITECT_INSTRUCTIONS.md Step 7.1 exactly. Each spec file will mock dependencies (PrismaService or S3Client) and test all public methods of the corresponding service.

**Tech Stack:** NestJS, Jest, Prisma, AWS SDK v3

---

### Task 1: Create profile-links.service.spec.ts

**Files:**
- Create: `apps/api/src/modules/profile-links/profile-links.service.spec.ts`

**Step 1: Write the failing test file**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ProfileLinksService } from './profile-links.service';

describe('ProfileLinksService', () => {
  let service: ProfileLinksService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileLinksService,
        {
          provide: PrismaService,
          useValue: {
            profileLink: {
              findMany: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
              findFirst: jest.fn(),
              count: jest.fn(),
              findUnique: jest.fn(),
              updateMany: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ProfileLinksService>(ProfileLinksService);
    prisma = module.get(PrismaService) as any;
  });

  describe('getLinks', () => {
    it('should return user links ordered by position', async () => {
      const userId = 'user-123';
      const mockLinks = [
        { id: 'link-1', title: 'GitHub', url: 'https://github.com', position: 0 },
        { id: 'link-2', title: 'Twitter', url: 'https://twitter.com', position: 1 },
      ];
      prisma.profileLink.findMany.mockResolvedValue(mockLinks);

      const result = await service.getLinks(userId);

      expect(prisma.profileLink.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { position: 'asc' },
      });
      expect(result).toEqual(mockLinks);
    });
  });

  describe('addLink', () => {
    it('should create a new link with correct position', async () => {
      const userId = 'user-123';
      const dto = { title: 'GitHub', url: 'https://github.com' };
      prisma.profileLink.count.mockResolvedValue(2);
      prisma.profileLink.findFirst.mockResolvedValue({ position: 1 });
      prisma.profileLink.create.mockResolvedValue({
        id: 'link-3',
        userId,
        ...dto,
        position: 2,
      });

      const result = await service.addLink(userId, dto);

      expect(prisma.profileLink.count).toHaveBeenCalledWith({ where: { userId } });
      expect(prisma.profileLink.findFirst).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { position: 'desc' },
      });
      expect(prisma.profileLink.create).toHaveBeenCalledWith({
        data: { userId, title: dto.title, url: dto.url, position: 2 },
      });
      expect(result.position).toBe(2);
    });

    it('should throw BadRequestException when exceeding MAX_LINKS', async () => {
      const userId = 'user-123';
      const dto = { title: 'GitHub', url: 'https://github.com' };
      prisma.profileLink.count.mockResolvedValue(5);

      await expect(service.addLink(userId, dto)).rejects.toThrow(BadRequestException);
    });

    it('should start at position 0 when no links exist', async () => {
      const userId = 'user-123';
      const dto = { title: 'GitHub', url: 'https://github.com' };
      prisma.profileLink.count.mockResolvedValue(0);
      prisma.profileLink.findFirst.mockResolvedValue(null);
      prisma.profileLink.create.mockResolvedValue({ id: 'link-1', ...dto, position: 0 });

      const result = await service.addLink(userId, dto);

      expect(result.position).toBe(0);
    });
  });

  describe('updateLink', () => {
    it('should update link when user owns it', async () => {
      const userId = 'user-123';
      const linkId = 'link-1';
      const dto = { title: 'Updated Title' };
      const mockLink = { id: linkId, userId, title: 'Old', url: 'https://old.com' };
      prisma.profileLink.findUnique.mockResolvedValue(mockLink);
      prisma.profileLink.update.mockResolvedValue({ ...mockLink, ...dto });

      const result = await service.updateLink(userId, linkId, dto);

      expect(prisma.profileLink.findUnique).toHaveBeenCalledWith({ where: { id: linkId } });
      expect(prisma.profileLink.update).toHaveBeenCalledWith({
        where: { id: linkId },
        data: dto,
      });
      expect(result.title).toBe('Updated Title');
    });

    it('should throw NotFoundException when link not found', async () => {
      const userId = 'user-123';
      const linkId = 'link-1';
      const dto = { title: 'Updated' };
      prisma.profileLink.findUnique.mockResolvedValue(null);

      await expect(service.updateLink(userId, linkId, dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when updating another user link', async () => {
      const userId = 'user-123';
      const linkId = 'link-1';
      const dto = { title: 'Updated' };
      const mockLink = { id: linkId, userId: 'other-user', title: 'Old' };
      prisma.profileLink.findUnique.mockResolvedValue(mockLink);

      await expect(service.updateLink(userId, linkId, dto)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteLink', () => {
    it('should delete link when user owns it', async () => {
      const userId = 'user-123';
      const linkId = 'link-1';
      const mockLink = { id: linkId, userId };
      prisma.profileLink.findUnique.mockResolvedValue(mockLink);
      prisma.profileLink.delete.mockResolvedValue({});

      const result = await service.deleteLink(userId, linkId);

      expect(prisma.profileLink.findUnique).toHaveBeenCalledWith({ where: { id: linkId } });
      expect(prisma.profileLink.delete).toHaveBeenCalledWith({ where: { id: linkId } });
      expect(result).toEqual({ message: 'Link removed' });
    });

    it('should throw NotFoundException when link not found', async () => {
      const userId = 'user-123';
      const linkId = 'link-1';
      prisma.profileLink.findUnique.mockResolvedValue(null);

      await expect(service.deleteLink(userId, linkId)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when deleting another user link', async () => {
      const userId = 'user-123';
      const linkId = 'link-1';
      const mockLink = { id: linkId, userId: 'other-user' };
      prisma.profileLink.findUnique.mockResolvedValue(mockLink);

      await expect(service.deleteLink(userId, linkId)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('reorder', () => {
    it('should reorder links correctly', async () => {
      const userId = 'user-123';
      const orderedIds = ['link-2', 'link-1', 'link-3'];
      const mockLinks = [
        { id: 'link-1', userId },
        { id: 'link-2', userId },
        { id: 'link-3', userId },
      ];
      prisma.profileLink.findMany.mockResolvedValue(mockLinks);
      prisma.$transaction.mockImplementation(async (ops) => ops.map((op) => op()));
      prisma.profileLink.update.mockImplementation(async (args) => args.data);

      await service.reorder(userId, orderedIds);

      expect(prisma.profileLink.findMany).toHaveBeenCalledWith({ where: { userId } });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.profileLink.update).toHaveBeenCalledTimes(3);
      // First call should update link-2 to position 0
      expect(prisma.profileLink.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'link-2' },
        data: { position: 0 },
      });
    });

    it('should throw ForbiddenException for non-user link in orderedIds', async () => {
      const userId = 'user-123';
      const orderedIds = ['link-1', 'link-2'];
      const mockLinks = [{ id: 'link-1', userId }]; // link-2 not in user's links
      prisma.profileLink.findMany.mockResolvedValue(mockLinks);

      await expect(service.reorder(userId, orderedIds)).rejects.toThrow(ForbiddenException);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest profile-links.service.spec --passWithNoTests`
Expected: FAIL with "Cannot find module" (file doesn't exist yet)

**Step 3: Create the spec file**

Create the file at `apps/api/src/modules/profile-links/profile-links.service.spec.ts` with the code above.

**Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest profile-links.service.spec --passWithNoTests`
Expected: All tests pass (green)

**Step 5: Commit**

```bash
git add apps/api/src/modules/profile-links/profile-links.service.spec.ts
git commit -m "test: add profile-links.service.spec.ts"
```

---

### Task 2: Create settings.service.spec.ts

**Files:**
- Create: `apps/api/src/modules/settings/settings.service.spec.ts`

**Step 1: Write the failing test file**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  let service: SettingsService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        {
          provide: PrismaService,
          useValue: {
            userSettings: {
              upsert: jest.fn(),
            },
            user: {
              update: jest.fn(),
            },
            blockedKeyword: {
              findMany: jest.fn(),
              upsert: jest.fn(),
              findUnique: jest.fn(),
              delete: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
    prisma = module.get(PrismaService) as any;
  });

  describe('getSettings', () => {
    it('should return user settings, creating if not exist', async () => {
      const userId = 'user-123';
      const mockSettings = { userId, id: 'settings-1' };
      prisma.userSettings.upsert.mockResolvedValue(mockSettings);

      const result = await service.getSettings(userId);

      expect(prisma.userSettings.upsert).toHaveBeenCalledWith({
        where: { userId },
        create: { userId },
        update: {},
      });
      expect(result).toEqual(mockSettings);
    });
  });

  describe('updatePrivacy', () => {
    it('should update privacy settings and user.isPrivate', async () => {
      const userId = 'user-123';
      const dto = { isPrivate: true, showActivity: false };
      const mockSettings = { userId, showActivity: false };
      prisma.userSettings.upsert.mockResolvedValue(mockSettings);
      prisma.user.update.mockResolvedValue({ id: userId, isPrivate: true });

      const result = await service.updatePrivacy(userId, dto);

      expect(prisma.userSettings.upsert).toHaveBeenCalledWith({
        where: { userId },
        create: { userId, showActivity: false },
        update: { showActivity: false },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { isPrivate: true },
      });
      expect(result).toEqual(mockSettings);
    });

    it('should not update user.isPrivate if not provided', async () => {
      const userId = 'user-123';
      const dto = { showActivity: true };
      prisma.userSettings.upsert.mockResolvedValue({ userId });

      await service.updatePrivacy(userId, dto);

      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('updateNotifications', () => {
    it('should upsert notification settings', async () => {
      const userId = 'user-123';
      const dto = { pushLikes: true, pushComments: false };
      const mockSettings = { userId, ...dto };
      prisma.userSettings.upsert.mockResolvedValue(mockSettings);

      const result = await service.updateNotifications(userId, dto);

      expect(prisma.userSettings.upsert).toHaveBeenCalledWith({
        where: { userId },
        create: { userId, ...dto },
        update: dto,
      });
      expect(result).toEqual(mockSettings);
    });
  });

  describe('updateAccessibility', () => {
    it('should upsert accessibility settings', async () => {
      const userId = 'user-123';
      const dto = { reduceMotion: true, highContrast: false };
      const mockSettings = { userId, ...dto };
      prisma.userSettings.upsert.mockResolvedValue(mockSettings);

      const result = await service.updateAccessibility(userId, dto);

      expect(prisma.userSettings.upsert).toHaveBeenCalledWith({
        where: { userId },
        create: { userId, ...dto },
        update: dto,
      });
      expect(result).toEqual(mockSettings);
    });
  });

  describe('updateWellbeing', () => {
    it('should upsert wellbeing settings', async () => {
      const userId = 'user-123';
      const dto = { hideSensitive: true, breakReminders: true };
      const mockSettings = { userId, ...dto };
      prisma.userSettings.upsert.mockResolvedValue(mockSettings);

      const result = await service.updateWellbeing(userId, dto);

      expect(prisma.userSettings.upsert).toHaveBeenCalledWith({
        where: { userId },
        create: { userId, ...dto },
        update: dto,
      });
      expect(result).toEqual(mockSettings);
    });
  });

  describe('getBlockedKeywords', () => {
    it('should return user blocked keywords ordered by createdAt', async () => {
      const userId = 'user-123';
      const mockKeywords = [
        { id: 'kw-1', keyword: 'spam', createdAt: new Date('2024-01-01') },
        { id: 'kw-2', keyword: 'ads', createdAt: new Date('2024-01-02') },
      ];
      prisma.blockedKeyword.findMany.mockResolvedValue(mockKeywords);

      const result = await service.getBlockedKeywords(userId);

      expect(prisma.blockedKeyword.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(mockKeywords);
    });
  });

  describe('addBlockedKeyword', () => {
    it('should add blocked keyword in lowercase', async () => {
      const userId = 'user-123';
      const keyword = 'SPAM';
      const mockKeyword = { id: 'kw-1', userId, keyword: 'spam' };
      prisma.blockedKeyword.upsert.mockResolvedValue(mockKeyword);

      const result = await service.addBlockedKeyword(userId, keyword);

      expect(prisma.blockedKeyword.upsert).toHaveBeenCalledWith({
        where: { userId_keyword: { userId, keyword: 'spam' } },
        create: { userId, keyword: 'spam' },
        update: {},
      });
      expect(result).toEqual(mockKeyword);
    });
  });

  describe('removeBlockedKeyword', () => {
    it('should delete keyword when user owns it', async () => {
      const userId = 'user-123';
      const keywordId = 'kw-1';
      const mockKeyword = { id: keywordId, userId, keyword: 'spam' };
      prisma.blockedKeyword.findUnique.mockResolvedValue(mockKeyword);
      prisma.blockedKeyword.delete.mockResolvedValue({});

      const result = await service.removeBlockedKeyword(userId, keywordId);

      expect(prisma.blockedKeyword.findUnique).toHaveBeenCalledWith({ where: { id: keywordId } });
      expect(prisma.blockedKeyword.delete).toHaveBeenCalledWith({ where: { id: keywordId } });
      expect(result).toEqual({ message: 'Keyword removed' });
    });

    it('should throw NotFoundException when keyword not found', async () => {
      const userId = 'user-123';
      const keywordId = 'kw-1';
      prisma.blockedKeyword.findUnique.mockResolvedValue(null);

      await expect(service.removeBlockedKeyword(userId, keywordId)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when deleting another user keyword', async () => {
      const userId = 'user-123';
      const keywordId = 'kw-1';
      const mockKeyword = { id: keywordId, userId: 'other-user', keyword: 'spam' };
      prisma.blockedKeyword.findUnique.mockResolvedValue(mockKeyword);

      await expect(service.removeBlockedKeyword(userId, keywordId)).rejects.toThrow(NotFoundException);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest settings.service.spec --passWithNoTests`
Expected: FAIL with "Cannot find module"

**Step 3: Create the spec file**

Create the file at `apps/api/src/modules/settings/settings.service.spec.ts` with the code above.

**Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest settings.service.spec --passWithNoTests`
Expected: All tests pass

**Step 5: Commit**

```bash
git add apps/api/src/modules/settings/settings.service.spec.ts
git commit -m "test: add settings.service.spec.ts"
```

---

### Task 3: Create upload.service.spec.ts

**Files:**
- Create: `apps/api/src/modules/upload/upload.service.spec.ts`

**Step 1: Write the failing test file**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { UploadService } from './upload.service';
import { v4 as uuidv4 } from 'uuid';

jest.mock('@aws-sdk/s3-request-presigner');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-123'),
}));

describe('UploadService', () => {
  let service: UploadService;
  let mockS3Client: any;
  let mockConfigService: any;

  beforeEach(async () => {
    mockS3Client = {
      send: jest.fn(),
    };
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
        UploadService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: S3Client,
          useValue: mockS3Client,
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
      expect(result).toEqual({
        uploadUrl: mockUrl,
        key: expect.stringContaining('avatars/user-123/mock-uuid-123.jpg'),
        publicUrl: expect.stringContaining('https://media.test.com/avatars/user-123/mock-uuid-123.jpg'),
        expiresIn: 300,
      });
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
      mockS3Client.send.mockResolvedValue({});

      const result = await service.deleteFile(key);

      expect(mockS3Client.send).toHaveBeenCalledWith(expect.any(DeleteObjectCommand));
      const command = mockS3Client.send.mock.calls[0][0];
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
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest upload.service.spec --passWithNoTests`
Expected: FAIL with "Cannot find module"

**Step 3: Create the spec file**

Create the file at `apps/api/src/modules/upload/upload.service.spec.ts` with the code above.

**Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest upload.service.spec --passWithNoTests`
Expected: All tests pass

**Step 5: Commit**

```bash
git add apps/api/src/modules/upload/upload.service.spec.ts
git commit -m "test: add upload.service.spec.ts"
```

---

### Task 4: Final Verification

**Step 1: Run all tests to ensure no regressions**

Run: `cd apps/api && npx jest --passWithNoTests`
Expected: All tests pass (210+ tests)

**Step 2: Check TypeScript compilation**

Run: `cd apps/api && npx tsc --noEmit`
Expected: 0 errors

**Step 3: Commit final state**

```bash
git status
git add docs/plans/2026-03-07-spec-files-implementation.md
git commit -m "docs: add implementation plan for spec files"
```

---

**Plan complete and saved to `docs/plans/2026-03-07-spec-files-implementation.md`. Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**