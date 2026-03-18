import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Pressable, TextInput } from 'react-native';
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
import { useTranslation } from '@/hooks/useTranslation';
import { colors, spacing, fontSize, radius } from '@/theme';
import { searchApi } from '@/services/api';
import { useStore } from '@/store';
import { useHaptic } from '@/hooks/useHaptic';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

const TOPICS: { id: string; label: string; icon: IconName }[] = [
  { id: 'new_muslim', label: 'New Muslim Guidance', icon: 'heart' },
  { id: 'quran', label: 'Quran Studies', icon: 'globe' },
  { id: 'arabic', label: 'Arabic Language', icon: 'edit' },
  { id: 'fiqh', label: 'Fiqh & Jurisprudence', icon: 'layers' },
  { id: 'general', label: 'General Mentorship', icon: 'users' },
];

export default function MentorshipScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const haptic = useHaptic();
  const queryClient = useQueryClient();
  const user = useStore(s => s.user);

  const [activeTab, setActiveTab] = useState<'find' | 'mine'>('find');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [requestSheetOpen, setRequestSheetOpen] = useState(false);
  const [selectedMentorId, setSelectedMentorId] = useState<string | null>(null);

  const myMentorshipsQuery = useQuery({
    queryKey: ['my-mentorships'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/mentorship/me`, {
        headers: { Authorization: `Bearer ${await getToken()}` },
      });
      return res.json();
    },
    enabled: activeTab === 'mine',
  });

  const searchResults = useQuery({
    queryKey: ['mentor-search', searchQuery],
    queryFn: () => searchApi.search(searchQuery),
    enabled: searchQuery.length >= 2 && activeTab === 'find',
  });

  const people = (searchResults.data as { people?: Array<Record<string, unknown>> })?.people || [];

  const renderMentor = ({ item, index }: { item: Record<string, unknown>; index: number }) => (
    <Animated.View entering={FadeInUp.delay(index * 60).duration(300)}>
      <Pressable
        style={styles.mentorCard}

        onPress={() => {
          setSelectedMentorId(item.id as string);
          setRequestSheetOpen(true);
          haptic.light();
        }}
      >
        <Avatar uri={item.avatarUrl as string | null} name={item.displayName as string || ''} size="lg" />
        <View style={{ flex: 1 }}>
          <Text style={styles.mentorName}>{item.displayName as string}</Text>
          <Text style={styles.mentorUsername}>@{item.username as string}</Text>
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
        <View style={styles.mentorCard}>
          <Avatar uri={other?.avatarUrl as string | null} name={other?.displayName as string || ''} size="lg" />
          <View style={{ flex: 1 }}>
            <Text style={styles.mentorName}>{other?.displayName as string}</Text>
            <View style={styles.badges}>
              <View style={[styles.badge, { backgroundColor: isMentor ? colors.gold + '20' : colors.emerald + '20' }]}>
                <Text style={[styles.badgeText, { color: isMentor ? colors.gold : colors.emerald }]}>
                  {isMentor ? 'Mentee' : 'Mentor'}
                </Text>
              </View>
              <View style={[styles.badge, { backgroundColor: (item.status === 'active' ? colors.emerald : colors.text.tertiary) + '20' }]}>
                <Text style={[styles.badgeText, { color: item.status === 'active' ? colors.emerald : colors.text.tertiary }]}>
                  {item.status as string}
                </Text>
              </View>
            </View>
            <Text style={styles.topicText}>{item.topic as string}</Text>
          </View>
        </View>
      </Animated.View>
    );
  };

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          title={t('community.mentorship')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />

        {/* Tabs */}
        <View style={styles.tabs}>
          {(['find', 'mine'] as const).map(tab => (
            <Pressable
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => { setActiveTab(tab); haptic.light(); }}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === 'find' ? 'Find a Mentor' : 'My Mentorships'}
              </Text>
            </Pressable>
          ))}
        </View>

        {activeTab === 'find' ? (
          <>
            <View style={styles.searchWrap}>
              <Icon name="search" size="sm" color={colors.text.tertiary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search users..."
                placeholderTextColor={colors.text.tertiary}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
            <FlatList
              data={people}
              renderItem={renderMentor}
              keyExtractor={(item) => item.id as string}
              contentContainerStyle={styles.list}
              ListEmptyComponent={
                <EmptyState icon="users" title={t('community.findMentor')} subtitle={t('community.findMentorHint')} />
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
              <RefreshControl refreshing={myMentorshipsQuery.isRefetching} onRefresh={() => myMentorshipsQuery.refetch()} tintColor={colors.emerald} />
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
              label={topic.label}
              icon={<Icon name={topic.icon} size="sm" color={colors.emerald} />}
              onPress={() => {
                setSelectedTopic(topic.id);
                setRequestSheetOpen(false);
                haptic.success();
                // Send request — would call API
              }}
            />
          ))}
        </BottomSheet>
      </View>
    </ScreenErrorBoundary>
  );
}

async function getToken() {
  // Clerk token getter — in real app, use the auth context
  return '';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  tabs: { flexDirection: 'row', marginHorizontal: spacing.base, marginBottom: spacing.md, gap: spacing.sm },
  tab: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.dark.bgCard, alignItems: 'center', borderWidth: 1, borderColor: colors.dark.border },
  tabActive: { borderColor: colors.emerald, backgroundColor: colors.emerald + '10' },
  tabText: { color: colors.text.secondary, fontSize: fontSize.sm, fontWeight: '500' },
  tabTextActive: { color: colors.emerald },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.base, marginBottom: spacing.md, backgroundColor: colors.dark.bgCard, borderRadius: radius.md, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.dark.border },
  searchInput: { flex: 1, color: colors.text.primary, fontSize: fontSize.base, paddingVertical: spacing.md },
  list: { paddingHorizontal: spacing.base, paddingBottom: spacing['2xl'] },
  skeletons: { gap: spacing.md },
  mentorCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.dark.bgCard, padding: spacing.base, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.dark.border, marginBottom: spacing.md },
  mentorName: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '600' },
  mentorUsername: { color: colors.text.secondary, fontSize: fontSize.sm },
  requestBtn: { width: 40, height: 40, borderRadius: radius.full, backgroundColor: colors.emerald + '15', justifyContent: 'center', alignItems: 'center' },
  badges: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full },
  badgeText: { fontSize: fontSize.xs, fontWeight: '600', textTransform: 'capitalize' },
  topicText: { color: colors.text.tertiary, fontSize: fontSize.xs, marginTop: spacing.xs, textTransform: 'capitalize' },
});
