import {
  computeWarmupPair,
  DEFAULT_WARMUP_SETTINGS,
  parseWarmupSettings,
  topSetKgFromPastSessions,
  warmupSettingsToJson,
} from '@/lib/warmup';

describe('warm-up calculations', () => {
  test('uses defaults for missing or malformed JSON', () => {
    expect(parseWarmupSettings(null)).toEqual(DEFAULT_WARMUP_SETTINGS);
    expect(parseWarmupSettings([])).toEqual(DEFAULT_WARMUP_SETTINGS);
  });

  test('clamps values and orders low/high percentages', () => {
    expect(
      parseWarmupSettings({
        w1_pct_low: 80,
        w1_pct_high: 20,
        w1_reps: 0,
        w2_pct: 200,
        w2_reps: 3.2,
      }),
    ).toEqual({ w1_pct_low: 20, w1_pct_high: 80, w1_reps: 1, w2_pct: 100, w2_reps: 3 });
  });

  test('calculates and rounds a warm-up pair to half kg', () => {
    expect(computeWarmupPair(101, DEFAULT_WARMUP_SETTINGS)).toEqual({
      w1: { kg: 45.5, reps: 6 },
      w2: { kg: 81, reps: 2 },
    });
  });

  test('does not create warm-ups for non-positive top weight', () => {
    expect(computeWarmupPair(0, DEFAULT_WARMUP_SETTINGS)).toBeNull();
    expect(computeWarmupPair(Number.NaN, DEFAULT_WARMUP_SETTINGS)).toBeNull();
  });

  test('uses the newest past session with a positive weight', () => {
    expect(
      topSetKgFromPastSessions([
        { sets: [{ kg: null, reps: 10 }] },
        { sets: [{ kg: 60, reps: 8 }, { kg: 70, reps: 5 }] },
        { sets: [{ kg: 100, reps: 1 }] },
      ]),
    ).toBe(70);
  });

  test('serializes settings without changing values', () => {
    expect(warmupSettingsToJson(DEFAULT_WARMUP_SETTINGS)).toEqual(DEFAULT_WARMUP_SETTINGS);
  });
});
