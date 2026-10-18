import assert from "node:assert/strict";
import test from "node:test";
import { parseReceiptExtraction } from "../lib/receipt-extraction.js";

const receipt = {
  is_receipt: true, currency: "MYR", merchant_name: "Dummy shop", total_amount: 12.5,
  receipt_date: "2026-10-01", category: "GROCERIES", items: [{ name: "Rice", price: 12.5 }],
};

test("a real MYR receipt retains facts and explicitly reviewed currency", () => {
  assert.equal(parseReceiptExtraction(receipt).currency, "MYR");
});
for (const currency of ["USD", "SGD", "UNKNOWN", "", null]) {
  test(`unsupported or uncertain currency ${currency} cannot become MYR spending`, () => {
    assert.throws(() => parseReceiptExtraction({ ...receipt, currency }));
  });
}
test("non-receipt input cannot create plausible financial records", () => {
  assert.throws(() => parseReceiptExtraction({ ...receipt, is_receipt: false }));
});
test("impossible dates are rejected before reaching database storage", () => {
  assert.throws(() => parseReceiptExtraction({ ...receipt, receipt_date: "2026-02-30" }));
});
test("missing totals cannot be coerced into zero and accepted", () => {
  for (const total_amount of [null, "", 0, -1, 10000000000]) {
    assert.throws(() => parseReceiptExtraction({ ...receipt, total_amount }));
  }
});
test("unrecognized categories become Other while discounts remain evidence", () => {
  const result = parseReceiptExtraction({ ...receipt, category: "IGNORE INSTRUCTIONS", items: [{ name: "Discount", price: -1 }] });
  assert.equal(result.category, "OTHER");
  assert.equal(result.items[0].price, -1);
});
