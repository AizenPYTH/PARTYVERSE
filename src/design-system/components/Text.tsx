import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { colors } from '../tokens';
import { textVariants, type TextVariant } from '../typography';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: string;
  align?: TextStyle['textAlign'];
}

export function Text({ variant = 'body', color = colors.textPrimary, align, style, ...rest }: TextProps) {
  return <RNText {...rest} style={[textVariants[variant], { color, textAlign: align }, style]} />;
}
