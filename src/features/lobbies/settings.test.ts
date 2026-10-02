import { describeSetting, seatOptions } from './settings';

describe('lobby settings', () => {
  it('offers player caps between the headcount and the game maximum', () => {
    expect(seatOptions(3, 12, 2)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(seatOptions(2, 4, 3)).toEqual([3, 4]);
    expect(seatOptions(2, 2, 3)).toEqual([]);
  });

  it('describes known settings in French', () => {
    expect(describeSetting('question_seconds', 15)).toEqual({ label: 'Temps par question', value: '15 s' });
    expect(describeSetting('mode', 'blank').value).toBe('Imposteur sans mot');
  });
});
