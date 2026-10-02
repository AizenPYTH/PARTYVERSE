import { Stack } from 'expo-router';

import { colors } from '@/design-system';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.midnight }, animation: 'slide_from_right' }} />
  );
}
