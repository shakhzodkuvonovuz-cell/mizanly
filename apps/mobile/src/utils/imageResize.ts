import * as ImageManipulator from 'expo-image-manipulator';

const MAX_DIMENSION = 2048;
const JPEG_QUALITY = 0.82;
const PNG_QUALITY = 0.9;

// Extensions that should NOT be converted to JPEG (preserve format)
const KEEP_FORMAT_EXTENSIONS = new Set(['png', 'gif', 'webp']);

/**
 * Resize and compress an image before upload.
 * - Scales down to MAX_DIMENSION if larger (preserves aspect ratio)
 * - PNGs stay PNG (preserves transparency)
 * - GIFs are returned as-is (ImageManipulator would flatten animation)
 * - Everything else converts to JPEG at 82% quality
 * - Returns new local URI + dimensions
 */
export async function resizeForUpload(
  uri: string,
  originalWidth?: number,
  originalHeight?: number,
): Promise<{ uri: string; width: number; height: number; mimeType: string }> {
  // Detect format from URI extension
  const uriPath = uri.split('?')[0];
  const ext = uriPath.split('.').pop()?.toLowerCase() ?? '';

  // GIFs: return as-is — ImageManipulator flattens animation to single frame
  if (ext === 'gif') {
    return {
      uri,
      width: originalWidth ?? 0,
      height: originalHeight ?? 0,
      mimeType: 'image/gif',
    };
  }

  const w = originalWidth ?? MAX_DIMENSION;
  const h = originalHeight ?? MAX_DIMENSION;
  const needsResize = w > MAX_DIMENSION || h > MAX_DIMENSION;

  const actions: ImageManipulator.Action[] = [];
  let targetWidth = w;
  let targetHeight = h;

  if (needsResize) {
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
  const compress = isPng ? PNG_QUALITY : JPEG_QUALITY;
  const mimeType = isPng ? 'image/png' : 'image/jpeg';

  try {
    const result = await ImageManipulator.manipulateAsync(uri, actions, { compress, format });
    return { uri: result.uri, width: result.width, height: result.height, mimeType };
  } catch (err) {
    // Fallback: return original URI if manipulation fails (corrupted image, unsupported format)
    console.warn('[imageResize] manipulateAsync failed, using original:', err);
    return { uri, width: w, height: h, mimeType: 'image/jpeg' };
  }
}
