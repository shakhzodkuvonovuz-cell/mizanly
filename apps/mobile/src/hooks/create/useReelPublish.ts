import { useState } from 'react';
import { Alert } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { reelsApi, uploadApi } from '@/services/api';
import { resizeForUpload } from '@/utils/imageResize';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { showToast } from '@/components/ui/Toast';
import type { TFunction } from 'i18next';
import type { AudioTrack } from '@/types';

interface UploadParams {
  videoUri: string;
  videoDuration: number;
  caption: string;
  hashtags: string[];
  mentions: string[];
  normalizeAudio: boolean;
  thumbnailUri: string | null;
  selectedTrack: AudioTrack | null;
  isDuet: boolean;
  duetOfId?: string;
  isStitch: boolean;
  stitchOfId?: string;
}

interface UseReelPublishReturn {
  isUploading: boolean;
  uploadMutation: ReturnType<typeof useMutation<unknown, Error, void>>;
  handleUpload: () => void;
  handleBack: (hasContent: boolean) => void;
}

export function useReelPublish(
  getParams: () => UploadParams | null,
  t: TFunction,
): UseReelPublishReturn {
  const router = useRouter();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const haptic = useContextualHaptic();
  const [isUploading, setIsUploading] = useState(false);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const params = getParams();
      if (!params) throw new Error('No video selected');

      setIsUploading(true);
      try {
        // Step 1: Upload video to R2
        const presign = await uploadApi.getPresignUrl('video/mp4', 'reels');
        const videoUploadRes = await fetch(presign.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'video/mp4' },
          body: await fetch(params.videoUri).then(r => r.blob()),
        });
        if (!videoUploadRes.ok) throw new Error('Video upload failed');

        // Step 2: Upload thumbnail if we have one
        let thumbnailUrl = presign.publicUrl;
        if (params.thumbnailUri) {
          const resizedThumb = await resizeForUpload(params.thumbnailUri);
          const thumbPresign = await uploadApi.getPresignUrl(resizedThumb.mimeType, 'thumbnails');
          const thumbResponse = await fetch(resizedThumb.uri);
          const thumbBlob = await thumbResponse.blob();
          await fetch(thumbPresign.uploadUrl, { method: 'PUT', body: thumbBlob, headers: { 'Content-Type': resizedThumb.mimeType } });
          thumbnailUrl = thumbPresign.publicUrl;
        }

        // Step 3: Create reel
        return await reelsApi.create({
          videoUrl: presign.publicUrl,
          thumbnailUrl,
          duration: params.videoDuration,
          caption: params.caption,
          hashtags: params.hashtags,
          mentions: params.mentions,
          normalizeAudio: params.normalizeAudio,
          audioTrackId: params.selectedTrack?.id,
          isDuet: params.isDuet,
          duetOfId: params.duetOfId,
          isStitch: params.isStitch,
          stitchOfId: params.stitchOfId,
        });
      } finally {
        setIsUploading(false);
      }
    },
    onSuccess: () => {
      haptic.success();
      queryClient.invalidateQueries({ queryKey: ['reels-feed'] });
      queryClient.invalidateQueries({ queryKey: ['reel', user?.id] });
      router.back();
    },
    onError: (error: Error) => {
      haptic.error();
      showToast({ message: error.message || t('common.somethingWentWrong'), variant: 'error' });
    },
  });

  const handleUpload = () => {
    if (uploadMutation.isPending) return;
    const params = getParams();
    if (!params) {
      showToast({ message: t('createReel.selectVideoFirst'), variant: 'error' });
      return;
    }
    if (params.caption.length > 500) {
      showToast({ message: t('createReel.maxCharacters', { max: 500 }), variant: 'error' });
      return;
    }
    uploadMutation.mutate();
  };

  const handleBack = (hasContent: boolean) => {
    if (hasContent) {
      Alert.alert(t('createReel.discardTitle'), t('createReel.discardMessage'), [
        { text: t('createReel.keepEditing') },
        { text: t('createReel.discard'), style: 'destructive', onPress: () => router.back() },
      ]);
    } else {
      router.back();
    }
  };

  return {
    isUploading,
    uploadMutation,
    handleUpload,
    handleBack,
  };
}
