import assert from "node:assert/strict";
import test from "node:test";
import { createReceiptHandler } from "../lib/receipt-deletion.js";

const userId = "11111111-1111-4111-8111-111111111111";
const receiptId = "22222222-2222-4222-8222-222222222222";

function fixture({ image = `${userId}/receipt.jpg`, storageFails = false, deleteFails = false } = {}) {
  const state = { row: { id: receiptId, user_id: userId, image_url: image }, imageExists: true, storageFails, deleteFails, events: [] };
  const db = {
    from(table) {
      assert.equal(table, "receipts");
      let deleting = false;
      const filters = {};
      const query = {
        select() { return query; },
        delete() { deleting = true; return query; },
        eq(key, value) { filters[key] = value; return query; },
        maybeSingle() { return Promise.resolve({ data: state.row && state.row.id === filters.id && state.row.user_id === filters.user_id ? state.row : null, error: null }); },
        then(resolve, reject) {
          assert.equal(deleting, true);
          assert.equal(filters.user_id, userId);
          assert.equal(filters.id, receiptId);
          state.events.push("database-delete");
          if (!state.deleteFails) state.row = null;
          return Promise.resolve({ error: state.deleteFails ? new Error("database unavailable") : null }).then(resolve, reject);
        },
      };
      return query;
    },
    storage: { from(bucket) {
      assert.equal(bucket, "receipts");
      return { async remove(paths) {
        state.events.push(["storage-delete", ...paths]);
        if (state.storageFails) return { data: null, error: new Error("storage unavailable") };
        state.imageExists = false;
        return { data: [], error: null };
      } };
    } },
  };
  const handler = createReceiptHandler({
    db, prepareResponse: () => true, requireUser: async () => ({ id: userId }),
    serverError: (res) => res.status(500).json({ success: false }),
  });
  const remove = async () => {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ method: "DELETE", query: { id: receiptId } }, res);
    return res;
  };
  return { state, remove };
}

test("a failed storage deletion preserves the receipt path and reports failure so retry can finish", async () => {
  const { state, remove } = fixture({ storageFails: true });
  assert.equal((await remove()).statusCode, 500);
  assert.equal(state.row.image_url, `${userId}/receipt.jpg`);
  assert.equal(state.imageExists, true);
  state.storageFails = false;
  assert.equal((await remove()).statusCode, 200);
  assert.equal(state.row, null);
  assert.equal(state.imageExists, false);
});

test("database failure after image deletion retains the row and a repeated deletion completes", async () => {
  const { state, remove } = fixture({ deleteFails: true });
  assert.equal((await remove()).statusCode, 500);
  assert.equal(state.imageExists, false);
  assert.equal(state.row.id, receiptId);
  state.deleteFails = false;
  assert.equal((await remove()).statusCode, 200);
  assert.equal(state.row, null);
});

test("legacy public receipt URLs are decoded and storage is removed before the row", async () => {
  const { state, remove } = fixture({ image: `https://example.supabase.co/storage/v1/object/public/receipts/${userId}%2Fold%20receipt.jpg` });
  assert.equal((await remove()).statusCode, 200);
  assert.deepEqual(state.events, [["storage-delete", `${userId}/old receipt.jpg`], "database-delete"]);
});

for (const image of ["someone-else/receipt.jpg", `${userId}/../someone-else/receipt.jpg`, `${userId}/folder\\receipt.jpg`, `https://example.supabase.co/storage/v1/object/public/receipts/other%2Freceipt.jpg`, "https://invalid.test/not-a-receipt", "%broken"]) {
  test(`unsafe receipt path is retained without destructive operations: ${image}`, async () => {
    const { state, remove } = fixture({ image });
    assert.equal((await remove()).statusCode, 500);
    assert.equal(state.row.image_url, image);
    assert.deepEqual(state.events, []);
  });
}

test("a receipt owned by another user is not found or deleted", async () => {
  const { state, remove } = fixture();
  state.row.user_id = "another-user";
  assert.equal((await remove()).statusCode, 404);
  assert.deepEqual(state.events, []);
});
