import { avatarHue, displayNameOf, initialsFor } from './avatars';

describe('avatars', () => {
  it('derives initials', () => {
    expect(initialsFor('Nova')).toBe('NO');
    expect(initialsFor('léo martin')).toBe('LM');
    expect(initialsFor('dark_knight')).toBe('DK');
    expect(initialsFor('')).toBe('?');
  });

  it('falls back for unknown avatars', () => {
    expect(avatarHue('unknown-item')).toBe(295);
    expect(avatarHue('comet-amber')).toBe(75);
  });

  it('prefers display names', () => {
    expect(displayNameOf({ display_name: ' ', username: 'nova' })).toBe('nova');
    expect(displayNameOf({ display_name: 'Nova', username: 'nova' })).toBe('Nova');
  });
});
