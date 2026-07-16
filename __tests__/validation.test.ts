import {
  clampKg,
  clampReps,
  isLoggedSetReps,
  isValidUuid,
  sanitizeDescription,
  sanitizeName,
  validateCredentials,
} from '@/lib/validation';

describe('validation', () => {
  test('accepts Supabase UUIDs and rejects malformed ids', () => {
    expect(isValidUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isValidUuid('not-an-id')).toBe(false);
  });

  test('clamps kg to supported range and precision', () => {
    expect(clampKg(82.567)).toBe(82.57);
    expect(clampKg(-10)).toBe(0);
    expect(clampKg(20_000)).toBe(9999);
    expect(clampKg(Number.NaN)).toBeNull();
  });

  test('rounds reps to half steps and treats values below one as empty', () => {
    expect(clampReps(6.26)).toBe(6.5);
    expect(clampReps(0.5)).toBeNull();
    expect(clampReps(20_000)).toBe(9999);
  });

  test('requires at least one rep for a logged set', () => {
    expect(isLoggedSetReps(1)).toBe(true);
    expect(isLoggedSetReps(0)).toBe(false);
    expect(isLoggedSetReps(null)).toBe(false);
  });

  test('sanitizes empty and oversized text', () => {
    expect(sanitizeName('  Bench press  ')).toBe('Bench press');
    expect(sanitizeName('   ')).toBeNull();
    expect(sanitizeName('x'.repeat(150))).toHaveLength(100);
    expect(sanitizeDescription('  cue  ')).toBe('cue');
    expect(sanitizeDescription('')).toBeNull();
  });

  test('normalizes valid credentials', () => {
    expect(validateCredentials(' USER@Example.com ', 'secret')).toEqual({
      email: 'user@example.com',
      password: 'secret',
    });
  });

  test('rejects invalid email and short registration password', () => {
    expect(validateCredentials('wrong', 'secret')).toHaveProperty('error');
    expect(validateCredentials('a@b.com', '123', true)).toHaveProperty('error');
  });
});
