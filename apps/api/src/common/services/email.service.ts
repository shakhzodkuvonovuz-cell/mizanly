import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface EmailData {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private resend: { emails: { send: (data: { from: string; to: string; subject: string; html: string }) => Promise<unknown> } } | null = null;
  private initPromise: Promise<void>;
  private readonly fromAddress: string;

  constructor(private config: ConfigService) {
    this.fromAddress = this.config.get<string>('EMAIL_FROM') || 'Mizanly <noreply@mizanly.com>';
    this.initPromise = this.initResend();
  }

  async onModuleInit() {
    // Ensure Resend is initialized before the module is ready to serve requests
    await this.initPromise;
  }

  private async initResend() {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logger.warn('RESEND_API_KEY not set — emails will be logged only');
      return;
    }

    try {
      const { Resend } = await import('resend');
      this.resend = new Resend(apiKey);
      this.logger.log('Resend email client initialized');
    } catch {
      this.logger.warn('Failed to initialize Resend — emails will be logged only');
    }
  }

  /**
   * HTML-escape user-provided strings to prevent XSS in email templates.
   */
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private async send(data: EmailData): Promise<boolean> {
    // Ensure Resend is initialized (handles race condition)
    await this.initPromise;

    if (this.resend) {
      try {
        await this.resend.emails.send({
          from: this.fromAddress,
          to: data.to,
          subject: data.subject,
          html: data.html,
        });
        this.logger.log(`Email sent to ${data.to}: ${data.subject}`);
        return true;
      } catch (err) {
        this.logger.error(`Failed to send email to ${data.to}: ${(err as Error).message}`);
        return false;
      }
    }

    // Fallback: log subject only (no PII/content in logs)
    this.logger.log(`[EMAIL LOG] To: ${data.to} | Subject: ${data.subject} (not sent — Resend not configured)`);
    return false;
  }

  private wrapTemplate(content: string): string {
    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0D1117; color: #fff; padding: 0; margin: 0;">
  <div style="max-width: 600px; margin: 0 auto; padding: 32px 24px;">
    <div style="background: #0A7B4F; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
      <h1 style="margin: 0; font-size: 28px; color: #fff; letter-spacing: 1px;">&#1605;&#1610;&#1586;&#1575;&#1606;&#1604;&#1610;</h1>
      <p style="margin: 4px 0 0; font-size: 14px; color: rgba(255,255,255,0.8);">Mizanly</p>
    </div>
    <div style="background: #161B22; padding: 24px; border-radius: 0 0 12px 12px;">
      ${content}
    </div>
    <p style="text-align: center; color: #6E7781; font-size: 12px; margin-top: 24px;">
      &copy; ${new Date().getFullYear()} Mizanly. All rights reserved.
    </p>
  </div>
</body>
</html>`;
  }

  async sendRawHtml(to: string, subject: string, html: string): Promise<boolean> {
    return this.send({ to, subject, html });
  }

  async sendWelcome(email: string, name: string): Promise<boolean> {
    const safeName = this.escapeHtml(name);
    const html = this.wrapTemplate(`
      <h2 style="color: #C8963E; margin: 0 0 16px;">Welcome to Mizanly, ${safeName}!</h2>
      <p style="color: #8B949E; line-height: 1.6;">
        Assalamu Alaikum! We're thrilled to have you join the Mizanly community &mdash;
        a culturally intelligent platform built for the global Muslim community.
      </p>
      <p style="color: #8B949E; line-height: 1.6;">
        Explore five unique spaces: <strong style="color: #fff;">Saf</strong> (photos &amp; stories),
        <strong style="color: #fff;">Majlis</strong> (discussions),
        <strong style="color: #fff;">Risalah</strong> (messages),
        <strong style="color: #fff;">Bakra</strong> (short videos), and
        <strong style="color: #fff;">Minbar</strong> (long videos).
      </p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="https://mizanly.com" style="background: #0A7B4F; color: #fff; padding: 12px 32px; border-radius: 999px; text-decoration: none; font-weight: 600;">
          Open Mizanly
        </a>
      </div>
    `);
    return this.send({ to: email, subject: 'Welcome to Mizanly!', html });
  }

  async sendSecurityAlert(email: string, data: { device: string; location: string; time: string }): Promise<boolean> {
    const safeDevice = this.escapeHtml(data.device);
    const safeLocation = this.escapeHtml(data.location);
    const safeTime = this.escapeHtml(data.time);
    const html = this.wrapTemplate(`
      <h2 style="color: #F85149; margin: 0 0 16px;">New Login Detected</h2>
      <p style="color: #8B949E; line-height: 1.6;">
        A new login to your Mizanly account was detected:
      </p>
      <table style="width: 100%; margin: 16px 0;">
        <tr><td style="color: #6E7781; padding: 8px 0;">Device:</td><td style="color: #fff; padding: 8px 0;">${safeDevice}</td></tr>
        <tr><td style="color: #6E7781; padding: 8px 0;">Location:</td><td style="color: #fff; padding: 8px 0;">${safeLocation}</td></tr>
        <tr><td style="color: #6E7781; padding: 8px 0;">Time:</td><td style="color: #fff; padding: 8px 0;">${safeTime}</td></tr>
      </table>
      <p style="color: #8B949E; line-height: 1.6;">
        If this wasn't you, please change your password immediately and enable two-factor authentication.
      </p>
    `);
    return this.send({ to: email, subject: 'New Login Detected — Mizanly', html });
  }

  async sendWeeklyDigest(email: string, data: {
    name: string;
    newFollowers: number;
    totalLikes: number;
    topPost?: string;
    prayerStreak: number;
  }): Promise<boolean> {
    const safeName = this.escapeHtml(data.name);
    const safeTopPost = data.topPost ? this.escapeHtml(data.topPost) : '';
    const html = this.wrapTemplate(`
      <h2 style="color: #C8963E; margin: 0 0 16px;">Your Weekly Summary</h2>
      <p style="color: #8B949E;">Assalamu Alaikum ${safeName}, here's your week on Mizanly:</p>
      <table style="width: 100%; margin: 24px 0; border-spacing: 8px;">
        <tr>
          <td style="background: rgba(10,123,79,0.15); border-radius: 12px; padding: 16px; text-align: center; width: 33%;">
            <p style="font-size: 28px; margin: 0; color: #0A7B4F; font-weight: 700;">${data.newFollowers}</p>
            <p style="color: #8B949E; font-size: 12px; margin: 4px 0 0;">New Followers</p>
          </td>
          <td style="background: rgba(200,150,62,0.15); border-radius: 12px; padding: 16px; text-align: center; width: 33%;">
            <p style="font-size: 28px; margin: 0; color: #C8963E; font-weight: 700;">${data.totalLikes}</p>
            <p style="color: #8B949E; font-size: 12px; margin: 4px 0 0;">Total Likes</p>
          </td>
          <td style="background: rgba(10,123,79,0.15); border-radius: 12px; padding: 16px; text-align: center; width: 33%;">
            <p style="font-size: 28px; margin: 0; color: #0A7B4F; font-weight: 700;">${data.prayerStreak}</p>
            <p style="color: #8B949E; font-size: 12px; margin: 4px 0 0;">Prayer Streak</p>
          </td>
        </tr>
      </table>
      ${safeTopPost ? `<p style="color: #8B949E;">Your top post: <em style="color: #fff;">&ldquo;${safeTopPost}&rdquo;</em></p>` : ''}
    `);
    return this.send({ to: email, subject: 'Your Weekly Mizanly Summary', html });
  }

  async sendCreatorWeeklySummary(email: string, data: {
    name: string;
    views: number;
    earnings: number;
    newSubscribers: number;
  }): Promise<boolean> {
    const safeName = this.escapeHtml(data.name);
    const html = this.wrapTemplate(`
      <h2 style="color: #C8963E; margin: 0 0 16px;">Creator Weekly Summary</h2>
      <p style="color: #8B949E;">Here's how your content performed this week, ${safeName}:</p>
      <table style="width: 100%; margin: 16px 0;">
        <tr><td style="color: #6E7781; padding: 8px 0;">Views:</td><td style="color: #0A7B4F; font-weight: 700; padding: 8px 0;">${data.views.toLocaleString()}</td></tr>
        <tr><td style="color: #6E7781; padding: 8px 0;">Earnings:</td><td style="color: #C8963E; font-weight: 700; padding: 8px 0;">$${data.earnings.toFixed(2)}</td></tr>
        <tr><td style="color: #6E7781; padding: 8px 0;">New Subscribers:</td><td style="color: #0A7B4F; font-weight: 700; padding: 8px 0;">+${data.newSubscribers}</td></tr>
      </table>
    `);
    return this.send({ to: email, subject: 'Creator Weekly Summary — Mizanly', html });
  }
}
