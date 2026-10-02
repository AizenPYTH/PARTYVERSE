import { frenchList } from './format';

describe('frenchList', () => {
  it('joins like French prose', () => {
    expect(frenchList([])).toBe('');
    expect(frenchList(['Nova'])).toBe('Nova');
    expect(frenchList(['Nova', 'toi'])).toBe('Nova et toi');
    expect(frenchList(['Nova', 'toi', 'Mila'])).toBe('Nova, toi et Mila');
  });
});
