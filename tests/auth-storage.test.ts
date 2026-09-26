import assert from "node:assert/strict";
import test from "node:test";
import { createChunkedAuthStorage } from "../utils/secure-auth-storage-core.ts";

function createStore() {
  const values = new Map<string, string>();
  const storage = createChunkedAuthStorage({
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    },
  });
  return { storage, values };
}

test("secure session storage preserves long Unicode values", async () => {
  const { storage, values } = createStore();
  const session = "🔐Mālaysia".repeat(700);
  await storage.setItem("sb-auth-token", session);
  assert.equal(await storage.getItem("sb-auth-token"), session);
  assert.ok(values.size > 2);
  assert.ok([...values.values()].every((part) => part.length <= 1600));
});

test("secure session storage replaces and removes every chunk", async () => {
  const { storage, values } = createStore();
  await storage.setItem("sb-auth-token", "old".repeat(1000));
  await storage.setItem("sb-auth-token", "new session");
  assert.equal(await storage.getItem("sb-auth-token"), "new session");
  await storage.removeItem("sb-auth-token");
  assert.equal(await storage.getItem("sb-auth-token"), null);
  assert.equal(values.size, 0);
});

test("an incomplete saved session cannot be loaded", async () => {
  const { storage, values } = createStore();
  await storage.setItem("sb-auth-token", "session".repeat(200));
  const chunkKey = [...values.keys()].find((key) => key !== "sb-auth-token");
  assert.ok(chunkKey);
  values.delete(chunkKey);
  assert.equal(await storage.getItem("sb-auth-token"), null);
});
