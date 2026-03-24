import * as ImageManipulator from 'expo-image-manipulator';

const MAX_DIMENSION = 2048; // Max width or height — balances quality vs file size
const JPEG_QUALITY = 0.82; // 82% quality — visually lossless, ~70% size reduction

/**
 * Resize and compress an image before upload.
 * - Scales down to MAX_DIMENSION if larger (preserves aspect ratio)
 * - Converts to JPEG at JPEG_QUALITY
 * - Returns new local URI + dimensions
 *
 * Skips resize if image is already small enough.
 */
export async function resizeForUpload(
  uri: string,
  originalWidth?: number,
  originalHeight?: number,
): Promise<{ uri: string; width: number; height: number }> {
  const w = originalWidth ?? MAX_DIMENSION;
  const h = originalHeight ?? MAX_DIMENSION;

  const needsResize = w > MAX_DIMENSION || h > MAX_DIMENSION;

  const actions: ImageManipulator.Action[] = [];
  let targetWidth = w;
  let targetHeight = h;

  if (needsResize) {
    // Scale to fit within MAX_DIMENSION maintaining aspect ratio
    if (w > h) {
      targetWidth = MAX_DIMENSION;
      targetHeight = Math.round((h / w) * MAX_DIMENSION);
    } else {
      targetHeight = MAX_DIMENSION;
      targetWidth = Math.round((w / h) * MAX_DIMENSION);
    }
    actions.push({ resize: { width: targetWidth, height: targetHeight } });
  }

  // Always compress to JPEG (even if no resize needed — saves space)
  const result = await ImageManipulator.manipulateAsync(
    uri,
    actions,
    {
      compress: JPEG_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  );

  return {
    uri: result.uri,
    width: result.width,
    height: result.height,
  };
}
