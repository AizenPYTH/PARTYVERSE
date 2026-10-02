import { z } from 'zod';

import { AppError, toAppError } from './errors';
import { requireSupabase } from './supabase';

/**
 * Calls a Postgres RPC and validates the response at runtime. Server data is
 * never trusted blindly: an unexpected shape surfaces as PV_BAD_RESPONSE.
 */
export async function callRpc<S extends z.ZodType>(
  fn: string,
  args: Record<string, unknown>,
  schema: S,
): Promise<z.infer<S>> {
  let response;
  try {
    response = await requireSupabase().rpc(fn, args);
  } catch (error) {
    throw toAppError(error);
  }
  if (response.error) throw toAppError(response.error);
  const parsed = schema.safeParse(response.data);
  if (!parsed.success) {
    if (__DEV__) console.warn(`[rpc] ${fn} returned an unexpected shape`, parsed.error.issues);
    throw new AppError('PV_BAD_RESPONSE', { cause: parsed.error });
  }
  return parsed.data;
}

/** For RPCs returning `void` (PostgREST answers with an empty body). */
export const voidResult = z.unknown().transform(() => undefined);
