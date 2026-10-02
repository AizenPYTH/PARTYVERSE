import { z } from 'zod';

import { COLUMNS, ROWS, type ConnectFourState } from './engine';

const seat = z.union([z.literal(0), z.literal(1)]);
const cell = z.tuple([z.number().int(), z.number().int()]);

export const connectFourStateSchema = z.object({
  columns: z.array(z.array(seat).max(ROWS)).length(COLUMNS),
  move_count: z.number().int().min(0),
  winning_cells: z.array(cell),
  last_move: z.object({ column: z.number().int(), row: z.number().int(), seat }).nullable(),
});

export function parseConnectFourState(raw: unknown): ConnectFourState | null {
  const parsed = connectFourStateSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
