import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Switch,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { Avatar } from '@/components/ui/Avatar';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import { useQuery } from '@tanstack/react-query';
import { eventsApi } from '@/services/eventsApi';
import { communitiesApi } from '@/services/communitiesApi';
import type { CreateEventDto, EventPrivacy, EventType as ApiEventType } from '@/types/events';
import type { Community } from '@/types/communities';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useDraftPersistence } from '@/hooks/useDraftPersistence';
import * as ImagePicker from 'expo-image-picker';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { navigate } from '@/utils/navigation';
import { showToast } from '@/components/ui/Toast';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatDateTime as localeFormatDateTime } from '@/utils/localeFormat';

type EventType = 'in-person' | 'online' | 'hybrid';
type PrivacyType = 'public' | 'members' | 'invite';



export default function CreateEventScreen() {
  const router = useRouter();
  const tc = useThemeColors();
  const { t } = useTranslation();
  const haptic = useContextualHaptic();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventType, setEventType] = useState<EventType>('in-person');
  const [privacy, setPrivacy] = useState<PrivacyType>('public');
  const [location, setLocation] = useState('');
  const [isOnline, setIsOnline] = useState(false);
  const [allDay, setAllDay] = useState(false);
  const [selectedCommunity, setSelectedCommunity] = useState<string>('');
  const [reminder1h, setReminder1h] = useState(true);
  const [reminder1d, setReminder1d] = useState(true);
  const [hasCover, setHasCover] = useState(false);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [showDiscardSheet, setShowDiscardSheet] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(() => {
    const date = new Date();
    date.setHours(date.getHours() + 2);
    return date;
  });
  const [showDatePicker, setShowDatePicker] = useState<'start' | 'end' | null>(null);
  const [tempDate, setTempDate] = useState(new Date());
  const communitiesQuery = useQuery({
    queryKey: ['my-communities'],
    queryFn: async () => {
      const response = await communitiesApi.list();
      const items = Array.isArray(response) ? response : (response as { data?: Community[] }).data ?? [];
      return items;
    },
  });
  const communities = communitiesQuery.data ?? [];
  const communitiesLoading = communitiesQuery.isLoading;

  // Draft persistence via shared hook
  interface EventDraft { title: string; description: string; location: string; eventType: string; privacy: string; isOnline: boolean; allDay: boolean; selectedCommunity: string }
  const { save: saveDraftImmediate, clear: clearDraft } = useDraftPersistence<EventDraft>(
    'event-draft',
    (draft) => {
      if (draft.title) setTitle(draft.title);
      if (draft.description) setDescription(draft.description);
      if (draft.location) setLocation(draft.location);
      if (draft.eventType) setEventType(draft.eventType as EventType);
      if (draft.privacy) setPrivacy(draft.privacy as PrivacyType);
      if (draft.isOnline !== undefined) setIsOnline(draft.isOnline);
      if (draft.allDay !== undefined) setAllDay(draft.allDay);
      if (draft.selectedCommunity) setSelectedCommunity(draft.selectedCommunity);
    },
  );

  const pickCoverPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
      exif: false,
    });
    if (!result.canceled && result.assets[0]) {
      setCoverUri(result.assets[0].uri);
      setHasCover(true);
    }
  };

  // D11#17: Communities now fetched via useQuery (was manual useEffect)

  useEffect(() => {
    if (showDatePicker === 'start') {
      setTempDate(startDate);
    } else if (showDatePicker === 'end') {
      setTempDate(endDate);
    }
  }, [showDatePicker, startDate, endDate]);

  const handleBack = useCallback(() => {
    const hasContent = title.trim() || description.trim() || location.trim() || coverUri;
    if (hasContent) {
      setShowDiscardSheet(true);
    } else {
      router.back();
    }
  }, [title, description, location, coverUri, router]);

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const dto: CreateEventDto = {
        title: title.trim(),
        description: description.trim() || undefined,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        location: location.trim() || undefined,
        isOnline,
        onlineUrl: isOnline ? location.trim() : undefined,
        eventType: eventType === 'in-person' ? 'in_person' : eventType === 'online' ? 'virtual' : 'hybrid',
        privacy: privacy === 'public' ? 'public' : privacy === 'members' ? 'private' : 'community',
        communityId: selectedCommunity || undefined,
      };
      const response = await eventsApi.create(dto);
      const eventId = (response as { id?: string }).id ?? '';
      haptic.success();
      showToast({ message: t('events.eventCreated'), variant: 'success' });
      navigate('/(screens)/event-detail', { id: eventId });
    } catch (err) {
      const message = err instanceof Error ? err.message : t('events.createFailed');
      setError(message);
      showToast({ message: t('events.createFailedRetry'), variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  }, [title, description, startDate, endDate, location, isOnline, eventType, privacy, selectedCommunity, submitting]);

  const handleDateSelect = useCallback((date: Date) => {
    if (showDatePicker === 'start') {
      setStartDate(date);
    } else if (showDatePicker === 'end') {
      setEndDate(date);
    }
    setShowDatePicker(null);
  }, [showDatePicker]);

  const formatDateTime = (date: Date) => {
    return localeFormatDateTime(date);
  };

  const getPrivacyIcon = () => {
    switch (privacy) {
      case 'public':
        return 'globe';
      case 'members':
        return 'users';
      case 'invite':
        return 'lock';
      default:
        return 'globe';
    }
  };

  return (
    <ScreenErrorBoundary>
    <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
      <GlassHeader title={t('events.createEvent')} onBack={handleBack} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* Cover Image Section */}
        <Animated.View entering={FadeInUp.duration(400)}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('events.addCoverPhoto')}
            style={[styles.coverContainer, hasCover && styles.coverHasImage]}
            onPress={pickCoverPhoto}
          >
            {coverUri ? (
              <>
                <ProgressiveImage uri={coverUri} width="100%" height={200} contentFit="cover" />
                <View style={styles.coverOverlay}>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('accessibility.changeCoverPhoto')} style={[styles.changeButton, { backgroundColor: tc.surface }]} onPress={pickCoverPhoto}>
                    <Text style={styles.changeText}>{t('common.change')}</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <LinearGradient
                colors={['rgba(10,123,79,0.3)', 'rgba(200,150,62,0.2)']}
                style={styles.coverGradient}
              >
                <View style={styles.coverContent}>
                  <Icon name="camera" size={48} color={colors.gold} />
                  <Text style={styles.coverTitle}>
                    {t('events.addCoverPhoto')}
                  </Text>
                  <Text style={styles.coverHint}>{t('events.tapToUpload')}</Text>
                </View>
              </LinearGradient>
            )}
          </Pressable>
        </Animated.View>

        {/* Title Card */}
        <Animated.View entering={FadeInUp.delay(100).duration(400)}>
          <LinearGradient
            colors={colors.gradient.cardDark}
            style={styles.formCard}
          >
            <View style={styles.formHeader}>
              <LinearGradient
                colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                style={styles.iconBg}
              >
                <Icon name="pencil" size="xs" color={colors.emerald} />
              </LinearGradient>
              <Text style={styles.formLabel}>{t('events.eventName')}</Text>
            </View>
            <TextInput
              style={[styles.titleInput, { backgroundColor: tc.surface }]}
              placeholder={t('events.eventNamePlaceholder')}
              placeholderTextColor={tc.text.tertiary}
              value={title}
              onChangeText={setTitle}
              maxLength={100}
            />
            <View style={styles.charCountRow}>
              <CharCountRing current={title.length} max={100} size={24} />
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Description Card */}
        <Animated.View entering={FadeInUp.delay(150).duration(400)}>
          <LinearGradient
            colors={colors.gradient.cardDark}
            style={styles.formCard}
          >
            <View style={styles.formHeader}>
              <LinearGradient
                colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                style={styles.iconBg}
              >
                <Icon name="edit" size="xs" color={colors.emerald} />
              </LinearGradient>
              <Text style={styles.formLabel}>{t('events.description')}</Text>
            </View>
            <TextInput
              style={[styles.descriptionInput, { backgroundColor: tc.surface }]}
              placeholder={t('events.descriptionPlaceholder')}
              placeholderTextColor={tc.text.tertiary}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              maxLength={500}
              textAlignVertical="top"
            />
            <View style={styles.charCountRow}>
              <CharCountRing current={description.length} max={500} size={24} />
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Date & Time Card */}
        <Animated.View entering={FadeInUp.delay(200).duration(400)}>
          <LinearGradient
            colors={colors.gradient.cardDark}
            style={styles.formCard}
          >
            <View style={styles.formHeader}>
              <LinearGradient
                colors={['rgba(200,150,62,0.3)', 'rgba(200,150,62,0.15)']}
                style={styles.iconBg}
              >
                <Icon name="calendar" size="xs" color={colors.gold} />
              </LinearGradient>
              <Text style={styles.formLabel}>{t('events.dateTime')}</Text>
            </View>

            <Pressable accessibilityRole="button" accessibilityLabel={t('events.start')} style={styles.dateRow} onPress={() => setShowDatePicker('start')}>
              <Text style={styles.dateLabel}>{t('events.start')}</Text>
              <View style={styles.dateValue}>
                <Text style={styles.dateText}>{formatDateTime(startDate)}</Text>
                <Icon name="chevron-right" size="xs" color={tc.text.tertiary} />
              </View>
            </Pressable>

            <View style={[styles.dateDivider, { backgroundColor: tc.border }]} />

            <Pressable accessibilityRole="button" accessibilityLabel={t('events.end')} style={styles.dateRow} onPress={() => setShowDatePicker('end')}>
              <Text style={styles.dateLabel}>{t('events.end')}</Text>
              <View style={styles.dateValue}>
                <Text style={styles.dateText}>{formatDateTime(endDate)}</Text>
                <Icon name="chevron-right" size="xs" color={tc.text.tertiary} />
              </View>
            </Pressable>

            <View style={[styles.toggleRow, { borderTopColor: tc.border }]}>
              <Text style={styles.toggleLabel}>{t('events.allDay')}</Text>
              <Switch
                value={allDay}
                onValueChange={setAllDay}
                trackColor={{ false: tc.surface, true: colors.emeraldLight }}
                thumbColor={allDay ? colors.emerald : tc.text.tertiary}
                accessibilityRole="switch"
                accessibilityLabel={t('events.allDay')}
                accessibilityState={{ checked: allDay }}
              />
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Location Card */}
        <Animated.View entering={FadeInUp.delay(250).duration(400)}>
          <LinearGradient
            colors={colors.gradient.cardDark}
            style={styles.formCard}
          >
            <View style={styles.formHeader}>
              <LinearGradient
                colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                style={styles.iconBg}
              >
                <Icon name="map-pin" size="xs" color={colors.emerald} />
              </LinearGradient>
              <Text style={styles.formLabel}>{t('events.location')}</Text>
            </View>

            <View style={[styles.toggleRow, { borderTopColor: tc.border }]}>
              <Text style={styles.toggleLabel}>{t('events.onlineEvent')}</Text>
              <Switch
                value={isOnline}
                onValueChange={setIsOnline}
                trackColor={{ false: tc.surface, true: colors.emeraldLight }}
                thumbColor={isOnline ? colors.emerald : tc.text.tertiary}
                accessibilityRole="switch"
                accessibilityLabel={t('events.onlineEvent')}
                accessibilityState={{ checked: isOnline }}
              />
            </View>

            <TextInput
              style={[styles.locationInput, { backgroundColor: tc.surface }]}
              placeholder={isOnline ? t('events.addMeetingUrl') : t('events.addLocation')}
              placeholderTextColor={tc.text.tertiary}
              value={location}
              onChangeText={setLocation}
            />
          </LinearGradient>
        </Animated.View>

        {/* Event Type Selector */}
        <Animated.View entering={FadeInUp.delay(300).duration(400)}>
          <LinearGradient
            colors={colors.gradient.cardDark}
            style={styles.formCard}
          >
            <View style={styles.formHeader}>
              <LinearGradient
                colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                style={styles.iconBg}
              >
                <Icon name="layers" size="xs" color={colors.emerald} />
              </LinearGradient>
              <Text style={styles.formLabel}>{t('events.eventType')}</Text>
            </View>

            <View style={styles.pillRow}>
              {(['in-person', 'online', 'hybrid'] as EventType[]).map((type) => {
                const eventTypeLabel = type === 'in-person' ? t('events.inPerson') : type === 'online' ? t('events.online') : t('events.hybrid');
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={eventTypeLabel}
                    key={type}
                    style={styles.pillButton}
                    onPress={() => setEventType(type)}
                  >
                    {eventType === type ? (
                      <LinearGradient
                        colors={[colors.emerald, colors.emeraldDark]}
                        style={styles.pillGradient}
                      >
                        <Text style={[styles.pillText, styles.pillTextActive]}>
                          {eventTypeLabel}
                        </Text>
                      </LinearGradient>
                    ) : (
                      <View style={[styles.pillInner, { backgroundColor: tc.surface }]}>
                        <Text style={styles.pillText}>
                          {eventTypeLabel}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Privacy Selector */}
        <Animated.View entering={FadeInUp.delay(350).duration(400)}>
          <LinearGradient
            colors={colors.gradient.cardDark}
            style={styles.formCard}
          >
            <View style={styles.formHeader}>
              <LinearGradient
                colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                style={styles.iconBg}
              >
                <Icon name={getPrivacyIcon()} size="xs" color={colors.emerald} />
              </LinearGradient>
              <Text style={styles.formLabel}>{t('events.privacy')}</Text>
            </View>

            <View style={styles.pillRow}>
              {(['public', 'members', 'invite'] as PrivacyType[]).map((type) => {
                const privacyLabel = type === 'public' ? t('events.public') : type === 'members' ? t('events.members') : t('events.inviteOnly');
                return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={privacyLabel}
                      key={type}
                      style={styles.pillButton}
                      onPress={() => setPrivacy(type)}
                    >
                      {privacy === type ? (
                        <LinearGradient
                          colors={[colors.emerald, colors.emeraldDark]}
                          style={styles.pillGradient}
                        >
                          <Text style={[styles.pillText, styles.pillTextActive]}>
                            {privacyLabel}
                          </Text>
                        </LinearGradient>
                      ) : (
                        <View style={[styles.pillInner, { backgroundColor: tc.surface }]}>
                          <Text style={styles.pillText}>
                            {privacyLabel}
                          </Text>
                        </View>
                      )}
                    </Pressable>
                
                );
              })}
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Community Selector */}
        <Animated.View entering={FadeInUp.delay(400).duration(400)}>
          <LinearGradient
            colors={colors.gradient.cardDark}
            style={styles.formCard}
          >
            <View style={styles.formHeader}>
              <LinearGradient
                colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                style={styles.iconBg}
              >
                <Icon name="users" size="xs" color={colors.emerald} />
              </LinearGradient>
              <Text style={styles.formLabel}>{t('events.community')}</Text>
            </View>

            <View style={[styles.communityDropdown, { backgroundColor: tc.surface }]}>
              <Text style={selectedCommunity ? styles.dropdownValue : styles.dropdownPlaceholder}>
                {selectedCommunity
                  ? communities.find(c => c.id === selectedCommunity)?.name
                  : t('events.postToCommunity')}
              </Text>
              <Icon name="chevron-down" size="xs" color={tc.text.tertiary} />
            </View>

            <Text style={styles.sectionTitle}>{t('events.yourCommunities')}</Text>
            {communitiesLoading ? (
              [...Array(3)].map((_, i) => (
                <View key={i} style={[styles.communityRow, i < 2 && styles.communityRowBorder]}>
                  <Skeleton.Circle size={40} />
                  <View style={styles.communityInfo}>
                    <Skeleton.Rect width="60%" height={14} borderRadius={6} />
                    <Skeleton.Rect width="30%" height={12} borderRadius={6} style={{ marginTop: 4 }} />
                  </View>
                </View>
              ))
            ) : communities.length === 0 ? (
              <EmptyState
                icon="users"
                title={t('events.noCommunities')}
                subtitle={t('events.joinCommunitiesToPost')}
              />
            ) : (
              communities.map((community, index) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={community.name}
                  key={community.id}
                  style={[
                    styles.communityRow,
                    index < communities.length - 1 && styles.communityRowBorder,
                    selectedCommunity === community.id && styles.communityRowSelected,
                  ]}
                  onPress={() => setSelectedCommunity(community.id)}
                >
                  <Avatar uri={community.avatarUrl} name={community.name} size="sm" />
                  <View style={styles.communityInfo}>
                    <Text style={styles.communityName}>{community.name}</Text>
                    <Text style={styles.communityMeta}>{community.memberCount.toLocaleString()} {t('events.members')}</Text>
                  </View>
                  {selectedCommunity === community.id && (
                    <LinearGradient
                      colors={[colors.emerald, colors.emeraldDark]}
                      style={styles.checkCircle}
                    >
                      <Icon name="check" size="xs" color={tc.text.primary} />
                    </LinearGradient>
                  )}
                </Pressable>
              ))
            )}
          </LinearGradient>
        </Animated.View>

        {/* Reminders Card */}
        <Animated.View entering={FadeInUp.delay(450).duration(400)}>
          <LinearGradient
            colors={colors.gradient.cardDark}
            style={styles.formCard}
          >
            <View style={styles.formHeader}>
              <LinearGradient
                colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                style={styles.iconBg}
              >
                <Icon name="bell" size="xs" color={colors.emerald} />
              </LinearGradient>
              <Text style={styles.formLabel}>{t('events.reminders')}</Text>
            </View>

            <View style={[styles.toggleRow, { borderTopColor: tc.border }]}>
              <View style={styles.reminderLabel}>
                <Icon name="clock" size="xs" color={tc.text.secondary} style={styles.reminderIcon} />
                <Text style={styles.toggleLabel}>{t('events.remind1Hour')}</Text>
              </View>
              <Switch
                value={reminder1h}
                onValueChange={setReminder1h}
                trackColor={{ false: tc.surface, true: colors.emeraldLight }}
                thumbColor={reminder1h ? colors.emerald : tc.text.tertiary}
                accessibilityRole="switch"
                accessibilityLabel={t('events.remind1Hour')}
                accessibilityState={{ checked: reminder1h }}
              />
            </View>

            <View style={[styles.toggleRow, { borderTopColor: tc.border }]}>
              <View style={styles.reminderLabel}>
                <Icon name="calendar" size="xs" color={tc.text.secondary} style={styles.reminderIcon} />
                <Text style={styles.toggleLabel}>{t('events.remind1Day')}</Text>
              </View>
              <Switch
                value={reminder1d}
                onValueChange={setReminder1d}
                trackColor={{ false: tc.surface, true: colors.emeraldLight }}
                thumbColor={reminder1d ? colors.emerald : tc.text.tertiary}
                accessibilityRole="switch"
                accessibilityLabel={t('events.remind1Day')}
                accessibilityState={{ checked: reminder1d }}
              />
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Bottom Spacer */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom Bar */}
      <View style={[styles.bottomBar, { backgroundColor: tc.bg, borderTopColor: tc.border, paddingBottom: Math.max(insets.bottom, spacing.base) }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('events.saveDraft')} onPress={async () => {
          await saveDraftImmediate({ title, description, location, eventType, privacy, isOnline, allDay, selectedCommunity });
          showToast({ message: t('common.saved'), variant: 'success' });
        }}>
          <Text style={styles.draftText}>{t('events.saveDraft')}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('events.createEvent')} onPress={handleSubmit} disabled={submitting} style={{ opacity: submitting ? 0.5 : 1 }}>
          <LinearGradient
            colors={[colors.emerald, colors.emeraldDark]}
            style={styles.createButton}
          >
            <Text style={styles.createText}>{submitting ? t('events.creating') : t('events.createEvent')}</Text>
          </LinearGradient>
        </Pressable>
      </View>

      {/* Discard confirmation */}
      <BottomSheet visible={showDiscardSheet} onClose={() => setShowDiscardSheet(false)}>
        <BottomSheetItem
          label={t('common.saveDraft')}
          icon={<Icon name="bookmark" size="sm" color={tc.text.primary} />}
          onPress={async () => {
            try {
              await saveDraftImmediate({ title, description, location, eventType, privacy, isOnline, allDay, selectedCommunity });
              setShowDiscardSheet(false);
              showToast({ message: t('common.draftSaved'), variant: 'success' });
              router.back();
            } catch {
              showToast({ message: t('common.error'), variant: 'error' });
            }
          }}
        />
        <BottomSheetItem
          label={t('compose.discard')}
          icon={<Icon name="trash" size="sm" color={colors.error} />}
          destructive
          onPress={() => {
            setShowDiscardSheet(false);
            clearDraft().catch(() => {});
            router.back();
          }}
        />
        <BottomSheetItem
          label={t('common.cancel')}
          icon={<Icon name="x" size="sm" color={tc.text.primary} />}
          onPress={() => setShowDiscardSheet(false)}
        />
      </BottomSheet>

      {/* Date Picker Bottom Sheet — @react-native-community/datetimepicker not installed, using quick-select options */}
      <BottomSheet visible={showDatePicker !== null} onClose={() => setShowDatePicker(null)} snapPoint={0.6}>
        <Text style={styles.sheetTitle}>{t('events.selectDateTime')}</Text>
        <View style={styles.datePickerPlaceholder}>
          <Text style={styles.datePickerText}>
            {showDatePicker === 'start' ? t('events.selectStartDate') : t('events.selectEndDate')}
          </Text>
          {[
            { label: t('events.inOneHour'), hours: 1 },
            { label: t('events.inTwoHours'), hours: 2 },
            { label: t('events.tomorrow'), hours: 24 },
            { label: t('events.nextWeek'), hours: 168 },
          ].map((option) => {
            const optionDate = new Date();
            optionDate.setHours(optionDate.getHours() + option.hours);
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={option.label}
                key={option.hours}
                style={styles.confirmButton}
                onPress={() => handleDateSelect(optionDate)}
              >
                <LinearGradient colors={colors.gradient.cardDark} style={styles.confirmButtonGradient}>
                  <Text style={styles.confirmButtonText}>{option.label} — {formatDateTime(optionDate)}</Text>
                </LinearGradient>
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>
    </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc.bg,
  },
  scrollContent: {
    padding: spacing.base,
  },
  coverContainer: {
    height: 200,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.emerald,
    borderStyle: 'dashed',
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  coverHasImage: {
    borderStyle: 'solid',
    borderColor: tc.border,
  },
  coverGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverContent: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  coverTitle: {
    fontSize: fontSize.md,
    fontFamily: fonts.semibold,
    color: tc.text.primary,
  },
  coverHint: {
    fontSize: fontSize.sm,
    fontFamily: fonts.regular,
    color: tc.text.secondary,
  },
  coverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  changeButton: {
    backgroundColor: tc.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  changeText: {
    fontSize: fontSize.base,
    fontFamily: fonts.medium,
    color: tc.text.primary,
  },
  formCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  iconBg: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formLabel: {
    fontSize: fontSize.md,
    fontFamily: fonts.semibold,
    color: tc.text.primary,
  },
  titleInput: {
    fontSize: fontSize.base,
    fontFamily: fonts.regular,
    color: tc.text.primary,
    padding: spacing.sm,
    backgroundColor: tc.surface,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
  },
  descriptionInput: {
    fontSize: fontSize.base,
    fontFamily: fonts.regular,
    color: tc.text.primary,
    padding: spacing.sm,
    backgroundColor: tc.surface,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
    minHeight: 100,
  },
  locationInput: {
    fontSize: fontSize.base,
    fontFamily: fonts.regular,
    color: tc.text.primary,
    padding: spacing.sm,
    backgroundColor: tc.surface,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  charCountRow: {
    alignItems: 'flex-end',
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  dateLabel: {
    fontSize: fontSize.base,
    fontFamily: fonts.medium,
    color: tc.text.secondary,
    width: 50,
  },
  dateValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dateText: {
    fontSize: fontSize.base,
    fontFamily: fonts.regular,
    color: tc.text.primary,
  },
  dateDivider: {
    height: 1,
    backgroundColor: tc.border,
    marginVertical: spacing.xs,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: tc.border,
  },
  toggleLabel: {
    fontSize: fontSize.base,
    fontFamily: fonts.medium,
    color: tc.text.primary,
  },
  reminderLabel: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reminderIcon: {
    marginEnd: spacing.sm,
  },
  pillRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  pillButton: {
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  pillGradient: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  pillInner: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: tc.surface,
    borderRadius: radius.full,
  },
  pillText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.medium,
    color: tc.text.secondary,
  },
  pillTextActive: {
    color: tc.text.primary,
  },
  communityDropdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.sm,
    backgroundColor: tc.surface,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  dropdownPlaceholder: {
    fontSize: fontSize.base,
    fontFamily: fonts.regular,
    color: tc.text.tertiary,
  },
  dropdownValue: {
    fontSize: fontSize.base,
    fontFamily: fonts.regular,
    color: tc.text.primary,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontFamily: fonts.semibold,
    color: tc.text.secondary,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  communityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  communityRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: tc.border,
  },
  communityRowSelected: {
    backgroundColor: colors.active.emerald5,
    borderRadius: radius.sm,
  },
  communityInfo: {
    flex: 1,
    marginStart: spacing.sm,
  },
  communityName: {
    fontSize: fontSize.base,
    fontFamily: fonts.medium,
    color: tc.text.primary,
  },
  communityMeta: {
    fontSize: fontSize.xs,
    fontFamily: fonts.regular,
    color: tc.text.tertiary,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomSpacer: {
    height: 100,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    start: 0,
    end: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.base,
    backgroundColor: tc.bg,
    borderTopWidth: 1,
    borderTopColor: tc.border,
  },
  draftText: {
    fontSize: fontSize.base,
    fontFamily: fonts.medium,
    color: tc.text.secondary,
    padding: spacing.sm,
  },
  createButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  createText: {
    fontSize: fontSize.base,
    fontFamily: fonts.semibold,
    color: tc.text.primary,
  },
  sheetTitle: {
    fontSize: fontSize.lg,
    fontFamily: fonts.semibold,
    color: tc.text.primary,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  datePickerPlaceholder: {
    alignItems: 'center',
    padding: spacing.lg,
  },
  datePickerText: {
    fontSize: fontSize.base,
    fontFamily: fonts.regular,
    color: tc.text.secondary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  datePickerHint: {
    fontSize: fontSize.sm,
    fontFamily: fonts.regular,
    color: tc.text.tertiary,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  confirmButton: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  confirmButtonGradient: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  confirmButtonText: {
    fontSize: fontSize.base,
    fontFamily: fonts.semibold,
    color: tc.text.primary,
  },
});
