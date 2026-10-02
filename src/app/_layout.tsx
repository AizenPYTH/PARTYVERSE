import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import * as Linking from 'expo-linking';
import { Stack, router, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BootScreen } from '@/components/BootScreen';
import { ConfigMissing } from '@/components/ConfigMissing';
import { ToastProvider, colors, fontAssets } from '@/design-system';
import { authService } from '@/features/auth/service';
import { useAuthStore } from '@/features/auth/store';
import { useAuthBootstrap } from '@/features/auth/useAuthBootstrap';
import { usePushNotifications } from '@/features/notifications/usePushNotifications';
import { useSignedInEffects } from '@/features/notifications/useSignedInEffects';
import { useOnboardingFlow } from '@/features/onboarding/store';
import { useHomeOverview } from '@/features/profile/hooks';
import { configState } from '@/lib/env';
import { errorMessage } from '@/lib/errors';
import { usePendingLink } from '@/lib/pendingLink';
import { queryClient } from '@/lib/queryClient';

export { ErrorBoundary } from 'expo-router';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const ready = fontsLoaded || !!fontError;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        {configState.ok ? (
          <QueryClientProvider client={queryClient}>
            <ToastProvider>
              <RootNavigator />
            </ToastProvider>
          </QueryClientProvider>
        ) : (
          <ConfigMissing missing={configState.missing} />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  useAuthBootstrap();
  const status = useAuthStore((state) => state.status);
  const passwordRecovery = useAuthStore((state) => state.passwordRecovery);
  const signedIn = status === 'signedIn';
  const overview = useHomeOverview(signedIn);
  const onboardingFlowActive = useOnboardingFlow((state) => state.active);
  useSignedInEffects(signedIn);

  const needsOnboarding = signedIn && (onboardingFlowActive || overview.data?.profile.onboarding_completed === false);
  const inApp = signedIn && !passwordRecovery && !needsOnboarding;
  const resolving = status === 'loading' || (signedIn && !passwordRecovery && !overview.data);
  usePushNotifications(signedIn, inApp && !resolving);

  // A link opened while signed out or onboarding (cold start included) is
  // remembered and opened once the player is in the app.
  // Only once auth is resolved: a signed-in cold start opens its URL directly,
  // and replaying it would push the same screen twice.
  const linkingUrl = Linking.useLinkingURL();
  useEffect(() => {
    if (!resolving && !inApp) usePendingLink.getState().remember(linkingUrl);
  }, [linkingUrl, inApp, resolving]);
  useEffect(() => {
    if (!inApp || resolving) return;
    const path = usePendingLink.getState().take();
    if (!path) return;
    const timer = setTimeout(() => router.push(path as Href), 0);
    return () => clearTimeout(timer);
  }, [inApp, resolving]);

  // The navigator mounts only once auth and profile are known, so the guards
  // never redirect away from the initial URL (cold-start deep links).
  if (resolving) {
    return (
      <BootScreen
        error={overview.error ? errorMessage(overview.error) : undefined}
        onRetry={overview.error ? () => void overview.refetch() : undefined}
        onSignOut={overview.error ? () => void authService.signOut().catch(() => undefined) : undefined}
      />
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.midnight }, animation: 'fade' }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && passwordRecovery}>
        <Stack.Screen name="reset-password" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !passwordRecovery && needsOnboarding}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={inApp}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="games/[gameId]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="lobby/[lobbyId]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="lobby/join" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="join/[code]" />
        <Stack.Screen name="match/[matchId]" options={{ gestureEnabled: false }} />
        <Stack.Screen name="matchmaking/[gameId]" options={{ gestureEnabled: false }} />
        <Stack.Screen name="friends/add" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="player/[userId]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="leaderboard/[gameId]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="notifications" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="profile/edit" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="profile/inventory" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="messages/index" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="messages/[userId]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="groups/index" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="groups/[groupId]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="quests" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="rankings" options={{ animation: 'slide_from_right' }} />
      </Stack.Protected>
      <Stack.Screen name="auth/callback" />
    </Stack>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.midnight } });
