import { cleanClue, impostor, normalizeWord, tally, type ImpostorState } from './impostor';
import { attempt, ctx, play } from './testing';
import type { Transition } from './types';

const DATA = { a: 'Chat', b: 'Chien' };
const four = (overrides = {}) => ctx({ seats: 4, data: DATA, settings: { rounds: 1, turn_seconds: 20, discussion_seconds: 30 }, ...overrides });

function giveClues(t: Transition<ImpostorState>, context = four()): Transition<ImpostorState> {
  let current = t;
  while (current.state.phase === 'clues') {
    const seat = current.turnSeat!;
    current = play(impostor, current, seat, { type: 'clue', text: `indice ${seat}` }, context);
  }
  return current;
}

function voteAll(t: Transition<ImpostorState>, target: (voter: number) => number, context = four()): Transition<ImpostorState> {
  let current = t;
  for (const voter of [0, 1, 2, 3]) current = play(impostor, current, voter, { type: 'vote', target: target(voter) }, context);
  return current;
}

const toVote = (t: Transition<ImpostorState>) => {
  let current = giveClues(t);
  for (const seat of [0, 1, 2, 3]) current = play(impostor, current, seat, { type: 'ready' }, four());
  return current;
};

describe('impostor helpers', () => {
  it('normalizes words and clues', () => {
    expect(normalizeWord('  Le Château ')).toBe('chateau');
    expect(normalizeWord("L'Éléphant")).toBe('elephant');
    expect(cleanClue(' miaou\u0007   doux ')).toBe('miaou doux');
  });

  it('tallies votes with ties', () => {
    expect(tally([1, 0, 1, 1], [0, 1, 2, 3]).top).toBe(1);
    expect(tally([1, 0, null, null], [0, 1, 2, 3]).top).toBeNull();
    expect(tally([2, 2, 3, null], [0, 1, 2]).top).toBe(2);
  });
});

describe('impostor engine', () => {
  it('deals secret words: the same for civilians, a close one for the impostor', () => {
    const t = impostor.init(four());
    const views = [0, 1, 2, 3].map((seat) => impostor.privateView(t.state, seat) as { word: string; impostor: boolean; vote: null });
    const odd = views.filter((v) => v.word === t.state.impostorWord);
    expect(odd).toHaveLength(1);
    expect(views.filter((v) => v.word === t.state.civilianWord)).toHaveLength(3);
    expect(new Set(views.map((v) => Object.keys(v).sort().join()))).toEqual(new Set(['impostor,vote,word']));
    const pub = JSON.stringify(impostor.publicView(t.state));
    expect(pub).not.toContain('Chat');
    expect(pub).not.toContain('Chien');
    expect(pub).not.toContain('"impostor"');
  });

  it('runs clue turns in the shuffled order and rejects a clue containing your word', () => {
    let t = impostor.init(four());
    expect(t.activeSeats).toEqual([t.state.order[0]]);
    const first = t.turnSeat!;
    const other = t.state.order[1]!;
    expect(attempt(impostor, t, other, { type: 'clue', text: 'x' }, four())).toBe('PV_NOT_YOUR_TURN');
    const own = (impostor.privateView(t.state, first) as { word: string }).word;
    expect(attempt(impostor, t, first, { type: 'clue', text: `petit ${own.toLowerCase()}` }, four())).toBe('PV_CLUE_FORBIDDEN');
    expect(attempt(impostor, t, first, { type: 'clue', text: 'x'.repeat(31) }, four())).toBe('PV_INVALID_MOVE');
    t = play(impostor, t, first, { type: 'clue', text: 'Animal' }, four());
    expect(t.state.clues).toEqual([{ seat: first, round: 1, text: 'Animal' }]);
    t = impostor.onTimeout(t.state, four());
    expect(t.state.clues[1]).toEqual({ seat: other, round: 1, text: null });
  });

  it('goes to discussion, then to a secret vote', () => {
    let t = giveClues(impostor.init(four()));
    expect(t.state.phase).toBe('discussion');
    expect(t.activeSeats).toEqual([0, 1, 2, 3]);
    t = play(impostor, t, 0, { type: 'ready' }, four());
    expect(attempt(impostor, t, 0, { type: 'ready' }, four())).toBe('PV_ALREADY_DONE');
    t = impostor.onTimeout(t.state, four());
    expect(t.state.phase).toBe('vote');
    t = play(impostor, t, 0, { type: 'vote', target: 1 }, four());
    expect(attempt(impostor, t, 1, { type: 'vote', target: 1 }, four())).toBe('PV_INVALID_MOVE');
    expect((impostor.publicView(t.state) as { voted: boolean[] }).voted).toEqual([true, false, false, false]);
    expect(JSON.stringify(impostor.publicView(t.state))).not.toContain('"votes"');
    expect(impostor.redactAction!({ type: 'vote', target: 1 })).toEqual({ type: 'vote' });
  });

  it('lets a caught impostor steal the win with the right word', () => {
    let t = toVote(impostor.init(four()));
    const imp = t.state.impostor;
    t = voteAll(t, (voter) => (voter === imp ? (imp + 1) % 4 : imp));
    expect(t.state.phase).toBe('guess');
    expect(t.activeSeats).toEqual([imp]);
    expect((impostor.publicView(t.state) as { eliminated: number }).eliminated).toBe(imp);
    const final = play(impostor, t, imp, { type: 'guess', text: ` le ${t.state.civilianWord.toUpperCase()} ` }, four());
    expect(final.outcome).toMatchObject({ outcome: 'completed', reason: 'impostor_guessed' });
    expect(final.outcome?.results.find((r) => r.seat === imp)).toMatchObject({ result: 'win', rank: 1, score: 3 });
    const wrong = play(impostor, t, imp, { type: 'guess', text: 'Poisson' }, four());
    expect(wrong.outcome?.reason).toBe('impostor_caught');
    expect(wrong.outcome?.results.filter((r) => r.result === 'win')).toHaveLength(3);
    expect((impostor.publicView(wrong.state) as { reveal: { impostor: number } }).reveal.impostor).toBe(imp);
  });

  it('gives the win to the impostor on a wrong or tied vote', () => {
    const t = toVote(impostor.init(four()));
    const imp = t.state.impostor;
    const innocent = (imp + 1) % 4;
    const wrong = voteAll(t, (voter) => (voter === innocent ? imp : innocent));
    expect(wrong.outcome).toMatchObject({ reason: 'wrong_vote' });
    expect(impostor.onTimeout(t.state, four()).outcome).toMatchObject({ reason: 'tie_vote' });
  });

  it('supports blank mode and players leaving', () => {
    const t = impostor.init(four({ settings: { mode: 'blank', rounds: 1 } }));
    expect(impostor.privateView(t.state, t.state.impostor)).toEqual({ word: null, impostor: true, vote: null });
    const left = impostor.onTimeout(t.state, four({ absentSeats: [t.state.impostor] }));
    expect(left.outcome).toMatchObject({ reason: 'impostor_left' });
    // A civilian who left is skipped in the clue order.
    const away = t.state.order.find((seat) => seat !== t.state.impostor && seat !== t.turnSeat)!;
    let current = t;
    const context = four({ absentSeats: [away], settings: { mode: 'blank', rounds: 1 } });
    while (current.state.phase === 'clues') current = play(impostor, current, current.turnSeat!, { type: 'clue', text: 'ok' }, context);
    expect(current.state.clues.map((c) => c.seat)).not.toContain(away);
    expect(current.activeSeats).not.toContain(away);
  });
});
