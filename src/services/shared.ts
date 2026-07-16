import type { PostgrestError } from '@supabase/supabase-js';

export class FitFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FitFlowError';
  }
}

export function requireData<T>(data: T | null, error: PostgrestError | null, fallback: string): T {
  if (error) throw new FitFlowError(error.message);
  if (data === null) throw new FitFlowError(fallback);
  return data;
}

export function throwOnError(error: { message: string } | null) {
  if (error) throw new FitFlowError(error.message);
}

export function errorMessage(error: unknown, fallback = 'Something went wrong.') {
  return error instanceof Error && error.message ? error.message : fallback;
}
