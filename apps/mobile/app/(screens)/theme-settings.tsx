import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Moon, Sun, Settings } from 'lucide-react-native';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { colors, spacing, fontSize, radius, iconSize } from '@/theme';
import { useStore } from '@/store';

type ThemeOption = 'dark' | 'light' | 'system';

interface ThemeRadioProps {
  icon: React.ReactNode;
  label: string;
  description?: string;
  isActive: boolean;
  onPress: () => void;
}

function ThemeRadio({ icon, label, description, isActive, onPress }: ThemeRadioProps) {
  return (
    <TouchableOpacity
      style={[styles.radio, isActive && styles.radioActive]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityLabel={`Select ${label} theme`}
      accessibilityRole="radio"
      accessibilityState={{ selected: isActive }}
    >
      <View style={styles.radioIcon}>{icon}</View>
      <View style={styles.radioText}>
        <Text style={[styles.radioLabel, isActive && styles.radioLabelActive]}>{label}</Text>
        {description && <Text style={styles.radioDescription}>{description}</Text>}
      </View>
      {isActive && <Icon name="check" size="sm" color={colors.emerald} />}
    </TouchableOpacity>
  );
}

function ColorSwatch({ bg, border, text }: { bg: string; border: string; text: string }) {
  return (
    <View style={[styles.swatch, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[styles.swatchText, { color: text }]}>Aa</Text>
    </View>
  );
}

function ThemeSettingsSkeleton() {
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
  const router = useRouter();
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
      label: 'Dark',
      description: 'Easier on the eyes in low light',
      icon: <Moon size={iconSize.md} color={colors.text.primary} strokeWidth={1.75} />,
    },
    {
      value: 'light',
      label: 'Light',
      description: 'Clean and bright',
      icon: <Sun size={iconSize.md} color={colors.text.primary} strokeWidth={1.75} />,
    },
    {
      value: 'system',
      label: 'System',
      description: 'Match device settings',
      icon: <Settings size={iconSize.md} color={colors.text.primary} strokeWidth={1.75} />,
    },
  ];

  if (!isReady) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <GlassHeader
          title="Appearance"
          leftAction={{ 
            icon: 'arrow-left', 
            onPress: () => router.back(),
            accessibilityLabel: 'Go back'
          }}
        />
        <View style={{ paddingTop: 100 }}>
          <ThemeSettingsSkeleton />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <GlassHeader
        title="Appearance"
        leftAction={{ 
          icon: 'arrow-left', 
          onPress: () => router.back(),
          accessibilityLabel: 'Go back'
        }}
      />

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {/* Preview swatch */}
        <View style={styles.previewCard}>
          <Text style={styles.previewTitle}>Preview</Text>
          <View style={styles.swatchRow}>
            <ColorSwatch bg={themeColors.bg} border={themeColors.border} text={colors.text.primary} />
            <ColorSwatch bg={themeColors.bgElevated} border={themeColors.border} text={colors.text.primary} />
            <ColorSwatch bg={themeColors.bgCard} border={themeColors.border} text={colors.text.primary} />
            <ColorSwatch bg={themeColors.surface} border={themeColors.border} text={colors.text.primary} />
          </View>
          <Text style={styles.previewHint}>
            {effectiveTheme === 'dark' ? 'Dark theme uses deep backgrounds with emerald highlights.' :
             effectiveTheme === 'light' ? 'Light theme uses light backgrounds with emerald highlights.' :
             'Theme follows your device settings.'}
          </Text>
        </View>

        {/* Theme selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Theme</Text>
          <View style={styles.card}>
            {options.map((opt, index) => (
              <React.Fragment key={opt.value}>
                {index > 0 && <View style={styles.divider} />}
                <ThemeRadio
                  icon={opt.icon}
                  label={opt.label}
                  description={opt.description}
                  isActive={theme === opt.value}
                  onPress={() => setTheme(opt.value)}
                />
              </React.Fragment>
            ))}
          </View>
        </View>

        {/* Note */}
        <Text style={styles.note}>
          Changes apply immediately across the app. Some screens may require a restart to reflect fully.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.dark.border,
  },
  headerTitle: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '700',
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingBottom: 60,
  },
  previewCard: {
    backgroundColor: colors.dark.bgElevated,
    marginHorizontal: spacing.base,
    marginTop: spacing.xl,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  previewTitle: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  swatchRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.lg,
  },
  swatch: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchText: {
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  previewHint: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: spacing.base,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.dark.bgElevated,
    marginHorizontal: spacing.base,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  radio: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  radioActive: {
    backgroundColor: colors.active.emerald10,
  },
  radioIcon: {
    marginRight: spacing.md,
  },
  radioText: {
    flex: 1,
    marginRight: spacing.md,
  },
  radioLabel: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '500',
  },
  radioLabelActive: {
    color: colors.emerald,
  },
  radioDescription: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  divider: {
    height: 0.5,
    backgroundColor: colors.dark.border,
    marginLeft: spacing.base,
  },
  note: {
    color: colors.text.tertiary,
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