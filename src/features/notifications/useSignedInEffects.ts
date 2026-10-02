import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

import { useToast } from '@/design-system';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import { errorMessage } from '@/lib/errors';
import { queryKeys } from '@/lib/queryClient';

import { useCurrentUserId } from '../auth/store';
import { lobbiesApi } from '../lobbies/api';
import { displayNameOf } from '../profile/avatars';
import { usePresenceHeartbeat } from '../social/usePresenceHeartbeat';

/**
 * App-wide effects while signed in: presence heartbeat, and a realtime inbox
 * that refreshes badges and surfaces lobby invitations as a toast.
 */
export function useSignedInEffects(enabled: boolean) {
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();
  const toast = useToast();
  usePresenceHeartbeat(enabled);

  useRealtimeInvalidation(
    enabled && userId ? `inbox:${userId}` : null,
    userId ? [{ table: 'notifications', filter: `user_id=eq.${userId}`, event: 'INSERT' }] : [],
    [queryKeys.notifications, queryKeys.home, queryKeys.friendRequests, queryKeys.invitations, queryKeys.friends],
    (_table, payload) => {
      const row = (payload as { new?: { type?: string; payload?: { invitation_id?: string } } }).new;
      if (row?.type !== 'lobby_invite' || !row.payload?.invitation_id) return;
      void showInvitationToast(row.payload.invitation_id);
    },
  );

  async function showInvitationToast(invitationId: string) {
    const invitations = await queryClient.fetchQuery({ queryKey: queryKeys.invitations, queryFn: lobbiesApi.invitations });
    const invitation = invitations.find((item) => item.invitation_id === invitationId);
    if (!invitation) return;
    if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    toast.show({
      message: `${displayNameOf({ display_name: invitation.sender_display_name, username: invitation.sender_username })} t’invite`,
      detail: 'Salon de jeu · expire dans 15 min',
      action: {
        label: 'Rejoindre',
        onPress: () => {
          lobbiesApi
            .respondInvitation(invitation.invitation_id, true)
            .then((lobbyId) => {
              void queryClient.invalidateQueries({ queryKey: queryKeys.invitations });
              if (lobbyId) router.push({ pathname: '/lobby/[lobbyId]', params: { lobbyId } });
              else toast.show({ message: 'Invitation expirée', tone: 'error' });
            })
            .catch((error: unknown) => toast.show({ message: errorMessage(error), tone: 'error' }));
        },
      },
    });
  }
}
