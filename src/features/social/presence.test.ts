import { describePresence } from './presence';

describe('describePresence', () => {
  it('describes each status with text', () => {
    expect(describePresence('online').label).toBe('Disponible');
    expect(describePresence('in_game', { gameName: 'Connect Four' }).label).toBe('En partie · Connect Four');
    expect(describePresence('in_lobby', { gameName: 'Connect Four', playerCount: 1, maxPlayers: 2 }).label).toBe(
      'Salon Connect Four · 1/2',
    );
    expect(describePresence('offline').label).toBe('Hors ligne');
  });
});
