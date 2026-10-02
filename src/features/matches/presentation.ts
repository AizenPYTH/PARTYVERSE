import { colors, tint } from '@/design-system';

import { displayNameOf } from '../profile/avatars';
import type { MatchPlayer, MatchState } from './api';

/** Seat identity: color + text label, so information never relies on color alone. */
const SEAT_HUES = [295, 75, 220, 160, 10, 350, 50, 245, 320, 185, 120, 25];

export interface SeatStyle {
  hue: number;
  color: string;
  soft: string;
  text: string;
}

export function seatStyle(seat: number): SeatStyle {
  if (seat === 0) return { hue: 295, color: colors.violet, soft: 'rgba(139,92,255,0.16)', text: colors.violetText };
  if (seat === 1) return { hue: 75, color: colors.amber, soft: 'rgba(255,181,71,0.14)', text: colors.amber };
  const hue = SEAT_HUES[seat % SEAT_HUES.length] ?? 220;
  const palette = tint(hue);
  return { hue, color: palette.accent, soft: `${palette.accent}26`, text: palette.emblem };
}

export const GENERIC_REASONS: Record<string, string> = {
  timeout: 'Temps écoulé',
  resignation: 'Abandon',
  abandon: 'Un joueur a quitté la partie',
  last_player_standing: 'Dernier joueur en lice',
  abandoned: 'Partie annulée : joueurs absents',
};

export interface StatusLine {
  text: string;
  color: string;
}

export function playerName(state: MatchState, seat: number | null | undefined): string {
  const player = state.players.find((p) => p.seat === seat);
  return player ? displayNameOf(player) : 'Adversaire';
}

/** Default status for alternating turn games. */
export function turnStatus(state: MatchState, mySeat: number | null): StatusLine {
  const { match } = state;
  if (match.status === 'aborted') return { text: 'Partie annulée', color: colors.textSecondary };
  if (match.status !== 'active') {
    const winners = state.players.filter((p) => p.result === 'win');
    if (winners.length !== 1) return { text: 'Match nul', color: colors.textPrimary };
    const winner = winners[0]!;
    if (mySeat === null) return { text: `${displayNameOf(winner)} gagne`, color: colors.mint };
    return winner.seat === mySeat
      ? { text: 'Victoire !', color: colors.mint }
      : { text: `${displayNameOf(winner)} gagne la manche`, color: colors.coral };
  }
  const turn = match.current_turn_seat;
  if (turn !== null && turn === mySeat) return { text: 'À toi de jouer', color: colors.violetText };
  if (turn === null) return { text: 'Partie en cours', color: colors.textSecondary };
  return { text: `Tour de ${playerName(state, turn)}`, color: seatStyle(turn).text };
}

export interface ResultSummary {
  title: string;
  color: string;
  reward: string;
  detail: string | null;
}

const ordinal = (rank: number) => (rank === 1 ? '1er' : `${rank}e`);

export function resultSummary(state: MatchState, mySeat: number | null, reasons: Record<string, string> = {}): ResultSummary {
  const { match } = state;
  const me: MatchPlayer | undefined = state.players.find((p) => p.seat === mySeat);
  const duel = state.players.length <= 2;

  if (match.status === 'aborted') {
    return { title: 'Partie annulée', color: colors.textPrimary, reward: '', detail: GENERIC_REASONS.abandoned ?? null };
  }

  let title = 'Partie terminée';
  let color: string = colors.textPrimary;
  if (me?.result === 'draw') title = duel ? 'Match nul' : `Ex æquo · ${ordinal(me.rank ?? 1)}`;
  else if (me?.result === 'win') {
    title = 'Victoire';
    color = colors.mint;
  } else if (me) {
    title = duel ? 'Défaite' : `${ordinal(me.rank ?? state.players.length)} sur ${state.players.length}`;
    color = duel ? colors.coral : colors.textPrimary;
  }

  let reward = '';
  if (me) {
    if (me.xp_awarded === 0) reward = 'Pas d’XP pour cette partie';
    else if (me.result === 'win' && me.win_streak >= 2) reward = `+${me.xp_awarded} XP · série de ${me.win_streak} victoires`;
    else if (me.result === 'loss' && duel) reward = `+${me.xp_awarded} XP · la revanche est à un tap`;
    else reward = `+${me.xp_awarded} XP`;
  }

  const parts: string[] = [];
  const reason = match.result_detail?.reason ?? match.outcome ?? '';
  const reasonText = reasons[reason] ?? GENERIC_REASONS[reason];
  if (reasonText) parts.push(reasonText);
  if (!duel && me?.score != null) parts.push(`${me.score} pts`);
  if (me?.rating_before != null && me.rating_after != null) {
    const delta = me.rating_after - me.rating_before;
    parts.push(`Classement ${me.rating_before} → ${me.rating_after} (${delta >= 0 ? '+' : ''}${delta})`);
  }
  return { title, color, reward, detail: parts.length ? parts.join(' · ') : null };
}
