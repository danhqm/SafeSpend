import assert from "node:assert/strict";
import test from "node:test";
import { fetchAllPages } from "../utils/pagination-core.ts";

type Row = { id: string; amount: number };

// The server boundary is an in-memory source with Supabase's inclusive range
// and row-cap behavior. The paginator and the financial total remain real.
function source(rows: Row[], cap = 1000) {
  return () => ({
    order(column: string, options: { ascending: boolean }) {
      assert.equal(column, "id");
      assert.equal(options.ascending, true);
      return {
        async range(from: number, to: number) {
          assert.ok(to - from + 1 <= 500);
          const sorted = [...rows].sort((a, b) => a.id.localeCompare(b.id));
          return { data: sorted.slice(from, Math.min(to + 1, from + cap)), error: null, count: rows.length };
        },
      };
    },
  });
}

test("pagination includes every row beyond the API cap in stable id order", async () => {
  const rows = Array.from({ length: 1205 }, (_, index) => ({
    id: String(1204 - index).padStart(4, "0"), amount: 1,
  }));
  const result = await fetchAllPages(source(rows));
  assert.equal(result.length, 1205);
  assert.equal(result.reduce((total, row) => total + row.amount, 0), 1205);
  assert.equal(result[0].id, "0000");
  assert.equal(result[1204].id, "1204");
});

test("pagination does not mistake a lower server cap for the end", async () => {
  const rows = Array.from({ length: 701 }, (_, index) => ({ id: String(index).padStart(4, "0"), amount: 1 }));
  const result = await fetchAllPages(source(rows, 200));
  assert.equal(result.length, 701);
  assert.equal(result.at(-1)?.id, "0700");
});

test("pagination rejects a later page error instead of returning a partial total", async () => {
  const first = source(Array.from({ length: 501 }, (_, index) => ({ id: String(index), amount: 1 })));
  let pages = 0;
  await assert.rejects(fetchAllPages(() => ({
    order: (column, options) => ({
      range: (from, to) => ++pages === 1
        ? first().order(column, options).range(from, to)
        : Promise.resolve({ data: null, error: new Error("connection lost"), count: null }),
    }),
  })), /connection lost/);
});

test("pagination rejects a truncated empty page before the exact count", async () => {
  await assert.rejects(fetchAllPages(() => ({
    order: () => ({ range: async () => ({ data: [], error: null, count: 3 }) }),
  })), /incomplete/i);
});

test("pagination rejects count drift while records are changing", async () => {
  let page = 0;
  await assert.rejects(fetchAllPages(() => ({
    order: () => ({
      range: async () => ++page === 1
        ? { data: [{ id: "a", amount: 1 }], error: null, count: 2 }
        : { data: [{ id: "b", amount: 1 }], error: null, count: 3 },
    }),
  })), /changed/i);
});

test("pagination rejects overlapping pages instead of double counting", async () => {
  await assert.rejects(fetchAllPages(() => ({
    order: () => ({ range: async () => ({ data: [{ id: "a", amount: 1 }], error: null, count: 2 }) }),
  })), /overlap/i);
});

test("pagination requires an exact count before publishing totals", async () => {
  await assert.rejects(fetchAllPages(() => ({
    order: () => ({ range: async () => ({ data: [{ id: "a", amount: 1 }], error: null, count: null }) }),
  })), /count/i);
});

test("pagination accepts an empty ledger with an exact zero count", async () => {
  assert.deepEqual(await fetchAllPages(source([])), []);
});
