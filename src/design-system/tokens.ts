/**
 * PARTYVERSE design tokens — source: design handoff v1 (docs/design/README.md).
 * Dark "Midnight" theme is the primary theme. Depth comes from surface steps
 * and 1 px borders; there are no drop shadows.
 */
export const colors = {
  midnight: '#0B0A14',
  surface: '#15131F',
  elevated: '#1E1B2B',
  border: '#2E2A40',
  borderStrong: '#3D3854',

  violet: '#8B5CFF',
  violetPressed: '#7443F0',
  violetText: '#B79BFF',
  violetSoft: 'rgba(139,92,255,0.16)',
  blue: '#3DB8FF',
  mint: '#3EE6A8',
  mintSoft: 'rgba(62,230,168,0.14)',
  amber: '#FFB547',
  amberSoft: 'rgba(255,181,71,0.14)',
  coral: '#FF5C72',
  coralSoft: 'rgba(255,92,114,0.12)',

  textPrimary: '#F4F2FA',
  textSecondary: '#A29DB8',
  /** 3.6:1 — only ≥ 16 px or non-essential meta */
  textTertiary: '#6E6987',
  textDisabled: '#4A4560',
  /** Text on blue / mint / amber / coral */
  onAccent: '#0B0A14',
  white: '#FFFFFF',
  scrim: 'rgba(5,4,9,0.72)',
  navBackground: 'rgba(11,10,20,0.96)',
} as const;

export const spacing = {
  xxs: 4,
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  screen: 20,
} as const;

export const radii = {
  chip: 6,
  badge: 8,
  sm: 12,
  md: 14,
  lg: 16,
  card: 18,
  hero: 24,
  sheet: 28,
  pill: 999,
} as const;

export const sizes = {
  buttonL: 52,
  buttonM: 44,
  buttonS: 36,
  iconButton: 44,
  iconButtonGame: 40,
  tabBar: 62,
  field: 52,
} as const;

export const motion = {
  press: 110,
  tab: 150,
  turn: 200,
  drop: 250,
  sheet: 280,
  pressScale: 0.97,
  cardPressScale: 0.98,
} as const;

export const theme = { colors, spacing, radii, sizes, motion } as const;
export type Theme = typeof theme;
