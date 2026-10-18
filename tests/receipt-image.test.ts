import assert from "node:assert/strict";
import test from "node:test";
import { prepareReceiptImage, type ReceiptImageEncoding } from "../utils/receipt-image-core.ts";
import { MAX_RECEIPT_BASE64_LENGTH } from "../utils/receipt-upload-size.ts";

const photo = { uri: "file:///camera/receipt.jpg", width: 4032, height: 3024 };

test("a camera photo is prepared within the upload budget with its aspect ratio preserved", async () => {
  const result = await prepareReceiptImage(photo, async (source, encoding) => {
    assert.equal(source.uri, photo.uri);
    assert.deepEqual(encoding.resize, { width: 2800, height: 2100 });
    return "A".repeat(MAX_RECEIPT_BASE64_LENGTH);
  });
  assert.equal(result.length, MAX_RECEIPT_BASE64_LENGTH);
});

test("portrait receipt photos keep the whole receipt without cropping or distortion", async () => {
  await prepareReceiptImage({ ...photo, width: 3024, height: 4032 }, async (_source, encoding) => {
    assert.deepEqual(encoding.resize, { width: 2100, height: 2800 });
    return "prepared";
  });
});

test("a small receipt is recompressed without upscaling its text", async () => {
  await prepareReceiptImage({ ...photo, width: 800, height: 1200 }, async (_source, encoding) => {
    assert.equal(encoding.resize, undefined);
    return "prepared";
  });
});

test("an oversized encoding retries with less data and returns only the fitting image", async () => {
  const attempts: ReceiptImageEncoding[] = [];
  const result = await prepareReceiptImage(photo, async (_source, encoding) => {
    attempts.push(encoding);
    return attempts.length < 3 ? "A".repeat(MAX_RECEIPT_BASE64_LENGTH + 4) : "fits";
  });
  assert.equal(result, "fits");
  assert.equal(attempts.length, 3);
  assert.ok(attempts[1].quality < attempts[0].quality);
  assert.ok(attempts[2].resize!.width < attempts[1].resize!.width);
});

test("an image that remains too large stops after bounded attempts with crop guidance", async () => {
  let attempts = 0;
  await assert.rejects(prepareReceiptImage(photo, async () => {
    attempts++;
    return "A".repeat(MAX_RECEIPT_BASE64_LENGTH + 4);
  }), /too large.*crop/i);
  assert.equal(attempts, 3);
});

test("missing encoded image data is never passed to OCR", async () => {
  await assert.rejects(prepareReceiptImage(photo, async () => ""), /could not prepare/i);
});

test("invalid source dimensions fail before decoding", async () => {
  let encoded = false;
  for (const invalid of [{ ...photo, uri: "" }, { ...photo, width: 0 }, { ...photo, height: NaN }]) {
    await assert.rejects(prepareReceiptImage(invalid, async () => { encoded = true; return "image"; }), /could not read/i);
  }
  assert.equal(encoded, false);
});
