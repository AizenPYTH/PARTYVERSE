import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { Platform } from 'react-native';

import { usePendingLink } from '@/lib/pendingLink';

import { pushDestination, type PushStatus } from './push';
import { pushApi } from './pushApi';

const supported = Platform.OS === 'ios' || Platform.OS === 'android';

if (supported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
  });
}

function projectId(): string | undefined {
  const fromConfig = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  return fromConfig ?? Constants.easConfig?.projectId ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? undefined;
}

/** Token registered for this device in this session (unregistered on sign-out). */
let currentToken: string | null = null;

export async function unregisterCurrentPushToken(): Promise<void> {
  if (!currentToken) return;
  const token = currentToken;
  currentToken = null;
  await pushApi.unregister(token).catch(() => undefined);
}

async function registerToken(): Promise<PushStatus> {
  const id = projectId();
  if (!id) return 'unconfigured';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'PARTYVERSE',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId: id });
  await pushApi.register(data, Platform.OS as 'ios' | 'android', Device.deviceName ?? Device.modelName ?? '');
  currentToken = data;
  return 'enabled';
}

const initialStatus: PushStatus = supported && Device.isDevice ? 'undetermined' : 'unsupported';

/** Push status of this device, shared with the settings screen. */
export const usePushStatus = create<{ status: PushStatus }>(() => ({ status: initialStatus }));
const setStatus = (status: PushStatus) => usePushStatus.setState({ status });

/** Explicit opt-in (settings): asks the OS permission, then registers the device. */
export async function enablePush(): Promise<PushStatus> {
  if (initialStatus === 'unsupported') return 'unsupported';
  const permission = await Notifications.requestPermissionsAsync();
  const next: PushStatus = permission.granted ? await registerToken() : 'denied';
  setStatus(next);
  return next;
}

/** Opens a push destination now, or after sign-in/onboarding. */
function openDestination(data: unknown, inApp: boolean) {
  const path = pushDestination(data);
  if (!path) return;
  if (inApp) router.push(path as Href);
  else usePendingLink.getState().remember(path);
}

/**
 * Push lifecycle: silent token refresh when permission was already granted,
 * explicit opt-in through `enable()`, and routing of taps (warm and cold start).
 */
export function usePushNotifications(signedIn: boolean, inApp: boolean) {
  const inAppRef = useRef(inApp);
  useEffect(() => {
    inAppRef.current = inApp;
  }, [inApp]);

  // Taps, including the one that launched the app.
  useEffect(() => {
    if (!supported) return;
    let handled: string | null = null;
    const handle = (response: Notifications.NotificationResponse | null) => {
      if (!response || handled === response.notification.request.identifier) return;
      handled = response.notification.request.identifier;
      openDestination(response.notification.request.content.data, inAppRef.current);
    };
    void Notifications.getLastNotificationResponseAsync().then(handle).catch(() => undefined);
    const subscription = Notifications.addNotificationResponseReceivedListener(handle);
    return () => subscription.remove();
  }, []);

  // Refresh the token silently when permission is already granted.
  useEffect(() => {
    if (!signedIn || initialStatus === 'unsupported') return;
    let cancelled = false;
    void Notifications.getPermissionsAsync()
      .then(async (permission) => {
        if (cancelled) return;
        if (permission.granted) setStatus(await registerToken());
        else setStatus(permission.canAskAgain ? 'undetermined' : 'denied');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [signedIn]);
}
