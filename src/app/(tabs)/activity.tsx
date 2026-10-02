import { Screen, Text } from '@/design-system';
import { NotificationsList } from '@/features/notifications/NotificationsList';
import { useNotifications } from '@/features/notifications/hooks';

export default function ActivityScreen() {
  const notifications = useNotifications();
  return (
    <Screen withTabBar gap={18} refreshing={notifications.isRefetching} onRefresh={() => void notifications.refetch()}>
      <Text variant="tabTitle" accessibilityRole="header">
        Activité
      </Text>
      <NotificationsList />
    </Screen>
  );
}
