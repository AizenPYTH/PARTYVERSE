import { parseAuthCallback } from './callback';

describe('parseAuthCallback', () => {
  it('extracts the PKCE code and intent', () => {
    expect(parseAuthCallback('partyverse://auth/callback?code=abc123&next=reset')).toEqual({
      kind: 'code',
      code: 'abc123',
      next: 'reset',
    });
    expect(parseAuthCallback('partyverse://auth/callback?code=abc')).toEqual({ kind: 'code', code: 'abc', next: null });
  });

  it('surfaces errors from the fragment', () => {
    expect(
      parseAuthCallback('partyverse://auth/callback#error=access_denied&error_code=otp_expired&error_description=Link+expired'),
    ).toEqual({ kind: 'error', code: 'otp_expired', description: 'Link expired' });
  });

  it('ignores unrelated URLs', () => {
    expect(parseAuthCallback('not a url')).toEqual({ kind: 'none' });
    expect(parseAuthCallback('partyverse://lobby/123')).toEqual({ kind: 'none' });
  });
});
