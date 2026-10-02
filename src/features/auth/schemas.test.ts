import { signInSchema, signUpSchema, usernameSchema } from './schemas';

describe('auth schemas', () => {
  it('normalizes emails', () => {
    expect(signInSchema.parse({ email: '  Nova@Mail.COM ', password: 'x' }).email).toBe('nova@mail.com');
  });

  it('rejects weak or mismatched passwords', () => {
    const weak = signUpSchema.safeParse({ email: 'a@b.co', password: 'short', confirm: 'short' });
    expect(weak.success).toBe(false);
    const mismatch = signUpSchema.safeParse({ email: 'a@b.co', password: 'abcdef12', confirm: 'abcdef13' });
    expect(mismatch.success).toBe(false);
    if (!mismatch.success) expect(mismatch.error.issues[0]?.path).toEqual(['confirm']);
    expect(signUpSchema.safeParse({ email: 'a@b.co', password: 'abcdef12', confirm: 'abcdef12' }).success).toBe(true);
  });

  it('validates usernames like the server', () => {
    expect(usernameSchema.parse(' Nova_24 ')).toBe('nova_24');
    expect(usernameSchema.safeParse('ab').success).toBe(false);
    expect(usernameSchema.safeParse('nova!').success).toBe(false);
  });
});
