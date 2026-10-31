export class LixoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LixoError';
  }
}

export function requireRow<T>(row: T | null | undefined, fallback: string): T {
  if (row === null || row === undefined) throw new LixoError(fallback);
  return row;
}

export function errorMessage(error: unknown, fallback = 'Something went wrong.') {
  return error instanceof Error && error.message ? error.message : fallback;
}
