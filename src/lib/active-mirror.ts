import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RestTimerState } from '@/services/active-workout';

const PREFIX = 'fitflow:activeSession:v4:';

export type MirrorSet = {
  kg: number | null;
  reps: number | null;
  completed: boolean;
};

export type ActiveMirror = {
  version: 4;
  sessionId: string;
  updatedAt: number;
  sets: Record<string, MirrorSet>;
  rest: RestTimerState;
  restDurations: Record<string, number>;
};

export async function readActiveMirror(sessionId: string): Promise<ActiveMirror | null> {
  try {
    const raw = await AsyncStorage.getItem(`${PREFIX}${sessionId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveMirror;
    return parsed.version === 4 && parsed.sessionId === sessionId ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeActiveMirror(mirror: ActiveMirror) {
  await AsyncStorage.setItem(`${PREFIX}${mirror.sessionId}`, JSON.stringify(mirror));
}

export async function clearActiveMirror(sessionId: string) {
  await AsyncStorage.removeItem(`${PREFIX}${sessionId}`);
}
