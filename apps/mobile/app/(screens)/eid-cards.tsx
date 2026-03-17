import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/ui/Icon';
import type { IconName } from '@/components/ui/Icon';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { EidFrame } from '@/components/islamic/EidFrame';
import type { Occasion } from '@/components/islamic/EidFrame';
import { colors, spacing, radius, fontSize } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';

interface OccasionItem {
  id: Occasion;
  name: string;
  nameAr: string;
  icon: IconName;
}

const occasions: OccasionItem[] = [
  { id: 'eid-fitr', name: 'Eid al-Fitr', nameAr: 'عيد الفطر', icon: 'star' },
  { id: 'eid-adha', name: 'Eid al-Adha', nameAr: 'عيد الأضحى', icon: 'star' },
  { id: 'ramadan', name: 'Ramadan', nameAr: 'رمضان', icon: 'moon' },
  { id: 'mawlid', name: 'Mawlid al-Nabi', nameAr: 'المولد النبوي', icon: 'heart' },
  { id: 'isra-miraj', name: "Isra' & Mi'raj", nameAr: 'الإسراء والمعراج', icon: 'globe' },
  { id: 'hijri-new-year', name: 'Islamic New Year', nameAr: 'رأس السنة الهجرية', icon: 'calendar' },
];

export default function EidCardsScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const [selectedOccasion, setSelectedOccasion] = useState<Occasion | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);

  const handleOccasionPress = (id: Occasion) => {
    setSelectedOccasion(id);
    setPreviewVisible(true);
  };

  const handleShareAsStory = () => {
    if (!selectedOccasion) return;
    setPreviewVisible(false);
    router.push({
      pathname: '/(screens)/create-story',
      params: { eidFrame: selectedOccasion },
    });
  };

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader title={t('eidCards.title')} showBack />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.grid}>
            {occasions.map((occ) => (
              <TouchableOpacity
                key={occ.id}
                onPress={() => handleOccasionPress(occ.id)}
                style={styles.card}
                activeOpacity={0.7}
              >
                <Icon name={occ.icon} size="xl" color={colors.gold} />
                <Text style={styles.cardNameAr}>{occ.nameAr}</Text>
                <Text style={styles.cardName}>{occ.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Preview BottomSheet */}
        <BottomSheet visible={previewVisible} onClose={() => setPreviewVisible(false)}>
          {selectedOccasion && (
            <View style={styles.previewContainer}>
              <EidFrame occasion={selectedOccasion}>
                <View style={styles.previewContent}>
                  <Text style={styles.previewText}>{t('eidCards.preview')}</Text>
                </View>
              </EidFrame>
              <View style={styles.actionRow}>
                <GradientButton
                  label={t('eidCards.shareAsStory')}
                  onPress={handleShareAsStory}
                  fullWidth
                />
              </View>
            </View>
          )}
        </BottomSheet>
      </View>
    </ScreenErrorBoundary>
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  card: {
    width: '47%',
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  cardNameAr: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    marginTop: spacing.sm,
    fontWeight: '600',
  },
  cardName: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  previewContainer: {
    padding: spacing.base,
  },
  previewContent: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewText: {
    color: colors.text.secondary,
    fontSize: fontSize.base,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
});
