import { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Alert, Modal, Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Avatar } from '@/components/ui/Avatar';
import { colors, spacing, fontSize } from '@/theme';
import { threadsApi, uploadApi, circlesApi } from '@/services/api';

type Visibility = 'PUBLIC' | 'FOLLOWERS' | 'CIRCLE';
const VISIBILITY_OPTIONS: { value: Visibility; label: string; icon: string }[] = [
  { value: 'PUBLIC', label: 'Everyone', icon: '🌍' },
  { value: 'FOLLOWERS', label: 'Followers', icon: '👥' },
  { value: 'CIRCLE', label: 'Circle', icon: '⭕' },
];

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
  const [visibility, setVisibility] = useState<Visibility>('PUBLIC');
  const [showVisibility, setShowVisibility] = useState(false);
  const [circleId, setCircleId] = useState<string | undefined>();
  const [showCirclePicker, setShowCirclePicker] = useState(false);

  const circlesQuery = useQuery({
    queryKey: ['my-circles'],
    queryFn: () => circlesApi.getMyCircles(),
    enabled: visibility === 'CIRCLE',
  });
  const circles: any[] = (circlesQuery.data as any[]) ?? [];
  const selectedCircle = circles.find((c) => c.id === circleId);

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
          // Visibility + circle only on the head
          ...(!headId ? { visibility, circleId: visibility === 'CIRCLE' ? circleId : undefined } : {}),
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

      {/* Visibility bar */}
      <View style={styles.visBar}>
        <TouchableOpacity
          style={styles.visPill}
          onPress={() => setShowVisibility((v) => !v)}
        >
          <Text style={styles.visPillText}>
            {visibility === 'CIRCLE' && selectedCircle
              ? `${selectedCircle.emoji ?? '⭕'} ${selectedCircle.name}`
              : `${VISIBILITY_OPTIONS.find((o) => o.value === visibility)!.icon} ${VISIBILITY_OPTIONS.find((o) => o.value === visibility)!.label}`}
            {' ▾'}
          </Text>
        </TouchableOpacity>
      </View>

      {showVisibility && (
        <View style={styles.visMenu}>
          {VISIBILITY_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.visOption, visibility === opt.value && styles.visOptionActive]}
              onPress={() => {
                setVisibility(opt.value);
                setShowVisibility(false);
                if (opt.value === 'CIRCLE') setShowCirclePicker(true);
              }}
            >
              <Text style={styles.visOptionIcon}>{opt.icon}</Text>
              <Text style={[styles.visOptionText, visibility === opt.value && styles.visOptionTextActive]}>{opt.label}</Text>
              {visibility === opt.value && <Text style={styles.visCheck}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Circle picker modal */}
      <Modal visible={showCirclePicker} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setShowCirclePicker(false)}>
          <Pressable style={styles.sheet}>
            <Text style={styles.sheetTitle}>Choose a Circle</Text>
            {circlesQuery.isLoading ? (
              <ActivityIndicator color={colors.emerald} style={{ marginVertical: 24 }} />
            ) : circles.length === 0 ? (
              <View style={styles.emptyCircles}>
                <Text style={styles.emptyCirclesText}>You haven't created any circles yet.</Text>
                <TouchableOpacity onPress={() => { setShowCirclePicker(false); router.push('/(screens)/circles'); }}>
                  <Text style={styles.emptyCirclesLink}>Create a circle →</Text>
                </TouchableOpacity>
              </View>
            ) : (
              circles.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.circleRow, circleId === c.id && styles.circleRowActive]}
                  onPress={() => { setCircleId(c.id); setShowCirclePicker(false); }}
                >
                  <Text style={styles.circleEmoji}>{c.emoji ?? '⭕'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.circleName}>{c.name}</Text>
                    <Text style={styles.circleMeta}>{c._count?.members ?? 0} members</Text>
                  </View>
                  {circleId === c.id && <Text style={styles.circleCheck}>✓</Text>}
                </TouchableOpacity>
              ))
            )}
          </Pressable>
        </Pressable>
      </Modal>

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

  // Visibility
  visBar: {
    paddingHorizontal: spacing.base, paddingVertical: spacing.xs,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  visPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.dark.bgElevated, borderRadius: 20,
    paddingHorizontal: spacing.sm, paddingVertical: 3,
  },
  visPillText: { color: colors.text.secondary, fontSize: fontSize.xs, fontWeight: '600' },
  visMenu: {
    backgroundColor: colors.dark.bgSheet, borderRadius: 12,
    borderWidth: 1, borderColor: colors.dark.border,
    marginHorizontal: spacing.base, marginBottom: spacing.sm, overflow: 'hidden',
  },
  visOption: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
  },
  visOptionActive: { backgroundColor: 'rgba(10,123,79,0.1)' },
  visOptionIcon: { fontSize: 18 },
  visOptionText: { flex: 1, color: colors.text.secondary, fontSize: fontSize.base },
  visOptionTextActive: { color: colors.text.primary, fontWeight: '600' },
  visCheck: { color: colors.emerald, fontSize: fontSize.base },

  // Circle picker modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.dark.bgSheet, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: spacing.base, paddingTop: spacing.lg, paddingBottom: spacing.xl,
    maxHeight: '60%',
  },
  sheetTitle: {
    color: colors.text.primary, fontSize: fontSize.lg, fontWeight: '700',
    textAlign: 'center', marginBottom: spacing.lg,
  },
  circleRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  circleRowActive: { backgroundColor: 'rgba(10,123,79,0.08)' },
  circleEmoji: { fontSize: 22, width: 32, textAlign: 'center' },
  circleName: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '600' },
  circleMeta: { color: colors.text.secondary, fontSize: fontSize.xs, marginTop: 2 },
  circleCheck: { color: colors.emerald, fontSize: fontSize.base, fontWeight: '700' },
  emptyCircles: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  emptyCirclesText: { color: colors.text.secondary, fontSize: fontSize.base },
  emptyCirclesLink: { color: colors.emerald, fontSize: fontSize.base, fontWeight: '600' },

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
