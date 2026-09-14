import assert from "node:assert/strict";
import test from "node:test";
import {
  expenseEffect,
  formatCategory,
  localDateString,
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
