import { colors } from '@/design-system';

import type { MatchPlayer, MatchState } from '../../matches/api';
import { displayNameOf } from '../../profile/avatars';

/** Seat 0 = full violet tokens, seat 1 = amber rings: shape + color, never color alone. */
export const SEAT_STYLE = [
  { color: colors.violet, soft: 'rgba(139,92,255,0.16)', hue: 295, label: 'Jetons pleins', text: colors.violetText },
  { color: colors.amber, soft: 'rgba(255,181,71,0.14)', hue: 75, label: 'Jetons cerclés', text: colors.amber },
] as const;

export interface StatusLine {
  text: string;
  color: string;
}

export function statusLine(state: MatchState, mySeat: number | null): StatusLine {
  const { match, players } = state;
  const nameAt = (seat: number | null) => {
    const player = players.find((p) => p.seat === seat);
    return player ? displayNameOf(player) : 'Adversaire';
  };
  if (match.status !== 'active') {
    if (match.winner_seat === null) return { text: 'Match nul', color: colors.textPrimary };
    if (mySeat === null) return { text: `${nameAt(match.winner_seat)} gagne la manche`, color: colors.mint };
    return match.winner_seat === mySeat
      ? { text: 'Victoire !', color: colors.mint }
      : { text: `${nameAt(match.winner_seat)} gagne la manche`, color: colors.coral };
  }
  if (match.current_turn_seat === mySeat) return { text: 'À toi de jouer', color: colors.violetText };
  return { text: `Tour de ${nameAt(match.current_turn_seat)}`, color: SEAT_STYLE[match.current_turn_seat === 1 ? 1 : 0].text };
}

export interface ResultSummary {
  title: string;
  color: string;
  reward: string;
  detail: string | null;
}

const OUTCOME_DETAIL: Record<string, string> = {
  timeout: 'Temps écoulé',
  resignation: 'Abandon',
  abandon: 'Un joueur a quitté la partie',
};

export function resultSummary(state: MatchState, mySeat: number | null): ResultSummary {
  const { match } = state;
  const me: MatchPlayer | undefined = state.players.find((p) => p.seat === mySeat);
  const draw = match.winner_seat === null;
  const won = !draw && match.winner_seat === mySeat;
  const title = draw ? 'Match nul' : mySeat === null ? 'Partie terminée' : won ? 'Victoire' : 'Défaite';
  const color = draw ? colors.textPrimary : won ? colors.mint : mySeat === null ? colors.textPrimary : colors.coral;

  let reward = '';
  if (me) {
    if (me.xp_awarded === 0) reward = 'Pas d’XP pour cette partie';
    else if (won && me.win_streak >= 2) reward = `+${me.xp_awarded} XP · série de ${me.win_streak} victoires`;
    else if (!won && !draw) reward = `+${me.xp_awarded} XP · la revanche est à un tap`;
    else reward = `+${me.xp_awarded} XP`;
  }

  const parts: string[] = [];
  if (match.outcome && OUTCOME_DETAIL[match.outcome]) parts.push(OUTCOME_DETAIL[match.outcome]!);
  if (me?.rating_before != null && me.rating_after != null) {
    const delta = me.rating_after - me.rating_before;
    parts.push(`Classement ${me.rating_before} → ${me.rating_after} (${delta >= 0 ? '+' : ''}${delta})`);
  }
  return { title, color, reward, detail: parts.length ? parts.join(' · ') : null };
}
