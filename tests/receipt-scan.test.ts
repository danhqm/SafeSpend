import assert from "node:assert/strict";
import test from "node:test";
import { scanReceiptImage } from "../utils/receipt-scan.ts";
import { getErrorMessage } from "../utils/error-message.ts";

const receipt = { id: "receipt-1", transaction_id: "transaction-1", merchant_name: "Demo Book Corner",
  total_amount: 114.8, receipt_date: "2025-10-17", category: "EDUCATION", items: [], image_url: "owner/books.png", status: "draft" };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

test("an old deployment is rejected before an image upload or potential duplicate expense", async () => {
  let uploads = 0;
  await assert.rejects(scanReceiptImage(async (_path, init) => {
    if (init?.method === "GET") return json({ success: false, error: "Method not allowed" }, 405);
    uploads++;
    return json({ success: true, data: receipt });
  }, "dummy-image", { taxReview: true }), /needs.*update/i);
  assert.equal(uploads, 0);
});
test("a compatible backend accepts the scan and returns the actual saved date", async () => {
  let uploaded: unknown;
  const result = await scanReceiptImage(async (_path, init) => {
    if (init?.method === "GET") return json({ success: true, receiptProtocol: 2 });
    uploaded = JSON.parse(String(init?.body));
    return json({ success: true, data: receipt });
  }, "dummy-image", { taxReview: true, allowDuplicate: false });
  assert.equal(result.kind, "saved");
  if (result.kind === "saved") assert.equal(result.receipt.receipt_date, "2025-10-17");
  assert.deepEqual(uploaded, { imageBase64: "dummy-image", taxReview: true, allowDuplicate: false });
});
test("structured API errors display their message instead of object coercion", async () => {
  await assert.rejects(scanReceiptImage(async (_path, init) => init?.method === "GET"
    ? json({ success: true, receiptProtocol: 2 })
    : json({ success: false, error: { message: "Receipt extraction is unavailable" } }, 503), "dummy"), /Receipt extraction is unavailable/);
});
test("an unrecognized error object produces a useful status message", async () => {
  await assert.rejects(scanReceiptImage(async (_path, init) => init?.method === "GET"
    ? json({ success: true, receiptProtocol: 2 })
    : json({ success: false, error: { code: "provider_failure" } }, 500), "dummy"), /Receipt scanning failed.*500/);
});
test("a non-JSON oversized-image response remains readable", async () => {
  await assert.rejects(scanReceiptImage(async (_path, init) => init?.method === "GET"
    ? json({ success: true, receiptProtocol: 2 })
    : new Response("Request Entity Too Large", { status: 413 }), "dummy"), /image.*too large/i);
});

test("a platform JSON 413 cannot replace helpful guidance with its generic error", async () => {
  await assert.rejects(scanReceiptImage(async (_path, init) => init?.method === "GET"
    ? json({ success: true, receiptProtocol: 2 })
    : json({ error: "Request Entity Too Large" }, 413), "dummy"), /receipt image.*too large.*crop/i);
});

test("a camera image whose base64 exceeds the safe upload budget never reaches the API", async () => {
  let requests = 0;
  await assert.rejects(scanReceiptImage(async () => {
    requests++;
    return json({ success: true, receiptProtocol: 2, data: receipt });
  }, "A".repeat(4_000_004)), /receipt image.*too large/i);
  assert.equal(requests, 0);
});

test("the largest prepared image plus scan options stays below the platform request limit", async () => {
  let bodyBytes = 0;
  await scanReceiptImage(async (_path, init) => {
    if (init?.method === "GET") return json({ success: true, receiptProtocol: 2 });
    bodyBytes = Buffer.byteLength(String(init?.body));
    return json({ success: true, data: receipt });
  }, "A".repeat(4_000_000), { taxReview: true, allowDuplicate: true });
  assert.ok(bodyBytes < 4_100_000);
});
test("a possible duplicate still offers the existing receipt rather than a new financial record", async () => {
  const result = await scanReceiptImage(async (_path, init) => init?.method === "GET"
    ? json({ success: true, receiptProtocol: 2 })
    : json({ success: false, code: "POSSIBLE_DUPLICATE", receiptId: "saved-1" }, 409), "dummy");
  assert.deepEqual(result, { kind: "duplicate", receiptId: "saved-1" });
});
test("an expired sign-in during compatibility checking never uploads an image", async () => {
  let uploads = 0;
  await assert.rejects(scanReceiptImage(async (_path, init) => {
    if (init?.method === "POST") uploads++;
    return json({ success: false, error: "Invalid or expired session" }, 401);
  }, "dummy"), /session/);
  assert.equal(uploads, 0);
});

test("an unknown successful capability response cannot authorize an image upload", async () => {
  let uploads = 0;
  await assert.rejects(scanReceiptImage(async (_path, init) => {
    if (init?.method === "POST") uploads++;
    return json({ success: true, receiptProtocol: 1 });
  }, "dummy"), /needs.*update/i);
  assert.equal(uploads, 0);
});
test("nested or cyclic error objects never become an object string", () => {
  assert.equal(getErrorMessage({ error: { message: { message: "Receipt date was not readable" } } }), "Receipt date was not readable");
  const cyclic: { error?: unknown } = {};
  cyclic.error = cyclic;
  assert.equal(getErrorMessage(cyclic, "Scan failed"), "Scan failed");
  assert.equal(getErrorMessage(new Error("[object Object]"), "Scan failed"), "Scan failed");
});
