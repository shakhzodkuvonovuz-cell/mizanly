import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { Icon } from '@/components/ui/Icon';
import { colors, fonts, fontSize, spacing, radius } from '@/theme';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';

interface PinnedMessage {
  id: string;
  content: string | null;
  sender: { username: string };
}

interface PinnedMessageBarProps {
  pinnedMessages: Array<PinnedMessage>;
  onTapPin: (messageId: string) => void;
  onViewAll: () => void;
}

const BAR_HEIGHT = 48;

export function PinnedMessageBar({
  pinnedMessages,
  onTapPin,
  onViewAll,
}: PinnedMessageBarProps) {
  const { t } = useTranslation();
  const haptic = useContextualHaptic();
  const tc = useThemeColors();
  const [currentIndex, setCurrentIndex] = useState(0);

  const currentMessage = pinnedMessages[currentIndex];

  const handleCycleMessage = useCallback(() => {
    if (pinnedMessages.length <= 1) {
      if (currentMessage) {
        onTapPin(currentMessage.id);
      }
      return;
    }
    haptic.tick();
    const nextIndex = (currentIndex + 1) % pinnedMessages.length;
    setCurrentIndex(nextIndex);
  }, [currentIndex, pinnedMessages.length, currentMessage, onTapPin, haptic]);

  const handleTapMessage = useCallback(() => {
    if (currentMessage) {
      haptic.navigate();
      onTapPin(currentMessage.id);
    }
  }, [currentMessage, onTapPin, haptic]);

  const handleViewAll = useCallback(() => {
    haptic.navigate();
    onViewAll();
  }, [onViewAll, haptic]);

  if (pinnedMessages.length === 0 || !currentMessage) {
    return null;
  }

  const previewText =
    currentMessage.content ?? t('chat.pinnedMedia', 'Media message');

  return (
    <Animated.View
      entering={FadeInDown.duration(200)}
      exiting={FadeOutUp.duration(150)}
      style={[styles.container, { backgroundColor: tc.bgCard, borderBottomColor: tc.border }]}
    >
      <View style={styles.pinIconContainer}>
        <Icon name="map-pin" size="sm" color={colors.emerald} />
      </View>

      <Pressable
        style={styles.contentArea}
        onPress={pinnedMessages.length > 1 ? handleCycleMessage : handleTapMessage}
        accessibilityRole="button"
        accessibilityLabel={t('chat.pinnedMessageBy', {
          defaultValue: 'Pinned message by {{username}}',
          username: currentMessage.sender.username,
        })}
      >
        <Text style={styles.senderText} numberOfLines={1}>
          {currentMessage.sender.username}
        </Text>
        <Text style={styles.previewText} numberOfLines={1}>
          {previewText}
        </Text>
      </Pressable>

      {pinnedMessages.length > 1 ? (
        <Text style={styles.countBadge}>
          {currentIndex + 1}/{pinnedMessages.length}
        </Text>
      ) : null}

      <Pressable
        onPress={handleViewAll}
        style={styles.viewAllButton}
        accessibilityRole="button"
        accessibilityLabel={t('chat.viewAllPinned', 'View all pinned messages')}
        hitSlop={8}
      >
        <Icon name="chevron-right" size="sm" color={colors.text.secondary} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dark.bgCard,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.dark.border,
    paddingHorizontal: spacing.md,
  },
  pinIconContainer: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentArea: {
    flex: 1,
    marginLeft: spacing.sm,
    marginRight: spacing.sm,
    justifyContent: 'center',
  },
  senderText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.xs,
    color: colors.emerald,
    lineHeight: 14,
  },
  previewText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    lineHeight: 18,
    marginTop: 1,
  },
  countBadge: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
    marginRight: spacing.xs,
  },
  viewAllButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
});
