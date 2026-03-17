import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, radius, fontSize } from '@/theme';

export type Occasion = 'eid-fitr' | 'eid-adha' | 'ramadan' | 'mawlid' | 'isra-miraj' | 'hijri-new-year';

interface EidFrameProps {
  occasion: Occasion;
  children: React.ReactNode;
}

const OCCASION_CONFIG: Record<Occasion, { greeting: string; greetingAr: string; colors: [string, string] }> = {
  'eid-fitr': { greeting: 'Eid Mubarak', greetingAr: 'عيد مبارك', colors: ['#0A7B4F', '#15A76C'] },
  'eid-adha': { greeting: 'Eid Al-Adha Mubarak', greetingAr: 'عيد الأضحى مبارك', colors: ['#C8963E', '#E8C476'] },
  'ramadan': { greeting: 'Ramadan Kareem', greetingAr: 'رمضان كريم', colors: ['#1A3A5C', '#2E5F8A'] },
  'mawlid': { greeting: 'Happy Mawlid', greetingAr: 'المولد النبوي الشريف', colors: ['#0A7B4F', '#C8963E'] },
  'isra-miraj': { greeting: "Isra' & Mi'raj", greetingAr: 'الإسراء والمعراج', colors: ['#1A237E', '#4A148C'] },
  'hijri-new-year': { greeting: 'Happy Islamic New Year', greetingAr: 'سنة هجرية مباركة', colors: ['#0A7B4F', '#0D9462'] },
};

export function EidFrame({ occasion, children }: EidFrameProps) {
  const config = OCCASION_CONFIG[occasion];

  return (
    <View style={styles.container}>
      {/* Top border with geometric pattern */}
      <LinearGradient colors={config.colors} style={styles.topBorder}>
        <View style={styles.patternRow}>
          {Array.from({ length: 7 }).map((_, i) => (
            <View key={i} style={[styles.diamond, { transform: [{ rotate: '45deg' }] }]}>
              <View style={styles.diamondInner} />
            </View>
          ))}
        </View>
        <Text style={styles.greetingAr}>{config.greetingAr}</Text>
        <Text style={styles.greeting}>{config.greeting}</Text>
      </LinearGradient>

      {/* Content area */}
      <View style={styles.content}>{children}</View>

      {/* Bottom border */}
      <LinearGradient colors={[config.colors[1], config.colors[0]]} style={styles.bottomBorder}>
        <View style={styles.patternRow}>
          {Array.from({ length: 7 }).map((_, i) => (
            <View key={i} style={[styles.diamond, { transform: [{ rotate: '45deg' }] }]}>
              <View style={styles.diamondInner} />
            </View>
          ))}
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  topBorder: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    alignItems: 'center',
  },
  bottomBorder: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    alignItems: 'center',
  },
  patternRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  diamond: {
    width: 8,
    height: 8,
    borderWidth: 1,
    borderColor: colors.gold,
    justifyContent: 'center',
    alignItems: 'center',
  },
  diamondInner: {
    width: 4,
    height: 4,
    backgroundColor: colors.gold,
    transform: [{ rotate: '0deg' }],
  },
  greetingAr: {
    fontSize: fontSize.lg,
    color: '#FFFFFF',
    fontWeight: '700',
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  greeting: {
    fontSize: fontSize.sm,
    color: colors.gold,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  content: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
});

export default EidFrame;
