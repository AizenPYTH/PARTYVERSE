import { SUPPORTED_GAMES } from './registry';
import { MATCH_RENDERERS } from './renderers';

describe('client game support', () => {
  it('declares exactly the games that have a renderer', () => {
    expect([...SUPPORTED_GAMES].sort()).toEqual(Object.keys(MATCH_RENDERERS).sort());
  });
});
