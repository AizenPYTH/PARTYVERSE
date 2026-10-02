import { StyleSheet, View } from 'react-native';

import { PressableScale, Text, colors, motion } from '@/design-system';

import { isPlayable, playersLabel, type Game } from '../catalog';
import { gameVisual } from '../registry';
import { GameEmblem } from './GameEmblem';

export function gameMeta(game: Game): string {
  return `${gameVisual(game.id).genre} · ${playersLabel(game)} · ${game.avg_duration_minutes} min`;
}

export function GameTile({ game, onPress, width }: { game: Game; onPress: () => void; width?: number }) {
  const playable = isPlayable(game);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${game.name}, ${gameMeta(game)}${playable ? '' : ', bientôt disponible'}`}
      onPress={onPress}
      scaleTo={motion.cardPressScale}
      style={[styles.tile, width ? { width } : styles.flex]}
    >
      <GameEmblem gameId={game.id} height={112} dimmed={!playable} />
      <View style={styles.text}>
        <Text variant="itemSm" color={playable ? colors.textPrimary : colors.textSecondary} numberOfLines={1}>
          {game.name}
        </Text>
        <Text variant="meta" color={playable ? colors.textSecondary : colors.amber} numberOfLines={1}>
          {playable ? gameMeta(game) : 'Bientôt disponible'}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  tile: { gap: 6 },
  flex: { flex: 1 },
  text: { gap: 2 },
});
