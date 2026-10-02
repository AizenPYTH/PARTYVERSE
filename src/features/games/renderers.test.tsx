import { ENGINES } from '@engines/registry';
import { ctx } from '@engines/testing';

import { stateSchema as checkers } from './checkers/CheckersMatch';
import { stateSchema as chess } from './chess/ChessMatch';
import { SUPPORTED_GAMES } from './registry';
import { MATCH_RENDERERS } from './renderers';
import { stateSchema as reversi } from './reversi/ReversiMatch';
import { stateSchema as ticTacToe } from './tic-tac-toe/TicTacToeMatch';

const SCHEMAS = { checkers, chess_arena: chess, reversi, tic_tac_toe: ticTacToe };

describe('client game support', () => {
  it('declares exactly the games that have a renderer', () => {
    expect([...SUPPORTED_GAMES].sort()).toEqual(Object.keys(MATCH_RENDERERS).sort());
  });

  it('has a renderer for every server engine', () => {
    for (const id of Object.keys(ENGINES)) expect(MATCH_RENDERERS[id]).toBeDefined();
  });

  it.each(Object.entries(SCHEMAS))('reads the public view of %s', (id, schema) => {
    const engine = ENGINES[id]!;
    const initial = engine.init(ctx());
    const view = JSON.parse(JSON.stringify(engine.publicView(initial.state)));
    expect(schema.safeParse(view).success).toBe(true);
  });
});
