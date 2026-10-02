import { readConfig } from './env';

describe('readConfig', () => {
  it('accepts a valid configuration', () => {
    expect(readConfig({ supabaseUrl: 'https://abc.supabase.co', supabaseAnonKey: 'x'.repeat(40) })).toEqual({
      ok: true,
      config: { supabaseUrl: 'https://abc.supabase.co', supabaseAnonKey: 'x'.repeat(40) },
    });
  });

  it('names the missing variables', () => {
    expect(readConfig({})).toEqual({
      ok: false,
      missing: ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'],
    });
    expect(readConfig({ supabaseUrl: 'not a url', supabaseAnonKey: 'x'.repeat(40) })).toEqual({
      ok: false,
      missing: ['EXPO_PUBLIC_SUPABASE_URL'],
    });
  });
});
