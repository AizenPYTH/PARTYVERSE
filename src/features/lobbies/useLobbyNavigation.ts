import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';

import { useToast } from '@/design-system';
import { errorMessage } from '@/lib/errors';
import { queryKeys } from '@/lib/queryClient';

import { lobbiesApi } from './api';

/**
 * Lobby entry points shared by Home, Friends, invitations and deep links.
 * Every action is a real server call; errors surface as toasts.
 */
export function useLobbyNavigation() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);

  const run = async (key: string, action: () => Promise<string | null>, emptyMessage?: string) => {
    setPending(key);
    try {
      const lobbyId = await action();
      void queryClient.invalidateQueries({ queryKey: queryKeys.home });
      if (lobbyId) router.push({ pathname: '/lobby/[lobbyId]', params: { lobbyId } });
      else if (emptyMessage) toast.show({ message: emptyMessage, tone: 'error' });
      return lobbyId;
    } catch (error) {
      toast.show({ message: errorMessage(error), tone: 'error' });
      return null;
    } finally {
      setPending(null);
    }
  };

  return {
    pending,
    /** Creates a private Connect Four room (the playable game today). */
    quickLobby: (gameId = 'connect_four') =>
      run(`create:${gameId}`, async () =>
        (await lobbiesApi.create({ gameId, visibility: 'private', allowSpectators: true, autoStart: false, settings: {} })).id,
      ),
    join: (lobbyId: string, asSpectator = false) => run(`join:${lobbyId}`, () => lobbiesApi.join(lobbyId, asSpectator)),
    joinByCode: (code: string) => run(`code:${code}`, () => lobbiesApi.joinByCode(code), 'Code invalide ou salon fermé.'),
    acceptInvitation: (invitationId: string) =>
      run(
        `invite:${invitationId}`,
        async () => {
          const lobbyId = await lobbiesApi.respondInvitation(invitationId, true);
          void queryClient.invalidateQueries({ queryKey: queryKeys.invitations });
          return lobbyId;
        },
        'Invitation expirée',
      ),
    /** Invites a friend, creating a room first when the user is not in one. */
    inviteFriend: (friendId: string, currentLobbyId: string | null | undefined) =>
      run(`invite-friend:${friendId}`, async () => {
        const lobbyId =
          currentLobbyId ??
          (await lobbiesApi.create({ gameId: 'connect_four', visibility: 'private', allowSpectators: true, autoStart: false, settings: {} })).id;
        await lobbiesApi.invite(lobbyId, friendId);
        toast.show({ message: 'Invitation envoyée', tone: 'success' });
        return lobbyId;
      }),
  };
}
