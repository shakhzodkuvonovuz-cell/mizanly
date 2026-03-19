import { Controller, Get, Param, Res, Header } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { OgService } from './og.service';

@ApiTags('Open Graph & SEO')
@Controller()
export class OgController {
  constructor(private readonly ogService: OgService) {}

  @Get('og/post/:id')
  @ApiOperation({ summary: 'Open Graph meta for a post' })
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  async postOg(@Param('id') id: string, @Res() res: Response) {
    const html = await this.ogService.getPostOg(id);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(html);
  }

  @Get('og/reel/:id')
  @ApiOperation({ summary: 'Open Graph meta for a reel' })
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  async reelOg(@Param('id') id: string, @Res() res: Response) {
    const html = await this.ogService.getReelOg(id);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(html);
  }

  @Get('og/profile/:username')
  @ApiOperation({ summary: 'Open Graph meta for a user profile' })
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  async profileOg(@Param('username') username: string, @Res() res: Response) {
    const html = await this.ogService.getProfileOg(username);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(html);
  }

  @Get('og/thread/:id')
  @ApiOperation({ summary: 'Open Graph meta for a thread' })
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  async threadOg(@Param('id') id: string, @Res() res: Response) {
    const html = await this.ogService.getThreadOg(id);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(html);
  }

  @Get('sitemap.xml')
  @ApiOperation({ summary: 'XML Sitemap' })
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async sitemap(@Res() res: Response) {
    const xml = await this.ogService.getSitemapXml();
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(xml);
  }

  @Get('robots.txt')
  @ApiOperation({ summary: 'Robots.txt' })
  @Header('Content-Type', 'text/plain')
  @Header('Cache-Control', 'public, max-age=86400')
  getRobots(): string {
    return this.ogService.getRobotsTxt();
  }

  @Get('landing')
  @ApiOperation({ summary: 'Landing page' })
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  async landing(@Res() res: Response) {
    const html = this.ogService.getLandingPage();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(html);
  }
}
