import { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radii, sizes } from '../tokens';
import { fonts } from '../typography';
import { Text } from './Text';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string;
  /** Positive feedback under the field, e.g. "Disponible". */
  success?: string;
  hint?: string;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, success, hint, onFocus, onBlur, editable = true, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.coral : focused ? colors.violet : 'transparent';
  const message = error ?? success ?? hint;
  const messageColor = error ? colors.coral : success ? colors.mint : colors.textTertiary;

  return (
    <View style={styles.container}>
      <Text variant="caption" color={colors.textSecondary}>
        {label}
      </Text>
      <TextInput
        ref={ref}
        {...rest}
        editable={editable}
        accessibilityLabel={label}
        accessibilityHint={message}
        placeholderTextColor={colors.textTertiary}
        selectionColor={colors.violet}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[styles.input, { borderColor, opacity: editable ? 1 : 0.6 }]}
      />
      {message ? (
        <Text variant="meta" color={messageColor} accessibilityLiveRegion={error ? 'polite' : 'none'}>
          {message}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: 8 },
  input: {
    height: sizes.field,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 15,
  },
});
