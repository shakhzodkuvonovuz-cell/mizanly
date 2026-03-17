import * as FileSystem from 'expo-file-system';

const DOWNLOADS_DIR = `${FileSystem.documentDirectory}offline-downloads/`;

/** Ensure the downloads directory exists */
async function ensureDir() {
  const info = await FileSystem.getInfoAsync(DOWNLOADS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(DOWNLOADS_DIR, { intermediates: true });
  }
}

/** Map of active DownloadResumable instances, keyed by downloadId */
const activeDownloads = new Map<string, FileSystem.DownloadResumable>();

/** Build a local file path for a given content item */
function localPath(contentId: string, contentType: string): string {
  const ext = contentType === 'post' ? 'jpg' : 'mp4';
  return `${DOWNLOADS_DIR}${contentId}.${ext}`;
}

export interface DownloadProgress {
  totalBytesWritten: number;
  totalBytesExpectedToWrite: number;
}

/**
 * Start downloading a file.
 * Returns the DownloadResumable so caller can await .downloadAsync().
 */
export async function startDownload(
  downloadId: string,
  url: string,
  contentId: string,
  contentType: string,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<FileSystem.DownloadResumable> {
  await ensureDir();
  const filePath = localPath(contentId, contentType);

  const callback = onProgress
    ? (dp: FileSystem.DownloadProgressData) => {
        onProgress({
          totalBytesWritten: dp.totalBytesWritten,
          totalBytesExpectedToWrite: dp.totalBytesExpectedToWrite,
        });
      }
    : undefined;

  const downloadResumable = FileSystem.createDownloadResumable(
    url,
    filePath,
    {},
    callback,
  );

  activeDownloads.set(downloadId, downloadResumable);
  return downloadResumable;
}

/** Pause an active download and return the savable data */
export async function pauseDownload(downloadId: string): Promise<FileSystem.DownloadPauseState | null> {
  const resumable = activeDownloads.get(downloadId);
  if (!resumable) return null;
  const state = await resumable.pauseAsync();
  return state;
}

/** Resume a paused download */
export async function resumeDownload(
  downloadId: string,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<FileSystem.DownloadResumable | null> {
  const resumable = activeDownloads.get(downloadId);
  if (!resumable) return null;
  return resumable;
}

/** Remove the active download entry (after completion or cancellation) */
export function clearActiveDownload(downloadId: string) {
  activeDownloads.delete(downloadId);
}

/** Delete a locally downloaded file */
export async function deleteFile(contentId: string, contentType: string = 'video'): Promise<void> {
  const filePath = localPath(contentId, contentType);
  const info = await FileSystem.getInfoAsync(filePath);
  if (info.exists) {
    await FileSystem.deleteAsync(filePath, { idempotent: true });
  }
}

/** Get free / total disk space info */
export async function getStorageInfo(): Promise<{ free: number; total: number }> {
  const freeSpace = await FileSystem.getFreeDiskStorageAsync();
  const totalSpace = await FileSystem.getTotalDiskCapacityAsync();
  return {
    free: freeSpace,
    total: totalSpace,
  };
}

/** Check if a content item has been downloaded locally */
export async function isDownloaded(contentId: string, contentType: string = 'video'): Promise<boolean> {
  const filePath = localPath(contentId, contentType);
  const info = await FileSystem.getInfoAsync(filePath);
  return info.exists;
}

/** Get local file URI for offline playback */
export function getLocalUri(contentId: string, contentType: string = 'video'): string {
  return localPath(contentId, contentType);
}
