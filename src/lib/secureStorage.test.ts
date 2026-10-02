import { CHUNK_SIZE, createChunkedSecureStore } from './secureStorage';

jest.mock('expo-secure-store', () => ({}));

function memoryBackend() {
  const data = new Map<string, string>();
  return {
    data,
    getItemAsync: async (key: string) => data.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => {
      if (!/^[A-Za-z0-9._-]+$/.test(key)) throw new Error(`invalid key ${key}`);
      if (value.length > 2048) throw new Error('value too large');
      data.set(key, value);
    },
    deleteItemAsync: async (key: string) => {
      data.delete(key);
    },
  };
}

describe('chunked secure store', () => {
  it('round-trips values larger than the secure store limit', async () => {
    const backend = memoryBackend();
    const store = createChunkedSecureStore(backend);
    const session = JSON.stringify({ token: 'a'.repeat(CHUNK_SIZE * 2 + 17) });
    await store.setItem('sb-project-auth-token', session);
    expect(await store.getItem('sb-project-auth-token')).toBe(session);
    expect(backend.data.get('sb-project-auth-token.chunks')).toBe('3');
  });

  it('shrinks cleanly when a smaller value replaces a larger one', async () => {
    const backend = memoryBackend();
    const store = createChunkedSecureStore(backend);
    await store.setItem('k', 'b'.repeat(CHUNK_SIZE * 3));
    await store.setItem('k', 'small');
    expect(await store.getItem('k')).toBe('small');
    expect([...backend.data.keys()].sort()).toEqual(['k.0', 'k.chunks']);
  });

  it('removes every chunk and sanitizes keys', async () => {
    const backend = memoryBackend();
    const store = createChunkedSecureStore(backend);
    await store.setItem('user:session/1', 'value');
    await store.removeItem('user:session/1');
    expect(backend.data.size).toBe(0);
    expect(await store.getItem('user:session/1')).toBeNull();
  });

  it('treats a partial write as no session', async () => {
    const backend = memoryBackend();
    const store = createChunkedSecureStore(backend);
    await store.setItem('k', 'c'.repeat(CHUNK_SIZE + 1));
    backend.data.delete('k.1');
    expect(await store.getItem('k')).toBeNull();
  });
});
