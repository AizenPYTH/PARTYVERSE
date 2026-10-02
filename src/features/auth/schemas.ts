import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email({ error: 'Adresse incomplète' }));

export const passwordSchema = z
  .string()
  .min(8, { error: '8 caractères minimum' })
  .max(72, { error: '72 caractères maximum' })
  .regex(/[A-Za-z]/, { error: 'Ajoute au moins une lettre' })
  .regex(/[0-9]/, { error: 'Ajoute au moins un chiffre' });

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: 'Mot de passe requis' }),
});

export const signUpSchema = z
  .object({ email: emailSchema, password: passwordSchema, confirm: z.string() })
  .refine((value) => value.password === value.confirm, { path: ['confirm'], error: 'Les mots de passe diffèrent' });

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((value) => value.password === value.confirm, { path: ['confirm'], error: 'Les mots de passe diffèrent' });

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/, { error: '3 à 20 caractères : lettres, chiffres ou _' });

export type SignInValues = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
