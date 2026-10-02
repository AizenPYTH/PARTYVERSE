import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';

import { TabBar, type TabBarItem } from '@/components/TabBar';
import { colors } from '@/design-system';
import { useUnreadMessages } from '@/features/messages/hooks';
import { useHomeOverview } from '@/features/profile/hooks';

type TabBarRenderProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const ITEMS: Record<string, Omit<TabBarItem, 'name' | 'badge'>> = {
  index: { label: 'Accueil', icon: 'home' },
  games: { label: 'Jeux', icon: 'games' },
  friends: { label: 'Amis', icon: 'friends' },
  activity: { label: 'Activité', icon: 'activity' },
  profile: { label: 'Profil', icon: 'profile' },
};

function AppTabBar({ state, navigation }: TabBarRenderProps) {
  const overview = useHomeOverview();
  const unread = useUnreadMessages();
  const badges: Record<string, number | undefined> = {
    friends: (overview.data?.pending_friend_requests ?? 0) + (unread.data ?? 0),
    activity: overview.data?.unread_notifications,
  };
  const items = state.routes.map((route) => ({
    name: route.name,
    ...(ITEMS[route.name] ?? { label: route.name, icon: 'home' as const }),
    badge: badges[route.name] || undefined,
  }));
  return (
    <TabBar
      items={items}
      activeIndex={state.index}
      onSelect={(index) => {
        const route = state.routes[index];
        if (route && index !== state.index) navigation.navigate(route.name);
      }}
    />
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.midnight }, animation: 'none' }}
      tabBar={(props) => <AppTabBar {...props} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="games" />
      <Tabs.Screen name="friends" />
      <Tabs.Screen name="activity" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
