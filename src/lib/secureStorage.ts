import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Session storage for Supabase Auth.
 *
 * iOS Keychain / Android Keystore entries are limited (~2 KB per value on
 * some devices) while a Supabase session can be larger, so values are split
 * into chunks. Every chunk lives in the secure store; nothing sensitive is
 * written to AsyncStorage. On web, localStorage is used (no secure enclave).
 */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const CHUNK_SIZE = 1800;

interface SecureBackend {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

const sanitize = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

export function createChunkedSecureStore(backend: SecureBackend): KeyValueStore {
  const countKey = (key: string) => `${sanitize(key)}.chunks`;
  const chunkKey = (key: string, index: number) => `${sanitize(key)}.${index}`;

  async function removeItem(key: string) {
    const count = Number((await backend.getItemAsync(countKey(key))) ?? 0);
    await Promise.all(Array.from({ length: count }, (_, i) => backend.deleteItemAsync(chunkKey(key, i))));
    await backend.deleteItemAsync(countKey(key));
  }

  return {
    async getItem(key) {
      const rawCount = await backend.getItemAsync(countKey(key));
      if (rawCount === null) return null;
      const count = Number(rawCount);
      if (!Number.isInteger(count) || count < 0) return null;
      const chunks = await Promise.all(Array.from({ length: count }, (_, i) => backend.getItemAsync(chunkKey(key, i))));
      // A missing chunk means a partial write: treat the session as absent.
      if (chunks.some((chunk) => chunk === null)) return null;
      return chunks.join('');
    },
    async setItem(key, value) {
      await removeItem(key);
      const chunks: string[] = [];
      for (let i = 0; i < value.length; i += CHUNK_SIZE) chunks.push(value.slice(i, i + CHUNK_SIZE));
      await Promise.all(chunks.map((chunk, i) => backend.setItemAsync(chunkKey(key, i), chunk)));
      // Written last so readers never see a count without its chunks.
      await backend.setItemAsync(countKey(key), String(chunks.length));
    },
    removeItem,
  };
}

function createWebStore(): KeyValueStore {
  const memory = new Map<string, string>();
  const storage = typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  return {
    async getItem(key) {
      return storage ? storage.getItem(key) : (memory.get(key) ?? null);
    },
    async setItem(key, value) {
      if (storage) storage.setItem(key, value);
      else memory.set(key, value);
    },
    async removeItem(key) {
      if (storage) storage.removeItem(key);
      else memory.delete(key);
    },
  };
}

export const sessionStorage: KeyValueStore =
  Platform.OS === 'web' ? createWebStore() : createChunkedSecureStore(SecureStore);
