import React, { useCallback } from 'react';
import { View, Text, Pressable, Linking, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { Icon } from '@/components/ui/Icon';
import { showToast } from '@/components/ui/Toast';
import { colors, fonts, fontSize, spacing, radius } from '@/theme';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';

interface ContactMessageProps {
  name: string;
  phone?: string;
  email?: string;
  avatarUrl?: string;
  isOutgoing: boolean;
}

const AVATAR_SIZE = 48;

export function ContactMessage({
  name,
  phone,
  email,
  avatarUrl,
  isOutgoing,
}: ContactMessageProps) {
  const { t } = useTranslation();
  const haptic = useContextualHaptic();
  const tc = useThemeColors();

  const handleCallPhone = useCallback(async () => {
    if (!phone) return;
    haptic.navigate();
    const url = `tel:${phone}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      }
    } catch {
      showToast({ message: t('contact.callErrorMessage', 'Could not open the phone dialer.'), variant: 'error' });
    }
  }, [phone, haptic, t]);

  const handleSendEmail = useCallback(async () => {
    if (!email) return;
    haptic.navigate();
    const url = `mailto:${email}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      }
    } catch {
      showToast({ message: t('contact.emailErrorMessage', 'Could not open the email application.'), variant: 'error' });
    }
  }, [email, haptic, t]);

  const handleAddToContacts = useCallback(() => {
    haptic.success();
    showToast({ message: t('contact.addMessage', '{{name}} will be added to your contacts.', { name }), variant: 'success' });
  }, [name, haptic, t]);

  const bgColor = isOutgoing ? colors.active.emerald10 : tc.bgCard;
  const borderColor = isOutgoing ? colors.emerald : tc.border;

  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <View
        style={[
          styles.container,
          { backgroundColor: bgColor, borderColor },
        ]}
      >
        {/* Header: Avatar + Name */}
        <View style={styles.header}>
          {avatarUrl ? (
            <ProgressiveImage
              uri={avatarUrl}
              width={AVATAR_SIZE}
              height={AVATAR_SIZE}
              borderRadius={radius.full}
            />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: tc.surface }]}>
              <Icon name="user" size="md" color={colors.text.tertiary} />
            </View>
          )}
          <Text style={styles.nameText} numberOfLines={1}>
            {name}
          </Text>
        </View>

        {/* Contact Details */}
        <View style={styles.detailsSection}>
          {phone ? (
            <Pressable
              style={styles.detailRow}
              onPress={handleCallPhone}
              accessibilityRole="button"
              accessibilityLabel={t('contact.callPhone', 'Call {{phone}}', { phone })}
            >
              <Icon name="phone" size="sm" color={colors.emerald} />
              <Text style={styles.detailText} numberOfLines={1}>
                {phone}
              </Text>
            </Pressable>
          ) : null}

          {email ? (
            <Pressable
              style={styles.detailRow}
              onPress={handleSendEmail}
              accessibilityRole="button"
              accessibilityLabel={t('contact.sendEmail', 'Send email to {{email}}', { email })}
            >
              <Icon name="mail" size="sm" color={colors.emerald} />
              <Text style={styles.detailText} numberOfLines={1}>
                {email}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {/* Add to Contacts Button */}
        <Pressable
          style={[styles.addButton, { borderTopColor: tc.border }]}
          onPress={handleAddToContacts}
          accessibilityRole="button"
          accessibilityLabel={t('contact.addToContacts', 'Add to contacts')}
        >
          <Icon name="circle-plus" size="sm" color={colors.emerald} />
          <Text style={styles.addButtonText}>
            {t('contact.addToContacts', 'Add to Contacts')}
          </Text>
        </Pressable>
      </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: radius.full,
  },
  avatarPlaceholder: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameText: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  detailsSection: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  detailText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.dark.border,
  },
  addButtonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.emerald,
  },
});
