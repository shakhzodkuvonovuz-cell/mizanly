import { Injectable, ConflictException, NotFoundException, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { EmailService } from '../../common/services/email.service';
import Redis from 'ioredis';
import { JoinWaitlistDto } from './dto/join-waitlist.dto';

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
    @Inject('REDIS') private redis: Redis,
  ) {}

  async join(dto: JoinWaitlistDto) {
    const normalizedEmail = dto.email.toLowerCase().trim();

    // Check if already on waitlist
    const existing = await this.prisma.waitlistEntry.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      // Return their existing position instead of erroring
      const position = await this.getPositionByEmail(normalizedEmail);
      return {
        alreadyJoined: true,
        position,
        referralCode: existing.referralCode,
        totalCount: await this.getCachedCount(),
      };
    }

    // Validate referral code if provided
    if (dto.referralCode) {
      const referrer = await this.prisma.waitlistEntry.findUnique({
        where: { referralCode: dto.referralCode },
      });
      if (!referrer) {
        // Don't block signup — just ignore invalid referral
        dto.referralCode = undefined;
      }
    }

    const entry = await this.prisma.waitlistEntry.create({
      data: {
        email: normalizedEmail,
        name: dto.name?.trim() || null,
        referredBy: dto.referralCode || null,
        source: dto.source || null,
      },
    });

    // Invalidate cached count
    await this.redis.del('waitlist:count').catch(() => {});

    const position = await this.getPositionByEmail(normalizedEmail);
    const totalCount = await this.getCachedCount();

    // Send confirmation email (fire-and-forget)
    this.sendConfirmationEmail(normalizedEmail, entry.name, position, entry.referralCode)
      .catch(err => this.logger.error(`Failed to send waitlist email: ${err.message}`));

    return {
      alreadyJoined: false,
      position,
      referralCode: entry.referralCode,
      totalCount,
    };
  }

  async getStats() {
    const totalCount = await this.getCachedCount();
    return { totalCount };
  }

  async getPosition(referralCode: string) {
    const entry = await this.prisma.waitlistEntry.findUnique({
      where: { referralCode },
    });

    if (!entry) {
      throw new NotFoundException('Waitlist entry not found');
    }

    const position = await this.getPositionByEmail(entry.email);
    const referralCount = await this.prisma.waitlistEntry.count({
      where: { referredBy: referralCode },
    });

    return {
      position,
      referralCount,
      totalCount: await this.getCachedCount(),
    };
  }

  private async getPositionByEmail(email: string): Promise<number> {
    const count = await this.prisma.waitlistEntry.count({
      where: {
        createdAt: {
          lte: (await this.prisma.waitlistEntry.findUnique({
            where: { email },
            select: { createdAt: true },
          }))!.createdAt,
        },
      },
    });
    return count;
  }

  private async getCachedCount(): Promise<number> {
    const cached = await this.redis.get('waitlist:count').catch(() => null);
    if (cached) return parseInt(cached, 10);

    const count = await this.prisma.waitlistEntry.count();
    await this.redis.set('waitlist:count', count.toString(), 'EX', 60).catch(() => {});
    return count;
  }

  private async sendConfirmationEmail(
    email: string,
    name: string | null,
    position: number,
    referralCode: string,
  ): Promise<void> {
    const displayName = name || 'there';
    const referralLink = `https://mizanly.app?ref=${referralCode}`;

    // Use the email service's internal wrapTemplate pattern
    // We access it via sendWaitlistConfirmation which we'll add, or use raw send
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0D1117; color: #fff; padding: 0; margin: 0;">
  <div style="max-width: 600px; margin: 0 auto; padding: 32px 24px;">
    <div style="background: linear-gradient(135deg, #0A7B4F, #065F3B); padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
      <h1 style="margin: 0; font-size: 28px; color: #fff; letter-spacing: 1px;">&#1605;&#1610;&#1586;&#1575;&#1606;&#1604;&#1610;</h1>
      <p style="margin: 4px 0 0; font-size: 14px; color: rgba(255,255,255,0.8);">Mizanly</p>
    </div>
    <div style="background: #161B22; padding: 32px 24px; border-radius: 0 0 12px 12px;">
      <h2 style="color: #C8963E; margin: 0 0 16px; font-size: 22px;">You're on the list!</h2>
      <p style="color: #8B949E; line-height: 1.7; margin: 0 0 16px;">
        Assalamu Alaikum ${displayName}! You're <strong style="color: #0A7B4F; font-size: 18px;">#${position}</strong> on the Mizanly waitlist.
      </p>
      <p style="color: #8B949E; line-height: 1.7; margin: 0 0 24px;">
        Mizanly is a culturally intelligent social platform built for the global Muslim community &mdash;
        five spaces combining the best of Instagram, TikTok, Twitter, WhatsApp, and YouTube in one app.
      </p>
      <div style="background: rgba(10,123,79,0.1); border: 1px solid rgba(10,123,79,0.2); border-radius: 12px; padding: 20px; margin: 0 0 24px;">
        <p style="color: #0A7B4F; font-weight: 600; margin: 0 0 8px; font-size: 14px;">Move up the waitlist</p>
        <p style="color: #8B949E; font-size: 13px; line-height: 1.6; margin: 0 0 12px;">
          Share your referral link. Each friend who joins moves you closer to early access.
        </p>
        <div style="background: #0D1117; border-radius: 8px; padding: 12px 16px; word-break: break-all;">
          <a href="${referralLink}" style="color: #C8963E; text-decoration: none; font-size: 14px;">${referralLink}</a>
        </div>
      </div>
      <p style="color: #6E7781; font-size: 13px; line-height: 1.6; margin: 0;">
        We'll notify you when it's your turn. In the meantime, follow us on social media for updates.
      </p>
    </div>
    <p style="text-align: center; color: #6E7781; font-size: 12px; margin-top: 24px;">
      &copy; ${new Date().getFullYear()} Mizanly. All rights reserved.
    </p>
  </div>
</body>
</html>`;

    await this.email.sendRawHtml(
      email,
      `You're #${position} on the Mizanly waitlist!`,
      html,
    );
  }
}
