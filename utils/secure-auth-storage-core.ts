// A Supabase session can exceed the size accepted by some iOS Keychain versions.
// Keep every part small and commit the new set only after all parts are written.
const CHUNK_LENGTH = 400;

type Store = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

type Manifest = { generation: string; count: number };

const partKey = (key: string, generation: string, index: number) =>
  `${key}.${generation}.${index}`;

export function createChunkedAuthStorage(store: Store): Store {
  async function readManifest(key: string): Promise<Manifest | null> {
    const value = await store.getItem(key);
    if (!value) return null;

    try {
      const manifest: Manifest = JSON.parse(value);
      if (
        typeof manifest.generation === "string" &&
        /^[a-z0-9-]+$/.test(manifest.generation) &&
        Number.isInteger(manifest.count) &&
        manifest.count > 0 &&
        manifest.count <= 1024
      ) {
        return manifest;
      }
    } catch {
      // An incomplete/corrupt session must not be treated as a valid login.
    }
    return null;
  }

  async function deleteParts(key: string, manifest: Manifest) {
    for (let index = 0; index < manifest.count; index += 1) {
      await store.removeItem(partKey(key, manifest.generation, index));
    }
  }

  return {
    async getItem(key) {
      const manifest = await readManifest(key);
      if (!manifest) return null;

      const parts = await Promise.all(
        Array.from({ length: manifest.count }, (_, index) =>
          store.getItem(partKey(key, manifest.generation, index)),
        ),
      );
      return parts.some((part) => part === null) ? null : parts.join("");
    },

    async setItem(key, value) {
      const previous = await readManifest(key);
      const generation = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const characters = Array.from(value);
      const parts: string[] = [];
      for (let index = 0; index < characters.length; index += CHUNK_LENGTH) {
        parts.push(characters.slice(index, index + CHUNK_LENGTH).join(""));
      }
      if (parts.length === 0) parts.push("");

      const manifest = { generation, count: parts.length };
      try {
        for (let index = 0; index < parts.length; index += 1) {
          await store.setItem(partKey(key, generation, index), parts[index]);
        }
        await store.setItem(key, JSON.stringify(manifest));
      } catch (error) {
        await deleteParts(key, manifest).catch(() => {});
        throw error;
      }

      if (previous) await deleteParts(key, previous).catch(() => {});
    },

    async removeItem(key) {
      const manifest = await readManifest(key);
      await store.removeItem(key);
      if (manifest) await deleteParts(key, manifest);
    },
  };
}
