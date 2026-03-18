import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Switch, Alert, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useChatLock } from '@/hooks/useChatLock';

function ChatLockContent() {
  const router = useRouter();
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const { t } = useTranslation();
  const { isLocked, lockConversation, unlockConversation, isBiometricAvailable } = useChatLock();

  const [locked, setLocked] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    async function loadState() {
      if (!conversationId) return;
      try {
        const [lockedState, bioAvailable] = await Promise.all([
          isLocked(conversationId),
          isBiometricAvailable(),
        ]);
        setLocked(lockedState);
        setBiometricAvailable(bioAvailable);
      } finally {
        setLoading(false);
      }
    }
    loadState();
  }, [conversationId]);

  const handleToggle = useCallback(async () => {
    if (!conversationId || toggling) return;
    setToggling(true);
    try {
      if (locked) {
        const success = await unlockConversation(conversationId);
        if (success) {
          setLocked(false);
        }
      } else {
        const success = await lockConversation(conversationId);
        if (success) {
          setLocked(true);
        }
      }
    } finally {
      setToggling(false);
    }
  }, [conversationId, locked, toggling, lockConversation, unlockConversation]);

  const handleRemoveLock = useCallback(() => {
    Alert.alert(
      t('chatLock.removeLockTitle', 'Remove Chat Lock'),
      t('chatLock.removeLockMessage', 'Are you sure you want to remove the lock from this chat?'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('chatLock.remove', 'Remove'),
          style: 'destructive',
          onPress: async () => {
            if (!conversationId) return;
            setToggling(true);
            const success = await unlockConversation(conversationId);
            if (success) {
              setLocked(false);
            }
            setToggling(false);
          },
        },
      ],
    );
  }, [conversationId, unlockConversation, t]);

  return (
    <View style={styles.container}>
      <GlassHeader
        title={t('chatLock.title', 'Chat Lock')}
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
        {/* Lock Icon */}
        <Animated.View entering={FadeIn.duration(400)} style={styles.iconContainer}>
          <LinearGradient
            colors={locked ? [colors.emerald, colors.emeraldDark] : [colors.dark.surface, colors.dark.bgCard]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconCircle}
          >
            <Icon name="lock" size={48} color={locked ? colors.text.primary : colors.text.secondary} />
          </LinearGradient>
        </Animated.View>

        {/* Toggle Row */}
        <Animated.View entering={FadeInUp.delay(100).duration(400)} style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleTextContainer}>
              <Text style={styles.toggleLabel}>
                {t('chatLock.lockThisChat', 'Lock this chat')}
              </Text>
              <Text style={styles.toggleDescription}>
                {t(
                  'chatLock.lockDescription',
                  'Locked chats require Face ID or fingerprint to open',
                )}
              </Text>
            </View>
            <Switch
              value={locked}
              onValueChange={handleToggle}
              disabled={loading || toggling || !biometricAvailable}
              trackColor={{ false: colors.dark.surface, true: colors.emerald }}
              thumbColor={colors.text.primary}
            />
          </View>
        </Animated.View>

        {/* Notification Preview Info */}
        {locked && (
          <Animated.View entering={FadeInUp.delay(200).duration(400)} style={styles.card}>
            <View style={styles.infoRow}>
              <View style={styles.infoIconWrapper}>
                <Icon name="bell" size={20} color={colors.emerald} />
              </View>
              <Text style={styles.infoText}>
                {t(
                  'chatLock.notificationPreview',
                  'Message previews will not appear in notifications for this chat',
                )}
              </Text>
            </View>
          </Animated.View>
        )}

        {/* Biometric Method Info */}
        <Animated.View entering={FadeInUp.delay(300).duration(400)} style={styles.card}>
          <View style={styles.infoRow}>
            <View style={styles.infoIconWrapper}>
              <Icon
                name={biometricAvailable ? 'check-circle' : 'slash'}
                size={20}
                color={biometricAvailable ? colors.emerald : colors.text.tertiary}
              />
            </View>
            <Text style={styles.infoText}>
              {biometricAvailable
                ? t(
                    'chatLock.biometricAvailable',
                    'Face ID or fingerprint authentication is available on this device',
                  )
                : t(
                    'chatLock.biometricUnavailable',
                    'Biometric authentication is not available. Please set up Face ID or fingerprint in your device settings.',
                  )}
            </Text>
          </View>
        </Animated.View>

        {/* Remove Lock Button */}
        {locked && (
          <Animated.View entering={FadeInUp.delay(400).duration(400)} style={styles.removeLockContainer}>
            <Pressable
              accessibilityRole="button"
              onPress={handleRemoveLock}
              disabled={toggling}
              style={({ pressed }) => [
                styles.removeLockButton,
                pressed && styles.removeLockButtonPressed,
              ]}
            >
              <Icon name="lock" size={20} color={colors.error} />
              <Text style={styles.removeLockText}>
                {t('chatLock.removeLock', 'Remove Lock')}
              </Text>
            </Pressable>
          </Animated.View>
        )}

        {/* Explanation Section */}
        <Animated.View entering={FadeInUp.delay(500).duration(400)} style={styles.explanationContainer}>
          <Text style={styles.explanationTitle}>
            {t('chatLock.howItWorks', 'How it works')}
          </Text>

          <View style={styles.explanationItem}>
            <View style={styles.bulletDot} />
            <Text style={styles.explanationText}>
              {t(
                'chatLock.explanation1',
                'When chat lock is enabled, you will need to use Face ID or fingerprint to view this conversation.',
              )}
            </Text>
          </View>

          <View style={styles.explanationItem}>
            <View style={styles.bulletDot} />
            <Text style={styles.explanationText}>
              {t(
                'chatLock.explanation2',
                'The chat will appear in your chat list but its contents will be hidden until you authenticate.',
              )}
            </Text>
          </View>

          <View style={styles.explanationItem}>
            <View style={styles.bulletDot} />
            <Text style={styles.explanationText}>
              {t(
                'chatLock.explanation3',
                'Notification previews will be hidden for locked chats to protect your privacy.',
              )}
            </Text>
          </View>

          <View style={styles.explanationItem}>
            <View style={styles.bulletDot} />
            <Text style={styles.explanationText}>
              {t(
                'chatLock.explanation4',
                'You can remove the lock at any time by authenticating again.',
              )}
            </Text>
          </View>
        </Animated.View>
      </Animated.ScrollView>
    </View>
  );
}

export default function ChatLockScreen() {
  return (
    <ScreenErrorBoundary>
      <ChatLockContent />
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
  iconContainer: {
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing['2xl'],
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.dark.border,
    padding: spacing.base,
    marginBottom: spacing.md,
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
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  infoIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.active.emerald10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  infoText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  removeLockContainer: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  removeLockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.active.error10,
    borderRadius: radius.lg,
    paddingVertical: spacing.base,
    borderWidth: 1,
    borderColor: 'rgba(248, 81, 73, 0.2)',
  },
  removeLockButtonPressed: {
    opacity: 0.7,
  },
  removeLockText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.error,
  },
  explanationContainer: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xs,
  },
  explanationTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.md,
    color: colors.text.primary,
    marginBottom: spacing.base,
  },
  explanationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.emerald,
    marginTop: 7,
  },
  explanationText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    lineHeight: 20,
  },
});
