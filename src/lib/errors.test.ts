import { AppError, errorMessage, toAppError } from './errors';

describe('toAppError', () => {
  it('maps server PV codes from Postgrest errors', () => {
    const error = toAppError({ message: 'PV_LOBBY_FULL', code: 'P0001', details: null });
    expect(error.code).toBe('PV_LOBBY_FULL');
    expect(error.message).toBe('Ce salon est complet.');
  });

  it('maps auth error codes', () => {
    expect(toAppError({ message: 'Invalid login credentials', code: 'invalid_credentials' }).code).toBe('invalid_credentials');
  });

  it('detects network failures', () => {
    expect(toAppError(new TypeError('Network request failed')).code).toBe('PV_NETWORK');
  });

  it('falls back to a generic message without leaking internals', () => {
    expect(errorMessage({ message: 'relation "x" does not exist' })).toBe('Une erreur est survenue. Réessaie.');
    expect(toAppError('boom').code).toBe('PV_UNKNOWN');
  });

  it('keeps AppError instances', () => {
    const original = new AppError('PV_MUTED');
    expect(toAppError(original)).toBe(original);
  });
});
