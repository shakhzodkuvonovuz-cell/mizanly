import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, gestureEnabled: false }}>
      <Stack.Screen name="username" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="interests" />
      <Stack.Screen name="suggested" />
    </Stack>
  );
}
