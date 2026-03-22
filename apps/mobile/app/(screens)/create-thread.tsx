import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput,
  ScrollView, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { Autocomplete } from '@/components/ui/Autocomplete';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { Circle } from '@/types';
import { threadsApi, uploadApi, circlesApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

type Visibility = 'PUBLIC' | 'FOLLOWERS' | 'CIRCLE';
type VisIconName = React.ComponentProps<typeof Icon>['name'];
const VISIBILITY_KEYS: { value: Visibility; labelKey: string; iconName: VisIconName }[] = [
  { value: 'PUBLIC', labelKey: 'compose.visibility.everyone', iconName: 'globe' },
  { value: 'FOLLOWERS', labelKey: 'compose.visibility.followers', iconName: 'users' },
  { value: 'CIRCLE', labelKey: 'compose.visibility.circle', iconName: 'lock' },
];

const CHAR_LIMIT = 500;
const THREAD_DRAFT_KEY = 'draft:thread';

type AutocompleteType = 'hashtag' | 'mention' | null;
interface AutocompleteState {
  partIndex: number | null;
  type: AutocompleteType;
  query: string;
}

interface ChainPart {
  content: string;
  media: { uri: string; type: 'image' | 'video' }[];
}

interface ThreadPartProps {
  part: ChainPart;
  index: number;
  isLast: boolean;
  onChange: (content: string) => void;
  onAddMedia: () => void;
  onRemoveMedia: (mi: number) => void;
  onTogglePoll?: () => void;
  hasPoll?: boolean;
  showLine: boolean;
  avatar?: string;
  name: string;
  autocomplete: AutocompleteState;
  setAutocomplete: (state: AutocompleteState) => void;
  setShowAutocomplete: (show: boolean) => void;
  inputRef: (index: number, ref: TextInput | null) => void;
}

function ThreadPart({
  part,
  index,
  isLast,
  onChange,
  onAddMedia,
  onRemoveMedia,
  onTogglePoll,
  hasPoll,
  showLine,
  avatar,
  name,
  autocomplete,
  setAutocomplete,
  setShowAutocomplete,
  inputRef,
}: ThreadPartProps) {
  const { t } = useTranslation();
  const tc = useThemeColors();
  return (
    <Animated.View entering={FadeInUp.delay(index * 100)} style={styles.part}>
      <View style={styles.partLeft}>
        <Avatar uri={avatar} name={name} size="md" />
        {showLine && (
          <LinearGradient
            colors={[colors.active.emerald20, colors.active.emerald10, 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.chainLineGradient}
          />
        )}
      </View>

      {/* Glassmorphism composer card */}
      <LinearGradient
        colors={['rgba(45,53,72,0.3)', 'rgba(28,35,51,0.15)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.partCard}
      >
        <View style={styles.partRight}>
          <Text style={styles.partUser}>{name}</Text>
          <TextInput
            ref={(ref) => inputRef(index, ref)}
            style={styles.partInput}
            placeholder={index === 0 ? t('compose.whatsOnYourMind') : t('compose.continueThread')}
            placeholderTextColor={colors.text.tertiary}
            accessibilityLabel={index === 0 ? t('accessibility.threadContent') : t('accessibility.threadContinuation')}
            value={part.content}
            onChangeText={(text) => {
              onChange(text);

              // Detect if typing a hashtag or mention
              const cursorPos = text.length;
              const textBeforeCursor = text.slice(0, cursorPos);

              // Check for hashtag pattern: #word
              const hashMatch = textBeforeCursor.match(/#([a-zA-Z0-9_\u0600-\u06FF]*)$/);
              if (hashMatch) {
                setAutocomplete({ partIndex: index, type: 'hashtag', query: hashMatch[1] });
                setShowAutocomplete(true);
                return;
              }

              // Check for mention pattern: @word
              const mentionMatch = textBeforeCursor.match(/@([a-zA-Z0-9_\.]*)$/);
              if (mentionMatch) {
                setAutocomplete({ partIndex: index, type: 'mention', query: mentionMatch[1] });
                setShowAutocomplete(true);
                return;
              }

              // If this part was showing autocomplete, hide it
              if (autocomplete.partIndex === index) {
                setShowAutocomplete(false);
                setAutocomplete({ partIndex: null, type: null, query: '' });
              }
            }}
            multiline
            maxLength={CHAR_LIMIT}
            autoFocus={index === 0}
          />

          {/* Premium media thumbnails */}
          {part.media.length > 0 && (
            <ScrollView
              horizontal showsHorizontalScrollIndicator={false}
              style={styles.mediaRow}
              contentContainerStyle={{ gap: spacing.sm }}
            >
              {part.media.map((item, mi) => (
                <Animated.View key={mi} entering={FadeInUp.delay(mi * 50)} style={styles.mediaCard}>
                  <LinearGradient
                    colors={['rgba(45,53,72,0.5)', 'rgba(28,35,51,0.3)']}
                    style={styles.mediaCardGradient}
                  >
                    <Image source={{ uri: item.uri }} style={styles.thumbImgEnhanced} contentFit="cover" />
                    <Pressable style={styles.removeThumb} onPress={() => onRemoveMedia(mi)} hitSlop={4}>
                      <LinearGradient
                        colors={['rgba(248,81,73,0.9)', 'rgba(200,60,50,0.9)']}
                        style={styles.removeThumbGradient}
                      >
                        <Icon name="x" size={10} color="#fff" />
                      </LinearGradient>
                    </Pressable>
                  </LinearGradient>
                </Animated.View>
              ))}
            </ScrollView>
          )}

          {/* Premium gradient toolbar */}
          <View style={styles.partToolbar}>
            <Pressable onPress={onAddMedia} disabled={part.media.length >= 4} hitSlop={8}>
              <LinearGradient
                colors={part.media.length >= 4 ? ['rgba(110,119,129,0.2)', 'rgba(110,119,129,0.1)'] : ['rgba(10,123,79,0.15)', 'rgba(10,123,79,0.05)']}
                style={[styles.toolbarBtnGradient, part.media.length >= 4 && styles.toolbarBtnDisabled]}
              >
                <Icon name="image" size="sm" color={part.media.length >= 4 ? colors.text.tertiary : colors.emerald} />
              </LinearGradient>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (autocomplete.partIndex === index && autocomplete.type === 'hashtag') {
                  setShowAutocomplete(false);
                  setAutocomplete({ partIndex: null, type: null, query: '' });
                } else {
                  const newContent = part.content + '#';
                  onChange(newContent);
                  setAutocomplete({ partIndex: index, type: 'hashtag', query: '' });
                  setShowAutocomplete(true);
                }
              }}
              hitSlop={8}
            >
              <LinearGradient
                colors={autocomplete.partIndex === index && autocomplete.type === 'hashtag' ? [colors.active.emerald10, 'rgba(10,123,79,0.05)'] : ['rgba(45,53,72,0.3)', 'rgba(45,53,72,0.1)']}
                style={styles.toolbarBtnGradient}
              >
                <Icon name="hash" size="sm" color={autocomplete.partIndex === index && autocomplete.type === 'hashtag' ? colors.emerald : colors.text.secondary} />
              </LinearGradient>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (autocomplete.partIndex === index && autocomplete.type === 'mention') {
                  setShowAutocomplete(false);
                  setAutocomplete({ partIndex: null, type: null, query: '' });
                } else {
                  const newContent = part.content + '@';
                  onChange(newContent);
                  setAutocomplete({ partIndex: index, type: 'mention', query: '' });
                  setShowAutocomplete(true);
                }
              }}
              hitSlop={8}
            >
              <LinearGradient
                colors={autocomplete.partIndex === index && autocomplete.type === 'mention' ? [colors.active.emerald10, 'rgba(10,123,79,0.05)'] : ['rgba(45,53,72,0.3)', 'rgba(45,53,72,0.1)']}
                style={styles.toolbarBtnGradient}
              >
                <Icon name="at-sign" size="sm" color={autocomplete.partIndex === index && autocomplete.type === 'mention' ? colors.emerald : colors.text.secondary} />
              </LinearGradient>
            </Pressable>

            {onTogglePoll && (
              <Pressable onPress={onTogglePoll} hitSlop={8}>
                <LinearGradient
                  colors={hasPoll ? [colors.active.emerald10, 'rgba(10,123,79,0.05)'] : ['rgba(45,53,72,0.3)', 'rgba(45,53,72,0.1)']}
                  style={styles.toolbarBtnGradient}
                >
                  <Icon name="bar-chart-2" size="sm" color={hasPoll ? colors.emerald : colors.text.secondary} />
                </LinearGradient>
              </Pressable>
            )}

            <View style={styles.toolbarSpacer} />
            <CharCountRing current={part.content.length} max={CHAR_LIMIT} size={24} />
          </View>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

export default function CreateThreadScreen() {
  const router = useRouter();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const [parts, setParts] = useState<ChainPart[]>([{ content: '', media: [] }]);
  const [visibility, setVisibility] = useState<Visibility>('PUBLIC');
  const [showVisibility, setShowVisibility] = useState(false);
  const [circleId, setCircleId] = useState<string | undefined>();
  const [showCirclePicker, setShowCirclePicker] = useState(false);
  const [poll, setPoll] = useState<{ question: string; options: string[]; allowMultiple: boolean } | null>(null);

  // Autocomplete state - tracks which part is currently showing autocomplete
  const [autocomplete, setAutocomplete] = useState<AutocompleteState>({
    partIndex: null,
    type: null,
    query: '',
  });
  const [showAutocomplete, setShowAutocomplete] = useState(false);

  // Refs for each part's input
  const inputRefs = useRef<Map<number, TextInput>>(new Map());
  const draftSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load draft on mount
  useEffect(() => {
    const loadDraft = async () => {
      try {
        const saved = await AsyncStorage.getItem(THREAD_DRAFT_KEY);
        if (saved) {
          const draft = JSON.parse(saved);
          if (draft.parts) setParts(draft.parts);
        }
      } catch (err) {
        // ignore
      }
    };
    loadDraft();

    return () => {
      if (draftSaveRef.current) clearTimeout(draftSaveRef.current);
    };
  }, []);

  // Debounced auto-save
  const saveDraft = useCallback(() => {
    if (draftSaveRef.current) clearTimeout(draftSaveRef.current);
    draftSaveRef.current = setTimeout(async () => {
      try {
        const hasContent = parts.some((p) => p.content.trim() || p.media.length > 0);
        if (!hasContent) {
          await AsyncStorage.removeItem(THREAD_DRAFT_KEY);
          return;
        }
        await AsyncStorage.setItem(THREAD_DRAFT_KEY, JSON.stringify({ parts }));
      } catch (err) {
        // ignore
      }
    }, 2000);
  }, [parts]);

  // Auto-save when parts changes
  useEffect(() => {
    saveDraft();
  }, [saveDraft]);

  const circlesQuery = useQuery({
    queryKey: ['my-circles'],
    queryFn: () => circlesApi.getMyCircles(),
    enabled: visibility === 'CIRCLE',
  });
  const circles: Circle[] = (circlesQuery.data ?? []) as Circle[];
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
          // Visibility + circle + poll only on the head
          ...(!headId ? {
            visibility,
            circleId: visibility === 'CIRCLE' ? circleId : undefined,
            poll: poll && poll.question.trim() && poll.options.filter(Boolean).length >= 2
              ? {
                  question: poll.question.trim(),
                  options: poll.options
                    .filter((o) => o.trim())
                    .map((text, position) => ({ text: text.trim(), position })),
                  allowMultiple: poll.allowMultiple,
                }
              : undefined,
          } : {}),
        });
        if (!headId) headId = thread.id;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['majlis-feed'] });
      AsyncStorage.removeItem(THREAD_DRAFT_KEY).catch(() => {});
      router.back();
    },
    onError: (err: Error) => {
      Alert.alert(t('common.error'), err.message || t('compose.failedToPostThread'));
    },
  });

  const canPost = parts.some((p) => p.content.trim().length > 0 || p.media.length > 0);

  const handleBack = () => {
    const hasContent = parts.some((p) => p.content.trim() || p.media.length > 0);
    if (hasContent) {
      Alert.alert(t('compose.discardThread'), t('compose.unsavedContent'), [
        { text: t('compose.keepEditing') },
        { text: t('compose.discard'), style: 'destructive', onPress: () => {
          AsyncStorage.removeItem(THREAD_DRAFT_KEY).catch(() => {});
          router.back();
        }},
      ]);
    } else {
      router.back();
    }
  };

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: tc.border }]}>
          <Pressable onPress={handleBack} hitSlop={8}>
            <Icon name="x" size="md" color={colors.text.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('majlis.newThread')}</Text>
          <GradientButton
            label={t('common.post')}
            size="sm"
            onPress={() => canPost && createMutation.mutate()}
            loading={createMutation.isPending}
            disabled={!canPost}
          />
        </View>

        {/* Visibility bar */}
        <View style={[styles.visBar, { borderBottomColor: tc.border }]}>
          <Pressable
            accessibilityRole="button"
            style={[styles.visPill, { backgroundColor: tc.bgElevated }]}
            onPress={() => setShowVisibility((v) => !v)}
          >

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Icon name={VISIBILITY_KEYS.find((o) => o.value === visibility)!.iconName} size={12} color={colors.text.secondary} />
              <Text style={styles.visPillText}>
                {visibility === 'CIRCLE' && selectedCircle
                  ? selectedCircle.name
                  : t(VISIBILITY_KEYS.find((o) => o.value === visibility)!.labelKey)}
              </Text>
              <Icon name="chevron-down" size={12} color={colors.text.tertiary} />
            </View>
          </Pressable>
        </View>

        <BottomSheet visible={showVisibility} onClose={() => setShowVisibility(false)}>
          {VISIBILITY_KEYS.map((opt) => (
            <BottomSheetItem
              key={opt.value}
              label={t(opt.labelKey)}
              icon={<Icon name={opt.iconName} size="sm" color={visibility === opt.value ? colors.emerald : colors.text.secondary} />}
              onPress={() => {
                setVisibility(opt.value);
                setShowVisibility(false);
                if (opt.value === 'CIRCLE') setShowCirclePicker(true);
              }}
            />
          ))}
        </BottomSheet>

        {/* Circle picker */}
        <BottomSheet visible={showCirclePicker} onClose={() => setShowCirclePicker(false)}>
          <Text style={styles.sheetTitle}>{t('compose.chooseCircle')}</Text>
          {circlesQuery.isLoading ? (
            <View style={styles.skeletonList}>
              {Array.from({ length: 3 }).map((_, i) => (
                <View key={i} style={styles.skeletonRow}>
                  <Skeleton.Circle size={36} />
                  <View style={{ flex: 1, gap: spacing.xs }}>
                    <Skeleton.Rect width={120} height={14} />
                    <Skeleton.Rect width={80} height={11} />
                  </View>
                </View>
              ))}
            </View>
          ) : circles.length === 0 ? (
            <View style={styles.emptyCircles}>
              <Text style={styles.emptyCirclesText}>{t('compose.noCirclesYet')}</Text>
              <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }} onPress={() => { setShowCirclePicker(false); router.push('/(screens)/circles'); }}>
                <Text style={styles.emptyCirclesLink}>{t('compose.createCircle')}</Text>
                <Icon name="chevron-right" size="sm" color={colors.emerald} />
              </Pressable>
            </View>
          ) : (
            circles.map((c) => (
              <BottomSheetItem
                key={c.id}
                label={c.name}
                icon={
                  <View style={styles.circleIconWrap}>
                    <Text style={styles.circleEmoji}>{c.emoji ?? '●'}</Text>
                  </View>
                }
                onPress={() => { setCircleId(c.id); setShowCirclePicker(false); }}
              />
            ))
          )}
        </BottomSheet>

        <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
          {parts.map((part, index) => (
            <View key={index}>
              <ThreadPart
                part={part}
                index={index}
                isLast={index === parts.length - 1}
                showLine={index < parts.length - 1}
                onChange={(content) => updateContent(index, content)}
                onAddMedia={() => pickMedia(index)}
                onRemoveMedia={(mi) => removeMedia(index, mi)}
                onTogglePoll={index === 0 ? () => setPoll((p) => p ? null : { question: '', options: ['', ''], allowMultiple: false }) : undefined}
                hasPoll={index === 0 && !!poll}
                avatar={user?.imageUrl}
                name={user?.fullName ?? user?.username ?? t('common.me')}
                autocomplete={autocomplete}
                setAutocomplete={setAutocomplete}
                setShowAutocomplete={setShowAutocomplete}
                inputRef={(idx, ref) => { if (ref) inputRefs.current.set(idx, ref); }}
              />
              {/* Premium Poll form — only on first part */}
              {index === 0 && poll && (
                <LinearGradient
                  colors={colors.gradient.cardDark}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.pollForm}
                >
                  <View style={styles.pollFormHeader}>
                    <LinearGradient
                      colors={[colors.gold, '#A67C00']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.pollIconContainer}
                    >
                      <Icon name="bar-chart-2" size="sm" color="#0D1117" />
                    </LinearGradient>
                    <Text style={styles.pollFormTitle}>{t('compose.poll')}</Text>
                    <Pressable onPress={() => setPoll(null)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                      <LinearGradient
                        colors={['rgba(248,81,73,0.9)', 'rgba(200,60,50,0.9)']}
                        style={styles.pollRemoveBtn}
                      >
                        <Icon name="x" size={14} color="#fff" />
                      </LinearGradient>
                    </Pressable>
                  </View>
                  <TextInput
                    style={[styles.pollQuestion, { borderBottomColor: tc.border }]}
                    placeholder={t('compose.askQuestion')}
                    placeholderTextColor={colors.text.tertiary}
                    value={poll.question}
                    onChangeText={(t) => setPoll((p) => p ? { ...p, question: t } : p)}
                    maxLength={120}
                  />
                  {poll.options.map((opt, oi) => (
                    <View key={oi} style={styles.pollOptionRow}>
                      <TextInput
                        style={[styles.pollOptionInput, { borderColor: tc.border }]}
                        placeholder={`Option ${oi + 1}`}
                        placeholderTextColor={colors.text.tertiary}
                        value={opt}
                        onChangeText={(t) => setPoll((p) => {
                          if (!p) return p;
                          const options = [...p.options];
                          options[oi] = t;
                          return { ...p, options };
                        })}
                        maxLength={80}
                      />
                      {poll.options.length > 2 && (
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => setPoll((p) => p ? { ...p, options: p.options.filter((_, i) => i !== oi) } : p)}
                          hitSlop={8}
                        >
                          <Icon name="x" size={14} color={colors.text.tertiary} />
                        </Pressable>
                      )}
                    </View>
                  ))}
                  {poll.options.length < 4 && (
                    <Pressable
                      accessibilityRole="button"
                      style={styles.pollAddOption}
                      onPress={() => setPoll((p) => p ? { ...p, options: [...p.options, ''] } : p)}
                    >
                      <Text style={styles.pollAddOptionText}>{t('compose.addOption')}</Text>
                    </Pressable>
                  )}
                  <Pressable
                    accessibilityRole="button"
                    style={styles.pollAllowMultiple}
                    onPress={() => setPoll((p) => p ? { ...p, allowMultiple: !p.allowMultiple } : p)}
                  >
                    <View style={[styles.pollCheckbox, poll.allowMultiple && styles.pollCheckboxOn]}>
                      {poll.allowMultiple && <Icon name="check" size={12} color="#fff" />}
                    </View>
                    <Text style={styles.pollAllowMultipleText}>{t('compose.allowMultipleAnswers')}</Text>
                  </Pressable>
                </LinearGradient>
              )}
            </View>
          ))}

          {/* Premium Add thread part */}
          {parts.length < 10 && (
            <Pressable style={styles.addPartBtn} onPress={addPart}>
              <LinearGradient
                colors={[colors.active.emerald20, 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.addPartLineGradient}
              />
              <LinearGradient
                colors={['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.05)']}
                style={styles.addPartAvatarContainer}
              >
                <Avatar uri={user?.imageUrl} name={user?.fullName ?? t('common.me')} size="sm" />
              </LinearGradient>
              <LinearGradient
                colors={['rgba(10,123,79,0.1)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.addPartTextContainer}
              >
                <Text style={styles.addPartText}>{t('compose.addToThread')}</Text>
              </LinearGradient>
            </Pressable>
          )}
          <View style={{ height: 80 }} />
        </ScrollView>

        {/* Autocomplete dropdown */}
        <Autocomplete
          visible={showAutocomplete}
          type={autocomplete.type || 'hashtag'}
          query={autocomplete.query}
          onSelect={(value) => {
            const idx = autocomplete.partIndex;
            if (idx === null) return;

            const partContent = parts[idx].content;
            const cursorPos = partContent.length;
            const lastHashIndex = partContent.lastIndexOf('#', cursorPos - 1);
            const lastAtIndex = partContent.lastIndexOf('@', cursorPos - 1);

            let newContent = partContent;
            if (autocomplete.type === 'hashtag' && lastHashIndex !== -1) {
              const before = partContent.slice(0, lastHashIndex);
              const after = partContent.slice(cursorPos);
              newContent = before + value + ' ' + after;
            } else if (autocomplete.type === 'mention' && lastAtIndex !== -1) {
              const before = partContent.slice(0, lastAtIndex);
              const after = partContent.slice(cursorPos);
              newContent = before + value + ' ' + after;
            }

            updateContent(idx, newContent);
          }}
          onClose={() => {
            setShowAutocomplete(false);
            setAutocomplete({ partIndex: null, type: null, query: '' });
          }}
        />
      </SafeAreaView>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.dark.border,
    backgroundColor: 'rgba(13, 17, 23, 0.92)',
  },
  headerTitle: { color: colors.text.primary, fontSize: fontSize.md, fontWeight: '700', letterSpacing: 0.2 },

  body: { flex: 1 },

  // Thread part
  part: {
    flexDirection: 'row', paddingHorizontal: spacing.base, paddingTop: spacing.md,
  },
  partLeft: { alignItems: 'center', marginRight: spacing.sm, width: 42 },
  chainLine: { width: 2, flex: 1, backgroundColor: colors.active.emerald20, marginTop: spacing.xs, borderRadius: 1 },
  partRight: { flex: 1, paddingBottom: spacing.md },
  partUser: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700', marginBottom: spacing.xs },
  partInput: {
    color: colors.text.primary, fontSize: fontSize.base, lineHeight: 23,
    minHeight: 60, textAlignVertical: 'top',
  },
  mediaRow: { marginTop: spacing.xs },
  thumb: {
    width: 80, height: 80, borderRadius: radius.sm, overflow: 'hidden',
    backgroundColor: colors.dark.bgElevated,
  },
  thumbImg: { width: '100%', height: '100%' },
  removeThumb: {
    position: 'absolute', top: 3, right: 3,
    backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: radius.sm,
    width: 18, height: 18, alignItems: 'center', justifyContent: 'center',
  },
  partToolbar: {
    flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, gap: spacing.md,
  },
  toolbarDisabled: { opacity: 0.3 },
  // Visibility
  visBar: {
    paddingHorizontal: spacing.base, paddingVertical: spacing.xs,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  visPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.dark.bgElevated, borderRadius: radius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 3,
  },
  visPillText: { color: colors.text.secondary, fontSize: fontSize.xs, fontWeight: '600' },
  visMenu: {
    backgroundColor: colors.dark.bgSheet, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.dark.border,
    marginHorizontal: spacing.base, marginBottom: spacing.sm, overflow: 'hidden',
  },
  visOption: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
  },
  visOptionActive: { backgroundColor: colors.active.emerald10 },
  visOptionText: { flex: 1, color: colors.text.secondary, fontSize: fontSize.base },
  visOptionTextActive: { color: colors.text.primary, fontWeight: '600' },

  // Circle picker sheet
  sheetTitle: {
    color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700',
    paddingHorizontal: spacing.xl, paddingBottom: spacing.sm,
  },
  skeletonList: { paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: spacing.md },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  circleIconWrap: { width: 36, height: 36, borderRadius: radius.full, backgroundColor: colors.active.emerald10, alignItems: 'center', justifyContent: 'center' },
  circleEmoji: { fontSize: 18 },
  emptyCircles: { alignItems: 'center', paddingVertical: spacing.xl, paddingHorizontal: spacing.xl, gap: spacing.sm },
  emptyCirclesText: { color: colors.text.secondary, fontSize: fontSize.base },
  emptyCirclesLink: { color: colors.emerald, fontSize: fontSize.base, fontWeight: '600' },

  // Premium thread part styling
  partCard: {
    flex: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(45,53,72,0.3)',
  },
  chainLineGradient: {
    width: 2,
    flex: 1,
    marginTop: spacing.xs,
    borderRadius: 1,
  },

  // Premium media cards
  mediaCard: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  mediaCardGradient: {
    padding: 2,
    borderRadius: radius.md,
  },
  thumbImgEnhanced: {
    width: 84,
    height: 84,
    borderRadius: radius.md - 2,
  },
  removeThumbGradient: {
    position: 'absolute',
    top: 3,
    right: 3,
    borderRadius: radius.sm,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Premium toolbar
  toolbarBtnGradient: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarBtnDisabled: {
    opacity: 0.5,
  },
  toolbarSpacer: { flex: 1 },

  // Premium Poll form
  pollForm: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.active.gold30,
    borderRadius: radius.lg,
    padding: spacing.md,
    overflow: 'hidden',
  },
  pollFormHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  pollIconContainer: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pollFormTitle: {
    flex: 1,
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '700',
  },
  pollRemoveBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pollQuestion: {
    color: colors.text.primary, fontSize: fontSize.base,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
    paddingVertical: spacing.sm, marginBottom: spacing.sm,
  },
  pollOptionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  pollOptionInput: {
    flex: 1, color: colors.text.primary, fontSize: fontSize.sm,
    borderWidth: 1, borderColor: colors.dark.border, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
  },
  pollAddOption: { paddingVertical: spacing.sm },
  pollAddOptionText: { color: colors.emerald, fontSize: fontSize.sm, fontWeight: '600' },
  pollAllowMultiple: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  pollCheckbox: {
    width: 20, height: 20, borderRadius: radius.sm,
    borderWidth: 1.5, borderColor: colors.dark.border,
    alignItems: 'center', justifyContent: 'center',
  },
  pollCheckboxOn: { backgroundColor: colors.emerald, borderColor: colors.emerald },
  pollAllowMultipleText: { color: colors.text.secondary, fontSize: fontSize.sm },

  // Premium Add part
  addPartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  addPartLineGradient: {
    width: 2,
    height: 24,
    borderRadius: 1,
    marginLeft: spacing.lg,
    marginRight: spacing.xs,
  },
  addPartAvatarContainer: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  addPartTextContainer: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  addPartText: {
    color: colors.emerald,
    fontSize: fontSize.base,
    fontWeight: '500',
  },
});
