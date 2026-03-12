import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import { useHaptic } from '@/hooks/useHaptic';

const { width } = Dimensions.get('window');

const PRESET_AMOUNTS = [1, 2, 5, 10, 25, 50];
const PLATFORM_FEE_PERCENT = 0.1;
const MAX_MESSAGE_LENGTH = 100;

interface Creator {
  name: string;
  username: string;
  isVerified: boolean;
  followers: string;
}

const MOCK_CREATOR: Creator = {
  name: 'Ahmed Hassan',
  username: '@ahmedh',
  isVerified: true,
  followers: '124K',
};

function AmountButton({
  amount,
  isSelected,
  isPopular,
  onPress,
}: {
  amount: number;
  isSelected: boolean;
  isPopular?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.amountButton}>
      <LinearGradient
        colors={
          isSelected
            ? ['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']
            : ['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']
        }
        style={[
          styles.amountGradient,
          isSelected && styles.amountGradientSelected,
        ]}
      >
        {isPopular && (
          <LinearGradient
            colors={[colors.gold, colors.goldLight]}
            style={styles.popularBadge}
          >
            <Icon name="star" size="xs" color={colors.dark.bg} />
          </LinearGradient>
        )}
        <Text style={[styles.amountText, isSelected && styles.amountTextSelected]}>
          ${amount}
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

function VerifiedBadge({ size = 13 }: { size?: number }) {
  return (
    <View style={[styles.verifiedBadge, { width: size, height: size }]}>
      <LinearGradient
        colors={[colors.emerald, colors.goldLight]}
        style={styles.verifiedGradient}
      >
        <Icon name="check" size="xs" color={colors.text.primary} />
      </LinearGradient>
    </View>
  );
}

export default function SendTipScreen() {
  const router = useRouter();
  const haptic = useHaptic();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState(5);
  const [customAmount, setCustomAmount] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const tipAmount = customAmount ? parseFloat(customAmount) || 0 : selectedAmount;
  const platformFee = tipAmount * PLATFORM_FEE_PERCENT;
  const total = tipAmount + platformFee;

  const handleAmountSelect = useCallback((amount: number) => {
    haptic.light();
    setSelectedAmount(amount);
    setCustomAmount('');
  }, [haptic]);

  const handleSendTip = useCallback(() => {
    haptic.medium();
    setIsSending(true);

    // Mock send
    setTimeout(() => {
      setIsSending(false);
      setIsSuccess(true);
      haptic.success();
    }, 1500);
  }, [haptic]);

  const handleDone = useCallback(() => {
    router.back();
  }, [router]);

  // Success State
  if (isSuccess) {
    return (
      <SafeAreaView style={styles.container}>
        <GlassHeader
          title="Send Tip"
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />

        <View style={styles.successContainer}>
          <Animated.View entering={FadeInUp.duration(500)}>
            <LinearGradient
              colors={['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)']}
              style={styles.successIconBg}
            >
              <Icon name="check-circle" size="xl" color={colors.emerald} />
            </LinearGradient>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(100).duration(400)}>
            <Text style={styles.successTitle}>Tip sent!</Text>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(200).duration(400)}>
            <Text style={styles.successSubtitle}>
              Your tip of ${tipAmount.toFixed(2)} has been sent to {MOCK_CREATOR.username}
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(300).duration(400)} style={styles.doneButtonContainer}>
            <TouchableOpacity onPress={handleDone} activeOpacity={0.8}>
              <LinearGradient
                colors={[colors.emerald, colors.emeraldDark]}
                style={styles.doneButton}
              >
                <Text style={styles.doneButtonText}>Done</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <GlassHeader
        title="Send Tip"
        leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
      />

      <ScrollView
        refreshControl={<RefreshControl tintColor={colors.emerald} refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Creator Info Card */}
        <Animated.View entering={FadeInUp.duration(400)}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.creatorCard}
          >
            {/* Avatar */}
            <LinearGradient
              colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
              style={styles.avatarContainer}
            >
              <Icon name="user" size="lg" color={colors.text.secondary} />
            </LinearGradient>

            {/* Creator Details */}
            <View style={styles.creatorInfo}>
              <View style={styles.creatorNameRow}>
                <Text style={styles.creatorName}>{MOCK_CREATOR.name}</Text>
                {MOCK_CREATOR.isVerified && <VerifiedBadge size={13} />}
              </View>
              <Text style={styles.creatorUsername}>{MOCK_CREATOR.username}</Text>
              <Text style={styles.followerCount}>{MOCK_CREATOR.followers} followers</Text>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Amount Selector */}
        <Animated.View entering={FadeInUp.delay(100).duration(400)}>
          <Text style={styles.sectionLabel}>Choose amount</Text>

          {/* Preset Grid */}
          <View style={styles.amountGrid}>
            {PRESET_AMOUNTS.map((amount, index) => (
              <AmountButton
                key={amount}
                amount={amount}
                isSelected={selectedAmount === amount && !customAmount}
                isPopular={amount === 5}
                onPress={() => handleAmountSelect(amount)}
              />
            ))}
          </View>

          {/* Custom Amount Input */}
          <LinearGradient
            colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']}
            style={styles.customAmountContainer}
          >
            <Icon name="circle" size="sm" color={colors.text.tertiary} />
            <Text style={styles.currencyPrefixLarge}>$</Text>
            <TextInput
              style={styles.customAmountInput}
              value={customAmount}
              onChangeText={(text) => {
                const cleaned = text.replace(/[^0-9.]/g, '');
                if (cleaned.split('.').length <= 2) {
                  setCustomAmount(cleaned);
                }
              }}
              placeholder="Enter custom amount"
              placeholderTextColor={colors.text.tertiary}
              keyboardType="decimal-pad"
            />
          </LinearGradient>
        </Animated.View>

        {/* Message Section */}
        <Animated.View entering={FadeInUp.delay(200).duration(400)}>
          <Text style={styles.sectionLabel}>Add a message (optional)</Text>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.messageCard}
          >
            <View style={styles.messageHeader}>
              <LinearGradient
                colors={['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.05)']}
                style={styles.messageIconBg}
              >
                <Icon name="mail" size="sm" color={colors.emerald} />
              </LinearGradient>
            </View>

            <View style={styles.messageInputContainer}>
              <TextInput
                style={styles.messageInput}
                value={message}
                onChangeText={setMessage}
                placeholder="Add a message (optional)"
                placeholderTextColor={colors.text.tertiary}
                multiline
                numberOfLines={2}
                maxLength={MAX_MESSAGE_LENGTH}
                textAlignVertical="top"
              />
              <View style={styles.charCountWrapper}>
                <CharCountRing current={message.length} max={MAX_MESSAGE_LENGTH} size={28} />
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Payment Summary Card */}
        <Animated.View entering={FadeInUp.delay(300).duration(400)}>
          <LinearGradient
            colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']}
            style={[styles.summaryCard, { borderLeftWidth: 3, borderLeftColor: colors.gold }]}
          >
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Tip amount</Text>
              <Text style={styles.summaryValue}>${tipAmount.toFixed(2)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Platform fee (10%)</Text>
              <Text style={[styles.summaryValue, styles.feeValue]}>${platformFee.toFixed(2)}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, styles.totalLabel]}>Total</Text>
              <Text style={[styles.summaryValue, styles.totalValue]}>${total.toFixed(2)}</Text>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Send Tip Button */}
        <Animated.View entering={FadeInUp.delay(400).duration(400)}>
          <TouchableOpacity
            onPress={handleSendTip}
            disabled={tipAmount <= 0 || isSending}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={[colors.emerald, colors.goldLight]}
              style={[
                styles.sendButton,
                (tipAmount <= 0 || isSending) && styles.sendButtonDisabled,
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {isSending ? (
                <ActivityIndicator color={colors.text.primary} size="small" />
              ) : (
                <>
                  <Text style={styles.sendButtonText}>Send ${total.toFixed(2)}</Text>
                  <Icon name="send" size="sm" color={colors.text.primary} />
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* Bottom spacing */}
        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  scrollContent: {
    padding: spacing.base,
    paddingTop: 100,
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    paddingTop: 100,
  },
  successIconBg: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  successTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSize.xl,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  successSubtitle: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  doneButtonContainer: {
    width: '100%',
  },
  doneButton: {
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  doneButtonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  creatorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  avatarContainer: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  creatorInfo: {
    flex: 1,
  },
  creatorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  creatorName: {
    fontFamily: fonts.heading,
    fontSize: fontSize.md,
    color: colors.text.primary,
  },
  verifiedBadge: {
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  verifiedGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  creatorUsername: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  followerCount: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
  },
  sectionLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  amountGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  amountButton: {
    width: (width - 32 - 20) / 3,
  },
  amountGradient: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingVertical: spacing.md,
    alignItems: 'center',
    position: 'relative',
  },
  amountGradientSelected: {
    borderColor: colors.emerald,
    shadowColor: colors.emerald,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  popularBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountText: {
    fontFamily: fonts.heading,
    fontSize: fontSize.lg,
    color: colors.text.secondary,
  },
  amountTextSelected: {
    color: colors.text.primary,
  },
  customAmountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  currencyPrefixLarge: {
    fontFamily: fonts.body,
    fontSize: fontSize.md,
    color: colors.text.tertiary,
    marginHorizontal: spacing.sm,
  },
  customAmountInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.primary,
    padding: 0,
  },
  messageCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  messageHeader: {
    marginBottom: spacing.sm,
  },
  messageIconBg: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageInputContainer: {
    position: 'relative',
  },
  messageInput: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.primary,
    lineHeight: 22,
    minHeight: 60,
    paddingRight: 40,
  },
  charCountWrapper: {
    position: 'absolute',
    bottom: 0,
    right: 0,
  },
  summaryCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  summaryLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.secondary,
  },
  summaryValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  feeValue: {
    color: colors.text.tertiary,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: colors.dark.border,
    marginVertical: spacing.md,
  },
  totalLabel: {
    fontFamily: fonts.heading,
    fontSize: fontSize.md,
    color: colors.text.primary,
  },
  totalValue: {
    fontFamily: fonts.heading,
    fontSize: fontSize.lg,
    color: colors.emerald,
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
});
