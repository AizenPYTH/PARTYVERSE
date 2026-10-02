import { replayablePath, usePendingLink } from './pendingLink';

const LOBBY = '/lobby/2f1c6f0e-6d7a-4c1b-9d55-3a4b5c6d7e8f';

describe('pending deep links', () => {
  it('accepts in-app destinations from app links, web URLs and paths', () => {
    expect(replayablePath(`partyverse:/${LOBBY}`)).toBe(LOBBY);
    expect(replayablePath('partyverse://join/ABCD12')).toBe('/join/ABCD12');
    expect(replayablePath(`https://partyverse.app${LOBBY}?ref=push`)).toBe(LOBBY);
    expect(replayablePath('/games/chess_arena/')).toBe('/games/chess_arena');
    expect(replayablePath('/messages')).toBe('/messages');
  });

  it('ignores auth screens, unknown routes and junk', () => {
    expect(replayablePath('/sign-in')).toBeNull();
    expect(replayablePath('/auth/callback?code=x')).toBeNull();
    expect(replayablePath('/lobby/not-a-uuid')).toBeNull();
    expect(replayablePath('javascript:alert(1)')).toBeNull();
    expect(replayablePath('')).toBeNull();
  });

  it('remembers one destination and hands it out once', () => {
    usePendingLink.getState().remember(LOBBY);
    usePendingLink.getState().remember('/sign-in');
    expect(usePendingLink.getState().take()).toBe(LOBBY);
    expect(usePendingLink.getState().take()).toBeNull();
  });
});
