import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import {
  Chip,
  EmptyState,
  ErrorState,
  Icon,
  PressableScale,
  Screen,
  Skeleton,
  Tag,
  Text,
  colors,
  fonts,
  motion,
  tint,
} from '@/design-system';
import { isPlayable, playersLabel, useCatalog } from '@/features/games/catalog';
import { GameEmblem } from '@/features/games/components/GameEmblem';
import { GameTile } from '@/features/games/components/GameTile';
import { CATALOG_FILTERS, filterGames, type CatalogFilter } from '@/features/games/filters';
import { gameVisual } from '@/features/games/registry';
import { errorMessage } from '@/lib/errors';

export default function GamesScreen() {
  const catalog = useCatalog();
  const [filter, setFilter] = useState<CatalogFilter>('all');
  const [query, setQuery] = useState('');
  const games = filterGames(catalog.data ?? [], filter, query);
  const featured = catalog.data?.find(isPlayable);
  const openGame = (gameId: string) => router.push({ pathname: '/games/[gameId]', params: { gameId } });

  return (
    <Screen withTabBar gap={18} refreshing={catalog.isRefetching} onRefresh={() => void catalog.refetch()}>
      <Text variant="tabTitle" accessibilityRole="header">
        Jeux
      </Text>
      <View style={styles.search}>
        <Icon name="search" size={20} color={colors.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Rechercher un jeu…"
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel="Rechercher un jeu"
          style={styles.searchInput}
          returnKeyType="search"
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {CATALOG_FILTERS.map((item) => (
          <Chip key={item.value} label={item.label} active={filter === item.value} onPress={() => setFilter(item.value)} />
        ))}
      </ScrollView>

      {catalog.error ? <ErrorState message={errorMessage(catalog.error)} onRetry={() => void catalog.refetch()} /> : null}
      {catalog.isPending ? <Skeleton height={168} radius={24} /> : null}

      {featured && filter === 'all' && !query ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`${featured.name}, jouable maintenant`}
          onPress={() => openGame(featured.id)}
          scaleTo={motion.cardPressScale}
          style={[styles.featured, { backgroundColor: tint(gameVisual(featured.id).hue).deep }]}
        >
          <View style={styles.featuredArt}>
            <GameEmblem gameId={featured.id} height={110} width={150} radius={18} scale={0.9} />
          </View>
          <Tag label="Jouable" color={colors.blue} solid />
          <Text variant="featured">{featured.name}</Text>
          <Text variant="caption" color="#D6CFF0">
            {`${featured.tagline} · ${playersLabel(featured)} · ${featured.avg_duration_minutes} min`}
          </Text>
        </PressableScale>
      ) : null}

      <Text variant="section">Tous les jeux</Text>
      {catalog.data && games.length === 0 ? <EmptyState title="Aucun jeu ne correspond" message="Essaie un autre filtre." /> : null}
      <View style={styles.grid}>
        {chunk(games, 2).map((row) => (
          <View key={row.map((game) => game.id).join('-')} style={styles.gridRow}>
            {row.map((game) => (
              <GameTile key={game.id} game={game} onPress={() => openGame(game.id)} />
            ))}
            {row.length === 1 ? <View style={styles.flex} /> : null}
          </View>
        ))}
      </View>
    </Screen>
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

const styles = StyleSheet.create({
  search: {
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, color: colors.textPrimary, fontFamily: fonts.semibold, fontSize: 15, height: 48, outlineWidth: 0 },
  chips: { gap: 8, paddingRight: 20 },
  featured: { height: 168, borderRadius: 24, padding: 20, justifyContent: 'flex-end', gap: 6, overflow: 'hidden' },
  featuredArt: { position: 'absolute', right: 18, top: 18 },
  grid: { gap: 16 },
  gridRow: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
});
