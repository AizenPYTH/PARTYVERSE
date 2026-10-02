import { formatNumber, greetingFor } from './greeting';

describe('home helpers', () => {
  it('greets by time of day', () => {
    expect(greetingFor(new Date(2026, 0, 1, 9))).toBe('Bonjour');
    expect(greetingFor(new Date(2026, 0, 1, 21))).toBe('Bonsoir');
    expect(greetingFor(new Date(2026, 0, 1, 2))).toBe('Bonsoir');
  });

  it('formats numbers the French way', () => {
    expect(formatNumber(1840)).toBe('1 840');
  });
});
