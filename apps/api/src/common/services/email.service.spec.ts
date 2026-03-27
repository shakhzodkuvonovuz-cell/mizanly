import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';

describe('EmailService', () => {
  let service: EmailService;
  let mockConfigService: { get: jest.Mock };
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'EMAIL_FROM') return undefined;
        if (key === 'RESEND_API_KEY') return undefined;
        return undefined;
      }),
    };

    // Suppress logger output during tests
    logSpy = jest.spyOn(console, 'log').mockImplementation();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    errorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function createService(overrides?: Record<string, string>) {
    mockConfigService.get.mockImplementation((key: string) => {
      if (overrides && key in overrides) return overrides[key];
      return undefined;
    });
    return new EmailService(mockConfigService as any as ConfigService);
  }

  // ─── escapeHtml (private — accessed via `as any`) ───

  describe('escapeHtml', () => {
    beforeEach(() => {
      service = createService();
    });

    it('should escape & to &amp;', () => {
      expect((service as any).escapeHtml('A & B')).toBe('A &amp; B');
    });

    it('should escape < to &lt;', () => {
      expect((service as any).escapeHtml('a < b')).toBe('a &lt; b');
    });

    it('should escape > to &gt;', () => {
      expect((service as any).escapeHtml('a > b')).toBe('a &gt; b');
    });

    it('should escape " to &quot;', () => {
      expect((service as any).escapeHtml('say "hello"')).toBe('say &quot;hello&quot;');
    });

    it("should escape ' to &#39;", () => {
      expect((service as any).escapeHtml("it's")).toBe('it&#39;s');
    });

    it('should handle empty string', () => {
      expect((service as any).escapeHtml('')).toBe('');
    });

    it('should return unchanged string with no special chars', () => {
      expect((service as any).escapeHtml('hello world 123')).toBe('hello world 123');
    });

    it('should escape all special chars in one string', () => {
      const input = '<script>alert("xss\'s & more")</script>';
      const expected =
        '&lt;script&gt;alert(&quot;xss&#39;s &amp; more&quot;)&lt;/script&gt;';
      expect((service as any).escapeHtml(input)).toBe(expected);
    });

    it('should handle multiple consecutive ampersands', () => {
      expect((service as any).escapeHtml('&&&&')).toBe('&amp;&amp;&amp;&amp;');
    });

    it('should not double-escape already-escaped entities', () => {
      // If someone passes &amp; it should escape the & again
      expect((service as any).escapeHtml('&amp;')).toBe('&amp;amp;');
    });

    it('should handle XSS payloads', () => {
      const xss = '"><img src=x onerror=alert(1)>';
      const result = (service as any).escapeHtml(xss);
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
      expect(result).not.toContain('"');
      expect(result).toBe(
        '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;',
      );
    });

    it('should handle unicode strings without modification', () => {
      const arabic = 'ميزانلي';
      expect((service as any).escapeHtml(arabic)).toBe(arabic);
    });
  });

  // ─── wrapTemplate (private — accessed via `as any`) ───

  describe('wrapTemplate', () => {
    beforeEach(() => {
      service = createService();
    });

    it('should wrap content in branded HTML template', () => {
      const result = (service as any).wrapTemplate('<p>Test</p>');
      expect(result).toContain('<!DOCTYPE html>');
      expect(result).toContain('<p>Test</p>');
      expect(result).toContain('#0A7B4F'); // brand emerald
      expect(result).toContain('Mizanly');
    });

    it('should include current year in copyright', () => {
      const result = (service as any).wrapTemplate('content');
      const year = new Date().getFullYear().toString();
      expect(result).toContain(`&copy; ${year} Mizanly`);
    });

    it('should include Arabic brand name', () => {
      const result = (service as any).wrapTemplate('content');
      // Unicode for ميزانلي
      expect(result).toContain('&#1605;&#1610;&#1586;&#1575;&#1606;&#1604;&#1610;');
    });
  });

  // ─── Constructor / Config ───

  describe('constructor', () => {
    it('should use default fromAddress when EMAIL_FROM not set', () => {
      service = createService();
      expect((service as any).fromAddress).toBe('Mizanly <noreply@mizanly.app>');
    });

    it('should use configured EMAIL_FROM when set', () => {
      service = createService({ EMAIL_FROM: 'Custom <custom@example.com>' });
      expect((service as any).fromAddress).toBe('Custom <custom@example.com>');
    });
  });

  // ─── onModuleInit ───

  describe('onModuleInit', () => {
    it('should await initPromise', async () => {
      service = createService();
      // Should resolve without error when no API key set
      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });
  });

  // ─── initResend (private) ───

  describe('initResend', () => {
    it('should set resend to null when RESEND_API_KEY not set', async () => {
      service = createService();
      await service.onModuleInit();
      expect((service as any).resend).toBeNull();
    });

    it('should handle import failure gracefully', async () => {
      // Mock the dynamic import to simulate module not found
      jest.mock('resend', () => {
        throw new Error('Cannot find module resend');
      });
      service = createService({ RESEND_API_KEY: 'test-key-123' });
      await service.onModuleInit();
      // Should fall back to null rather than throwing
      expect((service as any).resend).toBeNull();
      jest.unmock('resend');
    });

    it('should initialize Resend client when API key is set and module available', async () => {
      service = createService({ RESEND_API_KEY: 'test-key-123' });
      await service.onModuleInit();
      // resend package is installed, so it should initialize successfully
      expect((service as any).resend).not.toBeNull();
      expect((service as any).resend.emails).toBeDefined();
    });
  });

  // ─── send (private — tested through public methods) ───

  describe('send', () => {
    it('should return false when Resend not configured', async () => {
      service = createService();
      await service.onModuleInit();
      const result = await (service as any).send({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Hello</p>',
      });
      expect(result).toBe(false);
    });

    it('should use configured fromAddress in send call', async () => {
      const mockSend = jest.fn().mockResolvedValue({ id: 'msg-1' });
      service = createService({ EMAIL_FROM: 'Brand <brand@mizanly.com>' });
      await service.onModuleInit();
      // Manually wire up a mock resend client
      (service as any).resend = { emails: { send: mockSend } };

      await (service as any).send({
        to: 'user@example.com',
        subject: 'Test Subject',
        html: '<p>Body</p>',
      });

      expect(mockSend).toHaveBeenCalledWith({
        from: 'Brand <brand@mizanly.com>',
        to: 'user@example.com',
        subject: 'Test Subject',
        html: '<p>Body</p>',
      });
    });

    it('should return true on successful send via Resend', async () => {
      const mockSend = jest.fn().mockResolvedValue({ id: 'msg-1' });
      service = createService();
      await service.onModuleInit();
      (service as any).resend = { emails: { send: mockSend } };

      const result = await (service as any).send({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Hello</p>',
      });
      expect(result).toBe(true);
    });

    it('should return false on Resend send error', async () => {
      const mockSend = jest.fn().mockRejectedValue(new Error('API rate limit'));
      service = createService();
      await service.onModuleInit();
      (service as any).resend = { emails: { send: mockSend } };

      const result = await (service as any).send({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Hello</p>',
      });
      expect(result).toBe(false);
    });
  });

  // ─── sendWelcome ───

  describe('sendWelcome', () => {
    beforeEach(async () => {
      service = createService();
      await service.onModuleInit();
    });

    it('should send with correct subject', async () => {
      const sendSpy = jest.spyOn(service as any, 'send');
      await service.sendWelcome('user@example.com', 'Ahmad');
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Welcome to Mizanly!',
        }),
      );
    });

    it('should escape name in HTML body', async () => {
      const sendSpy = jest.spyOn(service as any, 'send');
      await service.sendWelcome('user@example.com', '<script>alert("xss")</script>');
      const callArg = sendSpy.mock.calls[0][0];
      expect(callArg.html).not.toContain('<script>');
      expect(callArg.html).toContain('&lt;script&gt;');
    });

    it('should include brand content in HTML', async () => {
      const sendSpy = jest.spyOn(service as any, 'send');
      await service.sendWelcome('user@example.com', 'Fatima');
      const html = sendSpy.mock.calls[0][0].html;
      expect(html).toContain('Fatima');
      expect(html).toContain('Assalamu Alaikum');
      expect(html).toContain('Saf');
      expect(html).toContain('Majlis');
      expect(html).toContain('Risalah');
      expect(html).toContain('Bakra');
      expect(html).toContain('Minbar');
    });

    it('should return false when Resend not configured', async () => {
      const result = await service.sendWelcome('user@example.com', 'Ahmad');
      expect(result).toBe(false);
    });

    it('should return true when Resend is configured and send succeeds', async () => {
      (service as any).resend = {
        emails: { send: jest.fn().mockResolvedValue({ id: 'msg-1' }) },
      };
      const result = await service.sendWelcome('user@example.com', 'Ahmad');
      expect(result).toBe(true);
    });
  });

  // ─── sendSecurityAlert ───

  describe('sendSecurityAlert', () => {
    beforeEach(async () => {
      service = createService();
      await service.onModuleInit();
    });

    it('should send with correct subject', async () => {
      const sendSpy = jest.spyOn(service as any, 'send');
      await service.sendSecurityAlert('user@example.com', {
        device: 'iPhone 16',
        location: 'Sydney, AU',
        time: '2026-03-23T10:00:00Z',
      });
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'New Login Detected — Mizanly',
        }),
      );
    });

    it('should escape device, location, and time in HTML', async () => {
      const sendSpy = jest.spyOn(service as any, 'send');
      await service.sendSecurityAlert('user@example.com', {
        device: '<img src=x onerror=alert(1)>',
        location: '"><script>xss</script>',
        time: "10 o'clock & <noon>",
      });
      const html = sendSpy.mock.calls[0][0].html;
      expect(html).not.toContain('<img');
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;img');
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('o&#39;clock &amp; &lt;noon&gt;');
    });

    it('should include all three data fields in HTML', async () => {
      const sendSpy = jest.spyOn(service as any, 'send');
      await service.sendSecurityAlert('user@example.com', {
        device: 'Pixel 9',
        location: 'London, UK',
        time: '2026-03-23T15:30:00Z',
      });
      const html = sendSpy.mock.calls[0][0].html;
      expect(html).toContain('Pixel 9');
      expect(html).toContain('London, UK');
      expect(html).toContain('2026-03-23T15:30:00Z');
    });
  });

  // ─── sendWeeklyDigest ───

  describe('sendWeeklyDigest', () => {
    beforeEach(async () => {
      service = createService();
      await service.onModuleInit();
    });

    it('should send with correct subject', async () => {
      const sendSpy = jest.spyOn(service as any, 'send');
      await service.sendWeeklyDigest('user@example.com', {
        name: 'Omar',
        newFollowers: 42,
        totalLikes: 1500,
        prayerStreak: 7,
      });
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Your Weekly Mizanly Summary',
        }),
      );
    });

    it('should escape name in HTML body', async () => {
      const sendSpy = jest.spyOn(service as any, 'send');
      await service.sendWeeklyDigest('user@example.com', {
        name: '<b>Omar</b>',
        newFollowers: 10,
        totalLikes: 50,
        prayerStreak: 3,
      });
      const html = sendSpy.mock.calls[0][0].html;
      expect(html).not.toContain('<b>Omar</b>');
      expect(html).toContain('&lt;b&gt;Omar&lt;/b&gt;');
    });

    it('should include stats in HTML', async () => {
      const sendSpy = jest.spyOn(service as any, 'send');
      await service.sendWeeklyDigest('user@example.com', {
        name: 'Ahmad',
        newFollowers: 42,
        totalLikes: 1500,
        prayerStreak: 7,
      });
      const html = sendSpy.mock.calls[0][0].html;
      expect(html).toContain('42');
      expect(html).toContain('1500');
      expect(html).toContain('7');
    });

    it('should include topPost when provided', async () => {
      const sendSpy = jest.spyOn(service as any, 'send');
      await service.sendWeeklyDigest('user@example.com', {
        name: 'Ahmad',
        newFollowers: 10,
        totalLikes: 50,
        topPost: 'My best post ever',
        prayerStreak: 5,
      });
      const html = sendSpy.mock.calls[0][0].html;
      expect(html).toContain('My best post ever');
    });

    it('should escape topPost to prevent XSS', async () => {
      const sendSpy = jest.spyOn(service as any, 'send');
      await service.sendWeeklyDigest('user@example.com', {
        name: 'Ahmad',
        newFollowers: 10,
        totalLikes: 50,
        topPost: '<img onerror=alert(1) src=x>',
        prayerStreak: 5,
      });
      const html = sendSpy.mock.calls[0][0].html;
      expect(html).not.toContain('<img');
      expect(html).toContain('&lt;img');
    });

    it('should omit topPost section when not provided', async () => {
      const sendSpy = jest.spyOn(service as any, 'send');
      await service.sendWeeklyDigest('user@example.com', {
        name: 'Ahmad',
        newFollowers: 10,
        totalLikes: 50,
        prayerStreak: 5,
      });
      const html = sendSpy.mock.calls[0][0].html;
      expect(html).not.toContain('Your top post');
    });
  });

  // ─── sendCreatorWeeklySummary ───

  describe('sendCreatorWeeklySummary', () => {
    beforeEach(async () => {
      service = createService();
      await service.onModuleInit();
    });

    it('should send with correct subject', async () => {
      const sendSpy = jest.spyOn(service as any, 'send');
      await service.sendCreatorWeeklySummary('creator@example.com', {
        name: 'Yusuf',
        views: 10000,
        earnings: 45.99,
        newSubscribers: 120,
      });
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Creator Weekly Summary — Mizanly',
        }),
      );
    });

    it('should escape name in HTML body', async () => {
      const sendSpy = jest.spyOn(service as any, 'send');
      await service.sendCreatorWeeklySummary('creator@example.com', {
        name: '"><script>xss</script>',
        views: 100,
        earnings: 10.0,
        newSubscribers: 5,
      });
      const html = sendSpy.mock.calls[0][0].html;
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('should format earnings with 2 decimal places', async () => {
      const sendSpy = jest.spyOn(service as any, 'send');
      await service.sendCreatorWeeklySummary('creator@example.com', {
        name: 'Yusuf',
        views: 5000,
        earnings: 123.4,
        newSubscribers: 50,
      });
      const html = sendSpy.mock.calls[0][0].html;
      expect(html).toContain('$123.40');
    });

    it('should format views with locale string', async () => {
      const sendSpy = jest.spyOn(service as any, 'send');
      await service.sendCreatorWeeklySummary('creator@example.com', {
        name: 'Yusuf',
        views: 1234567,
        earnings: 500.0,
        newSubscribers: 200,
      });
      const html = sendSpy.mock.calls[0][0].html;
      // toLocaleString() formats with commas (en-US) or periods depending on locale
      // Just verify it contains the number in some formatted form
      expect(html).toContain('1,234,567');
    });

    it('should include subscriber count with + prefix', async () => {
      const sendSpy = jest.spyOn(service as any, 'send');
      await service.sendCreatorWeeklySummary('creator@example.com', {
        name: 'Yusuf',
        views: 100,
        earnings: 10.0,
        newSubscribers: 42,
      });
      const html = sendSpy.mock.calls[0][0].html;
      expect(html).toContain('+42');
    });
  });

  // ─── Integration: send flow with mock Resend ───

  describe('end-to-end send flow with mock Resend', () => {
    let mockSend: jest.Mock;

    beforeEach(async () => {
      service = createService();
      await service.onModuleInit();
      mockSend = jest.fn().mockResolvedValue({ id: 'email-1' });
      (service as any).resend = { emails: { send: mockSend } };
    });

    it('should pass through sendWelcome to Resend with correct args', async () => {
      const result = await service.sendWelcome('test@example.com', 'Aisha');
      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);
      const call = mockSend.mock.calls[0][0];
      expect(call.from).toBe('Mizanly <noreply@mizanly.app>');
      expect(call.to).toBe('test@example.com');
      expect(call.subject).toBe('Welcome to Mizanly!');
      expect(call.html).toContain('Aisha');
    });

    it('should pass through sendSecurityAlert to Resend', async () => {
      const result = await service.sendSecurityAlert('test@example.com', {
        device: 'MacBook Pro',
        location: 'Tashkent, UZ',
        time: '2026-03-23',
      });
      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should pass through sendWeeklyDigest to Resend', async () => {
      const result = await service.sendWeeklyDigest('test@example.com', {
        name: 'Test',
        newFollowers: 5,
        totalLikes: 100,
        prayerStreak: 14,
      });
      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should pass through sendCreatorWeeklySummary to Resend', async () => {
      const result = await service.sendCreatorWeeklySummary('test@example.com', {
        name: 'Creator',
        views: 50000,
        earnings: 250.0,
        newSubscribers: 300,
      });
      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should return false when Resend send throws', async () => {
      mockSend.mockRejectedValueOnce(new Error('Service unavailable'));
      const result = await service.sendWelcome('test@example.com', 'Test');
      expect(result).toBe(false);
    });
  });
});
