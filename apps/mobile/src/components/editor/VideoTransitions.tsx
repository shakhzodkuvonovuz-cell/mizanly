import { memo } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Icon, type IconName } from '@/components/ui/Icon';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useHaptic } from '@/hooks/useHaptic';
import { useTranslation } from '@/hooks/useTranslation';

export type TransitionType = 'none' | 'fade' | 'slide' | 'zoom' | 'dissolve' | 'wipe';

interface TransitionOption {
  type: TransitionType;
  labelKey: string;
  icon: IconName;
}

const TRANSITIONS: TransitionOption[] = [
  { type: 'none', labelKey: 'editor.transitions.none', icon: 'x' },
  { type: 'fade', labelKey: 'editor.transitions.fade', icon: 'eye' },
  { type: 'slide', labelKey: 'editor.transitions.slide', icon: 'chevron-right' },
  { type: 'zoom', labelKey: 'editor.transitions.zoom', icon: 'search' },
  { type: 'dissolve', labelKey: 'editor.transitions.dissolve', icon: 'layers' },
  { type: 'wipe', labelKey: 'editor.transitions.wipe', icon: 'slash' },
];

interface VideoTransitionsProps {
  selected: TransitionType;
  onSelect: (type: TransitionType) => void;
}

/**
 * Video transition selector for between-clip transitions.
 * Supports: fade, slide, zoom, dissolve, wipe.
 */
export const VideoTransitions = memo(function VideoTransitions({
  selected,
  onSelect,
}: VideoTransitionsProps) {
  const { t } = useTranslation();
  const haptic = useHaptic();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('editor.transitions.title')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {TRANSITIONS.map((transition) => {
          const isActive = selected === transition.type;
          return (
            <Pressable
              key={transition.type}
              style={[styles.item, isActive && styles.itemActive]}
              onPress={() => {
                haptic.selection();
                onSelect(transition.type);
              }}
              accessibilityRole="button"
              accessibilityLabel={t(transition.labelKey)}
            >
              <View style={[styles.iconWrap, isActive && styles.iconWrapActive]}>
                <Icon
                  name={transition.icon}
                  size="sm"
                  color={isActive ? '#fff' : colors.text.secondary}
                />
              </View>
              <Text style={[styles.label, isActive && styles.labelActive]}>
                {t(transition.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.md,
  },
  title: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
    paddingHorizontal: spacing.base,
    marginBottom: spacing.md,
  },
  row: {
    paddingHorizontal: spacing.base,
    gap: spacing.md,
  },
  item: {
    alignItems: 'center',
    gap: spacing.xs,
    width: 64,
  },
  itemActive: {},
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.dark.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  iconWrapActive: {
    backgroundColor: colors.emerald,
    borderColor: colors.emerald,
  },
  label: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    textAlign: 'center',
  },
  labelActive: {
    color: colors.emerald,
    fontWeight: '600',
  },
});
