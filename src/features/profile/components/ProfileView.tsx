import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Card, ProgressBar, SectionHeader, Tag, Text, colors, presenceColor } from '@/design-system';

import { useCatalog } from '../../games/catalog';
import { GameEmblem } from '../../games/components/GameEmblem';
import { usePlayerAchievements } from '../../progression/hooks';
import { describePresence } from '../../social/presence';
import type { MatchHistoryEntry, PlayerProfile } from '../api';
import { displayNameOf } from '../avatars';
import { useCosmetics } from '../hooks';
import { bestFriendsRank, formatPlayTime, winRate } from '../stats';
import { CollectionPreview } from './CollectionPreview';

export function ProfileView({
  data,
  history,
  inventory,
  actions,
}: {
  data: PlayerProfile;
  history?: MatchHistoryEntry[];
  /** Owned item ids; only known for the current user. */
  inventory?: string[];
  actions?: ReactNode;
}) {
  const cosmetics = useCosmetics();
  const catalog = useCatalog();
  const { profile, progress, stats } = data;
  const trophies = usePlayerAchievements(profile.id);
  const title = cosmetics.data?.find((item) => item.id === profile.title_id)?.name;
  const span = Math.max(progress.next_level_xp - progress.level_start_xp, 1);
  const remaining = Math.max(progress.next_level_xp - profile.xp, 0);
  const gameName = (id: string) => catalog.data?.find((game) => game.id === id)?.name ?? id;
  const presence = data.presence ? describePresence(data.presence.presence, { gameName: data.presence.game_id ? gameName(data.presence.game_id) : null }) : null;
  const rank = stats ? bestFriendsRank(stats) : null;
  const rate = stats ? winRate(stats) : null;

  return (
    <View style={styles.root}>
      <View style={styles.identity}>
        <PlayerAvatar player={profile} size={116} ring="profile" />
        <Text variant="title" style={styles.name}>
          {displayNameOf(profile)}
        </Text>
        <Text variant="caption" color={colors.textTertiary}>{`@${profile.username ?? ''}`}</Text>
        {title ? (
          <View style={styles.titlePill}>
            <Text variant="captionBold" color={colors.violetText}>
              {title}
            </Text>
          </View>
        ) : null}
        {presence ? (
          <View style={styles.presence}>
            <View style={[styles.presenceDot, { backgroundColor: presenceColor[data.presence!.presence] }]} />
            <Text variant="caption" color={presence.color}>
              {presence.label}
            </Text>
          </View>
        ) : null}
        {profile.bio ? (
          <Text variant="body" color={colors.textSecondary} align="center">
            {profile.bio}
          </Text>
        ) : null}
      </View>

      <View style={styles.level}>
        <View style={styles.levelRow}>
          <Text variant="captionBold">{`Niveau ${profile.level}`}</Text>
          <Text variant="caption" color={colors.textSecondary} style={styles.numeric}>
            {profile.level >= 100 ? 'Niveau maximum' : `${remaining} XP avant le ${profile.level + 1}`}
          </Text>
        </View>
        <ProgressBar progress={(profile.xp - progress.level_start_xp) / span} accessibilityLabel={`Niveau ${profile.level}`} />
      </View>

      {actions}

      {data.stats_visible && stats ? (
        <View style={styles.grid}>
          <StatCard value={String(stats.played)} label="Parties" />
          <StatCard value={rate === null ? '—' : `${rate} %`} label={`Victoires · ${stats.wins}`} color={colors.mint} />
          <StatCard value={formatPlayTime(stats.total_seconds)} label="Temps de jeu" />
          <StatCard
            value={rank ? `#${rank.rank}` : '—'}
            label={rank ? `${gameName(rank.gameId)} · entre amis` : 'Classement entre amis'}
            color={colors.amber}
          />
        </View>
      ) : (
        <Card bordered>
          <Text variant="item">Profil privé</Text>
          <Text variant="caption" color={colors.textSecondary}>
            Les statistiques de ce joueur sont visibles par ses amis uniquement.
          </Text>
        </Card>
      )}

      {inventory ? <CollectionPreview inventory={inventory} /> : null}

      {trophies.data && trophies.data.length ? (
        <View style={styles.section}>
          <SectionHeader title="Succès" accent={{ text: String(trophies.data.length), color: colors.amber }} />
          <View style={styles.trophies}>
            {trophies.data.slice(0, 12).map((trophy) => (
              <Tag key={trophy.id} label={trophy.name} color={colors.amber} />
            ))}
          </View>
        </View>
      ) : null}

      {history && history.length ? (
        <View style={styles.section}>
          <SectionHeader title="Dernières parties" />
          {history.slice(0, 5).map((entry) => (
            <View key={entry.match_id} style={styles.historyRow}>
              <GameEmblem gameId={entry.game_id} height={40} width={40} radius={12} scale={0.35} />
              <View style={styles.flex}>
                <Text variant="itemSm" numberOfLines={1}>
                  {`${gameName(entry.game_id)} · contre ${entry.opponent_username ?? 'un joueur'}`}
                </Text>
                <Text variant="caption" color={colors.textSecondary}>
                  {[entry.ranked ? 'Classée' : 'Amicale', entry.xp_awarded ? `+${entry.xp_awarded} XP` : null].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Text
                variant="captionBold"
                color={entry.result === 'win' ? colors.mint : entry.result === 'loss' ? colors.coral : colors.textSecondary}
              >
                {entry.result === 'win' ? 'Victoire' : entry.result === 'loss' ? 'Défaite' : 'Nul'}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function StatCard({ value, label, color = colors.textPrimary }: { value: string; label: string; color?: string }) {
  return (
    <Card style={styles.stat} accessibilityLabel={`${label} : ${value}`}>
      <Text variant="stat" color={color}>
        {value}
      </Text>
      <Text variant="caption" color={colors.textSecondary} numberOfLines={1}>
        {label}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { gap: 22 },
  identity: { alignItems: 'center', gap: 8 },
  name: { fontFamily: 'Unbounded_700Bold', fontSize: 24, lineHeight: 30, marginTop: 6 },
  titlePill: { backgroundColor: colors.violetSoft, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  presence: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  presenceDot: { width: 8, height: 8, borderRadius: 4 },
  level: { gap: 8 },
  levelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  numeric: { fontVariant: ['tabular-nums'] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stat: { width: '47.5%', flexGrow: 1, gap: 4 },
  section: { gap: 12 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  trophies: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  flex: { flex: 1, gap: 2 },
});
