import { useState } from 'react';
import { Platform } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { storiesApi, uploadApi } from '@/services/api';
import { resizeForUpload } from '@/utils/imageResize';
import { showToast } from '@/components/ui/Toast';
import type { TFunction } from 'i18next';
import type { Sticker } from './useStoryEffects';

// Re-export filter/font constants so the screen can reference them
export const FILTERS = [
  { id: 'none', label: 'Normal', overlay: null },
  { id: 'warm', label: 'Warm', overlay: 'rgba(255, 180, 100, 0.15)' },
  { id: 'cool', label: 'Cool', overlay: 'rgba(100, 150, 255, 0.15)' },
  { id: 'vintage', label: 'Vintage', overlay: 'rgba(180, 150, 100, 0.2)' },
  { id: 'noir', label: 'Noir', overlay: 'rgba(0, 0, 0, 0.35)' },
  { id: 'emerald', label: 'Emerald', overlay: 'rgba(10, 123, 79, 0.15)' },
  { id: 'gold', label: 'Gold', overlay: 'rgba(200, 150, 62, 0.15)' },
];

export const FONTS = [
  { id: 'default', label: 'Default', fontFamily: undefined },
  { id: 'serif', label: 'Serif', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  { id: 'mono', label: 'Mono', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  { id: 'bold', label: 'Bold', fontFamily: undefined, fontWeight: '900' as const },
];

export const BG_GRADIENTS: [string, string][] = [
  ['#0A7B4F', '#065535'],
  ['#1a1a2e', '#16213e'],
  ['#C8963E', '#8B6914'],
  ['#0D1117', '#161B22'],
  ['#6B2FA0', '#3B0764'],
  ['#F85149', '#9B2C2C'],
];

interface PublishParams {
  mediaUri: string | null;
  mediaType: 'image' | 'video';
  text: string;
  textColor: string;
  fontIndex: number;
  filterIndex: number;
  bgGradientIndex: number;
  stickers: Sticker[];
  closeFriendsOnly: boolean;
  subscribersOnly: boolean;
}

interface UseStoryPublishReturn {
  publishMutation: ReturnType<typeof useMutation<unknown, Error, void>>;
  closeFriendsOnly: boolean;
  setCloseFriendsOnly: (v: boolean) => void;
  subscribersOnly: boolean;
  setSubscribersOnly: (v: boolean) => void;
  handleCloseFriendsToggle: (v: boolean) => void;
  handleSubscribersToggle: (v: boolean) => void;
}

export function useStoryPublish(
  getParams: () => PublishParams,
  t: TFunction,
): UseStoryPublishReturn {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [closeFriendsOnly, setCloseFriendsOnly] = useState(false);
  const [subscribersOnly, setSubscribersOnly] = useState(false);

  const handleCloseFriendsToggle = (val: boolean) => {
    setCloseFriendsOnly(val);
    if (val) setSubscribersOnly(false);
  };

  const handleSubscribersToggle = (val: boolean) => {
    setSubscribersOnly(val);
    if (val) setCloseFriendsOnly(false);
  };

  const publishMutation = useMutation({
    mutationFn: async () => {
      const params = getParams();
      let mediaUrl = '';
      if (params.mediaUri) {
        let uploadUri = params.mediaUri;
        let contentType: string;
        if (params.mediaType === 'video') {
          contentType = 'video/mp4';
        } else {
          const resized = await resizeForUpload(params.mediaUri);
          uploadUri = resized.uri;
          contentType = resized.mimeType;
        }
        const upload = await uploadApi.getPresignUrl(contentType, 'stories');
        const response = await fetch(uploadUri);
        const blob = await response.blob();
        await fetch(upload.uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': contentType } });
        mediaUrl = upload.publicUrl;
      }
      return storiesApi.create({
        mediaUrl,
        mediaType: params.mediaType,
        textOverlay: params.text || undefined,
        textColor: params.textColor,
        fontFamily: FONTS[params.fontIndex].id,
        filter: FILTERS[params.filterIndex].id,
        bgGradient: !params.mediaUri ? JSON.stringify(BG_GRADIENTS[params.bgGradientIndex]) : undefined,
        stickerData: params.stickers.length > 0 ? params.stickers : undefined,
        closeFriendsOnly: params.closeFriendsOnly,
        subscribersOnly: params.subscribersOnly,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stories-feed'] });
      showToast({ message: t('stories.published'), variant: 'success' });
      router.back();
    },
    onError: (error: Error) => showToast({ message: error.message || t('stories.failedToPublish'), variant: 'error' }),
  });

  return {
    publishMutation,
    closeFriendsOnly,
    setCloseFriendsOnly,
    subscribersOnly,
    setSubscribersOnly,
    handleCloseFriendsToggle,
    handleSubscribersToggle,
  };
}
