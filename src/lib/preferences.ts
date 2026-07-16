import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFERENCES_KEY = 'fitflow:preferences:v1';
export const REST_DEFAULT_SECONDS = 150;
export const REST_PRESET_SECONDS = [60, 90, 120, 150, 180, 300] as const;

export function clampRestSeconds(seconds: number, min = 15, max = 600) {
  return Number.isFinite(seconds)
    ? Math.min(max, Math.max(min, Math.round(seconds)))
    : REST_DEFAULT_SECONDS;
}

export async function getDefaultRestSeconds() {
  try {
    const raw = await AsyncStorage.getItem(PREFERENCES_KEY);
    if (!raw) return REST_DEFAULT_SECONDS;
    const parsed = JSON.parse(raw) as { defaultRestSeconds?: unknown };
    return typeof parsed.defaultRestSeconds === 'number'
      ? clampRestSeconds(parsed.defaultRestSeconds)
      : REST_DEFAULT_SECONDS;
  } catch {
    return REST_DEFAULT_SECONDS;
  }
}

export async function saveDefaultRestSeconds(seconds: number) {
  const value = clampRestSeconds(seconds);
  await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify({ defaultRestSeconds: value }));
  return value;
}
