import { toggleFavorite } from './favorites';

describe('toggleFavorite', () => {
  it('adds, removes and respects the limit', () => {
    expect(toggleFavorite(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleFavorite(['a', 'b'], 'a')).toEqual(['b']);
    expect(toggleFavorite(Array.from({ length: 10 }, (_, i) => `g${i}`), 'x')).toBeNull();
  });
});
