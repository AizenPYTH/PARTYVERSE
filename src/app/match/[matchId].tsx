import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import { EmptyState, ErrorState, LoadingDots, colors } from '@/design-system';
import { ConnectFourMatch } from '@/features/games/connect-four/ConnectFourMatch';
import { useMatch } from '@/features/matches/useMatch';
import { errorMessage } from '@/lib/errors';

/**
 * Match route. Each game has its own renderer; there is no generic "fake"
 * board for games whose engine does not exist yet.
 */
export default function MatchScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const match = useMatch(matchId);
  const state = match.query.data;

  if (match.query.isPending) {
    return (
      <View style={[styles.root, styles.center]}>
        <LoadingDots color={colors.violetText} />
      </View>
    );
  }
  if (match.query.error || !state) {
    return (
      <View style={[styles.root, styles.padded]}>
        <ScreenHeader title="Partie" />
        <ErrorState message={errorMessage(match.query.error)} onRetry={() => void match.query.refetch()} />
      </View>
    );
  }

  switch (state.match.game_id) {
    case 'connect_four':
      return <ConnectFourMatch state={state} match={match} />;
    default:
      return (
        <View style={[styles.root, styles.padded]}>
          <ScreenHeader title="Partie" />
          <EmptyState title="Jeu non pris en charge" message="Mets à jour l’application pour jouer à ce jeu." />
        </View>
      );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.midnight },
  center: { alignItems: 'center', justifyContent: 'center' },
  padded: { padding: 20, paddingTop: 60, gap: 16 },
});
