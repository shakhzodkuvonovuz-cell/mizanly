import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput } from 'react-native';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import type { IconName } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { showToast } from '@/components/ui/Toast';
import { useTranslation } from '@/hooks/useTranslation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { rtlFlexRow, rtlTextAlign } from '@/utils/rtl';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { api, searchApi } from '@/services/api';
import { useStore } from '@/store';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';

const TOPICS: { id: string; i18nKey: string; icon: IconName }[] = [
  { id: 'new_muslim', i18nKey: 'community.topicNewMuslim', icon: 'heart' },
  { id: 'quran', i18nKey: 'community.topicQuran', icon: 'globe' },
  { id: 'arabic', i18nKey: 'community.topicArabic', icon: 'edit' },
  { id: 'fiqh', i18nKey: 'community.topicFiqh', icon: 'layers' },
  { id: 'general', i18nKey: 'community.topicGeneral', icon: 'users' },
];

export default function MentorshipScreen() {
  const router = useRouter();
  const { t, isRTL } = useTranslation();
  const haptic = useContextualHaptic();
  const queryClient = useQueryClient();
  const user = useStore(s => s.user);
  const insets = useSafeAreaInsets();
  const doubleTapRef = useRef(false);

  const [activeTab, setActiveTab] = useState<'find' | 'mine'>('find');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [requestSheetOpen, setRequestSheetOpen] = useState(false);
  const [selectedMentorId, setSelectedMentorId] = useState<string | null>(null);
  const tc = useThemeColors();

  // Debounce search to avoid API spam on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const myMentorshipsQuery = useQuery({
    queryKey: ['my-mentorships'],
    queryFn: () => api.get<{ asMentor?: Array<Record<string, unknown>>; asMentee?: Array<Record<string, unknown>> }>('/mentorship/me'),
    enabled: activeTab === 'mine',
    staleTime: 30_000,
  });

  const searchResults = useQuery({
    queryKey: ['mentor-search', debouncedSearchQuery],
    queryFn: () => searchApi.search(debouncedSearchQuery),
    enabled: debouncedSearchQuery.length >= 2 && activeTab === 'find',
  });

  const people = (searchResults.data as { people?: Array<Record<string, unknown>> })?.people || [];

  const renderMentor = ({ item, index }: { item: Record<string, unknown>; index: number }) => (
    <Animated.View entering={FadeInUp.delay(Math.min(index, 10) * 60).duration(300)}>
      <Pressable
        accessibilityLabel={t('accessibility.sendMessage')}
        accessibilityRole="button"
        style={[styles.mentorCard, { backgroundColor: tc.bgCard, borderColor: tc.border, flexDirection: rtlFlexRow(isRTL) }]}

        onPress={() => {
          if (doubleTapRef.current) return;
          doubleTapRef.current = true;
          setTimeout(() => { doubleTapRef.current = false; }, 500);
          setSelectedMentorId(item.id as string);
          setRequestSheetOpen(true);
          haptic.tick();
        }}
      >
        <Avatar uri={item.avatarUrl as string | null} name={item.displayName as string || ''} size="lg" />
        <View style={{ flex: 1 }}>
          <Text style={[styles.mentorName, { color: tc.text.primary, textAlign: rtlTextAlign(isRTL) }]}>{item.displayName as string}</Text>
          <Text style={[styles.mentorUsername, { color: tc.text.secondary, textAlign: rtlTextAlign(isRTL) }]}>@{item.username as string}</Text>
        </View>
        <View style={styles.requestBtn}>
          <Icon name="send" size="sm" color={colors.emerald} />
        </View>
      </Pressable>
    </Animated.View>
  );

  const renderMyMentorship = ({ item, index }: { item: Record<string, unknown>; index: number }) => {
    const other = (item.mentor as Record<string, unknown>) || (item.mentee as Record<string, unknown>);
    const isMentor = !!(item.mentor as Record<string, unknown>);
    return (
      <Animated.View entering={FadeInUp.delay(index * 60).duration(300)}>
        <View style={[styles.mentorCard, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
          <Avatar uri={other?.avatarUrl as string | null} name={other?.displayName as string || ''} size="lg" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.mentorName, { color: tc.text.primary }]}>{other?.displayName as string}</Text>
            <View style={styles.badges}>
              <View style={[styles.badge, { backgroundColor: isMentor ? colors.gold + '20' : colors.emerald + '20' }]}>
                <Text style={[styles.badgeText, { color: isMentor ? colors.gold : colors.emerald }]}>
                  {isMentor ? t('community.mentee') : t('community.mentor')}
                </Text>
              </View>
              <View style={[styles.badge, { backgroundColor: (item.status === 'active' ? colors.emerald : tc.text.tertiary) + '20' }]}>
                <Text style={[styles.badgeText, { color: item.status === 'active' ? colors.emerald : tc.text.tertiary}]}>
                  {item.status as string}
                </Text>
              </View>
            </View>
            <Text style={[styles.topicText, { color: tc.text.tertiary }]}>{item.topic as string}</Text>
          </View>
        </View>
      </Animated.View>
    );
  };

  return (
    <ScreenErrorBoundary>
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('community.mentorship')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />

        {/* Tabs */}
        <View style={[styles.tabs, { marginTop: insets.top + 52 }]}>
          {(['find', 'mine'] as const).map(tab => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === tab }}
              accessibilityLabel={tab === 'find' ? t('community.findMentor') : t('community.myMentorships')}
              key={tab}
              style={[styles.tab, { backgroundColor: tc.bgCard, borderColor: tc.border }, activeTab === tab && styles.tabActive]}
              onPress={() => { setActiveTab(tab); haptic.tick(); }}
            >
              <Text style={[styles.tabText, { color: activeTab === tab ? colors.emerald : tc.text.secondary }]}>
                {tab === 'find' ? t('community.findMentor') : t('community.myMentorships')}
              </Text>
            </Pressable>
          ))}
        </View>

        {activeTab === 'find' ? (
          <>
            <View style={[styles.searchWrap, { backgroundColor: tc.bgCard, borderColor: tc.border, flexDirection: rtlFlexRow(isRTL) }]}>
              <Icon name="search" size="sm" color={tc.text.tertiary} />
              <TextInput
                style={[styles.searchInput, { color: tc.text.primary, textAlign: rtlTextAlign(isRTL) }]}
                placeholder={t('common.searchUsers')}
                placeholderTextColor={tc.text.tertiary}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
            <FlatList
              data={people}
              renderItem={renderMentor}
              keyExtractor={(item) => item.id as string}
              contentContainerStyle={styles.list}
              refreshControl={
                <BrandedRefreshControl
                  refreshing={searchResults.isRefetching}
                  onRefresh={() => searchResults.refetch()}
                />
              }
              ListEmptyComponent={
                searchResults.isLoading ? (
                  <View style={styles.skeletons}>
                    {[1, 2, 3].map(i => <Skeleton.Rect key={i} width="100%" height={80} borderRadius={radius.lg} />)}
                  </View>
                ) : (
                  <EmptyState icon="users" title={t('community.findMentor')} subtitle={t('community.findMentorHint')} />
                )
              }
            />
          </>
        ) : (
          <FlatList
            data={[
              ...((myMentorshipsQuery.data as { asMentor?: Array<Record<string, unknown>> })?.asMentor || []),
              ...((myMentorshipsQuery.data as { asMentee?: Array<Record<string, unknown>> })?.asMentee || []),
            ]}
            renderItem={renderMyMentorship}
            keyExtractor={(_, i) => `m-${i}`}
            contentContainerStyle={styles.list}
            refreshControl={
              <BrandedRefreshControl refreshing={myMentorshipsQuery.isRefetching} onRefresh={() => myMentorshipsQuery.refetch()} />
            }
            ListEmptyComponent={
              myMentorshipsQuery.isLoading ? (
                <View style={styles.skeletons}>
                  {[1, 2, 3].map(i => <Skeleton.Rect key={i} width="100%" height={80} borderRadius={radius.lg} />)}
                </View>
              ) : (
                <EmptyState icon="users" title={t('community.noMentorships')} subtitle={t('community.noMentorshipsHint')} />
              )
            }
          />
        )}

        {/* Topic Selection Sheet */}
        <BottomSheet visible={requestSheetOpen} onClose={() => setRequestSheetOpen(false)}>
          {TOPICS.map(topic => (
            <BottomSheetItem
              key={topic.id}
              label={t(topic.i18nKey, topic.id)}
              icon={<Icon name={topic.icon} size="sm" color={colors.emerald} />}
              onPress={() => {
                setRequestSheetOpen(false);
                haptic.save();
                // Send mentorship request via API
                if (selectedMentorId) {
                  api.post('/mentorship/request', { mentorId: selectedMentorId, topic: topic.id })
                    .then(() => {
                      showToast({ message: t('common.requestSent'), variant: 'success' });
                      queryClient.invalidateQueries({ queryKey: ['my-mentorships'] });
                    })
                    .catch((err: { status?: number }) => {
                      if (err?.status === 409) {
                        showToast({ message: t('community.duplicateRequest', 'Request already sent'), variant: 'info' });
                      } else {
                        showToast({ message: t('common.somethingWentWrong'), variant: 'error' });
                      }
                    });
                }
              }}
            />
          ))}
        </BottomSheet>
      </View>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabs: { flexDirection: 'row', marginHorizontal: spacing.base, marginBottom: spacing.md, gap: spacing.sm },
  tab: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center' as const, borderWidth: 1 },
  tabActive: { borderColor: colors.emerald, backgroundColor: colors.emerald + '10' },
  tabText: { fontSize: fontSize.sm, fontFamily: fonts.bodyMedium },
  tabTextActive: { color: colors.emerald },
  searchWrap: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginHorizontal: spacing.base, marginBottom: spacing.md, borderRadius: radius.md, paddingHorizontal: spacing.md, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: fontSize.base, fontFamily: fonts.body, paddingVertical: spacing.md },
  list: { paddingHorizontal: spacing.base, paddingBottom: spacing['2xl'] },
  skeletons: { gap: spacing.md },
  mentorCard: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, padding: spacing.base, borderRadius: radius.lg, borderWidth: 1, marginBottom: spacing.md },
  mentorName: { fontSize: fontSize.base, fontFamily: fonts.bodySemiBold },
  mentorUsername: { fontSize: fontSize.sm, fontFamily: fonts.body },
  requestBtn: { width: 40, height: 40, borderRadius: radius.full, backgroundColor: colors.emerald + '15', justifyContent: 'center', alignItems: 'center' },
  badges: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full },
  badgeText: { fontSize: fontSize.xs, fontFamily: fonts.bodySemiBold, textTransform: 'capitalize' as const },
  topicText: { fontSize: fontSize.xs, fontFamily: fonts.body, marginTop: spacing.xs, textTransform: 'capitalize' as const },
});
