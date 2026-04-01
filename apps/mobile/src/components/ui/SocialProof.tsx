import { memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Avatar } from './Avatar';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTranslation } from '@/hooks/useTranslation';
import { formatCount } from '@/utils/formatCount';
import { spacing, fontSize, fonts, radius } from '@/theme';

interface SocialProofUser {
  avatarUrl: string | null;
  name: string;
  username: string;
}

interface SocialProofProps {
  /** First 2-3 users to show avatars for */
  users: SocialProofUser[];
  /** Total count (e.g. total likes) */
  count: number;
  /** Label — "Liked by" | "Followed by" | "Viewed by" (default: "Liked by") */
  label?: string;
  /** Called when the component is tapped (e.g. navigate to likers list) */
  onPress?: () => void;
  /** Called when the bold username is tapped (e.g. navigate to profile) */
  onUserPress?: (username: string) => void;
}

const AVATAR_SIZE = 24; // matches Avatar 'xs' size
const OVERLAP = 10;
const AVATAR_STEP = AVATAR_SIZE - OVERLAP; // 14px per additional avatar

export const SocialProof = memo(function SocialProof({
  users,
  count,
  label,
  onPress,
  onUserPress,
}: SocialProofProps) {
  const tc = useThemeColors();
  const { t } = useTranslation();
  const displayLabel = label || t('social.likedBy');

  if (count === 0 || users.length === 0) return null;

  const firstUser = users[0];
  const othersCount = count - 1;
  const avatarsToShow = users.slice(0, 3);
  const stackWidth = AVATAR_SIZE + (avatarsToShow.length - 1) * AVATAR_STEP;

  return (
    <Pressable
      onPress={onPress}
      style={styles.container}
      accessibilityRole="button"
      accessibilityLabel={`${displayLabel} ${firstUser.name} ${t('social.and')} ${formatCount(othersCount)} ${othersCount === 1 ? t('social.other') : t('social.others')}`}
      disabled={!onPress}
    >
      {/* Stacked avatars */}
      <View style={[styles.avatarStack, { width: stackWidth }]}>
        {avatarsToShow.map((user, i) => (
          <View
            key={user.username}
            style={[
              styles.avatarWrap,
              {
                left: i * AVATAR_STEP,
                zIndex: avatarsToShow.length - i,
                borderColor: tc.bg,
              },
            ]}
          >
            <Avatar uri={user.avatarUrl} name={user.name} size="xs" />
          </View>
        ))}
      </View>

      {/* Text */}
      <Text style={[styles.text, { color: tc.text.secondary }]} numberOfLines={1}>
        {displayLabel}{' '}
        <Text
          style={[styles.bold, { color: tc.text.primary }]}
          onPress={onUserPress ? () => onUserPress(firstUser.username) : undefined}
        >
          {firstUser.name}
        </Text>
        {othersCount > 0 && (
          <>
            {` ${t('social.and')} `}
            <Text style={[styles.bold, { color: tc.text.primary }]}>
              {formatCount(othersCount)} {othersCount === 1 ? t('social.other') : t('social.others')}
            </Text>
          </>
        )}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  avatarStack: {
    height: AVATAR_SIZE,
    position: 'relative',
  },
  avatarWrap: {
    position: 'absolute',
    top: 0,
    borderWidth: 1.5,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  text: {
    flex: 1,
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: 18,
  },
  bold: {
    fontFamily: fonts.bodyBold,
  },
});
