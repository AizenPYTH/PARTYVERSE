/**
 * Connect Four rules — pure and deterministic.
 *
 * The server (`submit_connect_four_move` in supabase/migrations) is the
 * authority. This mirror is used by the client to render derived information
 * (playable columns, landing row for the drop animation) without a round trip,
 * and is checked against the SQL engine with the shared vectors in
 * tests/fixtures/connect-four-vectors.json.
 */

export const COLUMNS = 7;
export const ROWS = 6;
export const CELL_COUNT = COLUMNS * ROWS;

export type Seat = 0 | 1;
/** [column, row], row 0 is the bottom. */
export type Cell = readonly [number, number];

export interface ConnectFourState {
  /** One array per column, listing seats from bottom to top. */
  columns: Seat[][];
  move_count: number;
  winning_cells: Cell[];
  last_move: { column: number; row: number; seat: Seat } | null;
}

export type DropOutcome =
  | { type: 'continue' }
  | { type: 'win'; seat: Seat; cells: Cell[] }
  | { type: 'draw' };

export type DropResult =
  | { ok: true; state: ConnectFourState; row: number; outcome: DropOutcome }
  | { ok: false; error: 'PV_INVALID_MOVE' | 'PV_COLUMN_FULL' };

const DIRECTIONS: readonly Cell[] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

export function createInitialState(): ConnectFourState {
  return {
    columns: Array.from({ length: COLUMNS }, () => []),
    move_count: 0,
    winning_cells: [],
    last_move: null,
  };
}

export function cellAt(columns: readonly (readonly Seat[])[], col: number, row: number): Seat | null {
  if (col < 0 || col >= COLUMNS || row < 0 || row >= ROWS) return null;
  return columns[col]?.[row] ?? null;
}

export function isValidColumn(col: number): boolean {
  return Number.isInteger(col) && col >= 0 && col < COLUMNS;
}

export function canDrop(state: ConnectFourState, col: number): boolean {
  return isValidColumn(col) && (state.columns[col]?.length ?? ROWS) < ROWS;
}

/** The winning line through (col,row) for `seat`, or null. */
export function findWinningCells(
  columns: readonly (readonly Seat[])[],
  col: number,
  row: number,
  seat: Seat,
): Cell[] | null {
  for (const [dc, dr] of DIRECTIONS) {
    const cells: Cell[] = [[col, row]];
    for (const sign of [1, -1]) {
      let c = col + dc * sign;
      let r = row + dr * sign;
      while (cellAt(columns, c, r) === seat) {
        cells.push([c, r]);
        c += dc * sign;
        r += dr * sign;
      }
    }
    if (cells.length >= 4) return cells;
  }
  return null;
}

export function dropToken(state: ConnectFourState, col: number, seat: Seat): DropResult {
  if (!isValidColumn(col)) return { ok: false, error: 'PV_INVALID_MOVE' };
  const row = state.columns[col]?.length ?? ROWS;
  if (row >= ROWS) return { ok: false, error: 'PV_COLUMN_FULL' };

  const columns = state.columns.map((column, index) => (index === col ? [...column, seat] : column));
  const moveCount = state.move_count + 1;
  const cells = findWinningCells(columns, col, row, seat);

  const next: ConnectFourState = {
    columns,
    move_count: moveCount,
    winning_cells: cells ?? [],
    last_move: { column: col, row, seat },
  };

  const outcome: DropOutcome = cells
    ? { type: 'win', seat, cells }
    : moveCount >= CELL_COUNT
      ? { type: 'draw' }
      : { type: 'continue' };

  return { ok: true, state: next, row, outcome };
}

export function isWinningCell(state: ConnectFourState, col: number, row: number): boolean {
  return state.winning_cells.some(([c, r]) => c === col && r === row);
}
