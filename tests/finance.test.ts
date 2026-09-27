import assert from "node:assert/strict";
import test from "node:test";
import {
  expenseEffect,
  calculateAccountBalance,
  formatCategory,
  localDateString,
  monthDisplayName,
  monthStartString,
  shiftMonth,
  summarizeMonthlySpending,
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

test("monthly spending nets refunds and uses recorded income first", () => {
  const summary = summarizeMonthlySpending(
    [
      { transaction_type: "income", amount: 1000, category: "SALARY" },
      { transaction_type: "expense", amount: 250, category: "ENTERTAINMENT" },
      { transaction_type: "refund", amount: 50, category: "ENTERTAINMENT" },
      { transaction_type: "expense", amount: 100, category: "GROCERIES" },
    ],
    2000,
  );
  assert.equal(summary.income, 1000);
  assert.equal(summary.incomeSource, "recorded");
  assert.equal(summary.total, 300);
  assert.deepEqual(summary.categories, [
    { category: "ENTERTAINMENT", amount: 200 },
    { category: "GROCERIES", amount: 100 },
  ]);
  assert.equal((summary.categories[0].amount / summary.income) * 100, 20);
});

test("monthly spending falls back to profile income and excludes negative categories", () => {
  const summary = summarizeMonthlySpending(
    [
      { transaction_type: "expense", amount: 80, category: "TRANSPORT" },
      { transaction_type: "refund", amount: 100, category: "TRANSPORT" },
      { transaction_type: "expense", amount: 120, category: "OTHER" },
    ],
    600,
  );
  assert.equal(summary.incomeSource, "profile");
  assert.equal(summary.income, 600);
  assert.equal(summary.total, 120);
  assert.deepEqual(summary.categories, [{ category: "OTHER", amount: 120 }]);
});

test("monthly spending can show category share when income is unavailable", () => {
  const summary = summarizeMonthlySpending(
    [
      { transaction_type: "expense", amount: 30, category: "TRANSPORT" },
      { transaction_type: "expense", amount: 70, category: "FOOD_AND_DRINK" },
    ],
    0,
  );
  assert.equal(summary.incomeSource, "none");
  assert.equal(summary.income, 0);
  assert.equal(summary.total, 100);
  assert.equal((summary.categories[0].amount / summary.total) * 100, 70);
});

test("asset balances apply transactions and transfers in ledger direction", () => {
  const balance = calculateAccountBalance(
    { id: "bank", account_type: "bank", opening_balance: 1000 },
    [
      { account_id: "bank", transaction_type: "expense", amount: 120, status: "posted" },
      { account_id: "bank", transaction_type: "income", amount: 500, status: "posted" },
      { account_id: "bank", transaction_type: "refund", amount: 20, status: "posted" },
      { account_id: "bank", transaction_type: "expense", amount: 999, status: "draft" },
    ],
    [
      { from_account_id: "bank", to_account_id: "cash", amount: 100 },
      { from_account_id: "cash", to_account_id: "bank", amount: 50 },
    ],
  );
  assert.equal(balance, 1350);
});

test("credit card balances represent amount owed", () => {
  const balance = calculateAccountBalance(
    { id: "card", account_type: "credit_card", opening_balance: 300 },
    [
      { account_id: "card", transaction_type: "expense", amount: 80, status: "posted" },
      { account_id: "card", transaction_type: "refund", amount: 10, status: "posted" },
    ],
    [
      { from_account_id: "bank", to_account_id: "card", amount: 100 },
      { from_account_id: "card", to_account_id: "cash", amount: 20 },
    ],
  );
  assert.equal(balance, 290);
});
