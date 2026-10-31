import { formatDaysSince, formatDurationMs, formatRestMs, displayName } from '@/lib/format';
import { estimatedOneRmEpley, sessionMetrics, setVolume } from '@/lib/metrics';

describe('metrics', () => {
  test('calculates Epley estimated 1RM', () => {
    expect(estimatedOneRmEpley(100, 5)).toBeCloseTo(116.667, 2);
    expect(estimatedOneRmEpley(0, 5)).toBeNull();
    expect(estimatedOneRmEpley(100, 0)).toBeNull();
  });

  test('only counts logged reps in volume', () => {
    expect(setVolume({ kg: 100, reps: 5 })).toBe(500);
    expect(setVolume({ kg: 100, reps: 0 })).toBe(0);
  });

  test('summarizes max weight, volume and strength', () => {
    expect(sessionMetrics([{ kg: 100, reps: 5 }, { kg: 80, reps: 10 }, { kg: 200, reps: null }])).toEqual({
      maxKg: 100,
      volume: 1300,
      estimatedOneRm: 116.66666666666667,
    });
  });
});

describe('formatting', () => {
  test('formats workout and rest durations', () => {
    expect(formatDurationMs(3_900_000)).toBe('1h 5m');
    expect(formatDurationMs(65_000, true)).toBe('1:05');
    expect(formatRestMs(90_000)).toBe('1:30');
  });

  test('falls back for blank display names', () => {
    expect(displayName(' Push ')).toBe('Push');
    expect(displayName('   ')).toBe('Workout');
    expect(displayName(null, 'Fallback')).toBe('Fallback');
  });

  test('formats local calendar distance without DST assumptions', () => {
    const now = new Date(2026, 6, 17, 20);
    expect(formatDaysSince(new Date(2026, 6, 17, 1).toISOString(), now)).toBe('Today');
    expect(formatDaysSince(new Date(2026, 6, 16, 23).toISOString(), now)).toBe('Yesterday');
    expect(formatDaysSince(new Date(2026, 6, 10, 12).toISOString(), now)).toBe('7 days ago');
  });
});
