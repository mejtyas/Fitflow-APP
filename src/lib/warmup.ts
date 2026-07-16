import type { Json } from '@/lib/database.types';

export type WarmupSettings = {
  w1_pct_low: number;
  w1_pct_high: number;
  w1_reps: number;
  w2_pct: number;
  w2_reps: number;
};

export const DEFAULT_WARMUP_SETTINGS: WarmupSettings = {
  w1_pct_low: 40,
  w1_pct_high: 50,
  w1_reps: 6,
  w2_pct: 80,
  w2_reps: 2,
};

function clampInt(value: number, min: number, max: number) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : min;
}

export function parseWarmupSettings(raw: Json | null | undefined): WarmupSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_WARMUP_SETTINGS };
  }
  const object = raw as Record<string, unknown>;
  const low = clampInt(Number(object.w1_pct_low), 1, 100);
  const high = clampInt(Number(object.w1_pct_high), 1, 100);
  return {
    w1_pct_low: Math.min(low, high),
    w1_pct_high: Math.max(low, high),
    w1_reps: clampInt(Number(object.w1_reps), 1, 99),
    w2_pct: clampInt(Number(object.w2_pct), 1, 100),
    w2_reps: clampInt(Number(object.w2_reps), 1, 99),
  };
}

export function warmupSettingsToJson(settings: WarmupSettings): Json {
  return { ...settings };
}

export function topSetKgFromPastSessions(
  sessions: { sets: { kg: number | null; reps: number | null }[] }[],
) {
  for (const session of sessions) {
    const top = Math.max(0, ...session.sets.map((set) => set.kg ?? 0));
    if (top > 0) return top;
  }
  return null;
}

export function computeWarmupPair(topKg: number, settings: WarmupSettings) {
  if (!Number.isFinite(topKg) || topKg <= 0) return null;
  const roundHalf = (kg: number) => Math.round(kg * 2) / 2;
  const w1 = roundHalf(topKg * ((settings.w1_pct_low + settings.w1_pct_high) / 200));
  const w2 = roundHalf(topKg * (settings.w2_pct / 100));
  return {
    w1: { kg: w1, reps: settings.w1_reps },
    w2: { kg: w2, reps: settings.w2_reps },
  };
}
