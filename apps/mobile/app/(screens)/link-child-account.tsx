import { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList,
  RefreshControl, TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { GradientButton } from '@/components/ui/GradientButton';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius } from '@/theme';
import { searchApi, parentalApi } from '@/services/api';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { showToast } from '@/components/ui/Toast';
import { rtlFlexRow, rtlTextAlign, rtlMargin } from '@/utils/rtl';
import type { User } from '@/types';

export default function LinkChildAccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptic = useContextualHaptic();
  const { t, isRTL } = useTranslation();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinStep, setPinStep] = useState<'search' | 'confirm' | 'pin' | 'confirmPin'>('search');
  const tc = useThemeColors();

  const searchResults = useQuery({
    queryKey: ['user-search-link', searchQuery],
    queryFn: () => searchApi.search(searchQuery, 'users'),
    enabled: searchQuery.length >= 2,
  });

  const results = searchResults.data as { people?: User[] } | undefined;
  const users = results?.people ?? [];

  const linkMutation = useMutation({
    mutationFn: (dto: { childUserId: string; pin: string }) =>
      parentalApi.linkChild(dto),
    onSuccess: () => {
      haptic.success();
      queryClient.invalidateQueries({ queryKey: ['parental-children'] });
      router.back();
    },
    onError: (err: Error) => {
      showToast({ message: err.message, variant: 'error' });
    },
  });

  const handleSelectUser = (user: User) => {
    haptic.selection();
    setSelectedUser(user);
    setPinStep('confirm');
  };

  const handleConfirm = () => {
    setPinStep('pin');
  };

  const handlePinDigit = (digit: string, isConfirm: boolean) => {
    haptic.tick();
    if (isConfirm) {
      const next = confirmPin + digit;
      setConfirmPin(next);
      if (next.length === 4) {
        if (next === pin) {
          // PINs match, link!
          if (selectedUser) {
            linkMutation.mutate({ childUserId: selectedUser.id, pin });
          }
        } else {
          haptic.error();
          setConfirmPin('');
          showToast({ message: t('parentalControls.pinMismatchMessage'), variant: 'error' });
        }
      }
    } else {
      const next = pin + digit;
      setPin(next);
      if (next.length === 4) {
        setPinStep('confirmPin');
      }
    }
  };

  const handlePinDelete = (isConfirm: boolean) => {
    haptic.tick();
    if (isConfirm) {
      setConfirmPin((p) => p.slice(0, -1));
    } else {
      setPin((p) => p.slice(0, -1));
    }
  };

  const renderPinPad = (currentPin: string, isConfirm: boolean) => {
    const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
    return (
      <Animated.View entering={FadeInDown.duration(400)} style={styles.pinContainer}>
        <Icon name="lock" size="xl" color={colors.emerald} />
        <Text style={[styles.pinTitle, { color: tc.text.primary }]}>
          {isConfirm ? t('parentalControls.confirmNewPin') : t('parentalControls.setPin')}
        </Text>
        <Text style={[styles.pinSubtitle, { color: tc.text.secondary }]}>
          {isConfirm ? t('parentalControls.confirmPinSubtitle') : t('parentalControls.setPinSubtitle')}
        </Text>

        <View style={styles.pinDots}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.pinDot, { borderColor: tc.border }, i < currentPin.length && styles.pinDotFilled]} />
          ))}
        </View>

        <View style={styles.numPad}>
          {digits.map((d, i) => (
            <Pressable
              accessibilityRole="button"
              key={i}
              style={[styles.numKey, { backgroundColor: tc.bgElevated }, d === '' && styles.numKeyEmpty]}

              onPress={() => {
                if (d === 'del') handlePinDelete(isConfirm);
                else if (d !== '') handlePinDigit(d, isConfirm);
              }}
              disabled={d === ''}
            >
              {d === 'del' ? (
                <Icon name="arrow-left" size="md" color={tc.text.primary} />
              ) : (
                <Text style={[styles.numKeyText, { color: tc.text.primary }]}>{d}</Text>
              )}
            </Pressable>
          ))}
        </View>
      </Animated.View>
    );
  };

  // PIN setup step
  if (pinStep === 'pin') {
    return (
      <ScreenErrorBoundary>
        <View style={[styles.container, { backgroundColor: tc.bg }]}>
          <GlassHeader
            title={t('parentalControls.linkChildAccount')}
            leftAction={{ icon: 'arrow-left', onPress: () => setPinStep('confirm'), accessibilityLabel: t('common.back') }}
          />
          <View style={[styles.pinGate, { paddingTop: insets.top + 80 }]}>
            {renderPinPad(pin, false)}
          </View>
        </View>
      </ScreenErrorBoundary>
    );
  }

  // Confirm PIN step
  if (pinStep === 'confirmPin') {
    return (
      <ScreenErrorBoundary>
        <View style={[styles.container, { backgroundColor: tc.bg }]}>
          <GlassHeader
            title={t('parentalControls.linkChildAccount')}
            leftAction={{ icon: 'arrow-left', onPress: () => { setPinStep('pin'); setPin(''); setConfirmPin(''); }, accessibilityLabel: t('common.back') }}
          />
          <View style={[styles.pinGate, { paddingTop: insets.top + 80 }]}>
            {renderPinPad(confirmPin, true)}
          </View>
        </View>
      </ScreenErrorBoundary>
    );
  }

  // Confirmation step
  if (pinStep === 'confirm' && selectedUser) {
    return (
      <ScreenErrorBoundary>
        <View style={[styles.container, { backgroundColor: tc.bg }]}>
          <GlassHeader
            title={t('parentalControls.linkChildAccount')}
            leftAction={{ icon: 'arrow-left', onPress: () => { setPinStep('search'); setSelectedUser(null); }, accessibilityLabel: t('common.back') }}
          />
          <View style={[styles.confirmContainer, { paddingTop: insets.top + 80 }]}>
            <Animated.View entering={FadeInDown.duration(400)}>
              <LinearGradient
                colors={colors.gradient.cardDark}
                style={[styles.confirmCard, { borderColor: tc.border }]}
              >
                <Avatar
                  uri={selectedUser.avatarUrl ?? null}
                  name={selectedUser.displayName ?? selectedUser.username}
                  size="xl"
                />
                <Text style={[styles.confirmName, { color: tc.text.primary }]}>
                  {selectedUser.displayName ?? selectedUser.username}
                </Text>
                <Text style={[styles.confirmUsername, { color: tc.text.secondary }]}>@{selectedUser.username}</Text>
                <Text style={[styles.confirmHint, { color: tc.text.tertiary }]}>
                  {t('parentalControls.linkConfirmHint')}
                </Text>

                <View style={styles.confirmActions}>
                  <GradientButton
                    label={t('parentalControls.linkAccount')}
                    icon="check"
                    onPress={handleConfirm}
                    loading={linkMutation.isPending}
                  />
                </View>
              </LinearGradient>
            </Animated.View>
          </View>
        </View>
      </ScreenErrorBoundary>
    );
  }

  // Search step
  return (
    <ScreenErrorBoundary>
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('parentalControls.linkChildAccount')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />

        <View style={[styles.body, { paddingTop: insets.top + 60 }]}>
          {/* Search Input */}
          <View style={[styles.searchContainer, { backgroundColor: tc.bgElevated, borderColor: tc.border }, { flexDirection: rtlFlexRow(isRTL) }]}>
            <Icon name="search" size="sm" color={tc.text.tertiary} />
            <TextInput
              style={[styles.searchInput, { color: tc.text.primary, textAlign: rtlTextAlign(isRTL) }]}
              placeholder={t('parentalControls.searchPlaceholder')}
              placeholderTextColor={tc.text.tertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')}>
                <Icon name="x" size="sm" color={tc.text.tertiary} />
              </Pressable>
            )}
          </View>

          <FlatList
            data={users}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={searchResults.isFetching && !searchResults.isLoading}
                onRefresh={() => searchResults.refetch()}
                tintColor={colors.emerald}
              />
            }
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                style={[styles.userRow, { borderBottomColor: tc.border }, { flexDirection: rtlFlexRow(isRTL) }]}
                onPress={() => handleSelectUser(item)}

              >
                <Avatar
                  uri={item.avatarUrl ?? null}
                  name={item.displayName ?? item.username}
                  size="md"
                />
                <View style={[styles.userInfo, rtlMargin(isRTL, spacing.md, 0)]}>
                  <Text style={[styles.userName, { color: tc.text.primary, textAlign: rtlTextAlign(isRTL) }]}>
                    {item.displayName ?? item.username}
                  </Text>
                  <Text style={[styles.userHandle, { color: tc.text.secondary, textAlign: rtlTextAlign(isRTL) }]}>
                    @{item.username}
                  </Text>
                </View>
                <Icon name="chevron-right" size="sm" color={tc.text.tertiary} />
              </Pressable>
            )}
            ListEmptyComponent={
              searchResults.isLoading ? (
                <View style={{ gap: spacing.md, paddingTop: spacing.md }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton.ConversationItem key={i} />
                  ))}
                </View>
              ) : searchQuery.length >= 2 ? (
                <EmptyState
                  icon="search"
                  title={t('parentalControls.noResults')}
                  subtitle={t('parentalControls.noResultsSubtitle')}
                />
              ) : (
                <EmptyState
                  icon="search"
                  title={t('parentalControls.searchHint')}
                  subtitle={t('parentalControls.searchHintSubtitle')}
                />
              )
            }
          />
        </View>
      </View>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  body: { flex: 1 },
  listContent: { paddingHorizontal: spacing.base, paddingBottom: 60 },
  pinGate: { flex: 1, alignItems: 'center' },

  // Search
  searchContainer: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.dark.bgElevated, borderRadius: radius.md,
    paddingHorizontal: spacing.md, marginHorizontal: spacing.base,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.dark.border,
  },
  searchInput: {
    flex: 1, color: colors.text.primary, fontSize: fontSize.base,
    paddingVertical: spacing.md,
  },

  // User row
  userRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.dark.border,
  },
  userInfo: { flex: 1, marginLeft: spacing.md },
  userName: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '600' },
  userHandle: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: 2 },

  // Confirm
  confirmContainer: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.base },
  confirmCard: {
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.dark.border,
    padding: spacing.xl, alignItems: 'center', width: '100%',
  },
  confirmName: {
    color: colors.text.primary, fontSize: fontSize.lg, fontWeight: '700',
    marginTop: spacing.md,
  },
  confirmUsername: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: spacing.xs },
  confirmHint: {
    color: colors.text.tertiary, fontSize: fontSize.sm, textAlign: 'center',
    marginTop: spacing.lg, lineHeight: 20,
  },
  confirmActions: { marginTop: spacing.xl, width: '100%' },

  // PIN Pad
  pinContainer: { alignItems: 'center', gap: spacing.base },
  pinTitle: { color: colors.text.primary, fontSize: fontSize.lg, fontWeight: '700', marginTop: spacing.md },
  pinSubtitle: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: spacing.xs },
  pinDots: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  pinDot: {
    width: 16, height: 16, borderRadius: radius.full,
    borderWidth: 2, borderColor: colors.dark.border,
  },
  pinDotFilled: { backgroundColor: colors.emerald, borderColor: colors.emerald },
  numPad: {
    flexDirection: 'row', flexWrap: 'wrap', width: 260,
    justifyContent: 'center', marginTop: spacing.xl,
  },
  numKey: {
    width: 72, height: 72, borderRadius: radius.full,
    alignItems: 'center', justifyContent: 'center', margin: spacing.xs,
    backgroundColor: colors.dark.bgElevated,
  },
  numKeyEmpty: { backgroundColor: 'transparent' },
  numKeyText: { color: colors.text.primary, fontSize: fontSize.xl, fontWeight: '600' },
});
