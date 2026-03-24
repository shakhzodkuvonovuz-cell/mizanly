import * as ImageManipulator from 'expo-image-manipulator';

const MAX_DIMENSION = 2048;
const JPEG_QUALITY = 0.82;

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
};

/**
 * Resize and compress an image before upload.
 * - Scales down to MAX_DIMENSION if larger (preserves aspect ratio)
 * - PNGs stay PNG (preserves transparency)
 * - GIFs returned as-is (ImageManipulator would flatten animation)
 * - Small JPEGs (both dimensions <= MAX_DIMENSION) returned as-is (no re-encoding)
 * - Everything else converts to JPEG at 82% quality
 */
export async function resizeForUpload(
  uri: string,
  originalWidth?: number,
  originalHeight?: number,
): Promise<{ uri: string; width: number; height: number; mimeType: string }> {
  const uriPath = uri.split('?')[0];
  const ext = uriPath.split('.').pop()?.toLowerCase() ?? '';
  const originalMime = MIME_BY_EXT[ext] ?? 'image/jpeg';

  // GIFs: return as-is — ImageManipulator flattens animation to single frame
  if (ext === 'gif') {
    return { uri, width: originalWidth ?? 0, height: originalHeight ?? 0, mimeType: 'image/gif' };
  }

  const w = originalWidth ?? MAX_DIMENSION;
  const h = originalHeight ?? MAX_DIMENSION;
  const needsResize = w > MAX_DIMENSION || h > MAX_DIMENSION;

  // Small JPEG that doesn't need resize: skip re-encoding entirely (saves ~200ms + no quality loss)
  const isJpeg = ext === 'jpg' || ext === 'jpeg';
  if (!needsResize && isJpeg) {
    return { uri, width: w, height: h, mimeType: 'image/jpeg' };
  }

  const actions: ImageManipulator.Action[] = [];
  if (needsResize) {
    let targetWidth: number;
    let targetHeight: number;
    if (w > h) {
      targetWidth = MAX_DIMENSION;
      targetHeight = Math.round((h / w) * MAX_DIMENSION);
    } else {
      targetHeight = MAX_DIMENSION;
      targetWidth = Math.round((w / h) * MAX_DIMENSION);
    }
    actions.push({ resize: { width: targetWidth, height: targetHeight } });
  }

  // PNG: keep as PNG to preserve transparency
  const isPng = ext === 'png';
  const format = isPng ? ImageManipulator.SaveFormat.PNG : ImageManipulator.SaveFormat.JPEG;
  const compress = isPng ? 1 : JPEG_QUALITY; // PNG ignores compress (always lossless)
  const mimeType = isPng ? 'image/png' : 'image/jpeg';

  try {
    const result = await ImageManipulator.manipulateAsync(uri, actions, { compress, format });
    return { uri: result.uri, width: result.width, height: result.height, mimeType };
  } catch (err) {
    console.warn('[imageResize] manipulateAsync failed, using original:', err);
    return { uri, width: w, height: h, mimeType: originalMime };
  }
}
