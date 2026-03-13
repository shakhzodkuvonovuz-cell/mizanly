import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Switch,
  Dimensions,
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
import { eventsApi } from '@/services/eventsApi';
import { communitiesApi } from '@/services/communitiesApi';
import type { CreateEventDto, EventPrivacy, EventType as ApiEventType } from '@/types/events';
import type { Community } from '@/types/communities';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Alert } from 'react-native';
import { useTranslation } from '@/hooks/useTranslation';

const { width } = Dimensions.get('window');

type EventType = 'in-person' | 'online' | 'hybrid';
type PrivacyType = 'public' | 'members' | 'invite';



export default function CreateEventScreen() {
  const router = useRouter();
  const { t } = useTranslation();
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
  const [refreshing, setRefreshing] = useState(false);
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
  const [communities, setCommunities] = useState<Community[]>([]);
  const [communitiesLoading, setCommunitiesLoading] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  useEffect(() => {
    const fetchCommunities = async () => {
      setCommunitiesLoading(true);
      try {
        const response = await communitiesApi.list();
        setCommunities(response.data.data);
      } catch (err) {
        // Silently fail - communities optional for event creation
        console.error('Failed to fetch communities:', err);
      } finally {
        setCommunitiesLoading(false);
      }
    };
    fetchCommunities();
  }, []);

  useEffect(() => {
    if (showDatePicker === 'start') {
      setTempDate(startDate);
    } else if (showDatePicker === 'end') {
      setTempDate(endDate);
    }
  }, [showDatePicker, startDate, endDate]);

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
      router.push(`/(screens)/event-detail?id=${response.data.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('events.createFailed');
      setError(message);
      Alert.alert(t('common.error'), t('events.createFailedRetry'));
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
    return date.toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
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
    <SafeAreaView style={styles.container} edges={['top']}>
      <GlassHeader title={t('events.createEvent')} onBack={() => router.back()} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl tintColor={colors.emerald} refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Cover Image Section */}
        <Animated.View entering={FadeInUp.duration(400)}>
          <TouchableOpacity
            style={[styles.coverContainer, hasCover && styles.coverHasImage]}
            onPress={() => setHasCover(!hasCover)}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['rgba(10,123,79,0.3)', 'rgba(200,150,62,0.2)']}
              style={styles.coverGradient}
            >
              <View style={styles.coverContent}>
                <Icon name="camera" size={48} color={colors.gold} />
                <Text style={styles.coverTitle}>
                  {hasCover ? t('events.changeCoverPhoto') : t('events.addCoverPhoto')}
                </Text>
                {!hasCover && (
                  <Text style={styles.coverHint}>{t('events.tapToUpload')}</Text>
                )}
              </View>
            </LinearGradient>
            {hasCover && (
              <View style={styles.coverOverlay}>
                <TouchableOpacity style={styles.changeButton} activeOpacity={0.8}>
                  <Text style={styles.changeText}>{t('common.change')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
        </Animated.View>

        {/* Title Card */}
        <Animated.View entering={FadeInUp.delay(100).duration(400)}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
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
              style={styles.titleInput}
              placeholder={t('events.eventNamePlaceholder')}
              placeholderTextColor={colors.text.tertiary}
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
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
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
              style={styles.descriptionInput}
              placeholder={t('events.descriptionPlaceholder')}
              placeholderTextColor={colors.text.tertiary}
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
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
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

            <TouchableOpacity style={styles.dateRow} onPress={() => setShowDatePicker('start')} activeOpacity={0.8}>
              <Text style={styles.dateLabel}>{t('events.start')}</Text>
              <View style={styles.dateValue}>
                <Text style={styles.dateText}>{formatDateTime(startDate)}</Text>
                <Icon name="chevron-right" size="xs" color={colors.text.tertiary} />
              </View>
            </TouchableOpacity>

            <View style={styles.dateDivider} />

            <TouchableOpacity style={styles.dateRow} onPress={() => setShowDatePicker('end')} activeOpacity={0.8}>
              <Text style={styles.dateLabel}>{t('events.end')}</Text>
              <View style={styles.dateValue}>
                <Text style={styles.dateText}>{formatDateTime(endDate)}</Text>
                <Icon name="chevron-right" size="xs" color={colors.text.tertiary} />
              </View>
            </TouchableOpacity>

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>{t('events.allDay')}</Text>
              <Switch
                value={allDay}
                onValueChange={setAllDay}
                trackColor={{ false: colors.dark.surface, true: colors.emeraldLight }}
                thumbColor={allDay ? colors.emerald : colors.text.tertiary}
              />
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Location Card */}
        <Animated.View entering={FadeInUp.delay(250).duration(400)}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
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

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>{t('events.onlineEvent')}</Text>
              <Switch
                value={isOnline}
                onValueChange={setIsOnline}
                trackColor={{ false: colors.dark.surface, true: colors.emeraldLight }}
                thumbColor={isOnline ? colors.emerald : colors.text.tertiary}
              />
            </View>

            <TextInput
              style={styles.locationInput}
              placeholder={isOnline ? t('events.addMeetingUrl') : t('events.addLocation')}
              placeholderTextColor={colors.text.tertiary}
              value={location}
              onChangeText={setLocation}
            />
          </LinearGradient>
        </Animated.View>

        {/* Event Type Selector */}
        <Animated.View entering={FadeInUp.delay(300).duration(400)}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
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
                  <TouchableOpacity
                    key={type}
                    style={styles.pillButton}
                    onPress={() => setEventType(type)}
                    activeOpacity={0.8}
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
                      <View style={styles.pillInner}>
                        <Text style={styles.pillText}>
                          {eventTypeLabel}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Privacy Selector */}
        <Animated.View entering={FadeInUp.delay(350).duration(400)}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
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
                  <TouchableOpacity
                    key={type}
                    style={styles.pillButton}
                    onPress={() => setPrivacy(type)}
                    activeOpacity={0.8}
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
                      <View style={styles.pillInner}>
                        <Text style={styles.pillText}>
                          {privacyLabel}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Community Selector */}
        <Animated.View entering={FadeInUp.delay(400).duration(400)}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
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

            <TouchableOpacity style={styles.communityDropdown} activeOpacity={0.8}>
              <Text style={selectedCommunity ? styles.dropdownValue : styles.dropdownPlaceholder}>
                {selectedCommunity
                  ? communities.find(c => c.id === selectedCommunity)?.name
                  : t('events.postToCommunity')}
              </Text>
              <Icon name="chevron-down" size="xs" color={colors.text.tertiary} />
            </TouchableOpacity>

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
                size="sm"
              />
            ) : (
              communities.map((community, index) => (
                <TouchableOpacity
                  key={community.id}
                  style={[
                    styles.communityRow,
                    index < communities.length - 1 && styles.communityRowBorder,
                    selectedCommunity === community.id && styles.communityRowSelected,
                  ]}
                  onPress={() => setSelectedCommunity(community.id)}
                  activeOpacity={0.8}
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
                      <Icon name="check" size="xs" color={colors.text.primary} />
                    </LinearGradient>
                  )}
                </TouchableOpacity>
              ))
            )}
          </LinearGradient>
        </Animated.View>

        {/* Reminders Card */}
        <Animated.View entering={FadeInUp.delay(450).duration(400)}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
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

            <View style={styles.toggleRow}>
              <View style={styles.reminderLabel}>
                <Icon name="clock" size="xs" color={colors.text.secondary} style={styles.reminderIcon} />
                <Text style={styles.toggleLabel}>{t('events.remind1Hour')}</Text>
              </View>
              <Switch
                value={reminder1h}
                onValueChange={setReminder1h}
                trackColor={{ false: colors.dark.surface, true: colors.emeraldLight }}
                thumbColor={reminder1h ? colors.emerald : colors.text.tertiary}
              />
            </View>

            <View style={styles.toggleRow}>
              <View style={styles.reminderLabel}>
                <Icon name="calendar" size="xs" color={colors.text.secondary} style={styles.reminderIcon} />
                <Text style={styles.toggleLabel}>{t('events.remind1Day')}</Text>
              </View>
              <Switch
                value={reminder1d}
                onValueChange={setReminder1d}
                trackColor={{ false: colors.dark.surface, true: colors.emeraldLight }}
                thumbColor={reminder1d ? colors.emerald : colors.text.tertiary}
              />
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Bottom Spacer */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Bottom Bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity activeOpacity={0.8}>
          <Text style={styles.draftText}>{t('events.saveDraft')}</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.8} onPress={handleSubmit} disabled={submitting}>
          <LinearGradient
            colors={[colors.emerald, colors.emeraldDark]}
            style={styles.createButton}
          >
            <Text style={styles.createText}>{submitting ? t('events.creating') : t('events.createEvent')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Date Picker Bottom Sheet */}
      <BottomSheet visible={showDatePicker !== null} onClose={() => setShowDatePicker(null)} snapPoint={0.6}>
        <Text style={styles.sheetTitle}>{t('events.selectDateTime')}</Text>
        <View style={styles.datePickerPlaceholder}>
          <Text style={styles.datePickerText}>
            {t('events.datePickerPlaceholder')}
          </Text>
          <Text style={styles.datePickerHint}>
            {t('events.datePickerHint')}
          </Text>
          <TouchableOpacity style={styles.confirmButton} onPress={() => handleDateSelect(tempDate)}>
            <LinearGradient colors={[colors.emerald, colors.emeraldDark]} style={styles.confirmButtonGradient}>
              <Text style={styles.confirmButtonText}>{t('common.confirm')}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </BottomSheet>
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
    borderColor: colors.dark.border,
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
    color: colors.text.primary,
  },
  coverHint: {
    fontSize: fontSize.sm,
    fontFamily: fonts.regular,
    color: colors.text.secondary,
  },
  coverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  changeButton: {
    backgroundColor: colors.dark.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  changeText: {
    fontSize: fontSize.base,
    fontFamily: fonts.medium,
    color: colors.text.primary,
  },
  formCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
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
    color: colors.text.primary,
  },
  titleInput: {
    fontSize: fontSize.base,
    fontFamily: fonts.regular,
    color: colors.text.primary,
    padding: spacing.sm,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
  },
  descriptionInput: {
    fontSize: fontSize.base,
    fontFamily: fonts.regular,
    color: colors.text.primary,
    padding: spacing.sm,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
    minHeight: 100,
  },
  locationInput: {
    fontSize: fontSize.base,
    fontFamily: fonts.regular,
    color: colors.text.primary,
    padding: spacing.sm,
    backgroundColor: colors.dark.surface,
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
    color: colors.text.secondary,
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
    color: colors.text.primary,
  },
  dateDivider: {
    height: 1,
    backgroundColor: colors.dark.border,
    marginVertical: spacing.xs,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.dark.border,
  },
  toggleLabel: {
    fontSize: fontSize.base,
    fontFamily: fonts.medium,
    color: colors.text.primary,
  },
  reminderLabel: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reminderIcon: {
    marginRight: spacing.sm,
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
    backgroundColor: colors.dark.surface,
    borderRadius: radius.full,
  },
  pillText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.medium,
    color: colors.text.secondary,
  },
  pillTextActive: {
    color: colors.text.primary,
  },
  communityDropdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.sm,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  dropdownPlaceholder: {
    fontSize: fontSize.base,
    fontFamily: fonts.regular,
    color: colors.text.tertiary,
  },
  dropdownValue: {
    fontSize: fontSize.base,
    fontFamily: fonts.regular,
    color: colors.text.primary,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontFamily: fonts.semibold,
    color: colors.text.secondary,
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
    borderBottomColor: colors.dark.border,
  },
  communityRowSelected: {
    backgroundColor: 'rgba(10,123,79,0.05)',
    borderRadius: radius.sm,
  },
  communityInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  communityName: {
    fontSize: fontSize.base,
    fontFamily: fonts.medium,
    color: colors.text.primary,
  },
  communityMeta: {
    fontSize: fontSize.xs,
    fontFamily: fonts.regular,
    color: colors.text.tertiary,
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
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.base,
    backgroundColor: colors.dark.bg,
    borderTopWidth: 1,
    borderTopColor: colors.dark.border,
  },
  draftText: {
    fontSize: fontSize.base,
    fontFamily: fonts.medium,
    color: colors.text.secondary,
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
    color: colors.text.primary,
  },
  sheetTitle: {
    fontSize: fontSize.lg,
    fontFamily: fonts.semibold,
    color: colors.text.primary,
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
    color: colors.text.secondary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  datePickerHint: {
    fontSize: fontSize.sm,
    fontFamily: fonts.regular,
    color: colors.text.tertiary,
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
    color: colors.text.primary,
  },
});
