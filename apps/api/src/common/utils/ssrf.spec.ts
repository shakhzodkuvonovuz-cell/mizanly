import { isPrivateIp, assertNotPrivateUrl } from './ssrf';
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
      await expect(assertNotPrivateUrl('http://example.com/page')).resolves.not.toThrow();
    });

    it('should handle URL with port number', async () => {
      mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 } as any);
      await expect(assertNotPrivateUrl('https://example.com:8443/api')).resolves.not.toThrow();
    });

    it('should handle URL with auth info resolving to private IP', async () => {
      mockLookup.mockResolvedValue({ address: '10.0.0.1', family: 4 } as any);
      await expect(assertNotPrivateUrl('https://user:pass@internal.corp/api')).rejects.toThrow('private IP');
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
