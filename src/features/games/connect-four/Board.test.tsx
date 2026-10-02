import { render, screen, userEvent } from '@testing-library/react-native';

import { Board } from './Board';
import { createInitialState, dropToken, type ConnectFourState, type Seat } from './engine';

function stateAfter(columns: number[]): ConnectFourState {
  let state = createInitialState();
  columns.forEach((column, index) => {
    const result = dropToken(state, column, (index % 2) as Seat);
    if (!result.ok) throw new Error(result.error);
    state = result.state;
  });
  return state;
}

describe('Connect Four board', () => {
  it('sends the tapped column when it is the player’s turn', async () => {
    const onDrop = jest.fn();
    const user = userEvent.setup();
    await render(<Board state={createInitialState()} interactive onDrop={onDrop} />);
    await user.press(screen.getByTestId('c4-column-3'));
    expect(onDrop).toHaveBeenCalledWith(3);
  });

  it('blocks full columns and every column outside the player’s turn', async () => {
    const onDrop = jest.fn();
    const user = userEvent.setup();
    const full = stateAfter([0, 0, 0, 0, 0, 0]);
    const { rerender } = await render(<Board state={full} interactive onDrop={onDrop} />);
    expect(screen.getByLabelText('Colonne 1, pleine')).toBeDisabled();
    await user.press(screen.getByTestId('c4-column-0'));
    expect(onDrop).not.toHaveBeenCalled();

    await rerender(<Board state={full} interactive={false} onDrop={onDrop} />);
    await user.press(screen.getByTestId('c4-column-4'));
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('announces the number of free cells per column', async () => {
    await render(<Board state={stateAfter([2, 2])} interactive onDrop={jest.fn()} />);
    expect(screen.getByLabelText('Colonne 3, 4 places libres')).toBeOnTheScreen();
  });
});
