import { seatStyle } from '../../matches/presentation';

/** Seat 0 = full violet tokens, seat 1 = amber rings: shape + color, never color alone. */
export const SEAT_STYLE = [
  { ...seatStyle(0), label: 'Jetons pleins' },
  { ...seatStyle(1), label: 'Jetons cerclés' },
] as const;
