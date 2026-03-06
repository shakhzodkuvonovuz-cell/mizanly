import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, fontSize, radius } from '@/theme';
import { authApi } from '@/services/api';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

const USERNAME_RE = /^[a-z0-9_.]{3,30}$/;

export default function UsernameScreen() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const debouncedUsername = useDebounce(username, 500);

  useEffect(() => {
    setAvailable(null);
    if (!USERNAME_RE.test(debouncedUsername)) return;
    let cancelled = false;
    setChecking(true);
    authApi.checkUsername(debouncedUsername)
      .then((res) => { if (!cancelled) setAvailable(res.available); })
      .catch(() => { if (!cancelled) setAvailable(null); })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [debouncedUsername]);

  const isValid = USERNAME_RE.test(username) && available === true;

  const handleContinue = async () => {
    if (!isValid) return;
    setLoading(true);
    try {
      // Store username in Clerk unsafeMetadata — register call happens in profile step
      router.push({ pathname: '/onboarding/profile', params: { username } });
    } finally {
      setLoading(false);
    }
  };

  const statusText = () => {
    if (username.length < 3) return null;
    if (!USERNAME_RE.test(username)) return { text: 'Only letters, numbers, _ and .', color: colors.error };
    if (checking) return { text: 'Checking…', color: colors.text.secondary };
    if (available === true) return { text: `@${username} is available`, color: colors.success };
    if (available === false) return { text: 'Username taken', color: colors.error };
    return null;
  };

  const status = statusText();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <View style={styles.progress}>
          {[1, 2, 3, 4].map((i) => (
            <View key={i} style={[styles.dot, i === 1 && styles.dotActive]} />
          ))}
        </View>

        <Text style={styles.title}>Choose your username</Text>
        <Text style={styles.subtitle}>This is how people will find you on Mizanly</Text>

        <View style={styles.inputWrap}>
          <Text style={styles.at}>@</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={(v) => setUsername(v.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
            placeholder="yourname"
            placeholderTextColor={colors.text.tertiary}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={30}
          />
          {checking && <ActivityIndicator size="small" color={colors.text.secondary} />}
        </View>

        {status && (
          <View style={styles.statusRow}>
            <Text style={[styles.status, { color: status.color }]}>{status.text}</Text>
            {available === true && <Icon name="check" size="xs" color={colors.success} />}
          </View>
        )}

        <TouchableOpacity
          style={[styles.btn, !isValid && styles.btnDisabled]}
          onPress={handleContinue}
          disabled={!isValid || loading}
          activeOpacity={0.8}
        >
          {loading ? <ActivityIndicator color={colors.text.primary} /> : <Text style={styles.btnText}>Continue</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  inner: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing['2xl'] },
  progress: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing['3xl'] },
  dot: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.dark.border },
  dotActive: { backgroundColor: colors.emerald },
  title: { color: colors.text.primary, fontSize: fontSize.xl, fontWeight: '700', marginBottom: spacing.sm },
  subtitle: { color: colors.text.secondary, fontSize: fontSize.base, marginBottom: spacing['2xl'] },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dark.bgElevated,
    borderWidth: 1,
    borderColor: colors.dark.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    gap: spacing.xs,
  },
  at: { color: colors.text.secondary, fontSize: fontSize.base },
  input: { flex: 1, paddingVertical: spacing.md, color: colors.text.primary, fontSize: fontSize.base },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  status: { fontSize: fontSize.sm },
  btn: {
    backgroundColor: colors.emerald,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: 'auto',
    marginBottom: spacing.xl,
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#fff', fontSize: fontSize.base, fontWeight: '700' },
});
