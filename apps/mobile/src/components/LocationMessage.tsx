import React, { useCallback } from 'react';
import { View, Text, Pressable, Linking, StyleSheet, Alert } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Icon } from '@/components/ui/Icon';
import { colors, fonts, fontSize, spacing, radius } from '@/theme';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';

interface LocationMessageProps {
  latitude: number;
  longitude: number;
  address?: string;
  name?: string;
  isOutgoing: boolean;
}

const MAP_CARD_HEIGHT = 120;

export function LocationMessage({
  latitude,
  longitude,
  address,
  name,
  isOutgoing,
}: LocationMessageProps) {
  const { t } = useTranslation();
  const haptic = useContextualHaptic();
  const tc = useThemeColors();

  const mapsUrl = `https://maps.google.com/?q=${latitude},${longitude}`;

  const handleOpenMaps = useCallback(async () => {
    haptic.navigate();
    try {
      const supported = await Linking.canOpenURL(mapsUrl);
      if (supported) {
        await Linking.openURL(mapsUrl);
      } else {
        Alert.alert(
          t('location.cannotOpen', 'Cannot Open Maps'),
          t('location.cannotOpenMessage', 'No maps application is available on this device.'),
        );
      }
    } catch {
      Alert.alert(
        t('location.openError', 'Error'),
        t('location.openErrorMessage', 'Could not open the maps application.'),
      );
    }
  }, [mapsUrl, haptic, t]);

  const bgColor = isOutgoing ? colors.active.emerald10 : tc.bgCard;
  const borderColor = isOutgoing ? colors.emerald : tc.border;

  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <Pressable
        onPress={handleOpenMaps}
        style={[
          styles.container,
          { backgroundColor: bgColor, borderColor },
        ]}
        accessibilityRole="button"
        accessibilityLabel={t('location.openInMaps', 'Open location in maps')}
      >
        {/* Map Placeholder */}
        <View style={[styles.mapPlaceholder, { backgroundColor: tc.surface }]}>
          <Icon name="map-pin" size="xl" color={colors.emerald} />
        </View>

        {/* Location Details */}
        <View style={styles.details}>
          {name ? (
            <Text style={styles.nameText} numberOfLines={1}>
              {name}
            </Text>
          ) : null}

          {address ? (
            <Text style={styles.addressText} numberOfLines={2}>
              {address}
            </Text>
          ) : null}

          <Text style={styles.coordsText}>
            {latitude.toFixed(6)}, {longitude.toFixed(6)}
          </Text>

          {/* Open in Maps Link */}
          <View style={styles.openLink}>
            <Icon name="link" size="xs" color={colors.emerald} />
            <Text style={styles.openLinkText}>
              {t('location.openInMaps', 'Open in Maps')}
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    maxWidth: 260,
  },
  mapPlaceholder: {
    height: MAP_CARD_HEIGHT,
    backgroundColor: colors.dark.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  details: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  nameText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  addressText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  coordsText: {
    fontFamily: fonts.mono,
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
  },
  openLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  openLinkText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.emerald,
  },
});
