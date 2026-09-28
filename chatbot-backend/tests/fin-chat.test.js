import assert from "node:assert/strict";
import test from "node:test";

process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_SECRET_KEY ||= "test-only-placeholder";
const {
  cleanChatText,
  isUnrelatedMathQuestion,
  malaysiaWeekBounds,
  presentReceipt,
  runFinChatTool,
} = await import("../lib/fin-chat.js");

test("this week starts on Monday in Malaysia, even across a UTC date boundary", () => {
  assert.deepEqual(malaysiaWeekBounds(new Date("2026-09-27T17:00:00Z")), {
    today: "2026-09-28",
    weekStart: "2026-09-28",
  });
  assert.deepEqual(malaysiaWeekBounds(new Date("2027-01-03T15:00:00Z")), {
    today: "2027-01-03",
    weekStart: "2026-12-28",
  });
});

test("standalone arithmetic is refused without blocking finance calculations", () => {
  assert.equal(isUnrelatedMathQuestion("What is 5+5?"), true);
  assert.equal(isUnrelatedMathQuestion("25 / 5"), true);
  assert.equal(isUnrelatedMathQuestion("What is 5+5% of my monthly budget?"), false);
});

test("chat output removes emoji without removing financial figures", () => {
  assert.equal(cleanChatText("Your food spending was RM25.50 📊"), "Your food spending was RM25.50");
});

test("receipt presentation distinguishes a scan from confirmed spending", () => {
  const receipt = {
    merchant_name: "Cinema",
    receipt_date: "2026-09-14",
    created_at: "2026-09-28T05:00:00Z",
    total_amount: 25,
    category: "ENTERTAINMENT",
    items: [{ name: "Movie ticket", price: 25 }],
  };
  assert.deepEqual(presentReceipt(receipt, null), {
    merchant: "Cinema",
    receiptDate: "2026-09-14",
    scannedAt: "2026-09-28T05:00:00Z",
    scannedOnMalaysia: "2026-09-28",
    amountRM: 25,
    category: "ENTERTAINMENT",
    items: [{ name: "Movie ticket", priceRM: 25 }],
    itemsLimited: false,
    status: "saved without a transaction",
    countedInSpending: false,
  });
  assert.equal(presentReceipt(receipt, { status: "posted", transaction_type: "expense" }).countedInSpending, true);
});

test("receipt lookup uses the authenticated user and Malaysia scan-date boundaries", async () => {
  const calls = [];
  const receipt = {
    id: "receipt-1",
    merchant_name: "Cinema",
    receipt_date: "2026-09-14",
    created_at: "2026-09-28T05:00:00Z",
    total_amount: 25,
    category: "OTHER",
    items: [{ name: "Movie ticket", price: 25 }],
  };
  const database = {
    from(table) {
      const call = { table, filters: [] };
      calls.push(call);
      const builder = {
        select() { return builder; },
        eq(...args) { call.filters.push(["eq", ...args]); return builder; },
        gte(...args) { call.filters.push(["gte", ...args]); return builder; },
        lt(...args) { call.filters.push(["lt", ...args]); return builder; },
        order() { return builder; },
        limit() { return Promise.resolve({ data: [receipt], count: 1, error: null }); },
        in(...args) {
          call.filters.push(["in", ...args]);
          return Promise.resolve({
            data: [{ receipt_id: "receipt-1", merchant_name: "Cinema", amount: 25,
              category: "ENTERTAINMENT", status: "posted", transaction_type: "expense" }],
            error: null,
          });
        },
      };
      return builder;
    },
  };

  const result = await runFinChatTool("search_financial_records", {
    record_type: "receipt",
    date_basis: "scanned_at",
    from: "2026-09-28",
    through: "2026-09-29",
    category: "ENTERTAINMENT",
  }, "signed-in-user", database);

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].merchant, "Cinema");
  assert.equal(result.records[0].receiptDate, "2026-09-14");
  assert.equal(result.records[0].countedInSpending, true);
  assert.deepEqual(calls[0].filters, [
    ["eq", "user_id", "signed-in-user"],
    ["gte", "created_at", "2026-09-27T16:00:00.000Z"],
    ["lt", "created_at", "2026-09-29T16:00:00.000Z"],
  ]);
  assert.deepEqual(calls[1].filters, [
    ["eq", "user_id", "signed-in-user"],
    ["in", "receipt_id", ["receipt-1"]],
  ]);
});

test("transaction lookups stay user-scoped and reject invalid date filters", async () => {
  const filters = [];
  const database = {
    from(table) {
      assert.equal(table, "transactions");
      const builder = {
        select() { return builder; },
        eq(...args) { filters.push(["eq", ...args]); return builder; },
        gte(...args) { filters.push(["gte", ...args]); return builder; },
        lte(...args) { filters.push(["lte", ...args]); return builder; },
        ilike(...args) { filters.push(["ilike", ...args]); return builder; },
        order() { return builder; },
        limit() { return Promise.resolve({
          data: [{ merchant_name: "Cinema", amount: 25, currency: "MYR",
            occurred_on: "2026-09-14", category: "ENTERTAINMENT",
            transaction_type: "expense", source: "receipt", notes: null }],
          count: 1,
          error: null,
        }); },
      };
      return builder;
    },
  };
  const result = await runFinChatTool("search_financial_records", {
    record_type: "transaction", date_basis: "purchase_date",
    from: "2026-09-01", through: "2026-09-30",
    category: "ENTERTAINMENT", merchant: "Cinema",
  }, "signed-in-user", database);
  assert.equal(result.records[0].merchant, "Cinema");
  assert.deepEqual(filters, [
    ["eq", "user_id", "signed-in-user"],
    ["eq", "status", "posted"],
    ["gte", "occurred_on", "2026-09-01"],
    ["lte", "occurred_on", "2026-09-30"],
    ["eq", "category", "ENTERTAINMENT"],
    ["ilike", "merchant_name", "%Cinema%"],
  ]);
  assert.deepEqual(await runFinChatTool("search_financial_records", {
    record_type: "transaction", date_basis: "purchase_date", from: "2026-09-99",
  }, "signed-in-user", database), { error: "Invalid lookup filters" });
});
