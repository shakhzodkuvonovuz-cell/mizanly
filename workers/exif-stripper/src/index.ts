/**
 * EXIF Stripper Worker — removes GPS/device metadata from uploaded images.
 *
 * Triggered via R2 event notifications on object PUT.
 * Only processes JPEG images (EXIF doesn't apply to PNG/WebP/GIF).
 *
 * How it works:
 * 1. R2 sends event notification when an object is uploaded
 * 2. Worker checks if it's a JPEG (by Content-Type or extension)
 * 3. If JPEG: fetches the object, strips EXIF, re-uploads in place
 * 4. Non-JPEG files are ignored (no EXIF in PNG/WebP)
 *
 * Deployment:
 *   cd workers/exif-stripper
 *   wrangler deploy
 *   Then configure R2 event notification in Cloudflare dashboard:
 *   Bucket → Settings → Event notifications → Add → PUT → Worker: mizanly-exif-stripper
 */

export interface Env {
  BUCKET: R2Bucket;
}

// JPEG markers
const JPEG_SOI = 0xffd8; // Start of Image
const EXIF_MARKER = 0xffe1; // APP1 (EXIF)
const JFIF_MARKER = 0xffe0; // APP0 (JFIF)

/**
 * Strip EXIF data from a JPEG buffer.
 * Removes APP1 (EXIF) segments while preserving APP0 (JFIF) and image data.
 */
function stripExif(buffer: ArrayBuffer): ArrayBuffer {
  const view = new DataView(buffer);

  // Verify JPEG SOI marker
  if (view.getUint16(0) !== JPEG_SOI) return buffer; // Not a JPEG

  const output: Uint8Array[] = [];
  output.push(new Uint8Array(buffer, 0, 2)); // Copy SOI

  let offset = 2;
  while (offset < buffer.byteLength - 1) {
    const marker = view.getUint16(offset);

    // End of markers / start of compressed data
    if (marker === 0xffda) {
      // Copy everything from SOS marker to end of file (compressed image data)
      output.push(new Uint8Array(buffer, offset));
      break;
    }

    // Skip EXIF (APP1) segments — this is where GPS, device info, timestamps live
    if (marker === EXIF_MARKER) {
      const segmentLength = view.getUint16(offset + 2);
      offset += 2 + segmentLength; // Skip entire EXIF segment
      continue;
    }

    // Copy all other segments (JFIF, quantization tables, Huffman tables, SOF, etc.)
    if ((marker & 0xff00) === 0xff00) {
      // Markers with length field
      if (marker === 0xffd9 || marker === 0xffd0 || (marker >= 0xffd0 && marker <= 0xffd7)) {
        // RST markers and EOI — no length field
        output.push(new Uint8Array(buffer, offset, 2));
        offset += 2;
      } else {
        const segmentLength = view.getUint16(offset + 2);
        output.push(new Uint8Array(buffer, offset, 2 + segmentLength));
        offset += 2 + segmentLength;
      }
    } else {
      // Should not happen in a valid JPEG — copy byte and advance
      output.push(new Uint8Array(buffer, offset, 1));
      offset += 1;
    }
  }

  // Concatenate output segments
  const totalLength = output.reduce((sum, arr) => sum + arr.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const segment of output) {
    result.set(segment, pos);
    pos += segment.byteLength;
  }

  return result.buffer;
}

/** Check if a key is a JPEG image based on extension or content type */
function isJpeg(key: string, contentType?: string): boolean {
  if (contentType?.includes('jpeg') || contentType?.includes('jpg')) return true;
  const ext = key.split('.').pop()?.toLowerCase();
  return ext === 'jpg' || ext === 'jpeg';
}

export default {
  async queue(batch: MessageBatch<{ action: string; object: { key: string } }>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      const { action, object } = message.body;
      if (action !== 'PutObject') continue;

      const key = object.key;

      // Skip non-JPEG files (EXIF only applies to JPEG)
      // Also skip temp/ and deleted/ prefixes (transient uploads)
      if (key.startsWith('temp/') || key.startsWith('deleted/')) continue;

      try {
        const obj = await env.BUCKET.get(key);
        if (!obj) continue;

        const contentType = obj.httpMetadata?.contentType ?? '';
        if (!isJpeg(key, contentType)) continue;

        const originalBuffer = await obj.arrayBuffer();
        const strippedBuffer = stripExif(originalBuffer);

        // Only re-upload if we actually removed EXIF data (buffer size changed)
        if (strippedBuffer.byteLength < originalBuffer.byteLength) {
          await env.BUCKET.put(key, strippedBuffer, {
            httpMetadata: obj.httpMetadata,
            customMetadata: { ...obj.customMetadata, exifStripped: 'true' },
          });
        }
      } catch (error) {
        console.error(`EXIF stripping failed for ${key}:`, error);
      }

      message.ack();
    }
  },
};
