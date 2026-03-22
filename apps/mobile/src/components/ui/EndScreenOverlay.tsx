import React, { useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { navigate } from '@/utils/navigation';
import { colors, fonts, fontSize, spacing, radius, glass } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import type { EndScreen } from '@/types';

interface EndScreenOverlayProps {
  endScreens: EndScreen[];
  currentTime: number;
  totalDuration: number;
}

type PositionKey = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center-left' | 'center-right';

const POSITION_STYLES: Record<PositionKey, Record<string, number | string>> = {
  'top-left': { top: 60, left: 16 },
  'top-right': { top: 60, right: 16 },
  'bottom-left': { bottom: 80, left: 16 },
  'bottom-right': { bottom: 80, right: 16 },
  'center-left': { top: '40%', left: 16 },
  'center-right': { top: '40%', right: 16 },
};

function getPositionStyle(position: string): Record<string, number | string> {
  return POSITION_STYLES[position as PositionKey] ?? POSITION_STYLES['bottom-right'];
}

interface EndScreenCardProps {
  item: EndScreen;
  index: number;
  onPress: () => void;
}

function EndScreenCard({ item, index, onPress }: EndScreenCardProps) {
  const { t } = useTranslation();

  const iconName = useMemo(() => {
    switch (item.type) {
      case 'subscribe': return 'user' as const;
      case 'watch_next': return 'play' as const;
      case 'playlist': return 'layers' as const;
      case 'link': return 'globe' as const;
      default: return 'play' as const;
    }
  }, [item.type]);

  const gradientColors = item.type === 'subscribe'
    ? [colors.emeraldLight, colors.emerald] as const
    : ['rgba(45,53,72,0.85)', 'rgba(28,35,51,0.75)'] as const;

  return (
    <Animated.View
      entering={FadeInUp.delay(index * 100).duration(400).springify()}
      style={[styles.cardWrapper, getPositionStyle(item.position)]}
    >
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={item.label} hitSlop={6}>
        <LinearGradient
          colors={[...gradientColors]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <View style={styles.cardIcon}>
            <Icon name={iconName} size="sm" color={colors.text.primary} />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardLabel} numberOfLines={2}>
              {item.label}
            </Text>
            {item.type === 'subscribe' && (
              <Text style={styles.cardSubtext}>
                {t('endScreens.subscribe')}
              </Text>
            )}
            {item.type === 'playlist' && (
              <Text style={styles.cardSubtext}>
                {t('endScreens.playlist')}
              </Text>
            )}
          </View>
          <Icon name="chevron-right" size="xs" color={colors.text.secondary} />
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

export function EndScreenOverlay({
  endScreens,
  currentTime,
  totalDuration,
}: EndScreenOverlayProps) {
  const visibleCards = useMemo(() => {
    if (totalDuration <= 0 || currentTime <= 0) return [];
    const remainingTime = totalDuration - currentTime;
    return endScreens.filter((es) => remainingTime <= es.showAtSeconds);
  }, [endScreens, currentTime, totalDuration]);

  if (visibleCards.length === 0) return null;

  const handleCardPress = (item: EndScreen) => {
    switch (item.type) {
      case 'subscribe':
        if (item.targetId) {
          navigate(`/(screens)/channel/${item.targetId}`);
        }
        break;
      case 'watch_next':
        if (item.targetId) {
          navigate(`/(screens)/video/${item.targetId}`);
        }
        break;
      case 'playlist':
        if (item.targetId) {
          navigate(`/(screens)/playlist/${item.targetId}`);
        }
        break;
      case 'link':
        // External link handling deferred
        break;
    }
  };

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      {visibleCards.map((item, index) => (
        <EndScreenCard
          key={item.id}
          item={item}
          index={index}
          onPress={() => handleCardPress(item)}
        />
      ))}
    </View>
  );
}

const CARD_WIDTH = 180;

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },
  cardWrapper: {
    position: 'absolute',
    width: CARD_WIDTH,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: glass.light.borderWidth,
    borderColor: glass.light.borderColor,
    gap: spacing.sm,
  },
  cardIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
  },
  cardLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.text.primary,
    lineHeight: 18,
  },
  cardSubtext: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
});
