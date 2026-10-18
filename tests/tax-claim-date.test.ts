import assert from "node:assert/strict";
import test from "node:test";
import { checkClaimDate } from "../utils/tax-claim-date.ts";

test("the Demo Mart date reports an assessment-year mismatch, not a format problem", () => {
  const result = checkClaimDate("2026-10-17", 2025);
  assert.equal(result.receiptYear, 2026);
  assert.match(result.message!, /YA2026/);
  assert.match(result.message!, /YA2025/);
  assert.doesNotMatch(result.message!, /YYYY-MM-DD/);
});
test("the same date is valid as a YA2026 draft without rewriting the purchase date", () => {
  assert.deepEqual(checkClaimDate("2026-10-17", 2026), { date: "2026-10-17", message: null, receiptYear: 2026 });
});
test("pasted dates trim surrounding whitespace without guessing a locale", () => {
  assert.deepEqual(checkClaimDate(" 2025-10-17\n", 2025), { date: "2025-10-17", message: null, receiptYear: 2025 });
  assert.match(checkClaimDate("17/10/2025", 2025).message!, /YYYY-MM-DD/);
});
test("impossible dates are rejected even when their year matches", () => {
  assert.match(checkClaimDate("2025-02-29", 2025).message!, /real date/);
  assert.equal(checkClaimDate("2024-02-29", 2024).message, null);
});
test("an empty payment date can remain empty for a draft or personal declaration", () => {
  assert.deepEqual(checkClaimDate("   ", 2025), { date: null, message: null, receiptYear: null });
});
