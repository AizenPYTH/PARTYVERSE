import { FunctionsHttpError } from '@supabase/supabase-js';
import type { z } from 'zod';

import { AppError, toAppError } from '@/lib/errors';
import { requireSupabase } from '@/lib/supabase';

/**
 * Calls the game-action Edge Function. Business errors come back as
 * `{ error: 'PV_*' }` with a 4xx status and are mapped like RPC errors.
 */
export async function invokeGameAction<S extends z.ZodType>(body: Record<string, unknown>, schema: S): Promise<z.infer<S>> {
  let response;
  try {
    response = await requireSupabase().functions.invoke('game-action', { body });
  } catch (error) {
    throw toAppError(error);
  }
  if (response.error) {
    if (response.error instanceof FunctionsHttpError) {
      const payload = await (response.error.context as Response).json().catch(() => null);
      throw toAppError({ message: typeof payload?.error === 'string' ? payload.error : 'PV_UNKNOWN' });
    }
    throw toAppError(response.error);
  }
  const parsed = schema.safeParse(response.data);
  if (!parsed.success) throw new AppError('PV_BAD_RESPONSE', { cause: parsed.error });
  return parsed.data;
}
