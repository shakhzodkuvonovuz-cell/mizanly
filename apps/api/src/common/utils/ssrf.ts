import * as dns from 'dns';
import * as net from 'net';

/**
 * SSRF (Server-Side Request Forgery) validation utility.
 *
 * Resolves a URL's hostname to its IP address via DNS, then checks the
 * resolved IP against private/internal CIDR ranges. This approach defeats:
 *  - Decimal IP encoding (e.g., http://2130706433 → 127.0.0.1)
 *  - Octal IP encoding (e.g., http://0177.0.0.1 → 127.0.0.1)
 *  - IPv6 bypass (e.g., http://[::1], http://[::ffff:127.0.0.1])
 *  - DNS rebinding (hostname resolves to private IP)
 *  - Hostname tricks (e.g., localhost.attacker.com, 127.0.0.1.nip.io)
 *
 * Usage:
 *   await assertNotPrivateUrl(url);            // throws on private/invalid
 *   const safe = await isPrivateUrl(url);       // returns boolean
 *   assertNotPrivateIp(resolvedIp);             // checks a resolved IP directly
 */

// ── IPv4 private CIDR ranges ──────────────────────────────────

interface CidrV4 {
  base: number;
  mask: number;
}

function ipv4ToNumber(ip: string): number {
  const parts = ip.split('.');
  if (parts.length !== 4) return -1;
  let num = 0;
  for (const part of parts) {
    const n = parseInt(part, 10);
    if (isNaN(n) || n < 0 || n > 255) return -1;
    num = (num << 8) | n;
  }
  // Convert to unsigned 32-bit
  return num >>> 0;
}

function parseCidrV4(cidr: string): CidrV4 {
  const [baseIp, prefixStr] = cidr.split('/');
  const prefix = parseInt(prefixStr, 10);
  const base = ipv4ToNumber(baseIp);
  // Create mask: e.g. /8 → 0xFF000000
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return { base, mask };
}

const PRIVATE_CIDRS_V4: CidrV4[] = [
  '127.0.0.0/8',       // Loopback
  '10.0.0.0/8',        // Private (Class A)
  '172.16.0.0/12',     // Private (Class B)
  '192.168.0.0/16',    // Private (Class C)
  '169.254.0.0/16',    // Link-local
  '0.0.0.0/8',         // Current network
  '100.64.0.0/10',     // Carrier-grade NAT (RFC 6598)
  '198.18.0.0/15',     // Benchmarking (RFC 2544)
  '224.0.0.0/4',       // Multicast
  '240.0.0.0/4',       // Reserved
].map(parseCidrV4);

function isPrivateIpV4(ip: string): boolean {
  const num = ipv4ToNumber(ip);
  if (num < 0) return false;
  return PRIVATE_CIDRS_V4.some(cidr => (num & cidr.mask) === (cidr.base & cidr.mask));
}

// ── IPv6 private ranges ─────────────────────────────────────

/**
 * Parse an IPv6 address into a 16-byte Uint8Array.
 * Handles :: expansion and IPv4-mapped addresses.
 */
function ipv6ToBytes(ip: string): Uint8Array | null {
  // Handle IPv4-mapped IPv6: ::ffff:1.2.3.4
  const v4MappedMatch = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4MappedMatch) {
    const v4 = v4MappedMatch[1];
    const v4Num = ipv4ToNumber(v4);
    if (v4Num < 0) return null;
    const bytes = new Uint8Array(16);
    bytes[10] = 0xff;
    bytes[11] = 0xff;
    bytes[12] = (v4Num >>> 24) & 0xff;
    bytes[13] = (v4Num >>> 16) & 0xff;
    bytes[14] = (v4Num >>> 8) & 0xff;
    bytes[15] = v4Num & 0xff;
    return bytes;
  }

  const bytes = new Uint8Array(16);
  const halves = ip.split('::');
  if (halves.length > 2) return null;

  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];

  if (halves.length === 1) {
    // No :: present — must have exactly 8 groups
    if (left.length !== 8) return null;
  }

  const totalGroups = left.length + right.length;
  if (totalGroups > 8) return null;

  let pos = 0;
  for (const group of left) {
    const val = parseInt(group, 16);
    if (isNaN(val) || val < 0 || val > 0xffff) return null;
    bytes[pos++] = (val >> 8) & 0xff;
    bytes[pos++] = val & 0xff;
  }

  // Fill zeros for :: expansion
  if (halves.length === 2) {
    const zerosNeeded = 8 - totalGroups;
    pos += zerosNeeded * 2;
  }

  let rightPos = 16 - right.length * 2;
  for (const group of right) {
    const val = parseInt(group, 16);
    if (isNaN(val) || val < 0 || val > 0xffff) return null;
    bytes[rightPos++] = (val >> 8) & 0xff;
    bytes[rightPos++] = val & 0xff;
  }

  return bytes;
}

interface CidrV6 {
  bytes: Uint8Array;
  prefix: number;
}

function parseCidrV6(cidr: string): CidrV6 | null {
  const [addr, prefixStr] = cidr.split('/');
  const bytes = ipv6ToBytes(addr);
  if (!bytes) return null;
  return { bytes, prefix: parseInt(prefixStr, 10) };
}

const PRIVATE_CIDRS_V6_RAW = [
  '::1/128',           // Loopback
  'fc00::/7',          // Unique Local Address (ULA)
  'fe80::/10',         // Link-local
  '::ffff:0:0/96',     // IPv4-mapped (checked as IPv4)
  'ff00::/8',          // Multicast
  '::/128',            // Unspecified
];

const PRIVATE_CIDRS_V6: CidrV6[] = PRIVATE_CIDRS_V6_RAW
  .map(parseCidrV6)
  .filter((c): c is CidrV6 => c !== null);

function matchesCidrV6(ipBytes: Uint8Array, cidr: CidrV6): boolean {
  const fullBytes = cidr.prefix;
  const fullOctets = Math.floor(fullBytes / 8);
  const remainingBits = fullBytes % 8;

  for (let i = 0; i < fullOctets; i++) {
    if (ipBytes[i] !== cidr.bytes[i]) return false;
  }

  if (remainingBits > 0 && fullOctets < 16) {
    const mask = (0xff << (8 - remainingBits)) & 0xff;
    if ((ipBytes[fullOctets] & mask) !== (cidr.bytes[fullOctets] & mask)) return false;
  }

  return true;
}

function isPrivateIpV6(ip: string): boolean {
  const bytes = ipv6ToBytes(ip);
  if (!bytes) return false;

  // Check if it's an IPv4-mapped address — delegate to IPv4 check
  const isV4Mapped =
    bytes[10] === 0xff && bytes[11] === 0xff &&
    bytes.slice(0, 10).every(b => b === 0);
  if (isV4Mapped) {
    const v4 = `${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`;
    return isPrivateIpV4(v4);
  }

  return PRIVATE_CIDRS_V6.some(cidr => matchesCidrV6(bytes, cidr));
}

// ── Public API ──────────────────────────────────────────────

/**
 * Check if a resolved IP address is in a private/internal range.
 * Works with both IPv4 and IPv6 addresses.
 */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    return isPrivateIpV4(ip);
  }
  if (net.isIPv6(ip)) {
    return isPrivateIpV6(ip);
  }
  // Not a valid IP → treat as private (fail-closed)
  return true;
}

/**
 * Throws if the given IP is in a private range.
 */
export function assertNotPrivateIp(ip: string): void {
  if (isPrivateIp(ip)) {
    throw new Error(`Blocked: resolved IP ${ip} is in a private/internal range`);
  }
}

/**
 * Resolve a URL's hostname and check if the resolved IP is private.
 * Returns true if the URL resolves to a private/internal IP.
 *
 * @param url - The full URL to check
 * @returns true if the URL is private/internal; false if safe to fetch
 */
export async function isPrivateUrl(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);

    // Only allow HTTP(S) protocols
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return true;
    }

    const hostname = parsed.hostname;

    // If the hostname is already an IP literal, check directly
    // Strip brackets from IPv6 literals like [::1]
    const cleanHost = hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(cleanHost)) {
      return isPrivateIp(cleanHost);
    }

    // Resolve hostname to IP via DNS
    const { address } = await dns.promises.lookup(hostname);
    return isPrivateIp(address);
  } catch {
    // DNS failure or invalid URL → fail-closed (treat as private)
    return true;
  }
}

/**
 * Assert that a URL does not resolve to a private/internal IP.
 * Throws an Error on failure.
 *
 * @param url - The full URL to validate
 * @param label - Optional label for error messages (e.g., 'media URL', 'webhook URL')
 */
export async function assertNotPrivateUrl(url: string, label = 'URL'): Promise<void> {
  try {
    const parsed = new URL(url);

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error(`${label}: only HTTP(S) protocols are allowed`);
    }

    const hostname = parsed.hostname;
    const cleanHost = hostname.replace(/^\[|\]$/g, '');

    let resolvedIp: string;
    if (net.isIP(cleanHost)) {
      resolvedIp = cleanHost;
    } else {
      const result = await dns.promises.lookup(hostname);
      resolvedIp = result.address;
    }

    if (isPrivateIp(resolvedIp)) {
      throw new Error(`${label}: hostname '${hostname}' resolves to private IP ${resolvedIp}`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith(label)) {
      throw err;
    }
    throw new Error(`${label}: validation failed — ${err instanceof Error ? err.message : 'invalid URL'}`);
  }
}

/**
 * Follow redirects manually with SSRF re-validation on each hop.
 * Returns the final Response object.
 *
 * @param url - The initial URL to fetch
 * @param init - Fetch options (redirect is forced to 'manual')
 * @param maxRedirects - Maximum number of redirects to follow (default 5)
 * @param label - Optional label for SSRF error messages
 */
export async function safeFetch(
  url: string,
  init: RequestInit = {},
  maxRedirects = 5,
  label = 'URL',
): Promise<Response> {
  // Validate the initial URL
  await assertNotPrivateUrl(url, label);

  let currentUrl = url;
  let redirectsLeft = maxRedirects;

  while (true) {
    const response = await fetch(currentUrl, {
      ...init,
      redirect: 'manual',
    });

    // Not a redirect → return
    if (response.status < 300 || response.status >= 400) {
      return response;
    }

    // Redirect
    if (redirectsLeft <= 0) {
      throw new Error(`${label}: too many redirects (max ${maxRedirects})`);
    }

    const location = response.headers.get('location');
    if (!location) {
      throw new Error(`${label}: redirect response missing Location header`);
    }

    // Resolve relative redirects
    const redirectUrl = new URL(location, currentUrl).href;

    // Re-validate the redirect destination
    await assertNotPrivateUrl(redirectUrl, label);

    currentUrl = redirectUrl;
    redirectsLeft--;
  }
}
