import { render, screen, userEvent } from '@testing-library/react-native';
import { useState } from 'react';

import { Button } from '../Button';
import { TextField } from '../TextField';

describe('Button', () => {
  it('calls onPress and exposes an accessible name', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await render(<Button label="Jouer" onPress={onPress} />);
    await user.press(screen.getByRole('button', { name: 'Jouer' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ignores presses while disabled or loading', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await render(
      <>
        <Button label="Désactivé" onPress={onPress} disabled />
        <Button label="Chargement" onPress={onPress} loading />
      </>,
    );
    await user.press(screen.getByRole('button', { name: 'Désactivé' }));
    await user.press(screen.getByRole('button', { name: 'Chargement' }));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Chargement' })).toBeBusy();
  });
});

describe('TextField', () => {
  it('types text and shows validation feedback', async () => {
    const onChangeText = jest.fn();
    const user = userEvent.setup();
    function Controlled() {
      const [value, setValue] = useState('');
      return (
        <TextField
          label="Pseudo"
          value={value}
          onChangeText={(text) => {
            setValue(text);
            onChangeText(text);
          }}
        />
      );
    }
    const { rerender } = await render(<Controlled />);
    await user.type(screen.getByLabelText('Pseudo'), 'nova');
    expect(onChangeText).toHaveBeenLastCalledWith('nova');

    await rerender(<TextField label="Pseudo" value="nova" onChangeText={onChangeText} success="Disponible" />);
    expect(screen.getByText('Disponible')).toBeOnTheScreen();

    await rerender(<TextField label="Pseudo" value="no" onChangeText={onChangeText} error="Trop court" />);
    expect(screen.getByText('Trop court')).toBeOnTheScreen();
    expect(screen.queryByText('Disponible')).toBeNull();
  });
});
