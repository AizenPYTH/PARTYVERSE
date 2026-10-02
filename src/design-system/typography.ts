import { Unbounded_500Medium } from '@expo-google-fonts/unbounded/500Medium';
import { Unbounded_600SemiBold } from '@expo-google-fonts/unbounded/600SemiBold';
import { Unbounded_700Bold } from '@expo-google-fonts/unbounded/700Bold';
import { Manrope_400Regular } from '@expo-google-fonts/manrope/400Regular';
import { Manrope_500Medium } from '@expo-google-fonts/manrope/500Medium';
import { Manrope_600SemiBold } from '@expo-google-fonts/manrope/600SemiBold';
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold';
import { Manrope_800ExtraBold } from '@expo-google-fonts/manrope/800ExtraBold';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono/500Medium';
import type { TextStyle } from 'react-native';

/** Fonts bundled with the app (Google Fonts, OFL). */
export const fontAssets = {
  Unbounded_500Medium,
  Unbounded_600SemiBold,
  Unbounded_700Bold,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  JetBrainsMono_500Medium,
};

export const fonts = {
  display: 'Unbounded_700Bold',
  displaySemi: 'Unbounded_600SemiBold',
  displayMedium: 'Unbounded_500Medium',
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extrabold: 'Manrope_800ExtraBold',
  mono: 'JetBrainsMono_500Medium',
} as const;

const numeric: TextStyle = { fontVariant: ['tabular-nums'] };

export const textVariants = {
  wordmark: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36, letterSpacing: 2.4 },
  display: { fontFamily: fonts.display, fontSize: 32, lineHeight: 36, letterSpacing: -0.64 },
  tabTitle: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, letterSpacing: -0.28 },
  hero: { fontFamily: fonts.display, fontSize: 26, lineHeight: 29 },
  featured: { fontFamily: fonts.display, fontSize: 22, lineHeight: 27 },
  title: { fontFamily: fonts.displaySemi, fontSize: 22, lineHeight: 28 },
  titleSm: { fontFamily: fonts.displaySemi, fontSize: 18, lineHeight: 24 },
  titleXs: { fontFamily: fonts.displaySemi, fontSize: 16, lineHeight: 21 },
  stat: { fontFamily: fonts.displaySemi, fontSize: 26, lineHeight: 32, ...numeric },
  score: { fontFamily: fonts.displaySemi, fontSize: 24, lineHeight: 30, ...numeric },
  timer: { fontFamily: fonts.displaySemi, fontSize: 36, lineHeight: 40, ...numeric },
  section: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22 },
  item: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20 },
  itemSm: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 19 },
  caption: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16 },
  captionBold: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 16 },
  meta: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14 },
  metaBold: { fontFamily: fonts.bold, fontSize: 10, lineHeight: 13 },
  button: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, letterSpacing: 0.15 },
  buttonSm: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18 },
  tag: { fontFamily: fonts.extrabold, fontSize: 10, lineHeight: 13, letterSpacing: 0.4 },
  overline: { fontFamily: fonts.mono, fontSize: 11, lineHeight: 14, letterSpacing: 1.32, textTransform: 'uppercase' },
  numeric: { fontFamily: fonts.extrabold, fontSize: 15, lineHeight: 20, ...numeric },
} satisfies Record<string, TextStyle>;

export type TextVariant = keyof typeof textVariants;
