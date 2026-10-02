import { memory, type MemoryState } from './memory';
import { attempt, ctx, play } from './testing';
import type { Transition } from './types';

const positions = (t: Transition<MemoryState>, symbol: number) =>
  t.state.deck.flatMap((s, index) => (s === symbol && t.state.matchedBy[index] === null ? [index] : []));

describe('memory engine', () => {
  it('deals a hidden shuffled deck', () => {
    const t = memory.init(ctx({ settings: { pairs: 12 } }));
    expect(t.state.deck).toHaveLength(24);
    expect(new Set(t.state.deck).size).toBe(12);
    const view = memory.publicView(t.state) as { cards: (number | null)[] };
    expect(view.cards.every((c) => c === null)).toBe(true);
    expect(memory.init(ctx({ settings: { pairs: 99 } })).state.deck).toHaveLength(16);
  });

  it('keeps the turn after a pair and passes it after a mismatch', () => {
    let t = memory.init(ctx());
    const [a, b] = positions(t, 0);
    t = play(memory, t, 0, { type: 'flip', card: a! });
    expect((memory.publicView(t.state) as { cards: (number | null)[] }).cards[a!]).toBe(0);
    expect(attempt(memory, t, 0, { type: 'flip', card: a! })).toBe('PV_INVALID_MOVE');
    t = play(memory, t, 0, { type: 'flip', card: b! });
    expect(t.state.scores).toEqual([1, 0]);
    expect(t.turnSeat).toBe(0);
    expect(attempt(memory, t, 0, { type: 'flip', card: a! })).toBe('PV_INVALID_MOVE');

    const [c] = positions(t, 1);
    const [d] = positions(t, 2);
    t = play(memory, t, 0, { type: 'flip', card: c! });
    t = play(memory, t, 0, { type: 'flip', card: d! });
    expect(t.turnSeat).toBe(1);
    expect(t.state.lastMismatch).toEqual([c, d]);
    const view = memory.publicView(t.state) as { cards: (number | null)[] };
    expect(view.cards[c!]).toBe(1);
    expect(view.cards[d!]).toBe(2);
    expect(attempt(memory, t, 0, { type: 'flip', card: c! })).toBe('PV_NOT_YOUR_TURN');
  });

  it('finishes when every pair is found and ranks by pairs', () => {
    let t = memory.init(ctx());
    for (let symbol = 0; symbol < 8; symbol++) {
      const [a, b] = positions(t, symbol);
      t = play(memory, t, 0, { type: 'flip', card: a! });
      t = play(memory, t, 0, { type: 'flip', card: b! });
    }
    expect(t.outcome).toMatchObject({ outcome: 'win', reason: 'all_pairs' });
    expect(t.outcome?.results[0]).toMatchObject({ seat: 0, score: 8, rank: 1 });
  });

  it('passes the turn on timeout, skipping absent players', () => {
    const t = memory.init(ctx({ seats: 3 }));
    const flipped = play(memory, t, 0, { type: 'flip', card: 0 }, ctx({ seats: 3 }));
    const timedOut = memory.onTimeout(flipped.state, ctx({ seats: 3, absentSeats: [1] }));
    expect(timedOut.turnSeat).toBe(2);
    expect(timedOut.state.flipped).toEqual([]);
  });
});
