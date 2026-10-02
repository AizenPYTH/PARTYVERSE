import vectorsFile from '../../../../tests/fixtures/connect-four-vectors.json';
import { canDrop, createInitialState, dropToken, type Cell, type ConnectFourState, type Seat } from './engine';

type Expected =
  | { outcome: 'win'; winner: Seat; cells: number[][] }
  | { outcome: 'draw' }
  | { outcome: 'continue' }
  | { outcome: 'error'; error: string; atMove: number };

const vectors = vectorsFile.vectors as { name: string; moves: number[]; expected: Expected }[];

const sortCells = (cells: readonly (readonly number[])[]) =>
  cells.map((c) => `${c[0]},${c[1]}`).sort();

describe('connect four engine — shared vectors', () => {
  it.each(vectors)('$name', ({ moves, expected }) => {
    let state: ConnectFourState = createInitialState();
    let lastOutcome: string = 'continue';
    let lastCells: readonly Cell[] = [];

    for (const [index, column] of moves.entries()) {
      const result = dropToken(state, column, (index % 2) as Seat);
      if (!result.ok) {
        expect(expected).toEqual({ outcome: 'error', error: result.error, atMove: index });
        return;
      }
      state = result.state;
      lastOutcome = result.outcome.type;
      if (result.outcome.type === 'win') {
        lastCells = result.outcome.cells;
        expect(index).toBe(moves.length - 1);
      }
    }

    expect(lastOutcome).toBe(expected.outcome);
    if (expected.outcome === 'win') {
      expect(state.last_move?.seat).toBe(expected.winner);
      expect(sortCells(lastCells)).toEqual(sortCells(expected.cells));
      expect(sortCells(state.winning_cells)).toEqual(sortCells(expected.cells));
    }
  });
});

describe('connect four engine — invariants', () => {
  it('does not mutate the previous state', () => {
    const initial = createInitialState();
    const result = dropToken(initial, 3, 0);
    expect(result.ok).toBe(true);
    expect(initial.columns[3]).toEqual([]);
    expect(initial.move_count).toBe(0);
  });

  it('lands tokens on top of the column', () => {
    let state = createInitialState();
    for (const seat of [0, 1, 0] as Seat[]) {
      const result = dropToken(state, 2, seat);
      if (!result.ok) throw new Error(result.error);
      expect(result.row).toBe(state.columns[2]?.length);
      state = result.state;
    }
    expect(state.columns[2]).toEqual([0, 1, 0]);
  });

  it('reports playable columns', () => {
    let state = createInitialState();
    for (let i = 0; i < 6; i++) {
      const result = dropToken(state, 0, (i % 2) as Seat);
      if (!result.ok) throw new Error(result.error);
      state = result.state;
    }
    expect(canDrop(state, 0)).toBe(false);
    expect(canDrop(state, 1)).toBe(true);
    expect(canDrop(state, -1)).toBe(false);
    expect(canDrop(state, 1.5)).toBe(false);
  });
});
