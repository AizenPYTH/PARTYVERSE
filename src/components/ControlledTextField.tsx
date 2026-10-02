import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';

import { TextField, type TextFieldProps } from '@/design-system';

export function ControlledTextField<T extends FieldValues>({
  control,
  name,
  ...props
}: { control: Control<T>; name: FieldPath<T> } & Omit<TextFieldProps, 'value' | 'onChangeText' | 'onBlur'>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField
          {...props}
          value={typeof field.value === 'string' ? field.value : ''}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          error={fieldState.error?.message ?? props.error}
        />
      )}
    />
  );
}
