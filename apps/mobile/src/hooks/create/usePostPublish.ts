import { useState, useRef } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { postsApi, uploadApi, circlesApi } from '@/services/api';
import { resizeForUpload } from '@/utils/imageResize';
import { uploadWithProgress } from '@/components/ui/UploadProgressBar';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { showToast } from '@/components/ui/Toast';
import type { TFunction } from 'i18next';
import type { Circle } from '@/types';
import type { PickedMedia } from './usePostMedia';

type Visibility = 'PUBLIC' | 'FOLLOWERS' | 'CIRCLE';

interface UsePostPublishReturn {
  // Visibility
  visibility: Visibility;
  setVisibility: (v: Visibility) => void;
  showVisibility: boolean;
  setShowVisibility: (v: boolean) => void;
  circleId: string | undefined;
  setCircleId: (v: string | undefined) => void;
  showCirclePicker: boolean;
  setShowCirclePicker: (v: boolean) => void;
  circles: Circle[];
  circlesQuery: ReturnType<typeof useQuery>;

  // Upload
  uploading: boolean;
  uploadProgress: number;
  uploadAbortRef: React.MutableRefObject<(() => void) | null>;

  // Publish fields
  altText: string;
  setAltText: (v: string) => void;
  taggedUsers: string[];
  setTaggedUsers: React.Dispatch<React.SetStateAction<string[]>>;
  tagSearchQuery: string;
  setTagSearchQuery: (v: string) => void;
  collaboratorUsername: string;
  setCollaboratorUsername: (v: string) => void;
  commentControl: 'everyone' | 'followers' | 'nobody';
  setCommentControl: (v: 'everyone' | 'followers' | 'nobody') => void;
  shareToFeed: boolean;
  setShareToFeed: (v: boolean) => void;
  brandedContent: boolean;
  setBrandedContent: (v: boolean) => void;
  brandPartner: string;
  setBrandPartner: (v: string) => void;
  remixAllowed: boolean;
  setRemixAllowed: (v: boolean) => void;
  selectedTopics: string[];
  setSelectedTopics: React.Dispatch<React.SetStateAction<string[]>>;
  scheduledAt: string | null;
  setScheduledAt: (v: string | null) => void;
  showScheduleSheet: boolean;
  setShowScheduleSheet: (v: boolean) => void;
  showTopics: boolean;
  setShowTopics: (v: boolean) => void;

  // Autocomplete
  autocompleteType: 'hashtag' | 'mention' | null;
  setAutocompleteType: (v: 'hashtag' | 'mention' | null) => void;
  autocompleteQuery: string;
  setAutocompleteQuery: (v: string) => void;
  showAutocomplete: boolean;
  setShowAutocomplete: (v: boolean) => void;

  // Discard / Location
  showDiscardSheet: boolean;
  setShowDiscardSheet: (v: boolean) => void;
  showLocationPicker: boolean;
  setShowLocationPicker: (v: boolean) => void;
  location: { name: string; latitude?: number; longitude?: number } | null;
  setLocation: (v: { name: string; latitude?: number; longitude?: number } | null) => void;

  // Mutation
  createMutation: ReturnType<typeof useMutation<unknown, Error, void>>;
  canPost: boolean;
}

export function usePostPublish(
  getMediaAndContent: () => { media: PickedMedia[]; content: string },
  clearDraft: () => Promise<void>,
  t: TFunction,
): UsePostPublishReturn {
  const router = useRouter();
  const queryClient = useQueryClient();
  const haptic = useContextualHaptic();

  // Visibility
  const [visibility, setVisibility] = useState<Visibility>('PUBLIC');
  const [showVisibility, setShowVisibility] = useState(false);
  const [circleId, setCircleId] = useState<string | undefined>();
  const [showCirclePicker, setShowCirclePicker] = useState(false);

  // Upload
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const uploadAbortRef = useRef<(() => void) | null>(null);

  // Autocomplete
  const [autocompleteType, setAutocompleteType] = useState<'hashtag' | 'mention' | null>(null);
  const [autocompleteQuery, setAutocompleteQuery] = useState('');
  const [showAutocomplete, setShowAutocomplete] = useState(false);

  // Discard / Location
  const [showDiscardSheet, setShowDiscardSheet] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [location, setLocation] = useState<{ name: string; latitude?: number; longitude?: number } | null>(null);

  // Publish fields
  const [altText, setAltText] = useState('');
  const [taggedUsers, setTaggedUsers] = useState<string[]>([]);
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [collaboratorUsername, setCollaboratorUsername] = useState('');
  const [commentControl, setCommentControl] = useState<'everyone' | 'followers' | 'nobody'>('everyone');
  const [shareToFeed, setShareToFeed] = useState(true);
  const [brandedContent, setBrandedContent] = useState(false);
  const [brandPartner, setBrandPartner] = useState('');
  const [remixAllowed, setRemixAllowed] = useState(true);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const [showScheduleSheet, setShowScheduleSheet] = useState(false);
  const [showTopics, setShowTopics] = useState(false);

  const circlesQuery = useQuery({
    queryKey: ['my-circles'],
    queryFn: () => circlesApi.getMyCircles(),
    enabled: visibility === 'CIRCLE',
  });
  const circles: Circle[] = (circlesQuery.data ?? []) as Circle[];

  const createMutation = useMutation({
    mutationFn: async () => {
      const { media, content } = getMediaAndContent();
      setUploading(media.length > 0);
      setUploadProgress(0);

      const mediaUrls: string[] = [];
      const mediaTypes: string[] = [];
      let mediaWidth: number | undefined;
      let mediaHeight: number | undefined;

      for (let i = 0; i < media.length; i++) {
        const item = media[i];
        let uploadUri = item.uri;
        let uploadWidth = item.width;
        let uploadHeight = item.height;
        let contentType: string;
        if (item.type === 'image') {
          const resized = await resizeForUpload(item.uri, item.width, item.height);
          uploadUri = resized.uri;
          uploadWidth = resized.width;
          uploadHeight = resized.height;
          contentType = resized.mimeType;
        } else {
          const ext = uploadUri.split('?')[0].split('.').pop()?.toLowerCase() ?? 'mp4';
          contentType = `video/${ext}`;
        }
        const { uploadUrl, publicUrl } = await uploadApi.getPresignUrl(contentType, 'posts');

        const fileRes = await fetch(uploadUri);
        const blob = await fileRes.blob();

        const baseProgress = (i / media.length) * 100;
        const itemWeight = 100 / media.length;
        const { promise, abort } = uploadWithProgress(
          uploadUrl,
          blob,
          contentType,
          (percent) => setUploadProgress(baseProgress + (percent / 100) * itemWeight),
        );
        uploadAbortRef.current = abort;
        await promise;

        mediaUrls.push(publicUrl);
        mediaTypes.push(item.type);
        if (mediaWidth === undefined && uploadWidth) {
          mediaWidth = uploadWidth;
          mediaHeight = uploadHeight;
        }
      }

      uploadAbortRef.current = null;
      setUploading(false);

      const postType =
        mediaUrls.length === 0 ? 'TEXT'
        : mediaUrls.length > 1 ? 'CAROUSEL'
        : mediaTypes[0] === 'video' ? 'VIDEO'
        : 'IMAGE';

      return postsApi.create({
        content: content.trim() || undefined,
        postType,
        mediaUrls,
        mediaTypes,
        mediaWidth,
        mediaHeight,
        visibility,
        circleId: visibility === 'CIRCLE' ? circleId : undefined,
        locationName: location?.name,
        locationLat: location?.latitude,
        locationLng: location?.longitude,
        altText: altText.trim() || undefined,
        taggedUserIds: taggedUsers.length > 0 ? taggedUsers : undefined,
        collaboratorUsername: collaboratorUsername.trim() || undefined,
        commentPermission: commentControl === 'nobody' ? 'NOBODY' : commentControl === 'followers' ? 'FOLLOWERS' : 'EVERYONE',
        shareToFeed,
        brandedContent,
        brandPartner: brandedContent ? brandPartner.trim() || undefined : undefined,
        remixAllowed,
        topics: selectedTopics.length > 0 ? selectedTopics : undefined,
        scheduledAt: scheduledAt ?? undefined,
      });
    },
    onSuccess: async () => {
      haptic.success();
      queryClient.invalidateQueries({ queryKey: ['saf-feed'] });
      await clearDraft().catch(() => {});
      showToast({ message: t('compose.postPublished'), variant: 'success' });
      router.back();
    },
    onError: (err: Error) => {
      haptic.error();
      setUploading(false);
      showToast({ message: err.message || t('compose.failedToCreatePost'), variant: 'error' });
    },
  });

  const { media, content } = getMediaAndContent();
  const canPost = (content.trim().length > 0 || media.length > 0) && !createMutation.isPending;

  return {
    visibility, setVisibility, showVisibility, setShowVisibility,
    circleId, setCircleId, showCirclePicker, setShowCirclePicker,
    circles, circlesQuery,
    uploading, uploadProgress, uploadAbortRef,
    altText, setAltText,
    taggedUsers, setTaggedUsers, tagSearchQuery, setTagSearchQuery,
    collaboratorUsername, setCollaboratorUsername,
    commentControl, setCommentControl,
    shareToFeed, setShareToFeed,
    brandedContent, setBrandedContent, brandPartner, setBrandPartner,
    remixAllowed, setRemixAllowed,
    selectedTopics, setSelectedTopics,
    scheduledAt, setScheduledAt, showScheduleSheet, setShowScheduleSheet,
    showTopics, setShowTopics,
    autocompleteType, setAutocompleteType,
    autocompleteQuery, setAutocompleteQuery,
    showAutocomplete, setShowAutocomplete,
    showDiscardSheet, setShowDiscardSheet,
    showLocationPicker, setShowLocationPicker,
    location, setLocation,
    createMutation, canPost,
  };
}
