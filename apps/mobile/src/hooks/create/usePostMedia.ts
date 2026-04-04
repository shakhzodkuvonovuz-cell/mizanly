import { useState, useCallback, useRef, useEffect } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { showToast } from '@/components/ui/Toast';
import { useDraftPersistence } from '@/hooks/useDraftPersistence';
import type { TFunction } from 'i18next';

interface PickedMedia {
  uri: string;
  type: 'image' | 'video';
  width?: number;
  height?: number;
}

const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB

interface UsePostMediaReturn {
  media: PickedMedia[];
  setMedia: React.Dispatch<React.SetStateAction<PickedMedia[]>>;
  pickMedia: () => Promise<void>;
  removeMedia: (index: number) => void;
  content: string;
  setContent: (v: string) => void;
  showDraftBanner: boolean;
  setShowDraftBanner: (v: boolean) => void;
  saveDraftImmediate: (data: { content: string; mediaUrls: string[] }) => Promise<void>;
  clearDraft: () => Promise<void>;
  debouncedSaveDraft: (data: { content: string; mediaUrls: string[] }) => void;
}

export function usePostMedia(
  t: TFunction,
  prefillContent?: string,
  prefillMedia?: string,
): UsePostMediaReturn {
  const [content, setContent] = useState(prefillContent ?? '');
  const [media, setMedia] = useState<PickedMedia[]>(
    prefillMedia ? [{ uri: prefillMedia, type: prefillMedia.match(/\.(mp4|mov|avi)/i) ? 'video' : 'image' } as PickedMedia] : [],
  );
  const [showDraftBanner, setShowDraftBanner] = useState(false);

  const { save: saveDraftImmediate, clear: clearDraft, debouncedSave: debouncedSaveDraft } = useDraftPersistence<{ content: string; mediaUrls: string[] }>(
    'post-draft',
    (draft) => {
      if (draft.content) setContent(draft.content);
      setShowDraftBanner(true);
      setTimeout(() => setShowDraftBanner(false), 3000);
    },
  );

  // Debounced auto-save
  useEffect(() => {
    if (!content.trim() && media.length === 0) {
      clearDraft().catch(() => {});
      return;
    }
    debouncedSaveDraft({ content, mediaUrls: media.map(m => m.uri) });
  }, [content, media, clearDraft, debouncedSaveDraft]);

  const getFileSize = useCallback(async (uri: string): Promise<number> => {
    const info = await FileSystem.getInfoAsync(uri, { size: true });
    return info.exists && 'size' in info ? info.size : 0;
  }, []);

  const pickMedia = useCallback(async () => {
    if (media.length >= 10) {
      showToast({ message: t('compose.mediaLimit'), variant: 'error' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: 10 - media.length,
      quality: 0.85,
      exif: false,
    });
    if (!result.canceled) {
      const validAssets: PickedMedia[] = [];
      for (const a of result.assets) {
        const isVideo = a.type === 'video';
        const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
        const maxLabel = isVideo ? '100MB' : '20MB';
        const fileSize = a.fileSize ?? await getFileSize(a.uri);
        if (fileSize > maxSize) {
          const msgKey = isVideo ? 'compose.videoTooLarge' : 'compose.fileTooLarge';
          showToast({ message: t(msgKey, { max: maxLabel }), variant: 'error' });
          continue;
        }
        validAssets.push({
          uri: a.uri,
          type: isVideo ? 'video' : 'image',
          width: a.width,
          height: a.height,
        });
      }
      // Client-side NSFW screening
      if (validAssets.length > 0) {
        const imageUris = validAssets.filter(a => a.type === 'image').map(a => a.uri);
        if (imageUris.length > 0) {
          try {
            const { checkImages } = require('@/services/nsfwCheck');
            const nsfwResult = await checkImages(imageUris);
            if (!nsfwResult.safe) {
              showToast({ message: t('compose.contentBlocked') || 'This image violates community guidelines', variant: 'error' });
              return;
            }
          } catch {
            // nsfwCheck not available — server-side moderation is the fallback
          }
        }
        setMedia((prev) => [...prev, ...validAssets].slice(0, 10));
      }
    }
  }, [media.length, t, getFileSize]);

  const removeMedia = useCallback((index: number) => {
    setMedia((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return {
    media,
    setMedia,
    pickMedia,
    removeMedia,
    content,
    setContent,
    showDraftBanner,
    setShowDraftBanner,
    saveDraftImmediate,
    clearDraft,
    debouncedSaveDraft,
  };
}

export type { PickedMedia };
