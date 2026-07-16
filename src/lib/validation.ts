const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const limits = {
  kg: 9999,
  reps: 9999,
  name: 100,
  description: 2000,
  feedback: 4000,
} as const;

export function isValidUuid(id: string): boolean {
  return typeof id === 'string' && UUID_RE.test(id.trim());
}

export function clampKg(value: number | null | undefined): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || !Number.isFinite(value)) return null;
  return Math.min(limits.kg, Math.max(0, Math.round(value * 100) / 100));
}

export function isLoggedSetReps(reps: number | null | undefined): reps is number {
  return typeof reps === 'number' && Number.isFinite(reps) && reps >= 1;
}

export function clampReps(value: number | null | undefined): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 2) / 2;
  if (rounded < 1) return null;
  return Math.min(limits.reps, rounded);
}

export function sanitizeName(raw: string): string | null {
  const value = raw.trim();
  return value ? value.slice(0, limits.name) : null;
}

export function sanitizeDescription(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  return value ? value.slice(0, limits.description) : null;
}

export function validateCredentials(email: string, password: string, registering = false) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
    return { error: 'Enter a valid email address.' } as const;
  }
  if (!password || (registering && password.length < 6)) {
    return { error: registering ? 'Password must be at least 6 characters.' : 'Enter your password.' } as const;
  }
  return { email: normalizedEmail, password } as const;
}
