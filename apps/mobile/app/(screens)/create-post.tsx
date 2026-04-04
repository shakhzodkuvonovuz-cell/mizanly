import { useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, TextInput, Pressable,
  ScrollView, Platform, Dimensions, KeyboardAvoidingView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { Autocomplete } from '@/components/ui/Autocomplete';
import { LocationPicker } from '@/components/ui/LocationPicker';
import { GradientButton } from '@/components/ui/GradientButton';
import { AnimatedAccordion } from '@/components/ui/AnimatedAccordion';
import { RichCaptionInput, type RichCaptionInputRef } from '@/components/ui/RichCaptionInput';
import { UploadProgressBar } from '@/components/ui/UploadProgressBar';
import { SchedulePostSheet } from '@/components/ui/SchedulePostSheet';
import { colors, spacing, fontSize, radius, fontSizeExt, fonts } from '@/theme';
import { draftsApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { navigate } from '@/utils/navigation';
import { showToast } from '@/components/ui/Toast';
import { usePostMedia } from '@/hooks/create/usePostMedia';
import { usePostPublish } from '@/hooks/create/usePostPublish';

type Visibility = 'PUBLIC' | 'FOLLOWERS' | 'CIRCLE';

type VisIconName = React.ComponentProps<typeof Icon>['name'];
const VISIBILITY_KEYS: { value: Visibility; labelKey: string; iconName: VisIconName }[] = [
  { value: 'PUBLIC', labelKey: 'compose.visibility.everyone', iconName: 'globe' },
  { value: 'FOLLOWERS', labelKey: 'compose.visibility.followers', iconName: 'users' },
  { value: 'CIRCLE', labelKey: 'compose.visibility.circle', iconName: 'lock' },
];

export default function CreatePostScreen() {
  const router = useRouter();
  const { prefillContent, prefillMedia } = useLocalSearchParams<{ prefillContent?: string; prefillMedia?: string }>();
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const { user } = useUser();
  const { t } = useTranslation();
  const haptic = useContextualHaptic();
  const inputRef = useRef<RichCaptionInputRef>(null);

  // ── Hooks ──
  const mediaHook = usePostMedia(t, prefillContent, prefillMedia);
  const pub = usePostPublish(
    () => ({ media: mediaHook.media, content: mediaHook.content }),
    mediaHook.clearDraft,
    t,
  );

  const visibilityOption = VISIBILITY_KEYS.find((o) => o.value === pub.visibility)!;
  const selectedCircle = pub.circles.find((c) => c.id === pub.circleId);
  const pillText = pub.visibility === 'CIRCLE' && selectedCircle
    ? selectedCircle.name
    : t(visibilityOption.labelKey);

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: tc.border }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('accessibility.navigateBack')}
            onPress={() => {
              if (mediaHook.content.trim() || mediaHook.media.length > 0) {
                pub.setShowDiscardSheet(true);
              } else {
                router.back();
              }
            }}
            hitSlop={8}
          >
            <Icon name="x" size="md" color={tc.text.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>{pub.scheduledAt ? t('schedule.scheduled') : t('saf.newPost')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Pressable
              onPress={() => pub.setShowScheduleSheet(true)}
              hitSlop={8}
              style={{ padding: spacing.xs }}
              accessibilityLabel={t('schedule.scheduleButton')}
              accessibilityRole="button"
            >
              <Icon name="clock" size="md" color={pub.scheduledAt ? colors.emerald : tc.text.tertiary} />
            </Pressable>
            {/* Finding #384: Alt text reminder */}
            {mediaHook.media.length > 0 && !pub.altText.trim() && (
                            <Pressable
                accessibilityRole="button"
                onPress={() => inputRef.current?.blur()}
                hitSlop={8}
              >
                <Text style={{ color: colors.gold, fontSize: fontSize.xs, marginEnd: spacing.sm }}>{t('compose.addAltTextReminder', 'Add alt text?')}</Text>
              </Pressable>
            )}
            <GradientButton
              label={pub.scheduledAt ? t('schedule.confirm') : t('common.share')}
              size="sm"
              onPress={() => { if (!pub.canPost || pub.createMutation.isPending) return; pub.createMutation.mutate(); }}
              loading={pub.createMutation.isPending}
              disabled={!pub.canPost}
            />
          </View>
        </View>

        {/* Draft restored banner */}
        {mediaHook.showDraftBanner && (
          <View style={styles.draftBanner}>
            <Icon name="clock" size="sm" color={colors.gold} />
            <Text style={styles.draftBannerText}>{t('compose.draftRestored')}</Text>
                        <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('accessibility.close')}
              onPress={() => mediaHook.setShowDraftBanner(false)}
              hitSlop={8}
            >
              <Icon name="x" size="xs" color={tc.text.secondary} />
            </Pressable>
          </View>
        )}

        <ScrollView
          style={styles.body}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.bodyContent}
        >
          {/* User row */}
          <View style={styles.userRow}>
            <Avatar uri={user?.imageUrl} name={user?.fullName ?? t('common.me')} size="md" />
            <View>
              <Text style={styles.userName}>{user?.fullName ?? user?.username}</Text>
              {/* Visibility picker */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('accessibility.expandSection')}
                style={[styles.visibilityPill, { backgroundColor: tc.bgElevated }]}
                onPress={() => pub.setShowVisibility(!pub.showVisibility)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <Icon name={visibilityOption.iconName} size={12} color={tc.text.secondary} />
                  <Text style={styles.visibilityPillText}>{pillText}</Text>
                  <Icon name="chevron-down" size={12} color={tc.text.tertiary} />
                </View>
              </Pressable>
            </View>
          </View>

          {pub.showVisibility && (
            <View style={[styles.visibilityMenu, { backgroundColor: tc.bgSheet, borderColor: tc.border }]}>
              {VISIBILITY_KEYS.map((opt) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('accessibility.close')}
                  key={opt.value}
                  style={[styles.visOption, pub.visibility === opt.value && styles.visOptionActive]}
                  onPress={() => {
                    pub.setVisibility(opt.value);
                    pub.setShowVisibility(false);
                    if (opt.value === 'CIRCLE') pub.setShowCirclePicker(true);
                  }}
                >
                  <Icon name={opt.iconName} size="sm" color={pub.visibility === opt.value ? colors.emerald : tc.text.secondary} />
                  <Text style={[styles.visOptionText, pub.visibility === opt.value && styles.visOptionTextActive]}>
                    {t(opt.labelKey)}
                  </Text>
                  {pub.visibility === opt.value && <Icon name="check" size="sm" color={colors.emerald} />}
                </Pressable>
              ))}
            </View>
          )}

          {/* Circle picker — shown when CIRCLE visibility is active */}
          {pub.visibility === 'CIRCLE' && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('accessibility.seeMore')}
              style={styles.circlePill}
              onPress={() => pub.setShowCirclePicker(true)}
            >
              <Text style={styles.circlePillText}>
                {selectedCircle
                  ? selectedCircle.name
                  : t('compose.chooseCircle')}
              </Text>
              <Icon name="chevron-right" size="sm" color={colors.emerald} />
            </Pressable>
          )}

          {/* Rich caption input — #hashtags emerald, @mentions blue, URLs gold */}
          <RichCaptionInput
            ref={inputRef}
            value={mediaHook.content}
            onChangeText={mediaHook.setContent}
            placeholder={t('compose.whatsOnYourMind')}
            maxLength={2200}
            autoFocus
            accessibilityLabel={t('accessibility.postContent')}
            onTriggerAutocomplete={(type, query) => {
              pub.setAutocompleteType(type);
              pub.setShowAutocomplete(true);
              pub.setAutocompleteQuery(query);
            }}
            onDismissAutocomplete={() => {
              if (pub.showAutocomplete) {
                pub.setShowAutocomplete(false);
                pub.setAutocompleteType(null);
                pub.setAutocompleteQuery('');
              }
            }}
          />

          {/* Premium glassmorphism media previews */}
          {mediaHook.media.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.mediaRow}
              contentContainerStyle={{ gap: spacing.sm, paddingEnd: spacing.base }}
            >
              {mediaHook.media.map((item, idx) => (
                <Animated.View key={idx} entering={FadeInUp.delay(Math.min(idx, 15) * 50)} style={styles.mediaCard}>
                  <LinearGradient
                    colors={['rgba(45,53,72,0.5)', 'rgba(28,35,51,0.3)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.mediaCardGradient}
                  >
                    <ProgressiveImage uri={item.uri} width="100%" height={100} borderRadius={radius.md - 3} accessibilityLabel={pub.altText || t('compose.contentImage')} />
                    {item.type === 'video' && (
                      <LinearGradient
                        colors={['rgba(0,0,0,0.6)', 'transparent']}
                        style={styles.videoBadgeGradient}
                      >
                        <Icon name="play" size={12} color="#fff" />
                      </LinearGradient>
                    )}
                    <Pressable
                      style={styles.removeMedia}
                      onPress={() => mediaHook.removeMedia(idx)}
                      hitSlop={4}
                      accessibilityLabel={t('compose.removeMedia')}
                      accessibilityRole="button"
                    >
                      <LinearGradient
                        colors={['rgba(248,81,73,0.9)', 'rgba(200,60,50,0.9)']}
                        style={styles.removeMediaGradient}
                      >
                        <Icon name="x" size={12} color="#fff" />
                      </LinearGradient>
                    </Pressable>
                    <Pressable
                      style={[styles.removeMedia, { top: undefined, bottom: spacing.xs }]}
                      onPress={() => {
                        const editorScreen = item.type === 'video'
                          ? '/(screens)/video-editor'
                          : '/(screens)/image-editor';
                        navigate(editorScreen, { uri: item.uri });
                      }}
                      hitSlop={4}
                      accessibilityLabel={t('compose.editMedia')}
                      accessibilityRole="button"
                    >
                      <LinearGradient
                        colors={['rgba(10,123,79,0.9)', 'rgba(10,123,79,0.7)']}
                        style={styles.removeMediaGradient}
                      >
                        <Icon name="pencil" size={12} color="#fff" />
                      </LinearGradient>
                    </Pressable>
                  </LinearGradient>
                </Animated.View>
              ))}
              {mediaHook.media.length < 10 && (
                <Pressable style={styles.addMoreMedia} onPress={mediaHook.pickMedia} accessibilityLabel={t('compose.addMoreMedia')} accessibilityRole="button">
                  <LinearGradient
                    colors={['rgba(10,123,79,0.1)', 'rgba(10,123,79,0.05)']}
                    style={styles.addMoreMediaGradient}
                  >
                    <Icon name="plus" size="md" color={colors.emerald} />
                  </LinearGradient>
                </Pressable>
              )}
            </ScrollView>
          )}

          {/* ═══════ Publish Settings ═══════ */}
          <Animated.View entering={FadeInUp.delay(200)} style={{ marginTop: spacing.xl, gap: spacing.md }}>
            {/* Section header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
              <View style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: colors.emerald }} />
              <Text style={{ color: tc.text.primary, fontSize: fontSize.base, fontFamily: fonts.bodyBold, fontWeight: '700' }}>
                {t('compose.publishSettings')}
              </Text>
            </View>

            {/* ── Alt text (accessibility) — animated accordion ── */}
            {mediaHook.media.length > 0 && (
              <AnimatedAccordion
                icon="eye"
                title={pub.altText ? t('compose.altTextAdded') : t('compose.addAltText')}
                isActive={!!pub.altText}
              >
                <View style={{ paddingTop: spacing.sm }}>
                  <TextInput
                    value={pub.altText}
                    onChangeText={pub.setAltText}
                    placeholder={t('compose.describeForScreenReaders')}
                    placeholderTextColor={tc.text.tertiary}
                    multiline
                    maxLength={1000}
                    style={{ color: tc.text.primary, fontSize: fontSize.sm, minHeight: 60, textAlignVertical: 'top', backgroundColor: tc.bgElevated, borderRadius: radius.md, padding: spacing.md }}
                    accessibilityLabel={t('compose.altTextInput')}
                  />
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.xs }}>
                    <CharCountRing current={pub.altText.length} max={1000} size={20} />
                  </View>
                </View>
              </AnimatedAccordion>
            )}

            {/* ── Tag people — animated accordion ── */}
            <AnimatedAccordion
              icon="users"
              title={pub.taggedUsers.length > 0 ? `${pub.taggedUsers.length} ${t('compose.peopleTagged')}` : t('compose.tagPeople')}
              isActive={pub.taggedUsers.length > 0}
            >
              <View style={{ paddingTop: spacing.sm }}>
                <TextInput
                  value={pub.tagSearchQuery}
                  onChangeText={pub.setTagSearchQuery}
                  placeholder={t('compose.searchPeopleToTag')}
                  placeholderTextColor={tc.text.tertiary}
                  autoCapitalize="none"
                  style={{ color: tc.text.primary, fontSize: fontSize.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: tc.bgElevated, borderRadius: radius.md }}
                  accessibilityLabel={t('compose.searchPeopleToTag')}
                />
                {pub.taggedUsers.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm }}>
                    {pub.taggedUsers.map((user, i) => (
                      <Pressable key={i} onPress={() => pub.setTaggedUsers(prev => prev.filter((_, idx) => idx !== i))} hitSlop={4} accessibilityRole="button" accessibilityLabel={`${t('common.remove')} @${user}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', backgroundColor: pressed ? colors.active.emerald20 : colors.active.emerald10, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, gap: spacing.xs, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
                        <Text style={{ color: colors.emerald, fontSize: fontSize.xs, fontFamily: fonts.bodyBold, fontWeight: '600' }}>@{user}</Text>
                        <Icon name="x" size={12} color={colors.emerald} />
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            </AnimatedAccordion>

            {/* ── Invite collaborator — animated accordion ── */}
            <AnimatedAccordion
              icon="users"
              iconColor={colors.gold}
              title={pub.collaboratorUsername ? `${t('compose.collaborator')}: @${pub.collaboratorUsername}` : t('compose.inviteCollaborator')}
              isActive={!!pub.collaboratorUsername}
            >
              <View style={{ paddingTop: spacing.sm }}>
                <Text style={{ color: tc.text.secondary, fontSize: fontSize.xs, fontFamily: fonts.body, marginBottom: spacing.sm, lineHeight: 16 }}>
                  {t('compose.collaboratorDescription')}
                </Text>
                <TextInput
                  value={pub.collaboratorUsername}
                  onChangeText={pub.setCollaboratorUsername}
                  placeholder="@username"
                  placeholderTextColor={tc.text.tertiary}
                  autoCapitalize="none"
                  style={{ color: tc.text.primary, fontSize: fontSize.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: tc.bgElevated, borderRadius: radius.md }}
                  accessibilityLabel={t('compose.collaboratorUsername')}
                />
              </View>
            </AnimatedAccordion>

            {/* ── Who can comment — animated accordion ── */}
            <AnimatedAccordion
              icon="message-circle"
              title={t('compose.whoCanComment')}
              subtitle={t(`compose.comment${pub.commentControl.charAt(0).toUpperCase() + pub.commentControl.slice(1)}`)}
              isActive={pub.commentControl !== 'everyone'}
            >
              <View style={{ paddingTop: spacing.sm, borderRadius: radius.md, overflow: 'hidden' }}>
                {(['everyone', 'followers', 'nobody'] as const).map(opt => (
                  <Pressable
                    key={opt}
                    onPress={() => pub.setCommentControl(opt)}
                    style={({ pressed }) => ({
                      flexDirection: 'row', alignItems: 'center',
                      padding: spacing.md, gap: spacing.md,
                      backgroundColor: pub.commentControl === opt ? colors.active.emerald10 : pressed ? colors.active.white10 : 'transparent',
                      transform: [{ scale: pressed ? 0.98 : 1 }],
                    })}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: pub.commentControl === opt }}
                    accessibilityLabel={t(`compose.comment${opt.charAt(0).toUpperCase() + opt.slice(1)}`)}
                  >
                    <View style={{
                      width: 20, height: 20, borderRadius: radius.full,
                      borderWidth: 2, borderColor: pub.commentControl === opt ? colors.emerald : tc.border,
                      backgroundColor: pub.commentControl === opt ? colors.emerald : 'transparent',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      {pub.commentControl === opt && <Icon name="check" size={12} color="#fff" />}
                    </View>
                    <Text style={{ flex: 1, color: pub.commentControl === opt ? colors.emerald : tc.text.primary, fontSize: fontSize.sm, fontFamily: fonts.bodyMedium, fontWeight: '500' }}>
                      {t(`compose.comment${opt.charAt(0).toUpperCase() + opt.slice(1)}`)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </AnimatedAccordion>

            {/* ── Advanced settings — animated accordion ── */}
            <AnimatedAccordion
              icon="settings"
              title={t('compose.advancedSettings')}
            >
              <View style={{ gap: spacing.sm, paddingTop: spacing.sm }}>
                {/* Share to feed toggle */}
                <Pressable
                  onPress={() => pub.setShareToFeed(!pub.shareToFeed)}
                  style={({ pressed }) => [publishRowStyle, { backgroundColor: tc.bgElevated, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: pub.shareToFeed }}
                  accessibilityLabel={t('compose.shareToFeed')}
                >
                  <Icon name="layers" size="sm" color={pub.shareToFeed ? colors.emerald : tc.text.secondary} />
                  <Text style={{ flex: 1, color: tc.text.primary, fontSize: fontSize.sm, fontWeight: '500' }}>
                    {t('compose.shareToFeed')}
                  </Text>
                  <View style={{ width: 20, height: 20, borderRadius: radius.full, backgroundColor: pub.shareToFeed ? colors.emerald : tc.surface, borderWidth: 1, borderColor: tc.border, justifyContent: 'center', alignItems: 'center' }}>
                    {pub.shareToFeed && <Icon name="check" size={12} color="#fff" />}
                  </View>
                </Pressable>

                {/* Remix allowed toggle */}
                <Pressable
                  onPress={() => pub.setRemixAllowed(!pub.remixAllowed)}
                  style={({ pressed }) => [publishRowStyle, { backgroundColor: tc.bgElevated, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: pub.remixAllowed }}
                  accessibilityLabel={t('compose.allowRemix')}
                >
                  <Icon name="repeat" size="sm" color={pub.remixAllowed ? colors.emerald : tc.text.secondary} />
                  <Text style={{ flex: 1, color: tc.text.primary, fontSize: fontSize.sm, fontWeight: '500' }}>
                    {t('compose.allowRemix')}
                  </Text>
                  <View style={{ width: 20, height: 20, borderRadius: radius.full, backgroundColor: pub.remixAllowed ? colors.emerald : tc.surface, borderWidth: 1, borderColor: tc.border, justifyContent: 'center', alignItems: 'center' }}>
                    {pub.remixAllowed && <Icon name="check" size={12} color="#fff" />}
                  </View>
                </Pressable>

                {/* Branded content */}
                <Pressable
                  onPress={() => pub.setBrandedContent(!pub.brandedContent)}
                  style={({ pressed }) => [publishRowStyle, { backgroundColor: tc.bgElevated, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: pub.brandedContent }}
                  accessibilityLabel={t('compose.brandedContent')}
                >
                  <Icon name="check-circle" size="sm" color={pub.brandedContent ? colors.gold : tc.text.secondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: tc.text.primary, fontSize: fontSize.sm, fontWeight: '500' }}>
                      {t('compose.brandedContent')}
                    </Text>
                    <Text style={{ color: tc.text.tertiary, fontSize: fontSize.xs }}>
                      {t('compose.brandedContentHint')}
                    </Text>
                  </View>
                  <View style={{ width: 20, height: 20, borderRadius: radius.full, backgroundColor: pub.brandedContent ? colors.gold : tc.surface, borderWidth: 1, borderColor: tc.border, justifyContent: 'center', alignItems: 'center' }}>
                    {pub.brandedContent && <Icon name="check" size={12} color="#fff" />}
                  </View>
                </Pressable>
                {pub.brandedContent && (
                  <View style={{ backgroundColor: tc.bgElevated, borderRadius: radius.md, padding: spacing.md }}>
                    <TextInput
                      value={pub.brandPartner}
                      onChangeText={pub.setBrandPartner}
                      placeholder={t('compose.brandPartnerPlaceholder')}
                      placeholderTextColor={tc.text.tertiary}
                      autoCapitalize="none"
                      style={{ color: tc.text.primary, fontSize: fontSize.sm }}
                      accessibilityLabel={t('compose.brandPartner')}
                    />
                  </View>
                )}

                {/* Topics / categories */}
                <Pressable
                  onPress={() => pub.setShowTopics(!pub.showTopics)}
                  style={({ pressed }) => [publishRowStyle, { backgroundColor: tc.bgElevated, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
                  accessibilityRole="button"
                  accessibilityLabel={t('compose.addTopics')}
                >
                  <Icon name="hash" size="sm" color={pub.selectedTopics.length > 0 ? colors.emerald : tc.text.secondary} />
                  <Text style={{ flex: 1, color: tc.text.primary, fontSize: fontSize.sm, fontWeight: '500' }}>
                    {pub.selectedTopics.length > 0 ? `${pub.selectedTopics.length} ${t('compose.topicsSelected')}` : t('compose.addTopics')}
                  </Text>
                  <Icon name="chevron-right" size="sm" color={tc.text.tertiary} />
                </Pressable>
                {pub.showTopics && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, padding: spacing.sm }}>
                    {(['Islamic', 'Lifestyle', 'Education', 'Technology', 'Food', 'Travel', 'Fashion', 'Sports', 'Business', 'Art'] as const).map(topic => {
                      const isSelected = pub.selectedTopics.includes(topic);
                      return (
                        <Pressable
                          key={topic}
                          onPress={() => {
                            pub.setSelectedTopics(prev =>
                              isSelected ? prev.filter(t => t !== topic) : [...prev, topic].slice(0, 3)
                            );
                          }}
                          style={{
                            paddingHorizontal: spacing.md,
                            paddingVertical: spacing.sm,
                            borderRadius: radius.full,
                            backgroundColor: isSelected ? colors.emerald : tc.bgElevated,
                            borderWidth: 1,
                            borderColor: isSelected ? colors.emerald : tc.border,
                          }}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: isSelected }}
                          accessibilityLabel={topic}
                        >
                          <Text style={{ color: isSelected ? '#fff' : tc.text.primary, fontSize: fontSize.sm, fontWeight: '500' }}>
                            {t(`compose.topic${topic}`)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            </AnimatedAccordion>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

        {/* Discard confirmation */}
        <BottomSheet visible={pub.showDiscardSheet} onClose={() => pub.setShowDiscardSheet(false)}>
          <BottomSheetItem
            label={t('common.saveDraft')}
            icon={<Icon name="bookmark" size="sm" color={tc.text.primary} />}
            onPress={async () => {
              try {
                await mediaHook.saveDraftImmediate({ content: mediaHook.content, mediaUrls: mediaHook.media.map(m => m.uri) });
                pub.setShowDiscardSheet(false);
                showToast({ message: t('common.draftSaved'), variant: 'success' });
                router.back();
              } catch {
                showToast({ message: t('compose.failedToSaveDraft'), variant: 'error' });
              }
            }}
          />
          <BottomSheetItem
            label={t('compose.discard')}
            icon={<Icon name="trash" size="sm" color={colors.error} />}
            destructive
            onPress={async () => {
              pub.setShowDiscardSheet(false);
              await mediaHook.clearDraft().catch(() => {});
              router.back();
            }}
          />
          <BottomSheetItem
            label={t('common.cancel')}
            icon={<Icon name="x" size="sm" color={tc.text.primary} />}
            onPress={() => pub.setShowDiscardSheet(false)}
          />
        </BottomSheet>

        {/* Circle picker */}
        <BottomSheet visible={pub.showCirclePicker} onClose={() => pub.setShowCirclePicker(false)}>
          <Text style={styles.sheetTitle}>{t('compose.chooseCircle')}</Text>
          {pub.circlesQuery.isLoading ? (
            <View style={styles.skeletonList}>
              {Array.from({ length: 3 }).map((_, i) => (
                <View key={i} style={styles.skeletonRow}>
                  <Skeleton.Circle size={36} />
                  <View style={{ flex: 1, gap: spacing.xs }}>
                    <Skeleton.Rect width={120} height={14} />
                    <Skeleton.Rect width={80} height={11} />
                  </View>
                </View>
              ))}
            </View>
          ) : pub.circles.length === 0 ? (
            <View style={styles.emptyCircles}>
              <Text style={styles.emptyCirclesText}>{t('compose.noCirclesYet')}</Text>
                            <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('accessibility.seeMore')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}
                onPress={() => { pub.setShowCirclePicker(false); router.push('/(screens)/circles'); }}
              >
                <Text style={styles.emptyCirclesLink}>{t('compose.createCircle')}</Text>
                <Icon name="chevron-right" size="sm" color={colors.emerald} />
              </Pressable>
            </View>
          ) : (
            pub.circles.map((c) => (
              <BottomSheetItem
                key={c.id}
                label={c.name}
                icon={
                  <View style={styles.circleIconWrap}>
                    {c.emoji ? (
                      <Text style={styles.circleEmoji}>{c.emoji}</Text>
                    ) : (
                      <Icon name="users" size="sm" color={colors.emerald} />
                    )}
                  </View>
                }
                onPress={() => { pub.setCircleId(c.id); pub.setShowCirclePicker(false); }}
              />
            ))
          )}
        </BottomSheet>

        {/* Upload progress bar — non-blocking, shows real percentage */}
        <UploadProgressBar
          visible={pub.uploading}
          progress={pub.uploadProgress}
          label={mediaHook.media.length > 1 ? `${t('compose.uploadingMedia')} (${Math.ceil((pub.uploadProgress / 100) * mediaHook.media.length)}/${mediaHook.media.length})` : undefined}
          onCancel={() => {
            if (pub.uploadAbortRef.current) {
              pub.uploadAbortRef.current();
              pub.uploadAbortRef.current = null;
              showToast({ message: t('compose.uploadCancelled'), variant: 'info' });
            }
          }}
        />

        {/* Location display */}
        {pub.location && (
          <View style={styles.locationPill}>
            <Icon name="map-pin" size="xs" color={colors.emerald} />
            <Text style={styles.locationPillText}>{pub.location?.name}</Text>
                        <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('accessibility.close')}
              onPress={() => pub.setLocation(null)}
              hitSlop={8}
            >
              <Icon name="x" size="xs" color={tc.text.tertiary} />
            </Pressable>
          </View>
        )}

        {/* Autocomplete dropdown */}
        <Autocomplete
          visible={pub.showAutocomplete}
          type={pub.autocompleteType || 'hashtag'}
          query={pub.autocompleteQuery}
          onSelect={(value) => {
            // Find cursor position and replace the partial tag
            const cursorPos = mediaHook.content.length;
            const lastHashIndex = mediaHook.content.lastIndexOf('#', cursorPos - 1);
            const lastAtIndex = mediaHook.content.lastIndexOf('@', cursorPos - 1);

            let newContent = mediaHook.content;
            if (pub.autocompleteType === 'hashtag' && lastHashIndex !== -1) {
              const before = mediaHook.content.slice(0, lastHashIndex);
              const after = mediaHook.content.slice(cursorPos);
              newContent = before + value + ' ' + after;
            } else if (pub.autocompleteType === 'mention' && lastAtIndex !== -1) {
              const before = mediaHook.content.slice(0, lastAtIndex);
              const after = mediaHook.content.slice(cursorPos);
              newContent = before + value + ' ' + after;
            }
            mediaHook.setContent(newContent);
          }}
          onClose={() => {
            pub.setShowAutocomplete(false);
            pub.setAutocompleteType(null);
            pub.setAutocompleteQuery('');
          }}
        />

        {/* Location Picker */}
        <LocationPicker
          visible={pub.showLocationPicker}
          onClose={() => pub.setShowLocationPicker(false)}
          onSelect={(loc) => pub.setLocation(loc)}
        />

        {/* Premium gradient toolbar */}
        <LinearGradient
          colors={['transparent', tc.bg + 'F2', tc.bg]}
          locations={[0, 0.3, 1]}
          style={styles.toolbarGradient}
        >
          <View style={[styles.toolbar, { backgroundColor: tc.bg, borderTopColor: tc.border }]}>
                        <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('accessibility.pickMedia')}
              onPress={mediaHook.pickMedia}
              hitSlop={8}
              style={styles.toolbarBtn}
            >
              <LinearGradient
                colors={['rgba(10,123,79,0.1)', 'rgba(10,123,79,0.05)']}
                style={[styles.toolbarBtnGradient, mediaHook.media.length > 0 && styles.toolbarBtnGradientActive]}
              >
                <Icon name="image" size="md" color={mediaHook.media.length > 0 ? colors.emerald : tc.text.secondary} />
                {mediaHook.media.length > 0 && (
                  <View style={[styles.mediaBadge, { borderColor: tc.bg }]}>
                    <Text style={styles.mediaBadgeText}>{mediaHook.media.length}</Text>
                  </View>
                )}
              </LinearGradient>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('accessibility.addLocation')}
              hitSlop={8}
              style={styles.toolbarBtn}
              onPress={() => pub.setShowLocationPicker(true)}
            >
              <LinearGradient
                colors={pub.location ? [colors.active.emerald10, 'rgba(10,123,79,0.05)'] : ['rgba(45,53,72,0.3)', 'rgba(45,53,72,0.1)']}
                style={styles.toolbarBtnGradient}
              >
                <Icon name="map-pin" size="md" color={pub.location ? colors.emerald : tc.text.secondary} />
              </LinearGradient>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              style={styles.toolbarBtn}
              onPress={() => {
                pub.setAutocompleteType('hashtag');
                pub.setShowAutocomplete(true);
                pub.setAutocompleteQuery('');
                inputRef.current?.focus();
              }}
            >
              <LinearGradient
                colors={pub.showAutocomplete && pub.autocompleteType === 'hashtag' ? [colors.active.emerald10, 'rgba(10,123,79,0.05)'] : ['rgba(45,53,72,0.3)', 'rgba(45,53,72,0.1)']}
                style={styles.toolbarBtnGradient}
              >
                <Icon name="hash" size="md" color={pub.showAutocomplete && pub.autocompleteType === 'hashtag' ? colors.emerald : tc.text.secondary} />
              </LinearGradient>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              style={styles.toolbarBtn}
              onPress={() => {
                pub.setAutocompleteType('mention');
                pub.setShowAutocomplete(true);
                pub.setAutocompleteQuery('');
                inputRef.current?.focus();
              }}
            >
              <LinearGradient
                colors={pub.showAutocomplete && pub.autocompleteType === 'mention' ? [colors.active.emerald10, 'rgba(10,123,79,0.05)'] : ['rgba(45,53,72,0.3)', 'rgba(45,53,72,0.1)']}
                style={styles.toolbarBtnGradient}
              >
                <Icon name="at-sign" size="md" color={pub.showAutocomplete && pub.autocompleteType === 'mention' ? colors.emerald : tc.text.secondary} />
              </LinearGradient>
            </Pressable>

            <Pressable
              style={styles.toolbarBtn}
              onPress={async () => {
                try {
                  await draftsApi.save('SAF', {
                    content: mediaHook.content,
                    mediaUrls: mediaHook.media.map(m => m.uri),
                    mediaTypes: mediaHook.media.map(m => m.type),
                    visibility: pub.visibility,
                    circleId: pub.circleId,
                  });
                  showToast({ message: t('compose.draftSavedToAccount'), variant: 'success' });
                } catch {
                  showToast({ message: t('compose.failedToSaveDraft'), variant: 'error' });
                }
              }}
              accessibilityLabel={t('accessibility.saveDraftToCloud')}
              accessibilityRole="button"
            >
              <LinearGradient
                colors={['rgba(200,150,62,0.1)', 'rgba(200,150,62,0.05)']}
                style={styles.toolbarBtnGradient}
              >
                <Icon name="clock" size="sm" color={colors.gold} />
              </LinearGradient>
            </Pressable>

            <Pressable
              style={styles.toolbarBtn}
              onPress={() => navigate('/(screens)/schedule-post', { space: 'saf' })}
              accessibilityLabel={t('screens.schedule-post.title')}
              accessibilityRole="button"
            >
              <LinearGradient
                colors={['rgba(10,123,79,0.1)', 'rgba(10,123,79,0.05)']}
                style={styles.toolbarBtnGradient}
              >
                <Icon name="calendar" size="sm" color={colors.emerald} />
              </LinearGradient>
            </Pressable>

            <Pressable
              style={styles.toolbarBtn}
              onPress={() => navigate('/(screens)/branded-content')}
              accessibilityLabel={t('saf.brandedContent')}
              accessibilityRole="button"
            >
              <LinearGradient
                colors={['rgba(200,150,62,0.1)', 'rgba(200,150,62,0.05)']}
                style={styles.toolbarBtnGradient}
              >
                <Icon name="check-circle" size="sm" color={colors.gold} />
              </LinearGradient>
            </Pressable>

            <View style={styles.toolbarSpacer} />

            {/* Animated char count with glow effect */}
            <View style={styles.charCountContainer}>
              <LinearGradient
                colors={mediaHook.content.length > 2000 ? ['rgba(248,81,73,0.2)', 'transparent'] : ['rgba(10,123,79,0.1)', 'transparent']}
                style={styles.charCountGlow}
              >
                <CharCountRing current={mediaHook.content.length} max={2200} />
              </LinearGradient>
            </View>
          </View>
        </LinearGradient>
      </SafeAreaView>

      <SchedulePostSheet
        visible={pub.showScheduleSheet}
        onClose={() => pub.setShowScheduleSheet(false)}
        onSchedule={(isoDate) => { pub.setScheduledAt(isoDate); haptic.success(); }}
        onClearSchedule={() => { pub.setScheduledAt(null); haptic.delete(); }}
        currentSchedule={pub.scheduledAt}
      />
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: tc.bg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tc.border,
    backgroundColor: tc.bg,
  },
  headerTitle: { color: tc.text.primary, fontSize: fontSize.md, fontWeight: '700', letterSpacing: 0.2 },
  draftBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.active.emerald10,
    borderWidth: 1,
    borderColor: colors.emerald,
    borderRadius: radius.md,
    marginHorizontal: spacing.base,
    marginVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  draftBannerText: {
    flex: 1,
    color: tc.text.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },

  // Body
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 80 },

  // User row
  userRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  userName: { color: tc.text.primary, fontSize: fontSize.base, fontWeight: '700', marginBottom: spacing.xs },
  visibilityPill: {
    backgroundColor: tc.bgElevated, borderRadius: radius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  visibilityPillText: { color: tc.text.secondary, fontSize: fontSize.xs, fontWeight: '600' },

  // Visibility dropdown
  visibilityMenu: {
    backgroundColor: tc.bgSheet, borderRadius: radius.md,
    borderWidth: 1, borderColor: tc.border,
    marginBottom: spacing.md, overflow: 'hidden',
  },
  visOption: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
  },
  visOptionActive: { backgroundColor: colors.active.emerald10 },
  visOptionText: { flex: 1, color: tc.text.secondary, fontSize: fontSize.base },
  visOptionTextActive: { color: tc.text.primary, fontWeight: '600' },

  // Caption
  input: {
    color: tc.text.primary, fontSize: fontSize.base, lineHeight: 24,
    minHeight: 120, textAlignVertical: 'top',
  },
  // Premium media cards
  mediaRow: { marginTop: spacing.md },
  mediaCard: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  mediaCardGradient: {
    width: 120,
    height: 120,
    borderRadius: radius.lg,
    padding: 3,
  },
  mediaThumbnail: {
    width: 100, height: 100, borderRadius: radius.md, overflow: 'hidden',
    backgroundColor: tc.bgElevated,
  },
  mediaImage: {
    width: '100%',
    height: '100%',
    borderRadius: radius.md - 3,
  },
  videoBadgeGradient: {
    position: 'absolute',
    bottom: 6,
    start: 6,
    end: 6,
    top: '50%',
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoBadge: {
    position: 'absolute', bottom: 6, start: 6,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: radius.md,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  removeMedia: {
    position: 'absolute',
    top: spacing.xs,
    end: spacing.xs,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  removeMediaGradient: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  addMoreMedia: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  addMoreMediaGradient: {
    width: 120,
    height: 120,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.active.emerald30,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Upload overlay
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13,17,23,0.85)',
    alignItems: 'center', justifyContent: 'center', gap: spacing.md,
  },
  uploadText: { color: tc.text.primary, fontSize: fontSize.base },

  // Toolbar
  toolbar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
    borderTopWidth: 0.5, borderTopColor: tc.border,
    paddingBottom: Platform.OS === 'ios' ? spacing.lg : spacing.sm,
    backgroundColor: tc.bg,
  },
  toolbarBtn: { padding: spacing.xs },
  toolbarSpacer: { flex: 1 },
  toolbarBtnActive: { opacity: 1 },

  // Location pill
  locationPill: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.active.emerald10,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
    alignSelf: 'flex-start',
    borderWidth: 1, borderColor: colors.emerald,
  },
  locationPillText: {
    color: colors.emerald,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },

  // Circle inline pill
  circlePill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.active.emerald10, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.emerald,
  },
  circlePillText: { flex: 1, color: colors.emerald, fontSize: fontSize.sm, fontWeight: '600' },

  // Circle picker sheet
  sheetTitle: {
    color: tc.text.primary, fontSize: fontSize.base, fontWeight: '700',
    paddingHorizontal: spacing.xl, paddingBottom: spacing.sm,
  },
  skeletonList: { paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: spacing.md },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  circleIconWrap: { width: 36, height: 36, borderRadius: radius.full, backgroundColor: colors.active.emerald10, alignItems: 'center', justifyContent: 'center' },
  circleEmoji: { fontSize: 18 },
  emptyCircles: { alignItems: 'center', paddingVertical: spacing.xl, paddingHorizontal: spacing.xl, gap: spacing.sm },
  emptyCirclesText: { color: tc.text.secondary, fontSize: fontSize.base },
  emptyCirclesLink: { color: colors.emerald, fontSize: fontSize.base, fontWeight: '600' },

  // Premium toolbar styles
  toolbarGradient: {
    position: 'absolute',
    bottom: 0,
    start: 0,
    end: 0,
    paddingTop: spacing.xl,
  },
  toolbarBtnGradient: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarBtnGradientActive: {
    borderWidth: 1,
    borderColor: colors.emerald,
  },
  mediaBadge: {
    position: 'absolute',
    top: -4,
    end: -4,
    backgroundColor: colors.emerald,
    borderRadius: radius.md,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: tc.bg,
  },
  mediaBadgeText: {
    color: '#fff',
    fontSize: fontSizeExt.tiny,
    fontWeight: '700',
  },
  charCountContainer: {
    padding: 4,
    borderRadius: radius.full,
  },
  charCountGlow: {
    padding: 4,
    borderRadius: radius.full,
  },
});

// Shared publish row style
const publishRowStyle: import('react-native').ViewStyle = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: spacing.md,
  padding: spacing.md,
  borderRadius: radius.md,
};
