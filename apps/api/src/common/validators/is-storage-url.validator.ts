import { registerDecorator, ValidationOptions } from 'class-validator';
import { ConfigService } from '@nestjs/config';

/**
 * Allowed hostnames for application-owned media storage.
 * URLs must match one of these exactly (no substring matching — prevents
 * bypass via domains like "media.mizanly.app.evil.com").
 *
 * For R2_PUBLIC_URL from env, the hostname is extracted and added at runtime.
 */
const STATIC_ALLOWED_HOSTNAMES = [
  'media.mizanly.app',
];

/** Suffixes allowed for S3-compatible presigned URLs (Cloudflare R2 storage endpoints) */
const ALLOWED_HOSTNAME_SUFFIXES = [
  '.r2.cloudflarestorage.com',
  '.r2.dev',
];

/**
 * Resolves the complete set of allowed hostnames, including the dynamic
 * R2_PUBLIC_URL from environment. Cached after first call.
 */
let cachedAllowedHostnames: string[] | null = null;

function getAllowedHostnames(): string[] {
  if (cachedAllowedHostnames) return cachedAllowedHostnames;

  const hostnames = [...STATIC_ALLOWED_HOSTNAMES];

  // Extract hostname from R2_PUBLIC_URL env var if set
  const r2PublicUrl = process.env.R2_PUBLIC_URL;
  if (r2PublicUrl) {
    try {
      const parsed = new URL(r2PublicUrl);
      if (!hostnames.includes(parsed.hostname)) {
        hostnames.push(parsed.hostname);
      }
    } catch {
      // Invalid URL in env — skip silently, static list is sufficient
    }
  }

  cachedAllowedHostnames = hostnames;
  return hostnames;
}

function isAllowedStorageHostname(hostname: string): boolean {
  const allowed = getAllowedHostnames();
  if (allowed.includes(hostname)) return true;
  return ALLOWED_HOSTNAME_SUFFIXES.some(suffix => hostname.endsWith(suffix));
}

/**
 * Validates that a URL points to application-owned storage (Cloudflare R2).
 * Rejects arbitrary external URLs to prevent:
 * - SSRF (forcing backend to fetch from attacker-controlled hosts)
 * - Content moderation bypass (hotlinking unscreened media)
 * - Attribution confusion (displaying external content as if hosted on Mizanly)
 *
 * Usage:
 * ```ts
 * @IsStorageUrl()
 * mediaUrl: string;
 *
 * @IsStorageUrl({}, { each: true })
 * mediaUrls: string[];
 * ```
 */
export function IsStorageUrl(validationOptions?: ValidationOptions): PropertyDecorator {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isStorageUrl',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must point to application-owned storage`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false;
          try {
            const parsed = new URL(value);
            if (parsed.protocol !== 'https:') return false;
            return isAllowedStorageHostname(parsed.hostname);
          } catch {
            return false;
          }
        },
      },
    });
  };
}

/** Export for testing */
export { getAllowedHostnames, isAllowedStorageHostname, STATIC_ALLOWED_HOSTNAMES, ALLOWED_HOSTNAME_SUFFIXES };

/**
 * Reset the cached hostnames (used by tests to isolate env state).
 */
export function resetHostnameCache(): void {
  cachedAllowedHostnames = null;
}
