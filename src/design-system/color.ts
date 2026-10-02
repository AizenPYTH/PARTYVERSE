/**
 * OKLCH → sRGB hex. The design system derives every game tint and placeholder
 * avatar color from one formula (docs/design/README.md), so colors are
 * computed rather than copied.
 */
const toSrgb = (linear: number): number => {
  const v = linear <= 0.0031308 ? 12.92 * linear : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
  return Math.min(1, Math.max(0, v));
};

const toHex = (channel: number): string =>
  Math.round(channel * 255)
    .toString(16)
    .padStart(2, '0');

export function oklchToHex(lightness: number, chroma: number, hueDegrees: number): string {
  const hue = (hueDegrees * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);

  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const red = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const green = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const blue = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return `#${toHex(toSrgb(red))}${toHex(toSrgb(green))}${toHex(toSrgb(blue))}`;
}

export interface Tint {
  /** oklch(0.70 0.15 h) — accents, placeholder avatars */
  accent: string;
  /** oklch(0.42 0.12 h) — card background */
  card: string;
  /** oklch(0.36 0.11 h) — deep background (boards, featured cards) */
  deep: string;
  /** oklch(0.80 0.14 h) — light emblem */
  emblem: string;
  /** oklch(0.30 0.09 h) — lobby banner */
  banner: string;
  /** oklch(0.46 0.13 h) — secondary pattern tone */
  pattern: string;
}

const cache = new Map<number, Tint>();

export function tint(hue: number): Tint {
  const cached = cache.get(hue);
  if (cached) return cached;
  const value: Tint = {
    accent: oklchToHex(0.7, 0.15, hue),
    card: oklchToHex(0.42, 0.12, hue),
    deep: oklchToHex(0.36, 0.11, hue),
    emblem: oklchToHex(0.8, 0.14, hue),
    banner: oklchToHex(0.3, 0.09, hue),
    pattern: oklchToHex(0.46, 0.13, hue),
  };
  cache.set(hue, value);
  return value;
}

/** Appends an alpha channel to a #rrggbb color. */
export function withAlpha(hex: string, alpha: number): string {
  return `${hex}${toHex(Math.min(1, Math.max(0, alpha)))}`;
}
