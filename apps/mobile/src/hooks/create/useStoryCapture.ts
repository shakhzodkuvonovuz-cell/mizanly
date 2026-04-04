import { useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { showToast } from '@/components/ui/Toast';
import type { TFunction } from 'i18next';

interface UseStoryCaptureReturn {
  mediaUri: string | null;
  setMediaUri: (uri: string | null) => void;
  mediaType: 'image' | 'video';
  setMediaType: (type: 'image' | 'video') => void;
  pickMedia: () => Promise<void>;
  takePhoto: () => Promise<void>;
}

export function useStoryCapture(t: TFunction): UseStoryCaptureReturn {
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');

  const pickMedia = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showToast({ message: t('stories.mediaPermissionRequired', 'Media library permission required'), variant: 'error' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.9,
      exif: false,
    });
    if (!result.canceled && result.assets[0]) {
      setMediaUri(result.assets[0].uri);
      setMediaType(result.assets[0].type === 'video' ? 'video' : 'image');
    }
  }, [t]);

  const takePhoto = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.9,
      exif: false,
    });
    if (!result.canceled && result.assets[0]) {
      setMediaUri(result.assets[0].uri);
      setMediaType(result.assets[0].type === 'video' ? 'video' : 'image');
    }
  }, []);

  return {
    mediaUri,
    setMediaUri,
    mediaType,
    setMediaType,
    pickMedia,
    takePhoto,
  };
}
