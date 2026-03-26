import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { OgService } from './og.service';
import { PrismaService } from '../../config/prisma.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('OgService', () => {
  let service: OgService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        OgService,
        {
          provide: PrismaService,
          useValue: {
            post: {
              findFirst: jest.fn().mockResolvedValue({
                id: 'p1', content: 'Test post content', mediaUrls: ['https://img.test/1.jpg'],
                user: { username: 'testuser', displayName: 'Test User', avatarUrl: null, isBanned: false, isDeactivated: false },
              }),
              findMany: jest.fn().mockResolvedValue([]),
            },
            reel: {
              findFirst: jest.fn().mockResolvedValue({
                id: 'r1', caption: 'Test reel', thumbnailUrl: 'https://img.test/thumb.jpg',
                user: { username: 'reeluser', displayName: 'Reel User', avatarUrl: null, isBanned: false, isDeactivated: false },
              }),
            },
            thread: {
              findFirst: jest.fn().mockResolvedValue({
                id: 't1', content: 'Test thread content',
                user: { username: 'threaduser', displayName: 'Thread User', avatarUrl: null, isBanned: false, isDeactivated: false },
              }),
              findMany: jest.fn().mockResolvedValue([]),
            },
            user: {
              findFirst: jest.fn().mockResolvedValue({
                id: 'u1', username: 'testuser', displayName: 'Test User',
                bio: 'My bio', avatarUrl: 'https://img.test/avatar.jpg',
                _count: { followers: 100, posts: 50 },
              }),
              findMany: jest.fn().mockResolvedValue([]),
            },
          },
        },
      ],
    }).compile();

    service = module.get(OgService);
    prisma = module.get(PrismaService) as any;
  });

  it('should generate post OG meta', async () => {
    const result = await service.getPostOg('p1');
    expect(result).toContain('Test post content');
    expect(result).toContain('<meta');
  });

  it('should throw NotFoundException for missing post', async () => {
    prisma.post.findFirst.mockResolvedValueOnce(null);
    await expect(service.getPostOg('invalid')).rejects.toThrow(NotFoundException);
  });

  it('should generate reel OG meta', async () => {
    const result = await service.getReelOg('r1');
    expect(result).toContain('Test reel');
    expect(result).toContain('<meta');
  });

  it('should generate user profile OG meta', async () => {
    const result = await service.getProfileOg('testuser');
    expect(result).toContain('Test User');
    expect(result).toContain('<meta');
  });

  it('should throw NotFoundException for missing user profile', async () => {
    prisma.user.findFirst.mockResolvedValueOnce(null);
    await expect(service.getProfileOg('nobody')).rejects.toThrow(NotFoundException);
  });

  describe('getThreadOg', () => {
    it('should generate thread OG meta', async () => {
      const result = await service.getThreadOg('t1');
      expect(result).toContain('Thread User');
      expect(result).toContain('Test thread content');
      expect(result).toContain('og:type');
      expect(result).toContain('article');
    });

    it('should throw NotFoundException for missing thread', async () => {
      prisma.thread.findFirst.mockResolvedValueOnce(null);
      await expect(service.getThreadOg('bad')).rejects.toThrow(NotFoundException);
    });

    it('should use username when displayName is empty', async () => {
      prisma.thread.findFirst.mockResolvedValueOnce({
        id: 't2', content: 'No display name',
        user: { username: 'onlyuser', displayName: '', avatarUrl: null, isBanned: false, isDeactivated: false },
      });
      const result = await service.getThreadOg('t2');
      expect(result).toContain('onlyuser');
    });
  });

  describe('getReelOg — NotFoundException', () => {
    it('should throw NotFoundException for missing reel', async () => {
      prisma.reel.findFirst.mockResolvedValueOnce(null);
      await expect(service.getReelOg('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getSitemapXml', () => {
    it('should generate valid sitemap XML with users, posts, threads', async () => {
      prisma.user.findMany = jest.fn().mockResolvedValue([
        { username: 'alice', updatedAt: new Date('2026-01-01') },
      ]);
      prisma.post.findMany = jest.fn().mockResolvedValue([
        { id: 'p1', createdAt: new Date('2026-02-01') },
      ]);
      prisma.thread.findMany = jest.fn().mockResolvedValue([
        { id: 't1', createdAt: new Date('2026-03-01') },
      ]);

      const xml = await service.getSitemapXml();
      expect(xml).toContain('<?xml version="1.0"');
      expect(xml).toContain('<urlset');
      expect(xml).toContain('/profile/alice');
      expect(xml).toContain('/post/p1');
      expect(xml).toContain('/thread/t1');
    });

    it('should handle empty database', async () => {
      prisma.user.findMany = jest.fn().mockResolvedValue([]);
      prisma.post.findMany = jest.fn().mockResolvedValue([]);
      prisma.thread.findMany = jest.fn().mockResolvedValue([]);

      const xml = await service.getSitemapXml();
      expect(xml).toContain('<?xml version="1.0"');
      expect(xml).toContain('<urlset');
      // Still has landing page URL
      expect(xml).toContain('<priority>1.0</priority>');
    });
  });

  describe('getRobotsTxt', () => {
    it('should return valid robots.txt', () => {
      const txt = service.getRobotsTxt();
      expect(txt).toContain('User-agent: *');
      expect(txt).toContain('Allow: /');
      expect(txt).toContain('Disallow: /api/');
      expect(txt).toContain('Disallow: /admin/');
      expect(txt).toContain('sitemap.xml');
    });
  });

  describe('getLandingPage', () => {
    it('should return HTML with all five spaces', () => {
      const html = service.getLandingPage();
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Mizanly');
      expect(html).toContain('Saf');
      expect(html).toContain('Majlis');
      expect(html).toContain('Risalah');
      expect(html).toContain('Bakra');
      expect(html).toContain('Minbar');
      expect(html).toContain('#0A7B4F');
    });

    it('should include app store links', () => {
      const html = service.getLandingPage();
      expect(html).toContain('apps.apple.com');
      expect(html).toContain('play.google.com');
    });
  });

  describe('getPostOg — fallback description', () => {
    it('should use fallback when post has no content', async () => {
      prisma.post.findFirst.mockResolvedValueOnce({
        id: 'p2', content: '', mediaUrls: [],
        user: { username: 'emptypost', displayName: 'Empty', avatarUrl: null, isBanned: false, isDeactivated: false },
      });
      const result = await service.getPostOg('p2');
      expect(result).toContain('Post by @emptypost');
    });
  });

  describe('getProfileOg — fallback bio', () => {
    it('should use follower/post counts when no bio', async () => {
      prisma.user.findFirst.mockResolvedValueOnce({
        id: 'u2', username: 'nobio', displayName: 'No Bio',
        bio: '', avatarUrl: null,
        _count: { followers: 50, posts: 10 },
      });
      const result = await service.getProfileOg('nobio');
      expect(result).toContain('10 posts');
      expect(result).toContain('50 followers');
    });
  });

  describe('ConfigService usage', () => {
    it('should use APP_URL from ConfigService (defaults to mizanly.app)', async () => {
      const result = await service.getPostOg('p1');
      expect(result).toContain('mizanly.app');
    });

    it('should use custom APP_URL when configured', async () => {
      const { ConfigService } = require('@nestjs/config');
      const module2: TestingModule = await Test.createTestingModule({
        providers: [
          OgService,
          {
            provide: ConfigService,
            useValue: { get: jest.fn().mockImplementation((k: string) => k === 'APP_URL' ? 'https://staging.mizanly.app' : null) },
          },
          {
            provide: PrismaService,
            useValue: {
              post: { findFirst: jest.fn().mockResolvedValue({ id: 'p1', content: 'Test', mediaUrls: [], user: { username: 'u', displayName: 'U', avatarUrl: null, isBanned: false, isDeactivated: false } }) },
            },
          },
        ],
      }).compile();
      const svc2 = module2.get(OgService);
      const result = await svc2.getPostOg('p1');
      expect(result).toContain('staging.mizanly.app');
    });
  });
});
