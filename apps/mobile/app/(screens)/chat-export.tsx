import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Switch, Share, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { chatExportApi } from '@/services/chatExportApi';
import type { ChatExportStats } from '@/services/chatExportApi';

type ExportFormat = 'text' | 'json';

function ChatExportContent() {
  const router = useRouter();
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const { t } = useTranslation();

  const [stats, setStats] = useState<ChatExportStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [format, setFormat] = useState<ExportFormat>('text');
  const [includeMedia, setIncludeMedia] = useState(false);

  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    async function loadStats() {
      try {
        const result = await chatExportApi.getStats(conversationId);
        if (!cancelled) {
          setStats(result as unknown as ChatExportStats);
        }
      } catch {
        if (!cancelled) {
          Alert.alert(
            t('chatExport.errorTitle', 'Error'),
            t('chatExport.errorLoadStats', 'Failed to load chat statistics'),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadStats();
    return () => { cancelled = true; };
  }, [conversationId, t]);

  const handleExport = useCallback(async () => {
    if (!conversationId || exporting) return;
    setExporting(true);
    try {
      const result = await chatExportApi.generateExport(conversationId, {
        format,
        includeMedia,
      });
      const exportData = result as unknown as { url: string; filename: string };
      await Share.share({
        url: exportData.url,
        title: exportData.filename,
        message: t('chatExport.shareMessage', 'Chat export from Mizanly'),
      });
    } catch {
      Alert.alert(
        t('chatExport.errorTitle', 'Error'),
        t('chatExport.errorExport', 'Failed to export chat. Please try again.'),
      );
    } finally {
      setExporting(false);
    }
  }, [conversationId, format, includeMedia, exporting, t]);

  const formatOptions: { key: ExportFormat; label: string; description: string; icon: 'layers' | 'bar-chart-2' }[] = [
    {
      key: 'text',
      label: t('chatExport.formatText', 'Text (.txt)'),
      description: t('chatExport.formatTextDesc', 'Human readable format'),
      icon: 'layers',
    },
    {
      key: 'json',
      label: t('chatExport.formatJson', 'JSON (.json)'),
      description: t('chatExport.formatJsonDesc', 'Structured data format'),
      icon: 'bar-chart-2',
    },
  ];

  return (
    <View style={styles.container}>
      <GlassHeader
        title={t('chatExport.title', 'Export Chat')}
        leftAction={{
          icon: 'arrow-left',
          onPress: () => router.back(),
          accessibilityLabel: t('common.back', 'Go back'),
        }}
      />

      <Animated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats Card */}
        {loading ? (
          <View style={styles.card}>
            <Skeleton.Rect width="60%" height={16} borderRadius={radius.sm} />
            <View style={{ height: spacing.md }} />
            <Skeleton.Rect width="40%" height={14} borderRadius={radius.sm} />
            <View style={{ height: spacing.sm }} />
            <Skeleton.Rect width="50%" height={14} borderRadius={radius.sm} />
          </View>
        ) : stats ? (
          <Animated.View entering={FadeIn.duration(400)} style={styles.card}>
            <View style={styles.statsHeader}>
              <LinearGradient
                colors={[colors.emerald, colors.emeraldDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.statsIconCircle}
              >
                <Icon
                  name={stats.isGroup ? 'users' : 'message-circle'}
                  size={20}
                  color={colors.text.primary}
                />
              </LinearGradient>
              <View style={styles.statsHeaderText}>
                <Text style={styles.statsName} numberOfLines={1}>
                  {stats.name}
                </Text>
                <Text style={styles.statsSubtitle}>
                  {stats.isGroup
                    ? t('chatExport.groupChat', 'Group chat')
                    : t('chatExport.directChat', 'Direct chat')}
                </Text>
              </View>
            </View>

            <View style={styles.statsDivider} />

            <View style={styles.statsGrid}>
              {stats.isGroup && (
                <StatItem
                  icon="users"
                  label={t('chatExport.members', 'Members')}
                  value={stats.memberCount.toString()}
                />
              )}
              <StatItem
                icon="message-circle"
                label={t('chatExport.messages', 'Messages')}
                value={stats.messageCount.toLocaleString()}
              />
              <StatItem
                icon="image"
                label={t('chatExport.media', 'Media')}
                value={stats.mediaCount.toLocaleString()}
              />
            </View>
          </Animated.View>
        ) : null}

        {/* Format Selector */}
        <Animated.View entering={FadeInUp.delay(100).duration(400)}>
          <Text style={styles.sectionTitle}>
            {t('chatExport.exportFormat', 'Export Format')}
          </Text>
          <View style={styles.formatOptions}>
            {formatOptions.map((option) => {
              const selected = format === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => setFormat(option.key)}
                  style={[styles.formatOption, selected && styles.formatOptionSelected]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
                    {selected && <View style={styles.radioInner} />}
                  </View>
                  <View style={styles.formatOptionText}>
                    <Text style={[styles.formatLabel, selected && styles.formatLabelSelected]}>
                      {option.label}
                    </Text>
                    <Text style={styles.formatDescription}>
                      {option.description}
                    </Text>
                  </View>
                  <Icon name={option.icon} size={20} color={selected ? colors.emerald : colors.text.tertiary} />
                </Pressable>
              );
            })}
          </View>
        </Animated.View>

        {/* Options */}
        <Animated.View entering={FadeInUp.delay(200).duration(400)}>
          <Text style={styles.sectionTitle}>
            {t('chatExport.options', 'Options')}
          </Text>
          <View style={styles.card}>
            <View style={styles.toggleRow}>
              <View style={styles.toggleTextContainer}>
                <Text style={styles.toggleLabel}>
                  {t('chatExport.includeMedia', 'Include media links')}
                </Text>
                <Text style={styles.toggleDescription}>
                  {t('chatExport.includeMediaDesc', 'Add links to shared photos and videos')}
                </Text>
              </View>
              <Switch
                value={includeMedia}
                onValueChange={setIncludeMedia}
                trackColor={{ false: colors.dark.surface, true: colors.emerald }}
                thumbColor={colors.text.primary}
              />
            </View>
          </View>
        </Animated.View>

        {/* Export Button */}
        <Animated.View entering={FadeInUp.delay(300).duration(400)} style={styles.buttonContainer}>
          <GradientButton
            label={exporting
              ? t('chatExport.exporting', 'Exporting...')
              : t('chatExport.exportChat', 'Export Chat')}
            onPress={handleExport}
            loading={exporting}
            disabled={loading || !stats}
            fullWidth
            icon="share"
            size="lg"
          />
        </Animated.View>

        {/* Info Footer */}
        <Animated.View entering={FadeInUp.delay(400).duration(400)} style={styles.infoFooter}>
          <Icon name="lock" size={16} color={colors.text.tertiary} />
          <Text style={styles.infoFooterText}>
            {t(
              'chatExport.privacyNote',
              'Export only includes messages you have access to. Media files are referenced as links.',
            )}
          </Text>
        </Animated.View>
      </Animated.ScrollView>
    </View>
  );
}

function StatItem({ icon, label, value }: { icon: 'users' | 'message-circle' | 'image'; label: string; value: string }) {
  return (
    <View style={styles.statItem}>
      <View style={styles.statIconWrapper}>
        <Icon name={icon} size={16} color={colors.emerald} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function ChatExportScreen() {
  return (
    <ScreenErrorBoundary>
      <ChatExportContent />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 100,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['2xl'],
  },
  card: {
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.dark.border,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  statsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  statsIconCircle: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsHeaderText: {
    flex: 1,
  },
  statsName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.md,
    color: colors.text.primary,
  },
  statsSubtitle: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginTop: 2,
  },
  statsDivider: {
    height: 1,
    backgroundColor: colors.dark.border,
    marginVertical: spacing.base,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  statIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.active.emerald10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.md,
    color: colors.text.primary,
  },
  statLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
  },
  formatOptions: {
    gap: spacing.sm,
  },
  formatOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.dark.border,
    padding: spacing.base,
    gap: spacing.md,
  },
  formatOptionSelected: {
    borderColor: colors.emerald,
    backgroundColor: colors.active.emerald10,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.dark.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: colors.emerald,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: radius.full,
    backgroundColor: colors.emerald,
  },
  formatOptionText: {
    flex: 1,
  },
  formatLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  formatLabelSelected: {
    color: colors.emerald,
  },
  formatDescription: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginTop: 2,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleTextContainer: {
    flex: 1,
    marginRight: spacing.md,
  },
  toggleLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  toggleDescription: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  buttonContainer: {
    marginTop: spacing.xl,
  },
  infoFooter: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xs,
  },
  infoFooterText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
    lineHeight: 16,
  },
});
