import { useState, useEffect } from 'react';

/**
 * Generates a consistent muted color from an image URI.
 * Uses a hash of the URI to produce a deterministic dark color,
 * avoiding expensive image processing while still providing
 * a unique ambient color per video.
 */
export function useAmbientColor(imageUri: string | undefined | null) {
  const [dominantColor, setDominantColor] = useState<string | null>(null);
  const [secondaryColor, setSecondaryColor] = useState<string | null>(null);

  useEffect(() => {
    if (!imageUri) {
      setDominantColor(null);
      setSecondaryColor(null);
      return;
    }

    // Hash the URI to generate a consistent color
    let hash = 0;
    for (let i = 0; i < imageUri.length; i++) {
      const char = imageUri.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }

    const hue = Math.abs(hash % 360);
    const saturation = 25 + Math.abs((hash >> 8) % 15); // 25-40% (muted)
    const lightness = 12 + Math.abs((hash >> 16) % 8); // 12-20% (dark)

    setDominantColor(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
    setSecondaryColor(
      `hsl(${(hue + 30) % 360}, ${Math.max(saturation - 10, 15)}%, ${lightness + 3}%)`,
    );
  }, [imageUri]);

  return { dominantColor, secondaryColor };
}
