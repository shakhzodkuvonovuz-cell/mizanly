import { useState, useEffect } from 'react';
import { colors } from '@/theme';

// Cache extracted colors to avoid re-extraction on re-render
const colorCache = new Map<string, { dominant: string; secondary: string }>();

const DEFAULT_AMBIENT = `${colors.emerald}1A`; // emerald at 10% opacity

/**
 * useAmbientColor — extracts dominant/secondary colors from a video thumbnail.
 *
 * 1. Tries react-native-image-colors for real extraction
 * 2. Falls back to hash-based deterministic color if extraction fails
 * 3. Caches results per URL in memory
 *
 * Returns muted, dark-mode-friendly ambient tones suitable
 * for gradient backgrounds behind video players.
 */
export function useAmbientColor(imageUri: string | undefined | null) {
  const [dominantColor, setDominantColor] = useState<string | null>(null);
  const [secondaryColor, setSecondaryColor] = useState<string | null>(null);
  // [W12-C03#22] Removed redundant mountedRef — cancelled flag per-effect already handles cleanup

  useEffect(() => {
    if (!imageUri) {
      setDominantColor(null);
      setSecondaryColor(null);
      return;
    }

    // LRU eviction: batch-evict 10 entries when cap is hit
    if (colorCache.size > 50) {
      const keys = colorCache.keys();
      for (let i = 0; i < 10; i++) {
        const entry = keys.next();
        if (entry.done) break;
        colorCache.delete(entry.value);
      }
    }

    // Check cache first
    const cached = colorCache.get(imageUri);
    if (cached) {
      setDominantColor(cached.dominant);
      setSecondaryColor(cached.secondary);
      return;
    }

    let cancelled = false;

    // Try real color extraction first, fall back to hash
    (async () => {
      try {
        const ImageColors = await import('react-native-image-colors');
        const result = await ImageColors.default.getColors(imageUri, {
          fallback: colors.emerald,
          cache: true,
          key: imageUri,
          quality: 'lowest',
        });

        if (cancelled) return;

        let primary: string = colors.emerald;
        let accent: string = colors.gold;

        if (result.platform === 'android') {
          primary = result.dominant || result.average || colors.emerald;
          accent = result.vibrant || result.muted || colors.gold;
        } else if (result.platform === 'ios') {
          primary = result.primary || result.background || colors.emerald;
          accent = result.secondary || result.detail || colors.gold;
        } else if (result.platform === 'web') {
          primary = result.dominant || colors.emerald;
          accent = result.vibrant || colors.gold;
        }

        // Darken extracted colors for ambient use (30% opacity)
        // Only append hex alpha to hex colors; non-hex colors (rgb, hsl) pass through as-is
        const normalizePrimary = primary.startsWith('#') ? primary : `#${primary}`;
        const normalizeAccent = accent.startsWith('#') ? accent : `#${accent}`;
        const dom = primary.startsWith('#') || /^[0-9a-fA-F]{6}$/.test(primary)
          ? `${normalizePrimary}4D`
          : primary;
        const sec = accent.startsWith('#') || /^[0-9a-fA-F]{6}$/.test(accent)
          ? `${normalizeAccent}33`
          : accent;

        colorCache.set(imageUri, { dominant: dom, secondary: sec });
        if (!cancelled) {
          setDominantColor(dom);
          setSecondaryColor(sec);
        }
      } catch {
        // Fallback: hash-based deterministic color
        if (cancelled) return;

        const { dominant, secondary } = hashToAmbientColors(imageUri);
        colorCache.set(imageUri, { dominant, secondary });
        if (!cancelled) {
          setDominantColor(dominant);
          setSecondaryColor(secondary);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [imageUri]);

  return { dominantColor, secondaryColor };
}

/**
 * Hash-based fallback that produces deterministic dark colors from a URL.
 */
function hashToAmbientColors(uri: string): { dominant: string; secondary: string } {
  let hash = 0;
  for (let i = 0; i < uri.length; i++) {
    hash = ((hash << 5) - hash + uri.charCodeAt(i)) | 0;
  }

  const hue = Math.abs(hash % 360);
  const saturation = 25 + Math.abs((hash >> 8) % 15);
  const lightness = 12 + Math.abs((hash >> 16) % 8);

  return {
    dominant: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
    secondary: `hsl(${(hue + 30) % 360}, ${Math.max(saturation - 10, 15)}%, ${lightness + 3}%)`,
  };
}

/**
 * Clear the ambient color cache (call on memory warning).
 */
export function clearAmbientCache(): void {
  colorCache.clear();
}
