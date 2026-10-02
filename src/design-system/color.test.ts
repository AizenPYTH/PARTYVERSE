import { oklchToHex, tint, withAlpha } from './color';

describe('oklchToHex', () => {
  it('matches reference sRGB conversions', () => {
    expect(oklchToHex(1, 0, 0)).toBe('#ffffff');
    expect(oklchToHex(0, 0, 0)).toBe('#000000');
    // CSS Color 4 reference: pure red is oklch(0.628 0.2577 29.23)
    expect(oklchToHex(0.62796, 0.25768, 29.2339)).toBe('#ff0000');
  });

  it('derives a stable tint per hue', () => {
    const connectFour = tint(245);
    expect(connectFour).toBe(tint(245));
    expect(connectFour.card).toMatch(/^#[0-9a-f]{6}$/);
    expect(connectFour.accent).not.toBe(connectFour.card);
  });

  it('adds alpha', () => {
    expect(withAlpha('#8b5cff', 0.16)).toBe('#8b5cff29');
  });
});
