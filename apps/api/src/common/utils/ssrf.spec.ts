import { isPrivateIp, assertNotPrivateIp, isPrivateUrl, assertNotPrivateUrl } from './ssrf';
import * as dns from 'dns';

// Mock dns.promises.lookup for deterministic testing
jest.mock('dns', () => {
  const original = jest.requireActual('dns');
  return {
    ...original,
    promises: {
      ...original.promises,
      lookup: jest.fn(),
    },
  };
});

const mockLookup = dns.promises.lookup as jest.MockedFunction<typeof dns.promises.lookup>;

describe('SSRF Validation Utility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── isPrivateIp (IPv4) ────────────────────────────────────

  describe('isPrivateIp — IPv4', () => {
    it('should detect 127.0.0.0/8 loopback range', () => {
      expect(isPrivateIp('127.0.0.1')).toBe(true);
      expect(isPrivateIp('127.255.255.255')).toBe(true);
      expect(isPrivateIp('127.0.0.0')).toBe(true);
      expect(isPrivateIp('127.1.2.3')).toBe(true);
    });

    it('should detect 10.0.0.0/8 private range', () => {
      expect(isPrivateIp('10.0.0.1')).toBe(true);
      expect(isPrivateIp('10.255.255.255')).toBe(true);
      expect(isPrivateIp('10.10.10.10')).toBe(true);
    });

    it('should detect 172.16.0.0/12 private range', () => {
      expect(isPrivateIp('172.16.0.1')).toBe(true);
      expect(isPrivateIp('172.31.255.255')).toBe(true);
      expect(isPrivateIp('172.20.0.1')).toBe(true);
    });

    it('should NOT flag 172.32.x.x (outside /12 range)', () => {
      expect(isPrivateIp('172.32.0.1')).toBe(false);
    });

    it('should detect 192.168.0.0/16 private range', () => {
      expect(isPrivateIp('192.168.0.1')).toBe(true);
      expect(isPrivateIp('192.168.255.255')).toBe(true);
    });

    it('should detect 169.254.0.0/16 link-local range', () => {
      expect(isPrivateIp('169.254.0.1')).toBe(true);
      expect(isPrivateIp('169.254.169.254')).toBe(true); // AWS metadata
    });

    it('should detect 0.0.0.0/8 current network range', () => {
      expect(isPrivateIp('0.0.0.0')).toBe(true);
      expect(isPrivateIp('0.0.0.1')).toBe(true);
    });

    it('should detect 100.64.0.0/10 carrier-grade NAT', () => {
      expect(isPrivateIp('100.64.0.1')).toBe(true);
      expect(isPrivateIp('100.127.255.255')).toBe(true);
    });

    it('should NOT flag 100.128.0.1 (outside CGNAT /10 range)', () => {
      expect(isPrivateIp('100.128.0.1')).toBe(false);
    });

    it('should detect multicast range 224.0.0.0/4', () => {
      expect(isPrivateIp('224.0.0.1')).toBe(true);
      expect(isPrivateIp('239.255.255.255')).toBe(true);
    });

    it('should detect reserved range 240.0.0.0/4', () => {
      expect(isPrivateIp('240.0.0.1')).toBe(true);
      expect(isPrivateIp('255.255.255.254')).toBe(true);
    });

    it('should allow public IPs', () => {
      expect(isPrivateIp('8.8.8.8')).toBe(false);       // Google DNS
      expect(isPrivateIp('1.1.1.1')).toBe(false);       // Cloudflare DNS
      expect(isPrivateIp('142.250.80.46')).toBe(false);  // google.com
      expect(isPrivateIp('93.184.216.34')).toBe(false);  // example.com
      expect(isPrivateIp('198.51.100.1')).toBe(false);   // just outside /15
    });
  });

  // ── isPrivateIp (IPv6) ────────────────────────────────────

  describe('isPrivateIp — IPv6', () => {
    it('should detect ::1 loopback', () => {
      expect(isPrivateIp('::1')).toBe(true);
    });

    it('should detect fc00::/7 ULA addresses', () => {
      expect(isPrivateIp('fc00::1')).toBe(true);
      expect(isPrivateIp('fd12:3456:789a::1')).toBe(true);
    });

    it('should detect fe80::/10 link-local addresses', () => {
      expect(isPrivateIp('fe80::1')).toBe(true);
      expect(isPrivateIp('fe80::aede:48ff:fe00:1122')).toBe(true);
    });

    it('should detect IPv4-mapped IPv6 private addresses', () => {
      expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true);
      expect(isPrivateIp('::ffff:10.0.0.1')).toBe(true);
      expect(isPrivateIp('::ffff:192.168.1.1')).toBe(true);
      expect(isPrivateIp('::ffff:169.254.169.254')).toBe(true);
    });

    it('should allow IPv4-mapped IPv6 public addresses', () => {
      expect(isPrivateIp('::ffff:8.8.8.8')).toBe(false);
      expect(isPrivateIp('::ffff:1.1.1.1')).toBe(false);
    });

    it('should detect unspecified address ::', () => {
      expect(isPrivateIp('::')).toBe(true);
    });

    it('should detect multicast ff00::/8', () => {
      expect(isPrivateIp('ff02::1')).toBe(true);
    });

    it('should allow public IPv6 addresses', () => {
      expect(isPrivateIp('2606:4700:4700::1111')).toBe(false); // Cloudflare
      expect(isPrivateIp('2001:4860:4860::8888')).toBe(false); // Google
    });

    it('should treat invalid IP as private (fail-closed)', () => {
      expect(isPrivateIp('not-an-ip')).toBe(true);
      expect(isPrivateIp('')).toBe(true);
    });
  });

  // ── assertNotPrivateIp ────────────────────────────────────

  describe('assertNotPrivateIp', () => {
    it('should not throw for public IPs', () => {
      expect(() => assertNotPrivateIp('8.8.8.8')).not.toThrow();
      expect(() => assertNotPrivateIp('2606:4700:4700::1111')).not.toThrow();
    });

    it('should throw for private IPs', () => {
      expect(() => assertNotPrivateIp('127.0.0.1')).toThrow('private/internal range');
      expect(() => assertNotPrivateIp('::1')).toThrow('private/internal range');
      expect(() => assertNotPrivateIp('10.0.0.1')).toThrow('private/internal range');
    });
  });

  // ── isPrivateUrl (DNS-resolving) ──────────────────────────

  describe('isPrivateUrl', () => {
    it('should allow URL resolving to public IP', async () => {
      mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 } as any);
      expect(await isPrivateUrl('https://example.com/page')).toBe(false);
    });

    it('should block URL resolving to private IP (DNS rebinding simulation)', async () => {
      // Simulate DNS rebinding: hostname resolves to internal IP
      mockLookup.mockResolvedValue({ address: '127.0.0.1', family: 4 } as any);
      expect(await isPrivateUrl('https://evil-rebinding.attacker.com/steal')).toBe(true);
    });

    it('should block URL resolving to 10.x private IP', async () => {
      mockLookup.mockResolvedValue({ address: '10.0.0.1', family: 4 } as any);
      expect(await isPrivateUrl('https://internal.company.com/api')).toBe(true);
    });

    it('should block URL resolving to 169.254 metadata IP (cloud SSRF)', async () => {
      mockLookup.mockResolvedValue({ address: '169.254.169.254', family: 4 } as any);
      expect(await isPrivateUrl('https://metadata.attacker.com/latest')).toBe(true);
    });

    it('should block URL with direct IP literal 127.0.0.1', async () => {
      // Direct IP — no DNS lookup needed
      expect(await isPrivateUrl('https://127.0.0.1/admin')).toBe(true);
      expect(mockLookup).not.toHaveBeenCalled();
    });

    it('should block URL with direct IP literal 10.0.0.1', async () => {
      expect(await isPrivateUrl('https://10.0.0.1/internal')).toBe(true);
    });

    it('should block URL with direct IPv6 literal [::1]', async () => {
      expect(await isPrivateUrl('https://[::1]/admin')).toBe(true);
    });

    it('should block non-HTTP protocols', async () => {
      expect(await isPrivateUrl('ftp://example.com/file')).toBe(true);
      expect(await isPrivateUrl('file:///etc/passwd')).toBe(true);
      expect(await isPrivateUrl('gopher://internal/data')).toBe(true);
    });

    it('should block on DNS resolution failure (fail-closed)', async () => {
      mockLookup.mockRejectedValue(new Error('ENOTFOUND'));
      expect(await isPrivateUrl('https://nonexistent.invalid/page')).toBe(true);
    });

    it('should block malformed URLs', async () => {
      expect(await isPrivateUrl('not-a-url')).toBe(true);
      expect(await isPrivateUrl('')).toBe(true);
    });

    // ── Bypass technique coverage ─────────────────────────

    it('should block decimal IP encoding (2130706433 = 127.0.0.1)', async () => {
      // In URL form, decimal IPs would need to resolve via DNS or be direct
      // A hostname like "2130706433" would resolve via DNS
      mockLookup.mockResolvedValue({ address: '127.0.0.1', family: 4 } as any);
      expect(await isPrivateUrl('https://2130706433/admin')).toBe(true);
    });

    it('should block IPv6 mapped private IP in URL', async () => {
      expect(await isPrivateUrl('https://[::ffff:127.0.0.1]/admin')).toBe(true);
    });

    it('should block 0.0.0.0 direct', async () => {
      expect(await isPrivateUrl('https://0.0.0.0/admin')).toBe(true);
    });

    it('should block hostname that resolves to IPv6 private', async () => {
      mockLookup.mockResolvedValue({ address: '::1', family: 6 } as any);
      expect(await isPrivateUrl('https://evil.com/page')).toBe(true);
    });
  });

  // ── assertNotPrivateUrl ───────────────────────────────────

  describe('assertNotPrivateUrl', () => {
    it('should not throw for URL resolving to public IP', async () => {
      mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 } as any);
      await expect(assertNotPrivateUrl('https://example.com')).resolves.not.toThrow();
    });

    it('should throw for URL resolving to private IP', async () => {
      mockLookup.mockResolvedValue({ address: '10.0.0.1', family: 4 } as any);
      await expect(assertNotPrivateUrl('https://evil.com', 'Webhook URL')).rejects.toThrow('Webhook URL');
    });

    it('should throw for non-HTTPS protocol', async () => {
      await expect(assertNotPrivateUrl('ftp://example.com', 'Media URL')).rejects.toThrow('only HTTP(S) protocols');
    });

    it('should throw for direct private IP', async () => {
      await expect(assertNotPrivateUrl('https://192.168.1.1/admin')).rejects.toThrow('private IP');
    });

    it('should include the label in error message', async () => {
      await expect(assertNotPrivateUrl('https://192.168.1.1', 'OG unfurl URL')).rejects.toThrow('OG unfurl URL');
    });
  });

  // ── Edge cases ────────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle HTTP (not just HTTPS) URLs as valid protocol', async () => {
      mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 } as any);
      expect(await isPrivateUrl('http://example.com/page')).toBe(false);
    });

    it('should handle URL with port number', async () => {
      mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 } as any);
      expect(await isPrivateUrl('https://example.com:8443/api')).toBe(false);
    });

    it('should handle URL with auth info', async () => {
      mockLookup.mockResolvedValue({ address: '10.0.0.1', family: 4 } as any);
      expect(await isPrivateUrl('https://user:pass@internal.corp/api')).toBe(true);
    });

    it('should handle 172.16 boundary correctly', () => {
      // 172.16.0.0 - 172.31.255.255 is private (/12)
      expect(isPrivateIp('172.15.255.255')).toBe(false); // just below range
      expect(isPrivateIp('172.16.0.0')).toBe(true);      // start of range
      expect(isPrivateIp('172.31.255.255')).toBe(true);   // end of range
      expect(isPrivateIp('172.32.0.0')).toBe(false);      // just above range
    });

    it('should handle 100.64.0.0/10 boundary correctly', () => {
      expect(isPrivateIp('100.63.255.255')).toBe(false);  // just below
      expect(isPrivateIp('100.64.0.0')).toBe(true);       // start
      expect(isPrivateIp('100.127.255.255')).toBe(true);   // end
      expect(isPrivateIp('100.128.0.0')).toBe(false);     // just above
    });
  });
});
