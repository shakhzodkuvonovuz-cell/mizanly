import { useState, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  Keyboard,
  StyleProp,
  ViewStyle,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { colors, spacing, fontSize, radius, animation } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { Icon } from '@/components/ui/Icon';
import { CharCountRing } from '@/components/ui/CharCountRing';

export interface SubmittedQuestion {
  id: string;
  text: string;
  submittedAt: Date;
  userId: string;
}

export interface QuestionStickerData {
  prompt?: string;
  submittedQuestions?: SubmittedQuestion[];
}

interface QuestionStickerProps {
  data: QuestionStickerData;
  onResponse?: (questionText: string) => void;
  isCreator?: boolean;
  style?: StyleProp<ViewStyle>;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function QuestionSticker({ data, onResponse, isCreator = false, style }: QuestionStickerProps) {
  const tc = useThemeColors();
  const { t } = useTranslation();
  const [inputText, setInputText] = useState('');
  const [submittedQuestions, setSubmittedQuestions] = useState<SubmittedQuestion[]>(
    data.submittedQuestions || []
  );
  const [showInput, setShowInput] = useState(!isCreator);

  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  // Creator sees list, not input
  useEffect(() => {
    setShowInput(!isCreator);
  }, [isCreator]);

  const handleSubmit = () => {
    if (inputText.trim().length === 0) return;

    const newQuestion: SubmittedQuestion = {
      id: Date.now().toString(),
      text: inputText.trim(),
      submittedAt: new Date(),
      userId: 'current-user',
    };

    // Immediate optimistic update — no fake setTimeout
    scale.value = withSpring(0.95, animation.spring.snappy);
    setSubmittedQuestions(prev => [newQuestion, ...prev]);
    setInputText('');
    Keyboard.dismiss();
    scale.value = withSpring(1, animation.spring.snappy);

    if (onResponse) {
      onResponse(newQuestion.text);
    }
  };

  const handleReply = (questionId: string) => {
    // In a real app, this would open a reply composer or navigate
  };

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const renderQuestionItem = ({ item }: { item: SubmittedQuestion }) => (
    <View style={styles.questionItem}>
      <Text style={styles.questionText} numberOfLines={3}>
        {item.text}
      </Text>
      <Pressable
        style={styles.replyButton}
        onPress={() => handleReply(item.id)}
        accessibilityLabel={t('common.reply')}
        accessibilityRole="button"
      >
        <Icon name="send" size="xs" color={colors.emerald} />
        <Text style={styles.replyText}>{t('stories.questionReply')}</Text>
      </Pressable>
    </View>
  );

  return (
    <Animated.View style={[styles.container, containerStyle, style]}>
      <Text style={styles.title}>
        {data.prompt || 'Ask me anything!'}
      </Text>

      {showInput ? (
        <>
          <TextInput
            style={[styles.input, { backgroundColor: tc.bgElevated, borderColor: tc.borderLight }]}
            placeholder={t('saf.questionPlaceholder')}
            placeholderTextColor={colors.text.tertiary}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={200}
            editable
            accessibilityLabel={t('accessibility.questionInput')}
            accessibilityHint="Type your question for the story creator"
          />
          <View style={styles.inputFooter}>
            <CharCountRing current={inputText.length} max={200} size={22} />
            <Pressable
              style={[
                styles.submitButton, { backgroundColor: tc.bgElevated, borderColor: tc.borderLight },
                inputText.trim().length === 0 && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={inputText.trim().length === 0}
              accessibilityLabel={t('common.submit')}
              accessibilityRole="button"
            >
              <Icon
                name="send"
                size="sm"
                color={inputText.trim().length === 0 ? colors.text.tertiary : colors.emerald}
              />
            </Pressable>
          </View>
        </>
      ) : (
        // Creator view: list of submitted questions
        <View style={styles.creatorContainer}>
          <Text style={styles.sectionTitle}>
            {t('stories.questionCount', { count: submittedQuestions.length }).replace('{{count}}', String(submittedQuestions.length))}
          </Text>
          {submittedQuestions.length === 0 ? (
            <View style={styles.emptyState}>
              <Icon name="message-circle" size="lg" color={colors.text.tertiary} />
              <Text style={styles.emptyText}>
                {t('stories.questionNoQuestionsYet')}
              </Text>
            </View>
          ) : (
            <FlatList
              data={submittedQuestions}
              renderItem={renderQuestionItem}
              keyExtractor={item => item.id}
              style={styles.list}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
            />
          )}
        </View>
      )}

      {isCreator && (
        <View style={styles.creatorBadge}>
          <Icon name="eye" size="xs" color={colors.text.secondary} />
          <Text style={styles.creatorText}>{t('stories.creatorView')}</Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.glass.darkHeavy,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.glass.border,
    width: 280,
    maxWidth: '100%',
    maxHeight: 400,
  },
  title: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  input: {
    backgroundColor: colors.dark.bgElevated,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.text.primary,
    fontSize: fontSize.base,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.dark.borderLight,
  },
  inputFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  submitButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.dark.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.dark.borderLight,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  creatorContainer: {
    flex: 1,
  },
  sectionTitle: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginBottom: spacing.md,
    textTransform: 'uppercase',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: spacing.xs,
  },
  questionItem: {
    backgroundColor: colors.dark.bgElevated,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.emerald,
  },
  questionText: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  replyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.active.emerald10,
    borderRadius: radius.full,
  },
  replyText: {
    color: colors.emerald,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    opacity: 0.5,
  },
  emptyText: {
    color: colors.text.tertiary,
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
  },
  creatorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.active.white5,
    borderRadius: radius.full,
    alignSelf: 'center',
  },
  creatorText: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
  },
});
