import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

type DurationOption = 1 | 2 | 3 | 5;
type TransitionType = 'cut' | 'fade' | 'slide' | 'zoom' | 'wipe';

const DURATION_OPTIONS: DurationOption[] = [1, 2, 3, 5];

const TRANSITIONS: { id: TransitionType; name: string; icon: string }[] = [
  { id: 'cut', name: 'Cut', icon: 'scissors' },
  { id: 'fade', name: 'Fade', icon: 'eye' },
  { id: 'slide', name: 'Slide', icon: 'chevron-right' },
  { id: 'zoom', name: 'Zoom', icon: 'maximize' },
  { id: 'wipe', name: 'Wipe', icon: 'layers' },
];

export default function StitchCreateScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState<DurationOption>(5);
  const [selectedTransition, setSelectedTransition] = useState<TransitionType>('fade');
  const [isRecording, setIsRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const [flashOn, setFlashOn] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const originalCreator = {
    username: 'viral_dancer',
    displayName: 'Viral Dancer',
    isVerified: true,
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleRecording = () => {
    if (isRecording) {
      setIsRecording(false);
    } else {
      setIsRecording(true);
      const interval = setInterval(() => {
        setRecordTime((prev) => {
          const maxTime = 60 - selectedDuration;
          if (prev >= maxTime) {
            clearInterval(interval);
            setIsRecording(false);
            return maxTime;
          }
          return prev + 1;
        });
      }, 1000);
    }
  };

  const yourClipDuration = 60 - selectedDuration;
  const totalDuration = selectedDuration + recordTime;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <GlassHeader title="Create Stitch" showBackButton />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl tintColor={colors.emerald} refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Original Video Card */}
        <Animated.View entering={FadeInUp.delay(50).duration(400)}>
          <View style={styles.originalCard}>
            <LinearGradient
              colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
              style={styles.originalGradient}
            >
              {/* Creator Info */}
              <View style={styles.creatorRow}>
                <View style={styles.avatarPlaceholder}>
                  <Icon name="user" size="md" color={colors.text.tertiary} />
                </View>
                <View style={styles.creatorInfo}>
                  <View style={styles.creatorNameRow}>
                    <Text style={styles.creatorName}>{originalCreator.displayName}</Text>
                    {originalCreator.isVerified && <VerifiedBadge size={13} />}
                  </View>
                  <Text style={styles.stitchSubtitle}>Stitching from @{originalCreator.username}</Text>
                </View>
              </View>

              {/* Video Preview */}
              <View style={styles.videoPreviewContainer}>
                <LinearGradient
                  colors={['rgba(28,35,51,0.8)', 'rgba(13,17,23,0.9)']}
                  style={styles.videoPreview}
                >
                  <Icon name="play" size="xl" color={colors.text.tertiary} />
                </LinearGradient>
              </View>

              {/* Duration Selector */}
              <Text style={styles.durationLabel}>Use first:</Text>
              <View style={styles.durationButtons}>
                {DURATION_OPTIONS.map((duration) => (
                  <TouchableOpacity
                    key={duration}
                    style={styles.durationButton}
                    onPress={() => setSelectedDuration(duration)}
                  >
                    <LinearGradient
                      colors={selectedDuration === duration
                        ? ['rgba(10,123,79,0.5)', 'rgba(10,123,79,0.3)']
                        : ['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']
                      }
                      style={styles.durationButtonGradient}
                    >
                      <Text style={[
                        styles.durationButtonText,
                        selectedDuration === duration && styles.durationButtonTextActive
                      ]}>
                        {duration}s
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Progress Bar */}
              <View style={styles.progressBarContainer}>
                <View style={styles.progressBarTrack}>
                  <View style={[styles.progressBarFill, { width: `${(selectedDuration / 60) * 100}%` }]} />
                </View>
                <View style={styles.progressLabels}>
                  <Text style={styles.progressLabel}>Original: {selectedDuration}s</Text>
                  <Text style={styles.progressLabel}>Yours: {yourClipDuration}s max</Text>
                </View>
              </View>
            </LinearGradient>
          </View>
        </Animated.View>

        {/* Transition Selector */}
        <Animated.View entering={FadeInUp.delay(100).duration(400)}>
          <View style={styles.transitionCard}>
            <LinearGradient
              colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
              style={styles.transitionGradient}
            >
              <Text style={styles.transitionTitle}>Transition</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.transitionScroll}
              >
                {TRANSITIONS.map((transition, index) => (
                  <Animated.View
                    key={transition.id}
                    entering={FadeInUp.delay(index * 50).duration(300)}
                  >
                    <TouchableOpacity
                      style={styles.transitionButton}
                      onPress={() => setSelectedTransition(transition.id)}
                    >
                      <LinearGradient
                        colors={selectedTransition === transition.id
                          ? ['rgba(10,123,79,0.5)', 'rgba(10,123,79,0.3)']
                          : ['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']
                        }
                        style={styles.transitionButtonGradient}
                      >
                        <Icon
                          name={transition.icon as any}
                          size="sm"
                          color={selectedTransition === transition.id ? colors.emerald : colors.text.secondary}
                        />
                        <Text style={[
                          styles.transitionButtonText,
                          selectedTransition === transition.id && styles.transitionButtonTextActive
                        ]}>
                          {transition.name}
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </Animated.View>
                ))}
              </ScrollView>
            </LinearGradient>
          </View>
        </Animated.View>

        {/* Your Clip Section */}
        <Animated.View entering={FadeInUp.delay(150).duration(400)}>
          <View style={styles.yourClipCard}>
            <LinearGradient
              colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
              style={styles.yourClipGradient}
            >
              {/* Header */}
              <View style={styles.yourClipHeader}>
                <View style={styles.yourClipIconContainer}>
                  <LinearGradient
                    colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                    style={styles.yourClipIconGradient}
                  >
                    <Icon name="camera" size="sm" color={colors.emerald} />
                  </LinearGradient>
                </View>
                <View>
                  <Text style={styles.yourClipTitle}>Your Response</Text>
                  <Text style={styles.yourClipSubtitle}>Record your reaction or continuation</Text>
                </View>
              </View>

              {/* Camera Preview */}
              <View style={styles.cameraPreviewContainer}>
                <View style={styles.cameraPreview}>
                  <Icon name="camera" size="xl" color={colors.emerald} />
                  <Text style={styles.cameraHint}>Record your response</Text>
                </View>
              </View>

              {/* Recording Controls */}
              <View style={styles.recordingControls}>
                {/* Flip Camera */}
                <TouchableOpacity style={styles.controlButtonSmall}>
                  <LinearGradient
                    colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']}
                    style={styles.controlButtonGradientSmall}
                  >
                    <Icon name="repeat" size="sm" color={colors.text.secondary} />
                  </LinearGradient>
                </TouchableOpacity>

                {/* Record Button */}
                <TouchableOpacity style={styles.recordButtonSmall} onPress={toggleRecording}>
                  <LinearGradient
                    colors={isRecording
                      ? ['rgba(248,81,73,0.9)', 'rgba(220,60,50,0.95)']
                      : ['rgba(255,255,255,0.95)', 'rgba(240,240,240,1)']
                    }
                    style={styles.recordButtonOuterSmall}
                  >
                    {isRecording ? (
                      <View style={styles.recordingInnerSquareSmall} />
                    ) : (
                      <LinearGradient
                        colors={['rgba(248,81,73,1)', 'rgba(220,60,50,1)']}
                        style={styles.recordButtonInnerSmall}
                      />
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                {/* Flash Toggle */}
                <TouchableOpacity
                  style={styles.controlButtonSmall}
                  onPress={() => setFlashOn(!flashOn)}
                >
                  <LinearGradient
                    colors={flashOn
                      ? ['rgba(200,150,62,0.4)', 'rgba(200,150,62,0.2)']
                      : ['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)']
                    }
                    style={styles.controlButtonGradientSmall}
                  >
                    <Icon name="sun" size="sm" color={flashOn ? colors.gold : colors.text.secondary} />
                  </LinearGradient>
                </TouchableOpacity>
              </View>

              {/* Timer Display */}
              <View style={styles.timerDisplay}>
                <Text style={styles.timerText}>
                  {formatTime(recordTime)} / {formatTime(yourClipDuration)}
                </Text>
                {isRecording && (
                  <View style={styles.recordingBadge}>
                    <View style={styles.recordingDot} />
                    <Text style={styles.recordingBadgeText}>Recording</Text>
                  </View>
                )}
              </View>
            </LinearGradient>
          </View>
        </Animated.View>

        {/* Combined Preview Card */}
        <Animated.View entering={FadeInUp.delay(200).duration(400)}>
          <View style={styles.previewCard}>
            <LinearGradient
              colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
              style={styles.previewCardGradient}
            >
              <Text style={styles.previewCardTitle}>Preview</Text>

              {/* Sequence Thumbnails */}
              <View style={styles.sequenceContainer}>
                <View style={styles.sequenceItem}>
                  <LinearGradient
                    colors={['rgba(28,35,51,0.8)', 'rgba(13,17,23,0.9)']}
                    style={styles.sequenceThumbnail}
                  >
                    <Icon name="play" size="md" color={colors.text.tertiary} />
                    <View style={styles.sequenceDurationBadge}>
                      <Text style={styles.sequenceDurationText}>{selectedDuration}s</Text>
                    </View>
                  </LinearGradient>
                  <Text style={styles.sequenceLabel}>@{originalCreator.username}</Text>
                </View>

                <View style={styles.sequenceArrow}>
                  <LinearGradient
                    colors={['rgba(200,150,62,0.3)', 'rgba(200,150,62,0.1)']}
                    style={styles.arrowGradient}
                  >
                    <Icon name="chevron-right" size="sm" color={colors.gold} />
                  </LinearGradient>
                  <Text style={styles.transitionName}>{TRANSITIONS.find(t => t.id === selectedTransition)?.name}</Text>
                </View>

                <View style={styles.sequenceItem}>
                  <LinearGradient
                    colors={['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)']}
                    style={styles.sequenceThumbnail}
                  >
                    <Icon name="camera" size="md" color={colors.emerald} />
                    <View style={styles.sequenceDurationBadge}>
                      <Text style={styles.sequenceDurationText}>{recordTime}s</Text>
                    </View>
                  </LinearGradient>
                  <Text style={styles.sequenceLabel}>You</Text>
                </View>
              </View>

              {/* Total Duration */}
              <View style={styles.totalDurationContainer}>
                <Text style={styles.totalDurationLabel}>Total Duration</Text>
                <Text style={styles.totalDurationValue}>{formatTime(totalDuration)}</Text>
              </View>

              {/* Play Preview Button */}
              <TouchableOpacity
                style={styles.playPreviewButton}
                onPress={() => setShowPreview(true)}
              >
                <LinearGradient
                  colors={['rgba(10,123,79,0.9)', 'rgba(6,107,66,0.95)']}
                  style={styles.playPreviewGradient}
                >
                  <Icon name="play" size="sm" color="#FFF" />
                  <Text style={styles.playPreviewText}>Play Preview</Text>
                </LinearGradient>
              </TouchableOpacity>
            </LinearGradient>
          </View>
        </Animated.View>

        {/* Bottom Spacing */}
        <View style={styles.bottomSpacing} />
      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={styles.bottomBar}>
        <LinearGradient
          colors={['rgba(13,17,23,0.95)', 'rgba(13,17,23,1)']}
          style={styles.bottomBarGradient}
        >
          <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.nextButton} onPress={() => router.push('/create-reel')}>
            <LinearGradient
              colors={['rgba(10,123,79,0.9)', 'rgba(6,107,66,0.95)']}
              style={styles.nextButtonGradient}
            >
              <Text style={styles.nextButtonText}>Next</Text>
              <Icon name="chevron-right" size="sm" color="#FFF" />
            </LinearGradient>
          </TouchableOpacity>
        </LinearGradient>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  originalCard: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  originalGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.base,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(200,150,62,0.3)',
  },
  creatorInfo: {
    flex: 1,
  },
  creatorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  creatorName: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.text.primary,
  },
  stitchSubtitle: {
    fontSize: fontSize.xs,
    color: colors.emerald,
    marginTop: spacing.xs,
  },
  videoPreviewContainer: {
    marginTop: spacing.md,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  videoPreview: {
    height: 160,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  durationLabel: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  durationButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  durationButton: {
    flex: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  durationButtonGradient: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  durationButtonText: {
    fontSize: fontSize.base,
    color: colors.text.secondary,
  },
  durationButtonTextActive: {
    color: colors.emerald,
    fontWeight: '600',
  },
  progressBarContainer: {
    marginTop: spacing.md,
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.emerald,
    borderRadius: radius.full,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  progressLabel: {
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
  },
  transitionCard: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  transitionGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.base,
  },
  transitionTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  transitionScroll: {
    gap: spacing.sm,
  },
  transitionButton: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  transitionButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  transitionButtonText: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  transitionButtonTextActive: {
    color: colors.emerald,
    fontWeight: '600',
  },
  yourClipCard: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  yourClipGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.base,
  },
  yourClipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  yourClipIconContainer: {
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  yourClipIconGradient: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  yourClipTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.text.primary,
  },
  yourClipSubtitle: {
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
  },
  cameraPreviewContainer: {
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  cameraPreview: {
    height: 160,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.emerald,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cameraHint: {
    fontSize: fontSize.sm,
    color: colors.emerald,
  },
  recordingControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  controlButtonSmall: {
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  controlButtonGradientSmall: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordButtonSmall: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordButtonOuterSmall: {
    width: 60,
    height: 60,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.dark.bg,
  },
  recordButtonInnerSmall: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
  },
  recordingInnerSquareSmall: {
    width: 20,
    height: 20,
    borderRadius: radius.sm,
    backgroundColor: colors.error,
  },
  timerDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  timerText: {
    fontSize: fontSize.md,
    fontFamily: fonts.mono,
    color: colors.text.primary,
  },
  recordingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: 'rgba(248,81,73,0.2)',
  },
  recordingDot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.error,
  },
  recordingBadgeText: {
    fontSize: fontSize.xs,
    color: colors.error,
  },
  previewCard: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  previewCardGradient: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.base,
  },
  previewCardTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  sequenceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sequenceItem: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  sequenceThumbnail: {
    width: 80,
    height: 100,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  sequenceDurationBadge: {
    position: 'absolute',
    bottom: spacing.xs,
    right: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sequenceDurationText: {
    fontSize: 10,
    color: colors.text.primary,
    fontFamily: fonts.mono,
  },
  sequenceLabel: {
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
  },
  sequenceArrow: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  arrowGradient: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  transitionName: {
    fontSize: 10,
    color: colors.gold,
  },
  totalDurationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    marginBottom: spacing.md,
  },
  totalDurationLabel: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  totalDurationValue: {
    fontSize: fontSize.md,
    fontFamily: fonts.mono,
    color: colors.emerald,
    fontWeight: '600',
  },
  playPreviewButton: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  playPreviewGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  playPreviewText: {
    fontSize: fontSize.base,
    color: '#FFF',
    fontWeight: '600',
  },
  bottomSpacing: {
    height: 100,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  bottomBarGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    paddingBottom: spacing.lg,
  },
  cancelButton: {
    paddingHorizontal: spacing.lg,
  },
  cancelButtonText: {
    fontSize: fontSize.base,
    color: colors.text.secondary,
  },
  nextButton: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  nextButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  nextButtonText: {
    fontSize: fontSize.base,
    color: '#FFF',
    fontWeight: '600',
  },
});
