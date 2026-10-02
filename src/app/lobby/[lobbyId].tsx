import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { PlayerAvatar } from '@/components/PlayerAvatar';
import { ScreenHeader } from '@/components/ScreenHeader';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  ListSkeleton,
  PressableScale,
  Screen,
  Sheet,
  Text,
  colors,
  tint,
  useToast,
} from '@/design-system';
import { useCurrentUserId } from '@/features/auth/store';
import { isEngineGame, isPlayable, useCatalog, useGame, type Game } from '@/features/games/catalog';
import { GameEmblem } from '@/features/games/components/GameEmblem';
import { gameVisual } from '@/features/games/registry';
import { lobbiesApi, type LobbyMember, type LobbyState } from '@/features/lobbies/api';
import { InviteFriendsSheet } from '@/features/lobbies/components/InviteFriendsSheet';
import { LobbyChatSheet } from '@/features/lobbies/components/LobbyChatSheet';
import { EmptySlot, MemberSlot } from '@/features/lobbies/components/MemberSlot';
import { useLobby, useLobbyMessages } from '@/features/lobbies/hooks';
import { startLobbyMatch } from '@/features/lobbies/startMatch';
import { describeSetting, gameSettings, seatOptions } from '@/features/lobbies/settings';
import { messageText } from '@/features/lobbies/systemMessages';
import { partyApi } from '@/features/party/api';
import { PartyPanel } from '@/features/party/components/PartyPanel';
import { PartySetupSheet } from '@/features/party/components/PartySetupSheet';
import { partyPhase, upcomingRound } from '@/features/party/formats';
import { useParty } from '@/features/party/hooks';
import { displayNameOf } from '@/features/profile/avatars';
import { confirmAction } from '@/lib/confirm';
import { errorMessage, toAppError } from '@/lib/errors';
import { queryKeys } from '@/lib/queryClient';

type SheetName = 'menu' | 'invite' | 'chat' | 'member' | 'game' | 'party' | null;

export default function LobbyScreen() {
  const { lobbyId } = useLocalSearchParams<{ lobbyId: string }>();
  const { query: lobby, realtimeConnected } = useLobby(lobbyId);
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [sheet, setSheet] = useState<SheetName>(null);
  const [selected, setSelected] = useState<LobbyMember | null>(null);
  const [busy, setBusy] = useState(false);
  const openedMatch = useRef<string | null>(null);
  const { game } = useGame(lobby.data?.lobby.game_id);
  const catalog = useCatalog();
  const party = useParty(lobbyId);

  const state = lobby.data;
  const matchId = state?.lobby.status === 'in_progress' ? state.lobby.current_match_id : null;

  // Follow the room into the match as soon as the host starts it.
  useEffect(() => {
    if (matchId && openedMatch.current !== matchId && state?.my_role) {
      openedMatch.current = matchId;
      router.push({ pathname: '/match/[matchId]', params: { matchId } });
    }
  }, [matchId, state?.my_role]);

  // Engine games are started by a client (the server re-validates): when the
  // room is ready and starts automatically (auto-start, matchmaking, party).
  const autoStarted = useRef<string | null>(null);
  const roomStatus = state?.lobby.status;
  useEffect(() => {
    if (!state || !game || !isEngineGame(game) || roomStatus !== 'ready' || state.my_role !== 'player') return;
    if (!state.lobby.auto_start && state.lobby.source !== 'matchmaking') return;
    const key = `${state.lobby.id}:${state.lobby.matches_played}`;
    if (autoStarted.current === key) return;
    autoStarted.current = key;
    startLobbyMatch(state.lobby.id, game)
      .catch((error: unknown) => {
        const code = toAppError(error).code;
        if (!['PV_LOBBY_IN_GAME', 'PV_PLAYERS_NOT_READY', 'PV_STALE_STATE'].includes(code)) {
          toast.show({ message: errorMessage(error), tone: 'error' });
        }
      })
      .finally(() => void queryClient.invalidateQueries({ queryKey: queryKeys.lobby(lobbyId) }));
  }, [roomStatus, game, state, lobbyId, queryClient, toast]);

  const act = async (action: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    try {
      await action();
      if (success) toast.show({ message: success, tone: 'success' });
      await queryClient.invalidateQueries({ queryKey: queryKeys.lobby(lobbyId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.party(lobbyId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.home });
    } catch (error) {
      toast.show({ message: errorMessage(error), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (lobby.isPending) {
    return (
      <Screen>
        <ScreenHeader title="Salon" />
        <ListSkeleton rows={4} />
      </Screen>
    );
  }
  if (lobby.error || !state) {
    return (
      <Screen>
        <ScreenHeader title="Salon" />
        <ErrorState message={errorMessage(lobby.error)} onRetry={() => void lobby.refetch()} />
      </Screen>
    );
  }

  const { lobby: room, members } = state;
  const closed = ['finished', 'cancelled', 'expired'].includes(room.status);
  const players = members.filter((member) => member.role === 'player');
  const spectators = members.filter((member) => member.role === 'spectator');
  const me = members.find((member) => member.user_id === userId);
  const isHost = room.host_id === userId;
  const host = members.find((member) => member.user_id === room.host_id);
  const minPlayers = game?.min_players ?? 2;
  const readyCount = players.filter((player) => player.is_ready).length;
  const waitingFor = players.filter((player) => !player.is_ready).map((player) => (player.user_id === userId ? 'toi' : displayNameOf(player)));
  const gameName = game?.name ?? '';
  const title = room.name || `Salon de ${host ? displayNameOf(host) : 'PARTYVERSE'}`;
  const subtitle = [gameName, room.visibility === 'private' ? 'salon privé' : 'salon public', room.code ? `code ${room.code}` : null]
    .filter(Boolean)
    .join(' · ');

  const share = () => {
    if (!room.code) return;
    Share.share({ message: `Rejoins mon salon ${gameName} sur PARTYVERSE : partyverse://join/${room.code} (code ${room.code})` }).catch(() =>
      toast.show({ message: `Code du salon : ${room.code}`, detail: 'Partage-le à tes amis.' }),
    );
  };

  const leave = async () => {
    const confirmed = await confirmAction({
      title: 'Quitter le salon ?',
      message: room.status === 'in_progress' && me?.role === 'player' ? 'La partie en cours sera comptée comme abandonnée.' : undefined,
      confirmLabel: 'Quitter',
      cancelLabel: 'Rester',
      destructive: true,
    });
    if (!confirmed) return;
    await act(async () => {
      await lobbiesApi.leave(room.id);
      setSheet(null);
      router.replace('/');
    });
  };

  if (closed || !state.my_role) {
    return (
      <Screen>
        <ScreenHeader title={title} subtitle={subtitle} />
        {closed ? (
          <EmptyState icon="lobbies" title="Ce salon est fermé" message="Crée un nouveau salon pour rejouer." actionLabel="Accueil" onAction={() => router.replace('/')} />
        ) : (
          <JoinPreview state={state} onJoin={(asSpectator) => void act(() => lobbiesApi.join(room.id, asSpectator))} busy={busy} />
        )}
      </Screen>
    );
  }

  const allReady = players.length >= minPlayers && readyCount === players.length;
  const partyActive = partyPhase(party.data) === 'next';
  const nextRound = party.data && partyActive ? upcomingRound(party.data) : null;
  const playNextRound = () =>
    act(async () => {
      const next = await partyApi.nextRound(room.id);
      if (!next.finished) await startLobbyMatch(room.id, { network_model: next.network_model as Game['network_model'] });
    });
  const cta = (() => {
    if (room.status === 'in_progress' && matchId) {
      return <Button label={me?.role === 'player' ? 'Reprendre la partie' : 'Regarder la partie'} onPress={() => router.push({ pathname: '/match/[matchId]', params: { matchId } })} />;
    }
    if (me?.role === 'spectator') {
      return <Text variant="caption" color={colors.textSecondary} align="center">Tu regardes ce salon en spectateur.</Text>;
    }
    if (partyActive && room.status !== 'in_progress') {
      return isHost ? (
        <Button
          label={nextRound ? `Lancer la manche ${nextRound.round} · ${nextRound.name}` : 'Terminer la Party'}
          testID="party-next"
          loading={busy}
          onPress={() => void playNextRound()}
        />
      ) : (
        <Text variant="caption" color={colors.textSecondary} align="center">
          {`Party en cours · l’hôte lance la manche ${nextRound?.round ?? ''}`}
        </Text>
      );
    }
    if (isHost && allReady) {
      return (
        <Button
          label="Démarrer"
          testID="lobby-start"
          loading={busy}
          onPress={() =>
            void act(async () => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
              if (game) await startLobbyMatch(room.id, game);
            })
          }
        />
      );
    }
    return me?.is_ready ? (
      <Button label="✓ Prêt — annuler" variant="success" loading={busy} onPress={() => void act(() => lobbiesApi.setReady(room.id, false))} />
    ) : (
      <Button label="Je suis prêt" testID="lobby-ready" loading={busy} onPress={() => void act(() => lobbiesApi.setReady(room.id, true))} />
    );
  })();

  const slots = Array.from({ length: room.max_players }, (_, index) => players[index] ?? null);

  return (
    <Screen gap={18} footer={cta} refreshing={lobby.isRefetching} onRefresh={() => void lobby.refetch()}>
      <ScreenHeader
        title={title}
        subtitle={subtitle}
        right={<IconButton icon="settings" accessibilityLabel="Options du salon" onPress={() => setSheet('menu')} />}
      />

      <View style={[styles.banner, { backgroundColor: tint(gameVisual(room.game_id).hue).banner }]}>
        <GameEmblem gameId={room.game_id} height={70} width={140} radius={0} scale={0.6} style={styles.transparent} />
        <Text variant="captionBold" align="center">
          {room.status === 'in_progress'
            ? 'Partie en cours'
            : `${readyCount} / ${players.length} prêts${waitingFor.length ? ` · en attente de ${waitingFor.join(' et ')}` : ''}${
                players.length < minPlayers ? ` · ${minPlayers - players.length} joueur manquant` : ''
              }`}
        </Text>
      </View>

      <View style={styles.grid}>
        {slots.map((member, index) =>
          member ? (
            <MemberSlot
              key={member.user_id}
              member={member}
              isHost={member.user_id === room.host_id}
              onPress={() => {
                setSelected(member);
                setSheet('member');
              }}
            />
          ) : (
            <EmptySlot key={`empty-${index}`} canInvite={index === players.length} onInvite={() => setSheet('invite')} />
          ),
        )}
      </View>

      {spectators.length ? (
        <View style={styles.spectators}>
          <Text variant="caption" color={colors.textSecondary}>{`Spectateurs · ${spectators.length}`}</Text>
          <View style={styles.row}>
            {spectators.slice(0, 8).map((spectator) => (
              <PlayerAvatar key={spectator.user_id} player={spectator} size={32} />
            ))}
          </View>
        </View>
      ) : null}

      <PartyPanel
        party={party.data}
        isHost={isHost}
        userId={userId}
        canStart={room.status !== 'in_progress' && room.source !== 'matchmaking'}
        onSetup={() => setSheet('party')}
      />

      <Card style={styles.settings}>
        {Object.entries(room.settings).map(([key, value]) => (
          <SettingRow key={key} {...describeSetting(key, value)} />
        ))}
        <SettingRow label="Visibilité" value={room.visibility === 'private' ? 'Privé' : 'Public'} />
        <SettingRow label="Spectateurs" value={room.allow_spectators ? 'Autorisés' : 'Non'} last={!room.ranked} />
        {room.ranked ? <SettingRow label="Mode" value="Classé" last /> : null}
      </Card>

      <ChatPreview lobbyId={room.id} poll={!realtimeConnected} onOpen={() => setSheet('chat')} />

      <Sheet visible={sheet === 'menu'} onClose={() => setSheet(null)} title="Options du salon">
        {room.code ? <Button label={`Partager le code ${room.code}`} icon="share" variant="secondary" onPress={share} /> : null}
        {isHost && room.status !== 'in_progress' && room.source !== 'matchmaking' && !partyActive ? (
          <Button label="Changer de jeu" variant="secondary" icon="games" onPress={() => setSheet('game')} />
        ) : null}
        {isHost && partyActive && room.status !== 'in_progress' ? (
          <Button
            label="Terminer la Party"
            variant="secondary"
            onPress={() =>
              void act(async () => {
                await partyApi.end(room.id);
                setSheet(null);
              })
            }
          />
        ) : null}
        {isHost && room.status !== 'in_progress' ? (
          <Button
            label={room.visibility === 'private' ? 'Rendre public' : 'Rendre privé'}
            variant="secondary"
            onPress={() => void act(() => lobbiesApi.updateSettings(room.id, { visibility: room.visibility === 'private' ? 'public' : 'private' }))}
          />
        ) : null}
        {isHost && room.status !== 'in_progress' && game && game.min_players !== game.max_players ? (
          <View style={styles.settingEditor}>
            <Text variant="caption" color={colors.textSecondary}>
              Places
            </Text>
            <View style={styles.row}>
              {seatOptions(game.min_players, game.max_players, players.length).map((count) => (
                <Button
                  key={count}
                  testID={`lobby-seats-${count}`}
                  label={String(count)}
                  size="S"
                  variant={count === room.max_players ? 'primary' : 'secondary'}
                  onPress={() => void act(() => lobbiesApi.updateSettings(room.id, { maxPlayers: count }))}
                />
              ))}
            </View>
          </View>
        ) : null}
        {isHost && room.status !== 'in_progress' && game
          ? gameSettings(game).map((setting) => (
              <View key={setting.key} style={styles.settingEditor}>
                <Text variant="caption" color={colors.textSecondary}>
                  {setting.label}
                </Text>
                <View style={styles.row}>
                  {setting.options.map((option) => (
                    <Button
                      key={String(option.value)}
                      label={option.label}
                      size="S"
                      variant={option.value === room.settings[setting.key] ? 'primary' : 'secondary'}
                      onPress={() =>
                        void act(() => lobbiesApi.updateSettings(room.id, { settings: { ...room.settings, [setting.key]: option.value } }))
                      }
                    />
                  ))}
                </View>
              </View>
            ))
          : null}
        <Button label="Quitter le salon" variant="destructive" icon="logout" onPress={() => void leave()} />
      </Sheet>

      <Sheet visible={sheet === 'member' && !!selected} onClose={() => setSheet(null)} title={selected ? displayNameOf(selected) : ''}>
        {selected ? (
          <>
            <Button
              label="Voir le profil"
              variant="secondary"
              onPress={() => {
                setSheet(null);
                router.push({ pathname: '/player/[userId]', params: { userId: selected.user_id } });
              }}
            />
            {isHost && selected.user_id !== userId ? (
              <Button
                label="Exclure du salon"
                variant="destructive"
                onPress={() =>
                  void act(async () => {
                    await lobbiesApi.kick(room.id, selected.user_id);
                    setSheet(null);
                  }, `${displayNameOf(selected)} a été exclu`)
                }
              />
            ) : null}
          </>
        ) : null}
      </Sheet>

      <Sheet visible={sheet === 'game'} onClose={() => setSheet(null)} title="Choisir le jeu">
        <ScrollView style={styles.gameList} contentContainerStyle={styles.gameListContent}>
          {(catalog.data ?? [])
            .filter((item) => isPlayable(item) && item.max_players >= players.length)
            .map((item) => (
              <PressableScale
                key={item.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: item.id === room.game_id }}
                accessibilityLabel={item.name}
                onPress={() =>
                  void act(async () => {
                    await lobbiesApi.changeGame(room.id, item.id);
                    setSheet(null);
                  })
                }
                style={[styles.gameRow, item.id === room.game_id && styles.gameRowActive]}
              >
                <GameEmblem gameId={item.id} height={44} width={44} radius={12} scale={0.4} />
                <View style={styles.flex}>
                  <Text variant="itemSm">{item.name}</Text>
                  <Text variant="caption" color={colors.textSecondary}>
                    {`${item.min_players === item.max_players ? item.min_players : `${item.min_players}–${item.max_players}`} joueurs · ${item.avg_duration_minutes} min`}
                  </Text>
                </View>
                {item.id === room.game_id ? <Icon name="check" color={colors.mint} /> : null}
              </PressableScale>
            ))}
        </ScrollView>
      </Sheet>

      <InviteFriendsSheet
        lobbyId={room.id}
        memberIds={members.map((member) => member.user_id)}
        visible={sheet === 'invite'}
        onClose={() => setSheet(null)}
        onAddFriends={() => {
          setSheet(null);
          router.push('/friends/add');
        }}
      />
      <LobbyChatSheet lobbyId={room.id} visible={sheet === 'chat'} onClose={() => setSheet(null)} />
      <PartySetupSheet
        visible={sheet === 'party'}
        onClose={() => setSheet(null)}
        games={catalog.data ?? []}
        players={players.length}
        busy={busy}
        onStart={(format, rounds, games) =>
          void act(async () => {
            await partyApi.start(room.id, format, rounds, games);
            setSheet(null);
          }, 'Party lancée !')
        }
      />
    </Screen>
  );
}

function JoinPreview({ state, onJoin, busy }: { state: LobbyState; onJoin: (asSpectator: boolean) => void; busy: boolean }) {
  const players = state.members.filter((member) => member.role === 'player');
  const full = players.length >= state.lobby.max_players;
  const inGame = state.lobby.status === 'in_progress';
  return (
    <View style={styles.preview}>
      <Text variant="body" color={colors.textSecondary}>{`${players.length}/${state.lobby.max_players} joueurs`}</Text>
      {!full && !inGame ? <Button label="Rejoindre le salon" onPress={() => onJoin(false)} loading={busy} /> : null}
      {state.lobby.allow_spectators ? <Button label="Regarder" variant="secondary" onPress={() => onJoin(true)} loading={busy} /> : null}
    </View>
  );
}

function SettingRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.settingRow, !last && styles.separator]}>
      <Text variant="itemSm" color={colors.textSecondary}>
        {label}
      </Text>
      <Text variant="itemSm">{value}</Text>
    </View>
  );
}

function ChatPreview({ lobbyId, poll, onOpen }: { lobbyId: string; poll: boolean; onOpen: () => void }) {
  const messages = useLobbyMessages(lobbyId, true, poll);
  const last = [...(messages.data ?? [])].reverse().find((message) => message.kind !== 'system') ?? messages.data?.at(-1);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Ouvrir le chat" onPress={onOpen} style={styles.chat}>
      {last && last.kind !== 'system' ? (
        <PlayerAvatar player={{ avatar_id: last.sender_avatar_id, username: last.sender_username, display_name: last.sender_display_name }} size={24} />
      ) : null}
      <Text variant="caption" numberOfLines={1} style={styles.flex}>
        {last ? (
          <>
            {last.kind !== 'system' ? (
              <Text variant="captionBold">{`${displayNameOf({ display_name: last.sender_display_name, username: last.sender_username })} `}</Text>
            ) : null}
            <Text variant="caption" color={colors.textSecondary}>
              {messageText(last)}
            </Text>
          </>
        ) : (
          <Text variant="caption" color={colors.textTertiary}>
            Dis bonjour au salon…
          </Text>
        )}
      </Text>
      <Text variant="metaBold" color={colors.textTertiary}>
        Chat
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: { height: 150, borderRadius: 24, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 16 },
  transparent: { backgroundColor: 'transparent' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 },
  spectators: { gap: 8 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  settings: { paddingVertical: 0 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14 },
  separator: { borderBottomWidth: 1, borderBottomColor: colors.elevated },
  chat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  flex: { flex: 1 },
  preview: { gap: 12 },
  gameList: { maxHeight: 420 },
  settingEditor: { gap: 8 },
  gameListContent: { gap: 8 },
  gameRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 16, backgroundColor: colors.surface },
  gameRowActive: { borderWidth: 1, borderColor: colors.mint },
});
