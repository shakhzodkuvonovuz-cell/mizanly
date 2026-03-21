import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';

const APP_NAME = 'Mizanly';
const APP_STORE_URL = 'https://apps.apple.com/app/mizanly';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.mizanly.app';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen - 3) + '...';
}

@Injectable()
export class OgService {
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.appUrl = this.config.get<string>('APP_URL') || 'https://mizanly.com';
  }

  async getPostOg(postId: string): Promise<string> {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isRemoved: false, visibility: 'PUBLIC' },
      select: {
        id: true,
        content: true,
        mediaUrls: true,
        user: { select: { username: true, displayName: true, avatarUrl: true, isBanned: true, isDeactivated: true } },
      },
    });
    if (!post || post.user.isBanned || post.user.isDeactivated) throw new NotFoundException('Post not found');

    const title = `${post.user.displayName || post.user.username} on ${APP_NAME}`;
    const description = post.content ? truncate(post.content, 200) : `Post by @${post.user.username}`;
    const imageUrl = post.mediaUrls?.[0] || post.user.avatarUrl || '';
    const url = `${this.appUrl}/post/${post.id}`;

    return this.renderHtml({ title, description, imageUrl, url, type: 'article' });
  }

  async getReelOg(reelId: string): Promise<string> {
    const reel = await this.prisma.reel.findFirst({
      where: { id: reelId, isRemoved: false, status: 'READY' },
      select: {
        id: true,
        caption: true,
        thumbnailUrl: true,
        user: { select: { username: true, displayName: true, avatarUrl: true, isBanned: true, isDeactivated: true } },
      },
    });
    if (!reel || reel.user.isBanned || reel.user.isDeactivated) throw new NotFoundException('Reel not found');

    const title = `${reel.user.displayName || reel.user.username} — Reel on ${APP_NAME}`;
    const description = reel.caption ? truncate(reel.caption, 200) : `Watch this reel by @${reel.user.username}`;
    const imageUrl = reel.thumbnailUrl || reel.user.avatarUrl || '';
    const url = `${this.appUrl}/reel/${reel.id}`;

    return this.renderHtml({ title, description, imageUrl, url, type: 'video.other' });
  }

  async getProfileOg(username: string): Promise<string> {
    const user = await this.prisma.user.findFirst({
      where: { username, isBanned: false, isDeactivated: false, isDeleted: false },
      select: {
        id: true,
        username: true,
        displayName: true,
        bio: true,
        avatarUrl: true,
        _count: { select: { followers: true, posts: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const title = `${user.displayName || user.username} (@${user.username}) — ${APP_NAME}`;
    const description = user.bio
      ? truncate(user.bio, 200)
      : `${user._count.posts} posts · ${user._count.followers} followers`;
    const imageUrl = user.avatarUrl || '';
    const url = `${this.appUrl}/profile/${user.username}`;

    return this.renderHtml({ title, description, imageUrl, url, type: 'profile' });
  }

  async getThreadOg(threadId: string): Promise<string> {
    const thread = await this.prisma.thread.findFirst({
      where: { id: threadId, isRemoved: false, visibility: 'PUBLIC' },
      select: {
        id: true,
        content: true,
        user: { select: { username: true, displayName: true, avatarUrl: true, isBanned: true, isDeactivated: true } },
      },
    });
    if (!thread || thread.user.isBanned || thread.user.isDeactivated) throw new NotFoundException('Thread not found');

    const title = `${thread.user.displayName || thread.user.username} on ${APP_NAME}`;
    const description = thread.content ? truncate(thread.content, 200) : `Thread by @${thread.user.username}`;
    const imageUrl = thread.user.avatarUrl || '';
    const url = `${this.appUrl}/thread/${thread.id}`;

    return this.renderHtml({ title, description, imageUrl, url, type: 'article' });
  }

  async getSitemapXml(): Promise<string> {
    // Fetch recent public content for sitemap
    const [users, posts, threads] = await Promise.all([
      this.prisma.user.findMany({
        where: { isPrivate: false, isBanned: false, isDeactivated: false, isDeleted: false },
        select: { username: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 500,
      }),
      this.prisma.post.findMany({
        where: { isAltProfile: false, isRemoved: false, visibility: 'PUBLIC' },
        select: { id: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      this.prisma.thread.findMany({
        where: { isRemoved: false, visibility: 'PUBLIC' },
        select: { id: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
    ]);

    const urls: string[] = [
      // Landing page
      `<url><loc>${this.appUrl}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    ];

    // Profile URLs
    for (const u of users) {
      urls.push(
        `<url><loc>${this.appUrl}/profile/${escapeHtml(u.username)}</loc><lastmod>${u.updatedAt.toISOString().split('T')[0]}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
      );
    }

    // Post URLs
    for (const p of posts) {
      urls.push(
        `<url><loc>${this.appUrl}/post/${p.id}</loc><lastmod>${p.createdAt.toISOString().split('T')[0]}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`,
      );
    }

    // Thread URLs
    for (const t of threads) {
      urls.push(
        `<url><loc>${this.appUrl}/thread/${t.id}</loc><lastmod>${t.createdAt.toISOString().split('T')[0]}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`,
      );
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;
  }

  getRobotsTxt(): string {
    return `User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin/

Sitemap: ${this.appUrl}/sitemap.xml
`;
  }

  getLandingPage(): string {
    return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${APP_NAME} — The Social Platform for the Global Muslim Ummah</title>
  <meta name="description" content="Connect, share, and grow with the global Muslim community. Five spaces combining Instagram + TikTok + X/Twitter + WhatsApp + YouTube in one app." />
  <meta property="og:title" content="${APP_NAME} — The Social Platform for the Global Muslim Ummah" />
  <meta property="og:description" content="Connect, share, and grow with the global Muslim community." />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${this.appUrl}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="theme-color" content="#0A7B4F" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0D1117; color: #fff; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; }
    .logo { font-size: 3rem; font-weight: 800; background: linear-gradient(135deg, #0A7B4F, #C8963E); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 0.5rem; }
    .tagline { font-size: 1.25rem; color: #8B949E; margin-bottom: 2rem; text-align: center; max-width: 600px; }
    .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; max-width: 800px; margin-bottom: 2.5rem; }
    .feature { background: #161B22; border: 1px solid #30363D; border-radius: 16px; padding: 1.5rem; text-align: center; }
    .feature h3 { color: #0A7B4F; margin-bottom: 0.5rem; }
    .feature p { color: #8B949E; font-size: 0.875rem; }
    .buttons { display: flex; gap: 1rem; flex-wrap: wrap; justify-content: center; }
    .btn { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.875rem 1.75rem; border-radius: 12px; font-size: 1rem; font-weight: 600; text-decoration: none; transition: transform 0.2s; }
    .btn:hover { transform: scale(1.05); }
    .btn-primary { background: #0A7B4F; color: #fff; }
    .btn-secondary { background: #161B22; color: #fff; border: 1px solid #30363D; }
    footer { margin-top: 3rem; color: #6E7781; font-size: 0.8rem; text-align: center; }
    footer a { color: #8B949E; text-decoration: none; }
  </style>
</head>
<body>
  <div class="logo">${APP_NAME}</div>
  <p class="tagline">The social platform for the global Muslim community. Five spaces, one Ummah.</p>
  <div class="features">
    <div class="feature">
      <h3>Saf (الصف)</h3>
      <p>Share photos & stories with your community</p>
    </div>
    <div class="feature">
      <h3>Majlis (المجلس)</h3>
      <p>Join discussions and share your thoughts</p>
    </div>
    <div class="feature">
      <h3>Risalah (رسالة)</h3>
      <p>Private encrypted messaging & group chats</p>
    </div>
    <div class="feature">
      <h3>Bakra (بكرة)</h3>
      <p>Short videos with an Islamic-first algorithm</p>
    </div>
    <div class="feature">
      <h3>Minbar (المنبر)</h3>
      <p>Long-form Islamic education & content</p>
    </div>
  </div>
  <div class="buttons">
    <a href="${APP_STORE_URL}" class="btn btn-primary">Download for iOS</a>
    <a href="${PLAY_STORE_URL}" class="btn btn-secondary">Download for Android</a>
  </div>
  <footer>
    <p>&copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.</p>
    <p style="margin-top: 0.5rem;">
      <a href="${this.appUrl}/privacy">Privacy Policy</a> · <a href="${this.appUrl}/terms">Terms of Service</a>
    </p>
  </footer>
</body>
</html>`;
  }

  private renderHtml(meta: {
    title: string;
    description: string;
    imageUrl: string;
    url: string;
    type: string;
  }): string {
    const safeTitle = escapeHtml(meta.title);
    const safeDesc = escapeHtml(meta.description);
    const safeImage = escapeHtml(meta.imageUrl);
    const safeUrl = escapeHtml(meta.url);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDesc}" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDesc}" />
  <meta property="og:image" content="${safeImage}" />
  <meta property="og:url" content="${safeUrl}" />
  <meta property="og:type" content="${meta.type}" />
  <meta property="og:site_name" content="${APP_NAME}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${safeDesc}" />
  <meta name="twitter:image" content="${safeImage}" />
  <meta name="theme-color" content="#0A7B4F" />
  <script>
    // Deep link attempt — try to open app, fall back to store
    var userAgent = navigator.userAgent || navigator.vendor;
    var isIOS = /iPad|iPhone|iPod/.test(userAgent);
    var isAndroid = /android/i.test(userAgent);
    var appUrl = 'mizanly://${safeUrl.replace(/https?:\/\/[^/]+/, '')}';
    if (isIOS || isAndroid) {
      window.location.replace(appUrl);
      setTimeout(function() {
        window.location.replace(isIOS ? '${APP_STORE_URL}' : '${PLAY_STORE_URL}');
      }, 1500);
    }
  </script>
  <style>
    body { font-family: -apple-system, sans-serif; background: #0D1117; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; padding: 2rem; }
    .card { max-width: 420px; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #8B949E; margin-bottom: 1.5rem; }
    a { display: inline-block; padding: 0.75rem 1.5rem; background: #0A7B4F; color: #fff; text-decoration: none; border-radius: 10px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${safeTitle}</h1>
    <p>${safeDesc}</p>
    <a href="${APP_STORE_URL}">Get ${APP_NAME}</a>
  </div>
</body>
</html>`;
  }
}
