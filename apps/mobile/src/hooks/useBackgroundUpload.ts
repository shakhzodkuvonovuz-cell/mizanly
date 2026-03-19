import { useState, useCallback, useRef } from 'react';

interface UploadState {
  progress: number; // 0-1
  status: 'idle' | 'uploading' | 'success' | 'error';
  error?: string;
}

/**
 * Hook for background media uploads with progress tracking.
 * Uses XMLHttpRequest for progress events (fetch doesn't support upload progress).
 */
export function useBackgroundUpload() {
  const [state, setState] = useState<UploadState>({
    progress: 0,
    status: 'idle',
  });
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const upload = useCallback(
    async (
      presignedUrl: string,
      fileUri: string,
      contentType: string,
      onComplete?: (url: string) => void,
    ): Promise<void> => {
      setState({ progress: 0, status: 'uploading' });

      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;

        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const progress = event.loaded / event.total;
            setState({ progress, status: 'uploading' });
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setState({ progress: 1, status: 'success' });
            // Extract the public URL (presigned URL without query params)
            const publicUrl = presignedUrl.split('?')[0];
            onComplete?.(publicUrl);
            resolve();
          } else {
            const error = `Upload failed: ${xhr.status}`;
            setState({ progress: 0, status: 'error', error });
            reject(new Error(error));
          }
        });

        xhr.addEventListener('error', () => {
          const error = 'Network error during upload';
          setState({ progress: 0, status: 'error', error });
          reject(new Error(error));
        });

        xhr.open('PUT', presignedUrl);
        xhr.setRequestHeader('Content-Type', contentType);

        // For React Native, we need to read the file as a blob
        fetch(fileUri)
          .then(res => res.blob())
          .then(blob => {
            xhr.send(blob);
          })
          .catch(err => {
            const error = `Failed to read file: ${err.message}`;
            setState({ progress: 0, status: 'error', error });
            reject(new Error(error));
          });
      });
    },
    [],
  );

  const cancel = useCallback(() => {
    if (xhrRef.current) {
      xhrRef.current.abort();
      setState({ progress: 0, status: 'idle' });
    }
  }, []);

  const reset = useCallback(() => {
    setState({ progress: 0, status: 'idle' });
  }, []);

  return { ...state, upload, cancel, reset };
}
