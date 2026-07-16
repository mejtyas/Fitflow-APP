import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { clearActiveMirror, readActiveMirror, writeActiveMirror } from '@/lib/active-mirror';
import { getDefaultRestSeconds, saveDefaultRestSeconds } from '@/lib/preferences';
import { secureSessionStorage } from '@/lib/secure-storage';

describe('device persistence', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  test('persists and clamps the default rest preference', async () => {
    expect(await getDefaultRestSeconds()).toBe(150);
    expect(await saveDefaultRestSeconds(3)).toBe(15);
    expect(await getDefaultRestSeconds()).toBe(15);
    expect(await saveDefaultRestSeconds(999)).toBe(600);
  });

  test('round-trips and clears an active workout mirror', async () => {
    const mirror = {
      version: 4 as const,
      sessionId: 'session-1',
      updatedAt: 10,
      sets: { set1: { kg: 80, reps: 8, completed: true } },
      rest: { targetMs: null, remainingMs: 0, paused: false, endsAt: null },
      restDurations: { exercise1: 120 },
    };
    await writeActiveMirror(mirror);
    expect(await readActiveMirror('session-1')).toEqual(mirror);
    await clearActiveMirror('session-1');
    expect(await readActiveMirror('session-1')).toBeNull();
  });

  test('chunks encrypted session payloads and reconstructs them', async () => {
    const nativeStore = new Map<string, string>();
    jest.mocked(SecureStore.getItemAsync).mockImplementation(async (key) => nativeStore.get(key) ?? null);
    jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => { nativeStore.set(key, value); });
    jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => { nativeStore.delete(key); });
    const payload = 'x'.repeat(5000);
    await secureSessionStorage.setItem('auth:key', payload);
    expect(nativeStore.size).toBeGreaterThan(2);
    expect(await secureSessionStorage.getItem('auth:key')).toBe(payload);
    await secureSessionStorage.removeItem('auth:key');
    expect(await secureSessionStorage.getItem('auth:key')).toBeNull();
  });
});
