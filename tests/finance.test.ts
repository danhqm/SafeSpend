import assert from "node:assert/strict";
import test from "node:test";
import {
  expenseEffect,
  formatCategory,
  localDateString,
  monthDisplayName,
  monthStartString,
  shiftMonth,
} from "../types/finance.ts";

test("expenseEffect counts expenses and reverses refunds", () => {
  assert.equal(expenseEffect("expense", "42.50"), 42.5);
  assert.equal(expenseEffect("refund", 12), -12);
  assert.equal(expenseEffect("income", 900), 0);
});

test("localDateString uses the supplied local calendar date", () => {
  assert.equal(localDateString(new Date(2026, 0, 2, 23, 30)), "2026-01-02");
});

test("formatCategory produces a readable label", () => {
  assert.equal(formatCategory("FOOD_AND_DRINK"), "Food And Drink");
  assert.equal(formatCategory(null), "Other");
});

test("month helpers stay on local calendar boundaries", () => {
  assert.equal(monthStartString(new Date(2026, 0, 31, 23, 30)), "2026-01-01");
  assert.equal(shiftMonth("2026-01-01", -1), "2025-12-01");
  assert.equal(shiftMonth("2026-12-01", 1), "2027-01-01");
  assert.match(monthDisplayName("2026-09-01"), /September 2026/);
});
