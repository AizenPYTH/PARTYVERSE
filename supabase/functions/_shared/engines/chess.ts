import { Chess } from 'chess.js';

import { duelResults, stringSetting, type EngineContext, type GameEngine, type Seat, type Transition } from './types.ts';

/**
 * Chess Arena — rules by chess.js, clock by the server.
 * Seat 0 plays White. The full move list is replayed on every action so that
 * threefold repetition is detected exactly (a FEN alone cannot know it).
 */
export type TimeControl = 'bullet' | 'blitz' | 'rapid';

export const TIME_CONTROLS: Record<TimeControl, { baseMs: number; incrementMs: number; label: string }> = {
  bullet: { baseMs: 60_000, incrementMs: 0, label: 'Bullet 1+0' },
  blitz: { baseMs: 180_000, incrementMs: 2_000, label: 'Blitz 3+2' },
  rapid: { baseMs: 600_000, incrementMs: 5_000, label: 'Rapide 10+5' },
};

export type Promotion = 'q' | 'r' | 'b' | 'n';

export interface ChessMove {
  from: string;
  to: string;
  promotion?: Promotion;
  san: string;
  by: Seat;
  spentMs: number;
}

export interface ChessState {
  moves: ChessMove[];
  fen: string;
  clocks: [number, number];
  incrementMs: number;
  /** Server time when the side to move started thinking. */
  turnStartedAt: number;
  timeControl: TimeControl;
  /** Seat that offered a draw, if any. */
  drawOffer: Seat | null;
  drawOffersUsed: [number, number];
}

export type ChessAction =
  | { type: 'move'; from: string; to: string; promotion?: Promotion }
  | { type: 'offer_draw' }
  | { type: 'accept_draw' }
  | { type: 'decline_draw' };

const SQUARE = /^[a-h][1-8]$/;
const MAX_DRAW_OFFERS = 3;

export const sideToMove = (state: Pick<ChessState, 'moves'>): 0 | 1 => (state.moves.length % 2) as 0 | 1;

/** Rebuilds the game (with history) from the move list. */
export function replay(moves: readonly Pick<ChessMove, 'from' | 'to' | 'promotion'>[]): Chess {
  const game = new Chess();
  for (const move of moves) game.move({ from: move.from, to: move.to, promotion: move.promotion });
  return game;
}

/** True when `seat` cannot possibly checkmate (lone king, or king + one minor piece). */
export function hasInsufficientMaterial(fen: string, seat: Seat): boolean {
  const board = fen.split(' ')[0] ?? '';
  const pieces = [...board].filter((c) => /[a-zA-Z]/.test(c) && (seat === 0 ? c === c.toUpperCase() : c === c.toLowerCase()));
  const others = pieces.filter((c) => c.toLowerCase() !== 'k');
  return others.length === 0 || (others.length === 1 && ['b', 'n'].includes(others[0]!.toLowerCase()));
}

function step(state: ChessState, now: number): Transition<ChessState> {
  const turn = sideToMove(state);
  return {
    state,
    activeSeats: [0, 1],
    turnSeat: turn,
    deadlineMs: Math.max(0, state.clocks[turn] - (now - state.turnStartedAt)),
  };
}

function flag(state: ChessState, now: number): Transition<ChessState> {
  const loser = sideToMove(state);
  const clocks: [number, number] = [state.clocks[0], state.clocks[1]];
  clocks[loser] = 0;
  const finalState = { ...state, clocks, turnStartedAt: now };
  // A flag against a side that cannot mate is a draw (FIDE 6.9).
  if (hasInsufficientMaterial(state.fen, 1 - loser)) {
    return { state: finalState, activeSeats: [], turnSeat: null, deadlineMs: null, outcome: { outcome: 'draw', reason: 'timeout_vs_insufficient', results: duelResults(null) } };
  }
  return { state: finalState, activeSeats: [], turnSeat: null, deadlineMs: null, outcome: { outcome: 'timeout', reason: 'timeout', results: duelResults(1 - loser) } };
}

function drawReason(game: Chess): string | null {
  if (game.isStalemate()) return 'stalemate';
  if (game.isInsufficientMaterial()) return 'insufficient_material';
  if (game.isThreefoldRepetition()) return 'threefold_repetition';
  if (game.isDrawByFiftyMoves()) return 'fifty_moves';
  return null;
}

export const chess: GameEngine<ChessState, ChessAction> = {
  id: 'chess_arena',
  minPlayers: 2,
  maxPlayers: 2,

  init(ctx: EngineContext) {
    const timeControl = stringSetting(ctx.settings, 'time_control', 'blitz') as TimeControl;
    const control = TIME_CONTROLS[timeControl] ?? TIME_CONTROLS.blitz;
    return step(
      {
        moves: [],
        fen: new Chess().fen(),
        clocks: [control.baseMs, control.baseMs],
        incrementMs: control.incrementMs,
        turnStartedAt: ctx.now,
        timeControl: TIME_CONTROLS[timeControl] ? timeControl : 'blitz',
        drawOffer: null,
        drawOffersUsed: [0, 0],
      },
      ctx.now,
    );
  },

  parseAction(raw) {
    if (typeof raw !== 'object' || raw === null) return null;
    const value = raw as Record<string, unknown>;
    if (value.type === 'offer_draw' || value.type === 'accept_draw' || value.type === 'decline_draw') return { type: value.type };
    if (value.type !== 'move' || typeof value.from !== 'string' || typeof value.to !== 'string') return null;
    if (!SQUARE.test(value.from) || !SQUARE.test(value.to)) return null;
    if (value.promotion !== undefined && !['q', 'r', 'b', 'n'].includes(value.promotion as string)) return null;
    return { type: 'move', from: value.from, to: value.to, ...(value.promotion ? { promotion: value.promotion as Promotion } : {}) };
  },

  apply(state, seat, action, ctx) {
    const turn = sideToMove(state);
    const elapsed = Math.max(0, ctx.now - state.turnStartedAt);
    if (state.clocks[turn] - elapsed <= 0) return flag(state, ctx.now);

    switch (action.type) {
      case 'offer_draw': {
        if (state.drawOffer === 1 - seat) return chess.apply(state, seat, { type: 'accept_draw' }, ctx);
        if (state.drawOffer === seat) return { error: 'PV_INVALID_MOVE' };
        if (state.drawOffersUsed[seat as 0 | 1] >= MAX_DRAW_OFFERS) return { error: 'PV_RATE_LIMITED' };
        const used: [number, number] = [state.drawOffersUsed[0], state.drawOffersUsed[1]];
        used[seat as 0 | 1] += 1;
        return { ...step({ ...state, drawOffer: seat, drawOffersUsed: used }, ctx.now), log: { draw_offer: seat } };
      }
      case 'accept_draw':
        if (state.drawOffer !== 1 - seat) return { error: 'PV_INVALID_MOVE' };
        return {
          state: { ...state, drawOffer: null },
          activeSeats: [],
          turnSeat: null,
          deadlineMs: null,
          log: { draw_accepted: seat },
          outcome: { outcome: 'draw', reason: 'agreement', results: duelResults(null) },
        };
      case 'decline_draw':
        if (state.drawOffer !== 1 - seat) return { error: 'PV_INVALID_MOVE' };
        return { ...step({ ...state, drawOffer: null }, ctx.now), log: { draw_declined: seat } };
      case 'move': {
        if (seat !== turn) return { error: 'PV_NOT_YOUR_TURN' };
        const game = replay(state.moves);
        let played;
        try {
          played = game.move({ from: action.from, to: action.to, promotion: action.promotion });
        } catch {
          return { error: 'PV_INVALID_MOVE' };
        }
        const clocks: [number, number] = [state.clocks[0], state.clocks[1]];
        clocks[seat as 0 | 1] = clocks[seat as 0 | 1] - elapsed + state.incrementMs;
        const move: ChessMove = {
          from: played.from,
          to: played.to,
          ...(played.promotion ? { promotion: played.promotion as Promotion } : {}),
          san: played.san,
          by: seat,
          spentMs: elapsed,
        };
        const next: ChessState = {
          ...state,
          moves: [...state.moves, move],
          fen: game.fen(),
          clocks,
          turnStartedAt: ctx.now,
          // Moving declines a pending offer from the opponent.
          drawOffer: state.drawOffer === seat ? seat : null,
        };
        const log = { san: played.san, from: played.from, to: played.to };
        if (game.isCheckmate()) {
          return { state: next, activeSeats: [], turnSeat: null, deadlineMs: null, log, outcome: { outcome: 'win', reason: 'checkmate', results: duelResults(seat) } };
        }
        const reason = drawReason(game);
        if (reason) {
          return { state: next, activeSeats: [], turnSeat: null, deadlineMs: null, log, outcome: { outcome: 'draw', reason, results: duelResults(null) } };
        }
        return { ...step(next, ctx.now), log };
      }
    }
  },

  onTimeout(state, ctx) {
    return flag(state, ctx.now);
  },

  publicView: (state) => state,
  privateView: () => null,
};

/** French piece letters for display (C = cavalier, F = fou, T = tour, D = dame, R = roi). */
export function toFrenchSan(san: string): string {
  return san.replace(/[NBRQK]/g, (letter) => ({ N: 'C', B: 'F', R: 'T', Q: 'D', K: 'R' })[letter] ?? letter);
}
