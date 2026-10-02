import { chess, hasInsufficientMaterial, toFrenchSan, type ChessState } from './chess';
import { attempt, ctx, play } from './testing';
import type { Transition } from './types';

const SAN_TO_MOVE = (state: ChessState, san: string) => {
  // Resolve SAN through chess.js to {from,to,promotion} like the app would send.
  const { replay } = jest.requireActual<typeof import('./chess')>('./chess');
  const game = replay(state.moves);
  const move = game.moves({ verbose: true }).find((m) => m.san === san);
  if (!move) throw new Error(`illegal ${san} at ${game.fen()}`);
  return { type: 'move', from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) };
};

function playSan(sans: string[], start: Transition<ChessState> = chess.init(ctx({ settings: { time_control: 'blitz' } }))) {
  let t = start;
  let now = 1_000_000;
  for (const san of sans) {
    now += 1000;
    t = play(chess, t, t.state.moves.length % 2, SAN_TO_MOVE(t.state, san), ctx({ now }));
  }
  return t;
}

describe('chess engine', () => {
  it('starts White with the time control clocks', () => {
    const t = chess.init(ctx({ settings: { time_control: 'bullet' } }));
    expect(t).toMatchObject({ activeSeats: [0, 1], turnSeat: 0, deadlineMs: 60_000 });
    expect(t.state.clocks).toEqual([60_000, 60_000]);
  });

  it('detects checkmate (fool’s mate)', () => {
    const t = playSan(['f3', 'e5', 'g4', 'Qh4#']);
    expect(t.outcome).toMatchObject({ outcome: 'win', reason: 'checkmate' });
    expect(t.outcome?.results.find((r) => r.result === 'win')?.seat).toBe(1);
  });

  it('detects stalemate (Loyd’s 10-move stalemate)', () => {
    const t = playSan(['e3', 'a5', 'Qh5', 'Ra6', 'Qxa5', 'h5', 'h4', 'Rah6', 'Qxc7', 'f6', 'Qxd7+', 'Kf7', 'Qxb7', 'Qd3', 'Qxb8', 'Qh7', 'Qxc8', 'Kg6', 'Qe6']);
    expect(t.outcome).toMatchObject({ outcome: 'draw', reason: 'stalemate' });
  });

  it('detects threefold repetition from the replayed history', () => {
    const t = playSan(['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']);
    expect(t.outcome).toMatchObject({ outcome: 'draw', reason: 'threefold_repetition' });
  });

  it('supports castling, en passant and promotion', () => {
    const castled = playSan(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O']);
    expect(castled.state.fen.split(' ')[0]).toContain('RNBQ1RK1');
    const enPassant = playSan(['e4', 'a6', 'e5', 'd5', 'exd6']);
    expect(enPassant.state.moves.at(-1)?.san).toBe('exd6');
    const promoted = playSan(['h4', 'g5', 'hxg5', 'h6', 'gxh6', 'Nf6', 'h7', 'Rg8', 'hxg8=Q']);
    expect(promoted.state.moves.at(-1)).toMatchObject({ san: 'hxg8=Q', promotion: 'q' });
  });

  it('rejects illegal moves, wrong turns and bad input', () => {
    const t = chess.init(ctx());
    expect(attempt(chess, t, 0, { type: 'move', from: 'e2', to: 'e5' })).toBe('PV_INVALID_MOVE');
    expect(attempt(chess, t, 1, { type: 'move', from: 'e7', to: 'e5' })).toBe('PV_NOT_YOUR_TURN');
    expect(attempt(chess, t, 0, { type: 'move', from: 'z9', to: 'e4' })).toBe('PV_INVALID_MOVE');
    expect(attempt(chess, t, 0, { type: 'move', from: 'e2', to: 'e4', promotion: 'k' })).toBe('PV_INVALID_MOVE');
  });

  it('runs the clock on the server and adds the increment', () => {
    const t0 = chess.init(ctx({ now: 0, settings: { time_control: 'blitz' } }));
    const t1 = play(chess, t0, 0, { type: 'move', from: 'e2', to: 'e4' }, ctx({ now: 10_000 }));
    expect(t1.state.clocks).toEqual([180_000 - 10_000 + 2_000, 180_000]);
    expect(t1.state.moves[0]?.spentMs).toBe(10_000);
    expect(t1.turnSeat).toBe(1);
    const late = chess.apply(t1.state, 1, { type: 'move', from: 'e7', to: 'e5' }, ctx({ now: 10_000 + 180_001 }));
    expect('outcome' in late && late.outcome).toMatchObject({ outcome: 'timeout', reason: 'timeout' });
  });

  it('declares a draw when the flag falls against a side that cannot mate', () => {
    const lone: ChessState = { ...chess.init(ctx()).state, fen: '8/8/8/8/8/8/4k3/K6Q b - - 0 1' };
    expect(hasInsufficientMaterial(lone.fen, 1)).toBe(true);
    expect(hasInsufficientMaterial(lone.fen, 0)).toBe(false);
    // White (seat 0) flags while Black has a lone king: draw.
    const whiteToMove: ChessState = { ...lone, moves: [], fen: '8/8/8/8/8/8/4k3/K6Q w - - 0 1' };
    expect(chess.onTimeout(whiteToMove, ctx()).outcome).toMatchObject({ outcome: 'draw', reason: 'timeout_vs_insufficient' });
  });

  it('handles draw offers', () => {
    let t = chess.init(ctx());
    t = play(chess, t, 1, { type: 'offer_draw' });
    expect(t.state.drawOffer).toBe(1);
    expect(attempt(chess, t, 1, { type: 'accept_draw' })).toBe('PV_INVALID_MOVE');
    // Moving declines the opponent's offer.
    const moved = play(chess, t, 0, { type: 'move', from: 'e2', to: 'e4' });
    expect(moved.state.drawOffer).toBeNull();
    const accepted = play(chess, t, 0, { type: 'accept_draw' });
    expect(accepted.outcome).toMatchObject({ outcome: 'draw', reason: 'agreement' });
    let spam = chess.init(ctx());
    for (let i = 0; i < 3; i++) {
      spam = play(chess, spam, 0, { type: 'offer_draw' });
      spam = play(chess, spam, 1, { type: 'decline_draw' });
    }
    expect(attempt(chess, spam, 0, { type: 'offer_draw' })).toBe('PV_RATE_LIMITED');
  });

  it('translates notation to French piece letters', () => {
    expect(toFrenchSan('Nxe5+')).toBe('Cxe5+');
    expect(toFrenchSan('exd8=Q#')).toBe('exd8=D#');
    expect(toFrenchSan('O-O')).toBe('O-O');
  });
});
