import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { GradientButton } from '@/components/ui/GradientButton';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { colors, spacing, fontSize, radius, fontSizeExt } from '@/theme';
import { parentalApi } from '@/services/api';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { rtlFlexRow, rtlTextAlign, rtlMargin } from '@/utils/rtl';
import type { ParentalControl } from '@/types';
import { navigate } from '@/utils/navigation';
import { formatCount } from '@/utils/formatCount';

// ── PIN Pad ──
function PinPad({
  onComplete,
  title,
  subtitle,
}: {
  onComplete: (pin: string) => void;
  title: string;
  subtitle?: string;
}) {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const [pin, setPin] = useState('');
  const haptic = useContextualHaptic();
  const { isRTL } = useTranslation();

  const handleDigit = (d: string) => {
    haptic.tick();
    const next = pin + d;
    setPin(next);
    if (next.length === 4) {
      onComplete(next);
      setPin('');
    }
  };

  const handleDelete = () => {
    haptic.tick();
    setPin((p) => p.slice(0, -1));
  };

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

  return (
    <Animated.View entering={FadeInDown.duration(400)} style={styles.pinContainer}>
      <Icon name="lock" size="xl" color={colors.emerald} />
      <Text style={[styles.pinTitle, { textAlign: rtlTextAlign(isRTL) }]}>{title}</Text>
      {subtitle && <Text style={[styles.pinSubtitle, { textAlign: rtlTextAlign(isRTL) }]}>{subtitle}</Text>}

      <View style={styles.pinDots}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.pinDot, i < pin.length && styles.pinDotFilled]} />
        ))}
      </View>

      <View style={styles.numPad}>
        {digits.map((d, i) => (
          <Pressable
            accessibilityRole="button"
            key={i}
            style={[styles.numKey, d === '' && styles.numKeyEmpty]}

            onPress={() => {
              if (d === 'del') handleDelete();
              else if (d !== '') handleDigit(d);
            }}
            disabled={d === ''}
          >
            {d === 'del' ? (
              <Icon name="arrow-left" size="md" color={tc.text.primary} />
            ) : (
              <Text style={styles.numKeyText}>{d}</Text>
            )}
          </Pressable>
        ))}
      </View>
    </Animated.View>
  );
}

// ── Age Rating Selector ──
const AGE_RATINGS = ['G', 'PG', 'PG-13', 'R'] as const;

function AgeRatingSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const haptic = useContextualHaptic();
  return (
    <View style={styles.ageRatingRow}>
      {AGE_RATINGS.map((r) => (
        <Pressable
          accessibilityRole="button"
          key={r}
          style={[styles.ageRatingChip, value === r && styles.ageRatingChipActive]}
          onPress={() => { haptic.tick(); onChange(r); }}

        >
          <Text style={[styles.ageRatingText, value === r && styles.ageRatingTextActive]}>
            {r}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ── DM Restriction Selector ──
const DM_OPTIONS = ['none', 'contacts_only', 'disabled'] as const;

function DmRestrictionSelector({
  value,
  onChange,
  t,
}: {
  value: string;
  onChange: (v: string) => void;
  t: (k: string) => string;
}) {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const haptic = useContextualHaptic();
  const labels: Record<string, string> = {
    none: t('parentalControls.dmNone'),
    contacts_only: t('parentalControls.dmContactsOnly'),
    disabled: t('parentalControls.dmDisabled'),
  };
  return (
    <View style={styles.ageRatingRow}>
      {DM_OPTIONS.map((opt) => (
        <Pressable
          accessibilityRole="button"
          key={opt}
          style={[styles.dmChip, value === opt && styles.ageRatingChipActive]}
          onPress={() => { haptic.tick(); onChange(opt); }}

        >
          <Text style={[styles.ageRatingText, value === opt && styles.ageRatingTextActive]}>
            {labels[opt]}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ── Toggle Row ──
function ToggleRow({
  label,
  value,
  onToggle,
}: {
  label: string;
  value: boolean;
  onToggle: (v: boolean) => void;
}) {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const haptic = useContextualHaptic();
  const { isRTL } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      style={[styles.toggleRow, { flexDirection: rtlFlexRow(isRTL) }]}
      onPress={() => { haptic.tick(); onToggle(!value); }}

    >
      <Text style={[styles.toggleLabel, { textAlign: rtlTextAlign(isRTL) }]}>{label}</Text>
      <View style={[styles.toggleTrack, value && styles.toggleTrackActive]}>
        <View style={[styles.toggleThumb, value && styles.toggleThumbActive]} />
      </View>
    </Pressable>
  );
}

// ── Activity Digest Card ──
function DigestCard({ childId }: { childId: string }) {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const { t, isRTL } = useTranslation();
  const digestQuery = useQuery({
    queryKey: ['parental-digest', childId],
    queryFn: () => parentalApi.getDigest(childId),
  });

  if (digestQuery.isLoading) {
    return (
      <View style={styles.digestCard}>
        <Skeleton.Rect width="100%" height={120} />
      </View>
    );
  }

  const d = digestQuery.data as {
    postsCount: number;
    messagesCount: number;
    totalScreenTimeMinutes: number;
    dailyBreakdown: { date: string; minutes: number }[];
  } | undefined;

  if (!d) return null;

  const maxMinutes = Math.max(...d.dailyBreakdown.map((day) => day.minutes), 1);

  return (
    <Animated.View entering={FadeInDown.delay(200)} style={styles.digestCard}>
      <Text style={[styles.digestTitle, { textAlign: rtlTextAlign(isRTL) }]}>
        {t('parentalControls.weeklyReport')}
      </Text>

      <View style={[styles.digestStats, { flexDirection: rtlFlexRow(isRTL) }]}>
        <View style={styles.digestStatItem}>
          <Text style={styles.digestStatValue}>{formatCount(d.postsCount)}</Text>
          <Text style={styles.digestStatLabel}>{t('parentalControls.posts')}</Text>
        </View>
        <View style={styles.digestStatItem}>
          <Text style={styles.digestStatValue}>{formatCount(d.messagesCount)}</Text>
          <Text style={styles.digestStatLabel}>{t('parentalControls.messages')}</Text>
        </View>
        <View style={styles.digestStatItem}>
          <Text style={styles.digestStatValue}>{formatCount(d.totalScreenTimeMinutes)}m</Text>
          <Text style={styles.digestStatLabel}>{t('parentalControls.screenTime')}</Text>
        </View>
      </View>

      {/* Bar chart */}
      <View style={styles.barChart}>
        {d.dailyBreakdown.map((day) => (
          <View key={day.date} style={styles.barCol}>
            <View style={styles.barBg}>
              <LinearGradient
                colors={[colors.emerald, colors.gold]}
                style={[
                  styles.barFill,
                  { height: `${Math.max((day.minutes / maxMinutes) * 100, 4)}%` },
                ]}
              />
            </View>
            <Text style={styles.barLabel}>
              {new Date(day.date).toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2)}
            </Text>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

// ── Child Card (expanded controls) ──
function ChildCard({
  control,
  onUnlink,
  onChangePin,
}: {
  control: ParentalControl;
  onUnlink: (childId: string) => void;
  onChangePin: (childId: string) => void;
}) {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const [expanded, setExpanded] = useState(false);
  const haptic = useContextualHaptic();
  const { t, isRTL } = useTranslation();
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      parentalApi.updateControls(control.childUserId, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parental-children'] });
    },
  });

  const [restrictedMode, setRestrictedMode] = useState(control.restrictedMode);
  const [maxAgeRating, setMaxAgeRating] = useState(control.maxAgeRating);
  const [dmRestriction, setDmRestriction] = useState(control.dmRestriction);
  const [canGoLive, setCanGoLive] = useState(control.canGoLive);
  const [canPost, setCanPost] = useState(control.canPost);
  const [canComment, setCanComment] = useState(control.canComment);
  const [activityDigest, setActivityDigest] = useState(control.activityDigest);

  const update = (field: string, value: unknown) => {
    updateMutation.mutate({ [field]: value });
  };

  return (
    <Animated.View entering={FadeInDown.delay(100)}>
      <LinearGradient
        colors={colors.gradient.cardDark}
        style={styles.childCard}
      >
        <Pressable
          accessibilityRole="button"
          style={[styles.childHeader, { flexDirection: rtlFlexRow(isRTL) }]}
          onPress={() => { haptic.selection(); setExpanded(!expanded); }}

        >
          <Avatar
            uri={control.child?.avatarUrl ?? null}
            name={control.child?.displayName ?? control.child?.username ?? ''}
            size="md"
          />
          <View style={[styles.childInfo, rtlMargin(isRTL, spacing.md, 0)]}>
            <Text style={[styles.childName, { textAlign: rtlTextAlign(isRTL) }]}>
              {control.child?.displayName ?? control.child?.username}
            </Text>
            <Text style={[styles.childUsername, { textAlign: rtlTextAlign(isRTL) }]}>
              @{control.child?.username}
            </Text>
          </View>
          <Icon
            name={expanded ? 'chevron-down' : 'chevron-right'}
            size="sm"
            color={tc.text.tertiary}
          />
        </Pressable>

        {expanded && (
          <Animated.View entering={FadeInDown.duration(300)} style={styles.controlsBody}>
            <View style={styles.controlDivider} />

            <ToggleRow
              label={t('parentalControls.restrictedMode')}
              value={restrictedMode}
              onToggle={(v) => { setRestrictedMode(v); update('restrictedMode', v); }}
            />

            <Text style={[styles.controlSectionLabel, { textAlign: rtlTextAlign(isRTL) }]}>
              {t('parentalControls.ageRating')}
            </Text>
            <AgeRatingSelector
              value={maxAgeRating}
              onChange={(v) => { setMaxAgeRating(v); update('maxAgeRating', v); }}
            />

            <Text style={[styles.controlSectionLabel, { textAlign: rtlTextAlign(isRTL) }]}>
              {t('parentalControls.dmRestriction')}
            </Text>
            <DmRestrictionSelector value={dmRestriction} onChange={(v) => { setDmRestriction(v); update('dmRestriction', v); }} t={t} />

            <View style={styles.controlDivider} />

            <ToggleRow
              label={t('parentalControls.canGoLive')}
              value={canGoLive}
              onToggle={(v) => { setCanGoLive(v); update('canGoLive', v); }}
            />
            <ToggleRow
              label={t('parentalControls.canPost')}
              value={canPost}
              onToggle={(v) => { setCanPost(v); update('canPost', v); }}
            />
            <ToggleRow
              label={t('parentalControls.canComment')}
              value={canComment}
              onToggle={(v) => { setCanComment(v); update('canComment', v); }}
            />
            <ToggleRow
              label={t('parentalControls.activityDigest')}
              value={activityDigest}
              onToggle={(v) => { setActivityDigest(v); update('activityDigest', v); }}
            />

            <View style={styles.controlDivider} />

            {/* Activity Report */}
            <DigestCard childId={control.childUserId} />

            {/* Manage actions */}
            <View style={styles.manageActions}>
              <Pressable
                accessibilityRole="button"
                style={[styles.manageBtn, { flexDirection: rtlFlexRow(isRTL) }]}
                onPress={() => onChangePin(control.childUserId)}

              >
                <Icon name="lock" size="sm" color={colors.gold} />
                <Text style={[styles.manageBtnText, rtlMargin(isRTL, spacing.sm, 0)]}>
                  {t('parentalControls.changePin')}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                style={[styles.manageBtn, styles.manageBtnDanger, { flexDirection: rtlFlexRow(isRTL) }]}
                onPress={() => onUnlink(control.childUserId)}

              >
                <Icon name="x" size="sm" color={colors.error} />
                <Text style={[styles.manageBtnText, styles.manageBtnTextDanger, rtlMargin(isRTL, spacing.sm, 0)]}>
                  {t('parentalControls.unlinkAccount')}
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        )}
      </LinearGradient>
    </Animated.View>
  );
}

// ── Main Screen ──
export default function ParentalControlsScreen() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptic = useContextualHaptic();
  const { t, isRTL } = useTranslation();
  const queryClient = useQueryClient();

  const [pinVerified, setPinVerified] = useState(false);
  const [isFirstSetup, setIsFirstSetup] = useState(false);
  const [unlinkChildId, setUnlinkChildId] = useState<string | null>(null);
  const [changePinChildId, setChangePinChildId] = useState<string | null>(null);
  const [showChangePinSheet, setShowChangePinSheet] = useState(false);
  const [changePinStep, setChangePinStep] = useState<'current' | 'new'>('current');
  const [currentPinValue, setCurrentPinValue] = useState('');
  const [unlinkPinSheet, setUnlinkPinSheet] = useState(false);
  const [pinAttempts, setPinAttempts] = useState(0);
  const [pinError, setPinError] = useState(false);

  const childrenQuery = useQuery({
    queryKey: ['parental-children'],
    queryFn: () => parentalApi.getChildren(),
    enabled: pinVerified,
  });

  const children = (childrenQuery.data ?? []) as ParentalControl[];

  const unlinkMutation = useMutation({
    mutationFn: ({ childId, pin }: { childId: string; pin: string }) =>
      parentalApi.unlinkChild(childId, pin),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parental-children'] });
      setUnlinkChildId(null);
      setUnlinkPinSheet(false);
    },
  });

  const changePinMutation = useMutation({
    mutationFn: ({
      childId,
      currentPin,
      newPin,
    }: {
      childId: string;
      currentPin: string;
      newPin: string;
    }) => parentalApi.changePin(childId, currentPin, newPin),
    onSuccess: () => {
      setShowChangePinSheet(false);
      setChangePinChildId(null);
      setChangePinStep('current');
      setCurrentPinValue('');
      haptic.success();
    },
  });

  // Check if user has any children linked (for PIN gate vs first-time setup)
  // Use same query key as childrenQuery so React Query deduplicates the request
  const hasControlsQuery = useQuery({
    queryKey: ['parental-children'],
    queryFn: () => parentalApi.getChildren(),
  });

  const hasControls = ((hasControlsQuery.data ?? []) as ParentalControl[]).length > 0;

  // On mount, decide if we need PIN or first-time setup
  const handlePinComplete = useCallback(async (pin: string) => {
    if (!hasControls) {
      // No existing controls: this is first-time. Skip PIN gate.
      setPinVerified(true);
      return;
    }

    if (pinAttempts >= 5) return;

    try {
      const first = ((hasControlsQuery.data ?? []) as ParentalControl[])[0];
      const result = await parentalApi.verifyPin(first.childUserId, pin) as { valid: boolean };
      if (result.valid) {
        haptic.success();
        setPinVerified(true);
        setPinAttempts(0);
        setPinError(false);
      } else {
        haptic.error();
        setPinAttempts(prev => prev + 1);
        setPinError(true);
        setTimeout(() => setPinError(false), 2000);
      }
    } catch {
      haptic.error();
      setPinAttempts(prev => prev + 1);
      setPinError(true);
      setTimeout(() => setPinError(false), 2000);
    }
  }, [hasControls, hasControlsQuery.data, haptic, pinAttempts]);

  const handleUnlink = (childId: string) => {
    setUnlinkChildId(childId);
    setUnlinkPinSheet(true);
  };

  const handleChangePin = (childId: string) => {
    setChangePinChildId(childId);
    setChangePinStep('current');
    setCurrentPinValue('');
    setShowChangePinSheet(true);
  };

  const onRefresh = useCallback(() => {
    childrenQuery.refetch();
  }, [childrenQuery]);

  // Loading state
  if (hasControlsQuery.isLoading) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title={t('parentalControls.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />
        <View style={{ flex: 1, padding: spacing.base, paddingTop: insets.top + 60, gap: spacing.lg }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton.Rect key={i} width="100%" height={64} />
          ))}
        </View>
      </View>
    );
  }

  // PIN gate
  if (!pinVerified && hasControls) {
    const isLocked = pinAttempts >= 5;
    return (
      <ScreenErrorBoundary>
        <View style={styles.container}>
          <GlassHeader
            title={t('parentalControls.title')}
            leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
          />
          <View style={[styles.pinGate, { paddingTop: insets.top + 80 }]}>
            {isLocked ? (
              <Animated.View entering={FadeInDown.duration(400)} style={styles.pinContainer}>
                <Icon name="lock" size="xl" color={colors.error} />
                <Text style={[styles.pinTitle, { color: colors.error }]}>
                  {t('parentalControls.tooManyAttempts')}
                </Text>
              </Animated.View>
            ) : (
              <>
                <PinPad
                  onComplete={handlePinComplete}
                  title={t('parentalControls.enterPin')}
                  subtitle={pinError ? t('parentalControls.wrongPin') : t('parentalControls.enterPinSubtitle')}
                />
                {pinError && (
                  <Text style={{ color: colors.error, fontSize: fontSize.sm, marginTop: spacing.sm }}>
                    {t('parentalControls.wrongPin')}
                  </Text>
                )}
              </>
            )}
          </View>
        </View>
      </ScreenErrorBoundary>
    );
  }

  // If no controls and not verified, auto-verify (in useEffect to avoid setState during render)
  useEffect(() => {
    if (!pinVerified && !hasControls) setPinVerified(true);
  }, [pinVerified, hasControls]);

  // Main content
  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          title={t('parentalControls.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />

        <FlatList
          data={children}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingTop: insets.top + 60 }]}
          refreshControl={
            <RefreshControl
              refreshing={childrenQuery.isFetching && !childrenQuery.isLoading}
              onRefresh={onRefresh}
              tintColor={colors.emerald}
            />
          }
          ListHeaderComponent={
            <Animated.View entering={FadeInUp.delay(100)}>
              <View style={[styles.sectionHeader, { flexDirection: rtlFlexRow(isRTL) }]}>
                <Icon name="users" size="sm" color={colors.emerald} />
                <Text style={[styles.sectionTitle, rtlMargin(isRTL, spacing.sm, 0)]}>
                  {t('parentalControls.linkedAccounts')}
                </Text>
              </View>
            </Animated.View>
          }
          renderItem={({ item }) => (
            <ChildCard
              control={item}
              onUnlink={handleUnlink}
              onChangePin={handleChangePin}
            />
          )}
          ListEmptyComponent={
            childrenQuery.isLoading ? (
              <View style={{ gap: spacing.md }}>
                <Skeleton.Rect width="100%" height={80} />
                <Skeleton.Rect width="100%" height={80} />
              </View>
            ) : (
              <EmptyState
                icon="users"
                title={t('parentalControls.noChildren')}
                subtitle={t('parentalControls.noChildrenSubtitle')}
              />
            )
          }
          ListFooterComponent={
            <View style={styles.footer}>
              <GradientButton
                label={t('parentalControls.linkChildAccount')}
                icon="plus"
                onPress={() => navigate('/(screens)/link-child-account')}
              />
            </View>
          }
        />

        {/* Unlink PIN Sheet */}
        <BottomSheet
          visible={unlinkPinSheet}
          onClose={() => { setUnlinkPinSheet(false); setUnlinkChildId(null); }}
        >
          <View style={styles.sheetContent}>
            <PinPad
              onComplete={(pin) => {
                if (unlinkChildId) {
                  unlinkMutation.mutate({ childId: unlinkChildId, pin });
                }
              }}
              title={t('parentalControls.enterPinToUnlink')}
            />
          </View>
        </BottomSheet>

        {/* Change PIN Sheet */}
        <BottomSheet
          visible={showChangePinSheet}
          onClose={() => { setShowChangePinSheet(false); setChangePinChildId(null); }}
        >
          <View style={styles.sheetContent}>
            {changePinStep === 'current' ? (
              <PinPad
                onComplete={(pin) => {
                  setCurrentPinValue(pin);
                  setChangePinStep('new');
                }}
                title={t('parentalControls.enterCurrentPin')}
              />
            ) : (
              <PinPad
                onComplete={(newPin) => {
                  if (changePinChildId) {
                    changePinMutation.mutate({
                      childId: changePinChildId,
                      currentPin: currentPinValue,
                      newPin,
                    });
                  }
                }}
                title={t('parentalControls.enterNewPin')}
              />
            )}
          </View>
        </BottomSheet>
      </View>
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: tc.bg },
  listContent: { paddingHorizontal: spacing.base, paddingBottom: 60 },
  pinGate: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // PIN Pad
  pinContainer: { alignItems: 'center', gap: spacing.base },
  pinTitle: { color: colors.text.primary, fontSize: fontSize.lg, fontWeight: '700', marginTop: spacing.md },
  pinSubtitle: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: spacing.xs },
  pinDots: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  pinDot: {
    width: 16, height: 16, borderRadius: radius.full,
    borderWidth: 2, borderColor: tc.border,
  },
  pinDotFilled: { backgroundColor: colors.emerald, borderColor: colors.emerald },
  numPad: {
    flexDirection: 'row', flexWrap: 'wrap', width: 260,
    justifyContent: 'center', marginTop: spacing.xl,
  },
  numKey: {
    width: 72, height: 72, borderRadius: radius.full,
    alignItems: 'center', justifyContent: 'center', margin: spacing.xs,
    backgroundColor: tc.bgElevated,
  },
  numKeyEmpty: { backgroundColor: 'transparent' },
  numKeyText: { color: colors.text.primary, fontSize: fontSize.xl, fontWeight: '600' },

  // Section Header
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  sectionTitle: {
    color: colors.text.secondary, fontSize: fontSize.sm, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },

  // Child Card
  childCard: {
    borderRadius: radius.lg, borderWidth: 1, borderColor: tc.border,
    overflow: 'hidden', marginBottom: spacing.md,
  },
  childHeader: {
    flexDirection: 'row', alignItems: 'center',
    padding: spacing.base,
  },
  childInfo: { flex: 1, marginLeft: spacing.md },
  childName: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '600' },
  childUsername: { color: colors.text.secondary, fontSize: fontSize.sm, marginTop: 2 },

  // Controls Body
  controlsBody: { paddingHorizontal: spacing.base, paddingBottom: spacing.base },
  controlDivider: { height: 1, backgroundColor: tc.border, marginVertical: spacing.md },
  controlSectionLabel: {
    color: colors.text.secondary, fontSize: fontSize.xs, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: spacing.md, marginBottom: spacing.sm,
  },

  // Toggle Row
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  toggleLabel: { color: colors.text.primary, fontSize: fontSize.base, flex: 1 },
  toggleTrack: {
    width: 48, height: 28, borderRadius: radius.lg,
    backgroundColor: tc.border, padding: 3, justifyContent: 'center',
  },
  toggleTrackActive: { backgroundColor: colors.emerald },
  toggleThumb: {
    width: 22, height: 22, borderRadius: radius.full,
    backgroundColor: colors.text.primary,
  },
  toggleThumbActive: { alignSelf: 'flex-end' },

  // Age Rating
  ageRatingRow: { flexDirection: 'row', gap: spacing.sm },
  ageRatingChip: {
    flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md,
    borderWidth: 1, borderColor: tc.border, alignItems: 'center',
  },
  ageRatingChipActive: {
    borderColor: colors.emerald, backgroundColor: colors.active.emerald15,
  },
  ageRatingText: { color: colors.text.secondary, fontSize: fontSize.sm, fontWeight: '600' },
  ageRatingTextActive: { color: colors.emerald },

  // DM chips
  dmChip: {
    flex: 1, paddingVertical: spacing.sm, paddingHorizontal: spacing.xs,
    borderRadius: radius.md, borderWidth: 1, borderColor: tc.border,
    alignItems: 'center',
  },

  // Digest
  digestCard: {
    backgroundColor: tc.bgElevated, borderRadius: radius.md,
    padding: spacing.base, marginTop: spacing.sm,
  },
  digestTitle: {
    color: colors.text.primary, fontSize: fontSize.base, fontWeight: '600',
    marginBottom: spacing.md,
  },
  digestStats: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: spacing.lg },
  digestStatItem: { alignItems: 'center' },
  digestStatValue: { color: colors.emerald, fontSize: fontSize.lg, fontWeight: '700' },
  digestStatLabel: { color: colors.text.tertiary, fontSize: fontSize.xs, marginTop: 2 },

  // Bar chart
  barChart: { flexDirection: 'row', justifyContent: 'space-between', height: 80, gap: spacing.xs },
  barCol: { flex: 1, alignItems: 'center' },
  barBg: {
    flex: 1, width: '100%', backgroundColor: tc.surface,
    borderRadius: radius.sm, overflow: 'hidden', justifyContent: 'flex-end',
  },
  barFill: { width: '100%', borderRadius: radius.sm },
  barLabel: { color: colors.text.tertiary, fontSize: fontSizeExt.tiny, marginTop: 4 },

  // Manage actions
  manageActions: { gap: spacing.sm, marginTop: spacing.md },
  manageBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderRadius: radius.md, borderWidth: 1, borderColor: tc.border,
  },
  manageBtnDanger: { borderColor: 'rgba(248,81,73,0.3)' },
  manageBtnText: { color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '500' },
  manageBtnTextDanger: { color: colors.error },

  // Footer
  footer: { marginTop: spacing.xl, paddingBottom: spacing.xl },

  // Sheet content
  sheetContent: { paddingVertical: spacing.xl, alignItems: 'center' },
});
