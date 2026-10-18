import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import test from "node:test";
import { createReceiptOcrHandler } from "../lib/receipt-ocr.js";

const userId = "11111111-1111-4111-8111-111111111111";
const receiptId = "22222222-2222-4222-8222-222222222222";
const transactionId = "33333333-3333-4333-8333-333333333333";
const uploadId = "44444444-4444-4444-8444-444444444444";
const image = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const hash = createHash("sha256").update(image).digest("hex");
const facts = {
  is_receipt: true, currency: "MYR", merchant_name: "Dummy shop", total_amount: 12.5,
  receipt_date: "2026-10-01", category: "GROCERIES", items: [{ name: "Rice", price: 12.5 }],
};

function fixture({ existing = null, extraction = facts, status = "draft", saveError = null,
  outcome = "saved", concurrentPath = null, metadata = null, quotaAllowed = true,
  commitBeforeError = false, referenceLookupFails = false } = {}) {
  const state = { events: [], rpcCalls: [], uploads: new Set(), removed: [], errors: [], providerCalls: [], lookup: null,
    row: existing, rpcError: saveError };
  const db = {
    from(table) {
      assert.equal(table, "receipts");
      const filters = {};
      const query = {
        select() { return query; },
        eq(key, value) { filters[key] = value; return query; },
        async maybeSingle() {
          state.events.push(filters.image_url ? "reference-lookup" : "lookup");
          if (filters.image_url && referenceLookupFails) return { data: null, error: new Error("lookup unavailable") };
          if (!filters.image_url) state.lookup = filters;
          const row = state.row;
          const matches = row?.user_id === filters.user_id && (filters.image_url
            ? row.image_url === filters.image_url : row.image_sha256 === filters.image_sha256);
          return { data: matches ? row : null, error: null };
        },
      };
      return query;
    },
    async rpc(name, params) {
      assert.equal(name, "ingest_scanned_receipt");
      state.events.push("rpc");
      state.rpcCalls.push(params);
      if (state.rpcError && !commitBeforeError) return { data: null, error: state.rpcError };
      if (metadata) return { data: metadata, error: null };
      if (outcome === "possible_duplicate") return { data: { outcome, receipt_id: receiptId }, error: null };
      const ownedExisting = state.row?.user_id === userId ? state.row : null;
      const receipt = ownedExisting ?? { id: receiptId, user_id: userId,
        image_sha256: params.p_hash, image_url: concurrentPath ?? params.p_image_path,
        merchant_name: facts.merchant_name, total_amount: facts.total_amount, receipt_date: facts.receipt_date, category: "GROCERIES", items: facts.items };
      state.row = receipt;
      if (state.rpcError) return { data: null, error: state.rpcError };
      return { data: { outcome: "saved", reused: Boolean(ownedExisting || concurrentPath), receipt,
        transaction: { id: transactionId, user_id: userId, receipt_id: receiptId,
          category: "GROCERIES", status, source: "receipt", currency: "MYR" } }, error: null };
    },
    storage: { from(bucket) {
      assert.equal(bucket, "receipts");
      return {
        async upload(path, bytes, options) {
          state.events.push("upload");
          assert.deepEqual(bytes, image);
          assert.deepEqual(options, { contentType: "image/png", upsert: false });
          state.uploads.add(path);
          return { data: { path }, error: null };
        },
        async createSignedUrl(path) {
          state.events.push("signed-url");
          return { data: { signedUrl: `https://storage.invalid/${path}` }, error: null };
        },
        async remove(paths) {
          state.events.push("cleanup");
          state.removed.push(...paths);
          paths.forEach((path) => state.uploads.delete(path));
          return { data: paths, error: null };
        },
      };
    } },
  };
  const openai = { chat: { completions: { async create(request) {
    state.events.push("generate");
    state.providerCalls.push(request);
    return { choices: [{ message: { content: typeof extraction === "string" ? extraction : JSON.stringify(extraction) } }] };
  } } } };
  const handler = createReceiptOcrHandler({
    db, openai, uuid: () => uploadId, visionModel: "dummy-vision",
    prepareResponse: () => true, requireUser: async () => ({ id: userId }),
    enforceRateLimit: async () => { state.events.push("quota"); return quotaAllowed; },
    serverError: (res, context, error) => { state.errors.push(error); return res.status(500).json({ success: false }); },
  });
  const scan = async (body = {}, method = "POST") => {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    await handler({ method, body: { imageBase64: image.toString("base64"), ...body } }, res);
    return res;
  };
  return { state, scan };
}

test("an identical owned image reuses its posted transaction without quota, upload, or generation", async () => {
  const existing = { id: receiptId, user_id: userId, image_sha256: hash, image_url: `${userId}/saved.png`, category: "GROCERIES" };
  const { state, scan } = fixture({ existing, status: "posted" });
  const res = await scan({ lhdnCategory: "Tax review" });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.transaction_id, transactionId);
  assert.equal(res.body.data.status, "posted");
  assert.equal(res.body.data.reused, true);
  assert.deepEqual(state.events, ["lookup", "rpc"]);
  assert.deepEqual(state.lookup, { user_id: userId, image_sha256: hash });
  assert.equal(state.rpcCalls[0].p_receipt, null);
  assert.equal(state.rpcCalls[0].p_image_path, existing.image_url);
  assert.equal(state.rpcCalls[0].p_tax_review, true);
});

test("new valid receipt facts are atomically saved as a draft with an expense category", async () => {
  const { state, scan } = fixture({ extraction: { ...facts, is_valid_claim: true } });
  const res = await scan({ lhdnCategory: "Tax review", allowDuplicate: true });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.status, "draft");
  assert.equal(res.body.data.category, "GROCERIES");
  assert.equal(res.body.data.reused, false);
  assert.deepEqual(state.events, ["lookup", "quota", "upload", "signed-url", "generate", "rpc"]);
  assert.equal(state.rpcCalls[0].p_hash, hash);
  assert.equal(state.rpcCalls[0].p_receipt.category, "GROCERIES");
  assert.equal(state.rpcCalls[0].p_receipt.is_receipt, true);
  assert.equal(state.rpcCalls[0].p_tax_review, true);
  assert.equal(state.rpcCalls[0].p_allow_duplicate, true);
  assert.equal(Object.hasOwn(state.rpcCalls[0].p_receipt, "is_valid_claim"), false);
  const request = state.providerCalls[0];
  assert.equal(request.model, "dummy-vision");
  assert.equal(request.max_tokens, 2500);
  assert.match(request.messages[0].content[0].text, /is_receipt/);
  assert.match(request.messages[0].content[0].text, /UNKNOWN/);
  assert.match(request.messages[0].content[0].text, /MYR/);
});

for (const [name, extraction] of [
  ["unknown currency", { ...facts, currency: "UNKNOWN" }],
  ["foreign currency", { ...facts, currency: "USD" }],
  ["non-receipt", { ...facts, is_receipt: false }],
  ["malformed model JSON", "not JSON"],
]) {
  test(`${name} returns 422 without a financial write and cleans its upload`, async () => {
    const { state, scan } = fixture({ extraction });
    const res = await scan();
    assert.equal(res.statusCode, 422);
    assert.equal(res.body.success, false);
    assert.deepEqual(state.rpcCalls, []);
    assert.equal(state.uploads.size, 0);
    assert.deepEqual(state.removed, [`${userId}/${uploadId}.png`]);
  });
}

test("unsupported image bytes return 400 before quota or provider use", async () => {
  const { state, scan } = fixture();
  assert.equal((await scan({ imageBase64: Buffer.from("not a receipt image").toString("base64") })).statusCode, 400);
  assert.deepEqual(state.events, []);
});

test("a similar purchase returns the duplicate review ID and removes only its temporary upload", async () => {
  const { state, scan } = fixture({ outcome: "possible_duplicate" });
  const res = await scan();
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { success: false, code: "POSSIBLE_DUPLICATE", receiptId });
  assert.equal(state.uploads.size, 0);
  assert.deepEqual(state.removed, [`${userId}/${uploadId}.png`]);
  assert.equal(state.rpcCalls[0].p_allow_duplicate, false);
});

test("a failed atomic save reports failure and removes its upload", async () => {
  const { state, scan } = fixture({ saveError: new Error("database unavailable") });
  assert.equal((await scan()).statusCode, 500);
  assert.equal(state.rpcCalls.length, 1);
  assert.equal(state.uploads.size, 0);
  assert.deepEqual(state.removed, [`${userId}/${uploadId}.png`]);
});

test("a lost RPC response preserves committed image evidence and a retry reuses the row", async () => {
  const path = `${userId}/${uploadId}.png`;
  const { state, scan } = fixture({ saveError: new Error("response lost"), commitBeforeError: true });
  assert.equal((await scan()).statusCode, 500);
  assert.equal(state.row.image_url, path);
  assert.equal(state.uploads.has(path), true);
  assert.deepEqual(state.removed, []);
  state.rpcError = null;
  state.events = [];
  const retry = await scan();
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.body.data.reused, true);
  assert.deepEqual(state.events, ["lookup", "rpc"]);
  assert.equal(state.rpcCalls[1].p_receipt, null);
  assert.equal(state.uploads.has(path), true);
});

test("an unknown save outcome retains private evidence when its reference lookup also fails", async () => {
  const { state, scan } = fixture({ saveError: new Error("response lost"), referenceLookupFails: true });
  assert.equal((await scan()).statusCode, 500);
  assert.equal(state.uploads.size, 1);
  assert.deepEqual(state.removed, []);
});

test("concurrent exact-image reuse preserves the winner's evidence and removes only this request's upload", async () => {
  const winner = `${userId}/55555555-5555-4555-8555-555555555555.png`;
  const { state, scan } = fixture({ concurrentPath: winner });
  const res = await scan();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.image_url, winner);
  assert.equal(res.body.data.reused, true);
  assert.deepEqual(state.removed, [`${userId}/${uploadId}.png`]);
  assert.equal(state.removed.includes(winner), false);
});

test("unexpected RPC metadata cannot report a successful save", async () => {
  const { state, scan } = fixture({ metadata: { outcome: "saved", receipt: { id: receiptId }, transaction: {} } });
  const res = await scan();
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.success, false);
  assert.equal(state.rpcCalls.length, 1);
  assert.match(state.errors[0].message, /metadata/);
});

test("a saved receipt with unexpected ledger metadata retains potentially committed evidence", async () => {
  const path = `${userId}/${uploadId}.png`;
  const { state, scan } = fixture({ metadata: { outcome: "saved",
    receipt: { id: receiptId, user_id: userId, image_url: path, image_sha256: hash }, transaction: {} } });
  const res = await scan();
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.success, false);
  assert.equal(state.uploads.has(path), true);
  assert.deepEqual(state.removed, []);
});

test("a foreign owner's same image cannot take the exact-image reuse path", async () => {
  const { state, scan } = fixture({ existing: { id: receiptId, user_id: "another-owner", image_sha256: hash, image_url: "other/saved.png" } });
  const res = await scan();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.reused, false);
  assert.ok(state.events.includes("generate"));
  assert.deepEqual(state.lookup, { user_id: userId, image_sha256: hash });
});

test("unsupported methods are rejected before authentication or paid work", async () => {
  const { state, scan } = fixture();
  assert.equal((await scan({}, "PATCH")).statusCode, 405);
  assert.deepEqual(state.events, []);
});

test("the compatibility check advertises the reviewed-receipt protocol without paid work", async () => {
  const { state, scan } = fixture();
  const result = await scan({}, "GET");
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, { success: true, receiptProtocol: 2 });
  assert.deepEqual(state.events, []);
});
