import { ScreenHeader } from '@/components/ScreenHeader';
import { Screen } from '@/design-system';
import { NotificationsList } from '@/features/notifications/NotificationsList';
import { useNotifications } from '@/features/notifications/hooks';

export default function NotificationsScreen() {
  const notifications = useNotifications();
  return (
    <Screen gap={18} refreshing={notifications.isRefetching} onRefresh={() => void notifications.refetch()}>
      <ScreenHeader title="Notifications" />
      <NotificationsList />
    </Screen>
  );
}
