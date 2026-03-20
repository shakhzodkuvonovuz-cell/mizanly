import { Test, TestingModule } from '@nestjs/testing';
import { OgController } from './og.controller';
import { OgService } from './og.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('OgController', () => {
  let controller: OgController;
  let service: jest.Mocked<OgService>;

  const mockRes = () => {
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    };
    return res as any;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OgController],
      providers: [
        ...globalMockProviders,
        {
          provide: OgService,
          useValue: {
            getPostOg: jest.fn(),
            getReelOg: jest.fn(),
            getProfileOg: jest.fn(),
            getThreadOg: jest.fn(),
            getSitemapXml: jest.fn(),
            getRobotsTxt: jest.fn(),
            getLandingPage: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(OgController);
    service = module.get(OgService) as jest.Mocked<OgService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('postOg', () => {
    it('should call ogService.getPostOg and send HTML response', async () => {
      service.getPostOg.mockResolvedValue('<html>post og</html>');
      const res = mockRes();

      await controller.postOg('post-1', res);

      expect(service.getPostOg).toHaveBeenCalledWith('post-1');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
      expect(res.send).toHaveBeenCalledWith('<html>post og</html>');
    });
  });

  describe('reelOg', () => {
    it('should call ogService.getReelOg and send HTML response', async () => {
      service.getReelOg.mockResolvedValue('<html>reel og</html>');
      const res = mockRes();

      await controller.reelOg('reel-1', res);

      expect(service.getReelOg).toHaveBeenCalledWith('reel-1');
      expect(res.send).toHaveBeenCalledWith('<html>reel og</html>');
    });
  });

  describe('profileOg', () => {
    it('should call ogService.getProfileOg and send HTML response', async () => {
      service.getProfileOg.mockResolvedValue('<html>profile og</html>');
      const res = mockRes();

      await controller.profileOg('johndoe', res);

      expect(service.getProfileOg).toHaveBeenCalledWith('johndoe');
      expect(res.send).toHaveBeenCalledWith('<html>profile og</html>');
    });
  });

  describe('threadOg', () => {
    it('should call ogService.getThreadOg and send HTML response', async () => {
      service.getThreadOg.mockResolvedValue('<html>thread og</html>');
      const res = mockRes();

      await controller.threadOg('thread-1', res);

      expect(service.getThreadOg).toHaveBeenCalledWith('thread-1');
      expect(res.send).toHaveBeenCalledWith('<html>thread og</html>');
    });
  });

  describe('getRobots', () => {
    it('should call ogService.getRobotsTxt and return text', () => {
      service.getRobotsTxt.mockReturnValue('User-agent: *\nAllow: /');

      const result = controller.getRobots();

      expect(service.getRobotsTxt).toHaveBeenCalled();
      expect(result).toContain('User-agent');
    });
  });

  describe('sitemap', () => {
    it('should call ogService.getSitemapXml and send XML response', async () => {
      service.getSitemapXml.mockResolvedValue('<xml>sitemap</xml>');
      const res = mockRes();

      await controller.sitemap(res);

      expect(service.getSitemapXml).toHaveBeenCalled();
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/xml; charset=utf-8');
      expect(res.send).toHaveBeenCalledWith('<xml>sitemap</xml>');
    });
  });
});
