import 'react-native-url-polyfill/auto';

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { createClient, type SupportedStorage } from '@supabase/supabase-js';

const extra = Constants.expoConfig?.extra ?? {};
const supabaseUrl = extra.supabaseUrl as string | undefined;
const supabaseAnonKey = extra.supabaseAnonKey as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing SUPABASE_URL / SUPABASE_ANON_KEY. Copy .env.example to .env, fill it in, ' +
      'and restart the dev server so app.config.ts picks the values up.',
  );
}

/**
 * SecureStore caps a single value at ~2 KB on Android, and a Supabase session
 * (access token + refresh token + user) routinely exceeds that. So values are
 * split into fixed-size chunks with an index record describing the count.
 */
const CHUNK_SIZE = 1800;

function chunkKey(key: string, index: number) {
  return `${key}.${index}`;
}

async function readChunkCount(key: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(key);
  if (raw === null) return 0;
  const count = Number.parseInt(raw, 10);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

async function clearChunks(key: string, count: number) {
  for (let i = 0; i < count; i += 1) {
    await SecureStore.deleteItemAsync(chunkKey(key, i));
  }
}

const secureStoreAdapter: SupportedStorage = {
  async getItem(key) {
    const count = await readChunkCount(key);
    if (count === 0) return null;

    const parts: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i));
      // A missing chunk means a torn write — treat the whole value as absent
      // so the user is asked to sign in again rather than handed a broken JSON.
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(key, value) {
    await clearChunks(key, await readChunkCount(key));

    const count = Math.max(1, Math.ceil(value.length / CHUNK_SIZE));
    for (let i = 0; i < count; i += 1) {
      await SecureStore.setItemAsync(
        chunkKey(key, i),
        value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
      );
    }
    await SecureStore.setItemAsync(key, String(count));
  },

  async removeItem(key) {
    await clearChunks(key, await readChunkCount(key));
    await SecureStore.deleteItemAsync(key);
  },
};

/**
 * expo-secure-store is native-only — there is no keychain in a browser, and its
 * web build throws on every call. The dev server runs on web, so persist the
 * session in localStorage there instead. Native still gets the keychain.
 */
const webStorageAdapter: SupportedStorage = {
  async getItem(key) {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      // Private windows and blocked site data throw on access.
      return null;
    }
  },
  async setItem(key, value) {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // Not fatal: the session just will not survive a reload.
    }
  },
  async removeItem(key) {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
  },
};

const sessionStorageAdapter =
  Platform.OS === 'web' ? webStorageAdapter : secureStoreAdapter;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: sessionStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    // No URL to read a session out of in a native app.
    detectSessionInUrl: false,
  },
});
