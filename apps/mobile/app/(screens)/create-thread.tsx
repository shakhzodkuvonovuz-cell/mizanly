import { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Avatar } from '@/components/ui/Avatar';
import { colors, spacing, fontSize } from '@/theme';
import { threadsApi, uploadApi } from '@/services/api';

const CHAR_LIMIT = 500;

interface ChainPart {
  content: string;
  media: { uri: string; type: 'image' | 'video' }[];
}

function ThreadPart({
  part,
  index,
  isLast,
  onChange,
  onAddMedia,
  onRemoveMedia,
  showLine,
  avatar,
  name,
}: {
  part: ChainPart;
  index: number;
  isLast: boolean;
  onChange: (content: string) => void;
  onAddMedia: () => void;
  onRemoveMedia: (mi: number) => void;
  showLine: boolean;
  avatar?: string;
  name: string;
}) {
  return (
    <View style={styles.part}>
      <View style={styles.partLeft}>
        <Avatar uri={avatar} name={name} size="md" />
        {showLine && <View style={styles.chainLine} />}
      </View>
      <View style={styles.partRight}>
        <Text style={styles.partUser}>{name}</Text>
        <TextInput
          style={styles.partInput}
          placeholder={index === 0 ? "What's on your mind?" : 'Continue the thread…'}
          placeholderTextColor={colors.text.tertiary}
          value={part.content}
          onChangeText={onChange}
          multiline
          maxLength={CHAR_LIMIT}
          autoFocus={index === 0}
        />
        {/* Media thumbnails */}
        {part.media.length > 0 && (
          <ScrollView
            horizontal showsHorizontalScrollIndicator={false}
            style={styles.mediaRow}
            contentContainerStyle={{ gap: spacing.xs }}
          >
            {part.media.map((item, mi) => (
              <View key={mi} style={styles.thumb}>
                <Image source={{ uri: item.uri }} style={styles.thumbImg} contentFit="cover" />
                <TouchableOpacity style={styles.removeThumb} onPress={() => onRemoveMedia(mi)} hitSlop={4}>
                  <Text style={styles.removeThumbText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}
        {/* Part toolbar */}
        <View style={styles.partToolbar}>
          <TouchableOpacity onPress={onAddMedia} disabled={part.media.length >= 4} hitSlop={8}>
            <Text style={[styles.partToolbarIcon, part.media.length >= 4 && styles.toolbarDisabled]}>🖼️</Text>
          </TouchableOpacity>
          <Text style={[styles.partCharCount, part.content.length > CHAR_LIMIT * 0.8 && styles.charCountWarn]}>
            {CHAR_LIMIT - part.content.length}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function CreateThreadScreen() {
  const router = useRouter();
  const { user } = useUser();
  const queryClient = useQueryClient();

  const [parts, setParts] = useState<ChainPart[]>([{ content: '', media: [] }]);

  const addPart = () => {
    if (parts.length >= 10) return;
    setParts((prev) => [...prev, { content: '', media: [] }]);
  };

  const updateContent = (index: number, content: string) => {
    setParts((prev) => prev.map((p, i) => (i === index ? { ...p, content } : p)));
  };

  const pickMedia = async (index: number) => {
    const part = parts[index];
    if (part.media.length >= 4) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 4 - part.media.length,
      quality: 0.85,
    });
    if (!result.canceled) {
      const picked = result.assets.map((a) => ({ uri: a.uri, type: 'image' as const }));
      setParts((prev) =>
        prev.map((p, i) =>
          i === index ? { ...p, media: [...p.media, ...picked].slice(0, 4) } : p
        )
      );
    }
  };

  const removeMedia = (partIndex: number, mediaIndex: number) => {
    setParts((prev) =>
      prev.map((p, i) =>
        i === partIndex ? { ...p, media: p.media.filter((_, mi) => mi !== mediaIndex) } : p
      )
    );
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      // Upload media for each part
      const partsWithUrls = await Promise.all(
        parts
          .filter((p) => p.content.trim().length > 0 || p.media.length > 0)
          .map(async (part) => {
            const mediaUrls: string[] = [];
            const mediaTypes: string[] = [];
            for (const item of part.media) {
              const ext = item.uri.split('.').pop() ?? 'jpg';
              const { uploadUrl, publicUrl } = await uploadApi.getPresignUrl(`image/${ext}`, 'threads');
              const blob = await (await fetch(item.uri)).blob();
              await fetch(uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': `image/${ext}` } });
              mediaUrls.push(publicUrl);
              mediaTypes.push('image');
            }
            return { content: part.content.trim(), mediaUrls, mediaTypes };
          })
      );

      if (partsWithUrls.length === 0) throw new Error('Thread is empty');

      // Post each part — first creates the chain head, rest are chained
      let headId: string | undefined;
      for (const part of partsWithUrls) {
        const thread = await threadsApi.create({
          ...part,
          isChainHead: !headId,
          chainId: headId,
        });
        if (!headId) headId = thread.id;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['majlis-feed'] });
      router.back();
    },
    onError: (err: Error) => {
      Alert.alert('Error', err.message || 'Failed to post thread.');
    },
  });

  const canPost = parts.some((p) => p.content.trim().length > 0 || p.media.length > 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Thread</Text>
        <TouchableOpacity
          style={[styles.postBtn, !canPost && styles.postBtnDisabled]}
          onPress={() => canPost && createMutation.mutate()}
          disabled={!canPost || createMutation.isPending}
        >
          {createMutation.isPending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.postBtnText}>Post</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
        {parts.map((part, index) => (
          <ThreadPart
            key={index}
            part={part}
            index={index}
            isLast={index === parts.length - 1}
            showLine={index < parts.length - 1}
            onChange={(content) => updateContent(index, content)}
            onAddMedia={() => pickMedia(index)}
            onRemoveMedia={(mi) => removeMedia(index, mi)}
            avatar={user?.imageUrl}
            name={user?.fullName ?? user?.username ?? 'Me'}
          />
        ))}

        {/* Add thread part */}
        {parts.length < 10 && (
          <TouchableOpacity style={styles.addPartBtn} onPress={addPart}>
            <View style={styles.addPartLine} />
            <Avatar uri={user?.imageUrl} name={user?.fullName ?? 'Me'} size="sm" />
            <Text style={styles.addPartText}>Add to thread…</Text>
          </TouchableOpacity>
        )}
        <View style={{ height: 80 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  cancelText: { color: colors.text.secondary, fontSize: fontSize.base },
  headerTitle: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },
  postBtn: {
    backgroundColor: colors.emerald, borderRadius: 20,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.xs + 2,
    minWidth: 60, alignItems: 'center',
  },
  postBtnDisabled: { backgroundColor: colors.dark.surface },
  postBtnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700' },

  body: { flex: 1 },

  // Thread part
  part: {
    flexDirection: 'row', paddingHorizontal: spacing.base, paddingTop: spacing.md,
  },
  partLeft: { alignItems: 'center', marginRight: spacing.sm, width: 42 },
  chainLine: { width: 2, flex: 1, backgroundColor: colors.dark.border, marginTop: spacing.xs, borderRadius: 1 },
  partRight: { flex: 1, paddingBottom: spacing.md },
  partUser: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700', marginBottom: spacing.xs },
  partInput: {
    color: colors.text.primary, fontSize: fontSize.base, lineHeight: 23,
    minHeight: 60, textAlignVertical: 'top',
  },
  mediaRow: { marginTop: spacing.xs },
  thumb: {
    width: 80, height: 80, borderRadius: 8, overflow: 'hidden',
    backgroundColor: colors.dark.bgElevated,
  },
  thumbImg: { width: '100%', height: '100%' },
  removeThumb: {
    position: 'absolute', top: 3, right: 3,
    backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 8,
    width: 18, height: 18, alignItems: 'center', justifyContent: 'center',
  },
  removeThumbText: { color: '#fff', fontSize: 10 },
  partToolbar: {
    flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, gap: spacing.md,
  },
  partToolbarIcon: { fontSize: 20 },
  toolbarDisabled: { opacity: 0.3 },
  partCharCount: { color: colors.text.tertiary, fontSize: fontSize.xs, marginLeft: 'auto' },
  charCountWarn: { color: colors.warning },

  // Add part
  addPartBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.base, paddingVertical: spacing.md, gap: spacing.sm,
  },
  addPartLine: {
    width: 2, height: 20, backgroundColor: colors.dark.border,
    borderRadius: 1, marginLeft: 20, marginRight: spacing.xs,
  },
  addPartText: { color: colors.text.tertiary, fontSize: fontSize.base },
});
