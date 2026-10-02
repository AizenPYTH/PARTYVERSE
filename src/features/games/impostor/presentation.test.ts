import { impostorStatus } from './presentation';

const ctx = { myTurn: false, turnName: 'Nova', eliminatedName: 'Léo' };

describe('impostorStatus', () => {
  it('describes every phase', () => {
    expect(impostorStatus('clues', { ...ctx, myTurn: true }).text).toBe('À toi de donner un indice');
    expect(impostorStatus('clues', ctx).text).toBe('Nova cherche un indice');
    expect(impostorStatus('discussion', ctx).text).toBe('Discussion');
    expect(impostorStatus('vote', { ...ctx, myTurn: true }).text).toBe('Vote pour l’imposteur');
    expect(impostorStatus('guess', ctx).text).toBe('Léo est démasqué et tente de deviner');
  });
});
