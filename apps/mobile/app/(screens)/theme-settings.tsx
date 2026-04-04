import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useStore } from '@/store';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

type ThemeOption = 'dark' | 'light' | 'system';

interface ThemeRadioProps {
  icon: React.ReactNode;
  label: string;
  description?: string;
  isActive: boolean;
  onPress: () => void;
}

function ThemeRadio({ icon, label, description, isActive, onPress }: ThemeRadioProps) {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={`Select ${label} theme`}
      accessibilityRole="radio"
      accessibilityState={{ selected: isActive }}
    >
      <LinearGradient
        colors={isActive ? ['rgba(10,123,79,0.15)', 'rgba(10,123,79,0.05)'] : tc.isDark ? ['rgba(45,53,72,0.3)', 'rgba(28,35,51,0.15)'] : ['rgba(200,210,220,0.4)', 'rgba(220,230,240,0.2)']}
        style={[styles.radio, isActive && styles.radioActive]}
      >
        <LinearGradient
          colors={isActive ? ['rgba(10,123,79,0.3)', 'rgba(200,150,62,0.2)'] : tc.isDark ? ['rgba(110,119,129,0.2)', 'rgba(110,119,129,0.1)'] : ['rgba(150,160,170,0.2)', 'rgba(150,160,170,0.1)']}
          style={styles.radioIconBg}
        >
          {icon}
        </LinearGradient>
        <View style={styles.radioText}>
          <Text style={[styles.radioLabel, isActive && styles.radioLabelActive]}>{label}</Text>
          {description && <Text style={styles.radioDescription}>{description}</Text>}
        </View>
        {isActive && (
          <LinearGradient
            colors={[colors.emerald, colors.gold]}
            style={styles.checkIconBg}
          >
            <Icon name="check" size="xs" color="#fff" />
          </LinearGradient>
        )}
      </LinearGradient>
    </Pressable>
  );
}

function ColorSwatch({ bg, border, text }: { bg: string; border: string; text: string }) {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  return (
    <View style={styles.swatchOuter}>
      <LinearGradient
        colors={[colors.emerald, colors.gold]}
        style={styles.swatchBorder}
      >
        <View style={[styles.swatch, { backgroundColor: bg }]}>
          <Text style={[styles.swatchText, { color: text }]}>Aa</Text>
        </View>
      </LinearGradient>
    </View>
  );
}

function ThemeSettingsSkeleton() {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  return (
    <View style={styles.skeletonContainer}>
      {/* Preview card skeleton */}
      <Skeleton.Rect width="100%" height={160} borderRadius={radius.lg} />
      {/* Section title skeleton */}
      <Skeleton.Rect width={60} height={12} borderRadius={radius.sm} />
      {/* Theme options skeleton */}
      <Skeleton.Rect width="100%" height={180} borderRadius={radius.lg} />
      {/* Note skeleton */}
      <Skeleton.Text width="80%" />
    </View>
  );
}

export default function ThemeSettingsScreen() {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const { t, isRTL } = useTranslation();
  const router = useRouter();
  const haptic = useContextualHaptic();
  const { theme, setTheme } = useStore();
  const systemTheme = useColorScheme() ?? 'dark';
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Short delay to allow store hydration
    const timer = setTimeout(() => setIsReady(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const effectiveTheme = theme === 'system' ? systemTheme : theme;

  const themeColors = effectiveTheme === 'dark' ? colors.dark : colors.light;

  const options: Array<{ value: ThemeOption; label: string; description: string; icon: React.ReactNode }> = [
    {
      value: 'dark',
      label: t('screens.theme-settings.dark'),
      description: t('screens.theme-settings.darkDesc'),
      icon: <Icon name="moon" size="md" color={tc.text.primary} />,
    },
    {
      value: 'light',
      label: t('screens.theme-settings.light'),
      description: t('screens.theme-settings.lightDesc'),
      icon: <Icon name="sun" size="md" color={tc.text.primary} />,
    },
    {
      value: 'system',
      label: t('screens.theme-settings.system'),
      description: t('screens.theme-settings.systemDesc'),
      icon: <Icon name="settings" size="md" color={tc.text.primary} />,
    },
  ];

  if (!isReady) {
    return (
      <ScreenErrorBoundary>
        <SafeAreaView style={styles.container} edges={['top']}>
          <GlassHeader
            title={t('screens.theme-settings.title')}
            leftAction={{
              icon: 'arrow-left',
              onPress: () => router.back(),
              accessibilityLabel: t('accessibility.goBack')
            }}
          />
          <View style={{ paddingTop: spacing['2xl'] * 3 }}>
            <ThemeSettingsSkeleton />
          </View>
        </SafeAreaView>
      </ScreenErrorBoundary>
    );
  }

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={styles.container} edges={['top']}>
        <GlassHeader
          title={t('screens.theme-settings.title')}
          leftAction={{ 
            icon: 'arrow-left', 
            onPress: () => router.back(),
            accessibilityLabel: t('accessibility.goBack')
          }}
        />

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          {/* Preview swatch with glassmorphism */}
          <Animated.View entering={FadeInUp.duration(500)}>
            <LinearGradient
              colors={tc.isDark ? ['rgba(45,53,72,0.5)', 'rgba(28,35,51,0.3)'] : ['rgba(200,210,220,0.5)', 'rgba(220,230,240,0.3)']}
              style={styles.previewCard}
            >
              <View style={styles.previewHeader}>
                <LinearGradient
                  colors={['rgba(10,123,79,0.3)', 'rgba(200,150,62,0.2)']}
                  style={styles.previewIconBg}
                >
                  <Icon name="eye" size="xs" color={colors.emerald} />
                </LinearGradient>
                <Text style={styles.previewTitle}>{t('screens.theme-settings.preview')}</Text>
              </View>
              <View style={styles.swatchRow}>
                <ColorSwatch bg={themeColors.bg} border={themeColors.border} text={tc.text.primary} />
                <ColorSwatch bg={themeColors.bgElevated} border={themeColors.border} text={tc.text.primary} />
                <ColorSwatch bg={themeColors.bgCard} border={themeColors.border} text={tc.text.primary} />
                <ColorSwatch bg={themeColors.surface} border={themeColors.border} text={tc.text.primary} />
              </View>
              <Text style={styles.previewHint}>
                {effectiveTheme === 'dark' ? t('screens.theme-settings.darkHint', 'Dark theme uses deep backgrounds with emerald highlights.') :
                 effectiveTheme === 'light' ? t('screens.theme-settings.lightHint', 'Light theme uses light backgrounds with emerald highlights.') :
                 t('screens.theme-settings.systemHint', 'Theme follows your device settings.')}
              </Text>
            </LinearGradient>
          </Animated.View>

          {/* Theme selection with glassmorphism */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <LinearGradient
                colors={['rgba(200,150,62,0.3)', 'rgba(200,150,62,0.1)']}
                style={styles.sectionIconBg}
              >
                <Icon name="settings" size="xs" color={colors.gold} />
              </LinearGradient>
              <Text style={styles.sectionTitle}>{t('screens.theme-settings.themeLabel')}</Text>
            </View>
            <Animated.View entering={FadeInUp.delay(100).duration(500)}>
              <LinearGradient
                colors={tc.isDark ? colors.gradient.cardDark : ['rgba(230,235,240,0.6)', 'rgba(240,242,245,0.3)'] as [string, string]}
                style={styles.card}
              >
                {options.map((opt, index) => (
                  <React.Fragment key={opt.value}>
                    {index > 0 && <View style={styles.divider} />}
                    <ThemeRadio
                      icon={opt.icon}
                      label={opt.label}
                      description={opt.description}
                      isActive={theme === opt.value}
                      onPress={() => { haptic.tick(); setTheme(opt.value); }}
                    />
                  </React.Fragment>
                ))}
              </LinearGradient>
            </Animated.View>
          </View>

          {/* Note */}
          <Text style={styles.note}>
            {t('screens.theme-settings.note')}
          </Text>
        </ScrollView>
      </SafeAreaView>
  
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc.bg,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingBottom: 60,
    paddingTop: spacing['2xl'] * 3,
  },
  // Preview card with glassmorphism
  previewCard: {
    marginHorizontal: spacing.base,
    marginTop: spacing.xl,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: tc.border,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  previewIconBg: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewTitle: {
    color: tc.text.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  swatchRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.lg,
  },
  // Color swatches with gradient borders
  swatchOuter: {
    padding: 2,
    borderRadius: radius.md + 2,
  },
  swatchBorder: {
    padding: 2,
    borderRadius: radius.md + 2,
  },
  swatch: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchText: {
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  previewHint: {
    color: tc.text.secondary,
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
  // Section with glassmorphism
  section: {
    marginTop: spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    marginBottom: spacing.sm,
  },
  sectionIconBg: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    color: tc.text.secondary,
    fontSize: fontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  card: {
    marginHorizontal: spacing.base,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: tc.border,
    padding: spacing.sm,
  },
  // Radio buttons with premium styling
  radio: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    marginVertical: 2,
  },
  radioActive: {
    borderWidth: 1,
    borderColor: colors.active.emerald30,
  },
  radioIconBg: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: spacing.md,
  },
  radioText: {
    flex: 1,
    marginEnd: spacing.md,
  },
  radioLabel: {
    color: tc.text.primary,
    fontSize: fontSize.base,
    fontWeight: '500',
  },
  radioLabelActive: {
    color: colors.emerald,
    fontWeight: '600',
  },
  radioDescription: {
    color: tc.text.tertiary,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  checkIconBg: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 0.5,
    backgroundColor: tc.border,
    marginHorizontal: spacing.md,
  },
  note: {
    color: tc.text.tertiary,
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginTop: spacing.xl,
    marginHorizontal: spacing.base,
    lineHeight: 16,
  },
  skeletonContainer: {
    padding: spacing.base,
    marginTop: spacing.xl,
    gap: spacing.xl,
  },
});