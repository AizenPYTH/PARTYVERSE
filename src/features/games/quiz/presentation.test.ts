import { quizStatus } from './presentation';

describe('quizStatus', () => {
  it('describes each step for players and spectators', () => {
    expect(quizStatus('question', null, undefined, true, 0).text).toBe('Choisis ta réponse');
    expect(quizStatus('question', 2, undefined, true, 0).text).toBe('Réponse envoyée');
    expect(quizStatus('question', null, undefined, false, 0).text).toBe('Les joueurs répondent');
    expect(quizStatus('reveal', 1, 1, true, 180).text).toBe('Bonne réponse · +180');
    expect(quizStatus('reveal', 0, 1, true, 0).text).toBe('Mauvaise réponse');
    expect(quizStatus('reveal', null, 1, true, 0).text).toBe('Temps écoulé');
  });
});
