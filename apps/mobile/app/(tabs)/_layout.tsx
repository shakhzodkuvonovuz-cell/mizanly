import { useState } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Modal, Pressable } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, tabBar, spacing, fontSize } from '@/theme';
import { useStore } from '@/store';

function TabIcon({ name, focused, badge }: { name: string; focused: boolean; badge?: number }) {
  const iconMap: Record<string, string> = { saf: '🏠', bakra: '▶️', majlis: '💬', risalah: '✉️' };
  return (
    <View style={styles.iconWrap}>
      <View style={[styles.iconCircle, focused && styles.iconCircleFocused]}>
        <Text style={{ fontSize: 20 }}>{iconMap[name] || '•'}</Text>
      </View>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
    </View>
  );
}

function CreateButton() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <TouchableOpacity style={styles.createButton} onPress={() => setOpen(true)} activeOpacity={0.8}>
        <Text style={styles.createButtonText}>+</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setOpen(false)}>
          <View style={styles.createSheet}>
            <Text style={styles.createSheetTitle}>Create</Text>
            <TouchableOpacity
              style={styles.createOption}
              onPress={() => { setOpen(false); router.push('/(screens)/create-post'); }}
            >
              <Text style={styles.createOptionIcon}>🖼️</Text>
              <View>
                <Text style={styles.createOptionLabel}>Post</Text>
                <Text style={styles.createOptionSub}>Photo, video, or text in Saf</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.createOption}
              onPress={() => { setOpen(false); router.push('/(screens)/create-thread'); }}
            >
              <Text style={styles.createOptionIcon}>💬</Text>
              <View>
                <Text style={styles.createOptionLabel}>Thread</Text>
                <Text style={styles.createOptionSub}>Share your thoughts in Majlis</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelOption} onPress={() => setOpen(false)}>
              <Text style={styles.cancelOptionText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

export default function TabLayout() {
  const unreadNotifications = useStore(s => s.unreadNotifications);
  const unreadMessages = useStore(s => s.unreadMessages);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.emerald,
        tabBarInactiveTintColor: colors.text.secondary,
        tabBarLabelStyle: styles.tabLabel,
        tabBarBackground: () => (
          Platform.OS === 'ios' ? (
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(13,17,23,0.95)' }]} />
          )
        ),
      }}
    >
      <Tabs.Screen
        name="saf"
        options={{
          title: 'Saf',
          tabBarIcon: ({ focused }) => <TabIcon name="saf" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="bakra"
        options={{
          title: 'Bakra',
          tabBarIcon: ({ focused }) => <TabIcon name="bakra" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: '',
          tabBarButton: () => <CreateButton />,
        }}
      />
      <Tabs.Screen
        name="majlis"
        options={{
          title: 'Majlis',
          tabBarIcon: ({ focused }) => <TabIcon name="majlis" focused={focused} badge={unreadNotifications || undefined} />,
        }}
      />
      <Tabs.Screen
        name="risalah"
        options={{
          title: 'Risalah',
          tabBarIcon: ({ focused }) => <TabIcon name="risalah" focused={focused} badge={unreadMessages || undefined} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    borderTopWidth: 0.5,
    borderTopColor: colors.dark.border,
    height: tabBar.height,
    paddingTop: 6,
    backgroundColor: 'transparent',
    elevation: 0,
  },
  tabLabel: { fontSize: 10, fontWeight: '600', marginTop: -2 },
  iconWrap: { alignItems: 'center', justifyContent: 'center' },
  iconCircle: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  iconCircleFocused: { transform: [{ scale: 1.1 }] },
  badge: {
    position: 'absolute', top: -4, right: -10,
    backgroundColor: colors.error, borderRadius: 10,
    minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  createButton: {
    width: 48, height: 36, borderRadius: 18,
    backgroundColor: colors.emerald,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 4,
    shadowColor: colors.emerald, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  createButtonText: { color: '#FFF', fontSize: 24, fontWeight: '300', marginTop: -2 },

  // Create sheet modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  createSheet: {
    backgroundColor: colors.dark.bgSheet,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: spacing.md,
    paddingBottom: Platform.OS === 'ios' ? 34 : spacing.lg,
  },
  createSheetTitle: {
    color: colors.text.secondary, fontSize: fontSize.sm, fontWeight: '700',
    textAlign: 'center', marginBottom: spacing.md,
  },
  createOption: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
  },
  createOptionIcon: { fontSize: 28 },
  createOptionLabel: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },
  createOptionSub: { color: colors.text.secondary, fontSize: fontSize.xs, marginTop: 2 },
  cancelOption: {
    margin: spacing.md, borderRadius: 14,
    backgroundColor: colors.dark.surface,
    paddingVertical: spacing.md, alignItems: 'center',
    marginTop: spacing.sm,
  },
  cancelOptionText: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '600' },
});
