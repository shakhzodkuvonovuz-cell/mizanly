import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { colors, avatar as avatarSizes } from '@/theme';

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

interface AvatarProps {
  uri?: string | null;
  name?: string;
  size?: Size;
  showRing?: boolean;
  ringColor?: string;
}

export function Avatar({ uri, name, size = 'md', showRing, ringColor }: AvatarProps) {
  const dim = avatarSizes[size];
  const fontSize = dim * 0.4;

  return (
    <View
      style={[
        styles.wrap,
        { width: dim, height: dim, borderRadius: dim / 2 },
        showRing && { borderWidth: 2, borderColor: ringColor ?? colors.emerald, padding: 2 },
      ]}
    >
      <View style={[styles.inner, { width: showRing ? dim - 4 : dim, height: showRing ? dim - 4 : dim, borderRadius: (showRing ? dim - 4 : dim) / 2 }]}>
        {uri ? (
          <Image
            source={{ uri }}
            style={[styles.img, { width: showRing ? dim - 4 : dim, height: showRing ? dim - 4 : dim, borderRadius: (showRing ? dim - 4 : dim) / 2 }]}
            contentFit="cover"
          />
        ) : (
          <Text style={[styles.fallback, { fontSize }]}>
            {name?.[0]?.toUpperCase() ?? '?'}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  inner: { backgroundColor: colors.dark.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  img: {},
  fallback: { color: colors.text.primary, fontWeight: '700' },
});
