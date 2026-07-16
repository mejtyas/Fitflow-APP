import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const CHUNK_SIZE = 1800;
const memoryStorage = new Map<string, string>();

function safeKey(key: string) {
  return `fitflow.${key.replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

function webStorage() {
  return typeof globalThis.localStorage !== 'undefined' ? globalThis.localStorage : null;
}

async function nativeRemove(key: string) {
  const base = safeKey(key);
  const countRaw = await SecureStore.getItemAsync(`${base}.chunks`);
  const count = Number.parseInt(countRaw ?? '0', 10);
  await Promise.all([
    SecureStore.deleteItemAsync(base),
    SecureStore.deleteItemAsync(`${base}.chunks`),
    ...Array.from({ length: Number.isFinite(count) ? count : 0 }, (_, index) =>
      SecureStore.deleteItemAsync(`${base}.${index}`),
    ),
  ]);
}

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return webStorage()?.getItem(key) ?? memoryStorage.get(key) ?? null;
    }
    const base = safeKey(key);
    const countRaw = await SecureStore.getItemAsync(`${base}.chunks`);
    const count = Number.parseInt(countRaw ?? '0', 10);
    if (Number.isFinite(count) && count > 0) {
      const chunks = await Promise.all(
        Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(`${base}.${index}`)),
      );
      return chunks.every((chunk): chunk is string => chunk !== null) ? chunks.join('') : null;
    }
    return SecureStore.getItemAsync(base);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      const storage = webStorage();
      if (storage) storage.setItem(key, value);
      else memoryStorage.set(key, value);
      return;
    }
    await nativeRemove(key);
    const base = safeKey(key);
    const options = {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    };
    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(base, value, options);
      return;
    }
    const chunks = Array.from(
      { length: Math.ceil(value.length / CHUNK_SIZE) },
      (_, index) => value.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE),
    );
    await Promise.all(
      chunks.map((chunk, index) => SecureStore.setItemAsync(`${base}.${index}`, chunk, options)),
    );
    await SecureStore.setItemAsync(`${base}.chunks`, String(chunks.length), options);
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      webStorage()?.removeItem(key);
      memoryStorage.delete(key);
      return;
    }
    await nativeRemove(key);
  },
};
