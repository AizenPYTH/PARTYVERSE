import { ENGINES } from '@engines/registry';
import { ctx } from '@engines/testing';

import { stateSchema as battleship } from './battleship/BattleshipMatch';
import { stateSchema as checkers } from './checkers/CheckersMatch';
import { stateSchema as chess } from './chess/ChessMatch';
import { SUPPORTED_GAMES } from './registry';
import { MATCH_RENDERERS } from './renderers';
import { stateSchema as impostor } from './impostor/ImpostorMatch';
import { stateSchema as memory } from './memory/MemoryMatch';
import { stateSchema as quiz } from './quiz/QuizMatch';
import { stateSchema as reversi } from './reversi/ReversiMatch';
import { stateSchema as ticTacToe } from './tic-tac-toe/TicTacToeMatch';

const SCHEMAS = { battleship, checkers, chess_arena: chess, impostor, memory_match: memory, mental_math: quiz, reversi, tic_tac_toe: ticTacToe };

describe('client game support', () => {
  it('declares exactly the games that have a renderer', () => {
    expect([...SUPPORTED_GAMES].sort()).toEqual(Object.keys(MATCH_RENDERERS).sort());
  });

  it('has a renderer for every server engine', () => {
    for (const id of Object.keys(ENGINES)) expect(MATCH_RENDERERS[id]).toBeDefined();
  });

  it.each(Object.entries(SCHEMAS))('reads the public view of %s', (id, schema) => {
    const engine = ENGINES[id]!;
    const initial = engine.init(ctx({ seats: engine.minPlayers, data: id === 'impostor' ? { a: 'Chat', b: 'Chien' } : undefined }));
    const view = JSON.parse(JSON.stringify(engine.publicView(initial.state)));
    expect(schema.safeParse(view).success).toBe(true);
  });
});
