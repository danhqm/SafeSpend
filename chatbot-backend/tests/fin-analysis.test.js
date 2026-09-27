import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFinancialSnapshot,
  cleanInsight,
  fallbackInsights,
  malaysiaDate,
} from "../lib/fin-analysis.js";

function transaction(date, type, amount, category, merchant = null, extra = {}) {
  return {
    occurred_on: date,
    transaction_type: type,
    amount,
    category,
    merchant_name: merchant,
    currency: "MYR",
    status: "posted",
    account_id: null,
    ...extra,
  };
}

test("Malaysia calendar date follows local time rather than UTC", () => {
  assert.equal(malaysiaDate(new Date("2026-09-26T17:00:00Z")), "2026-09-27");
});

test("analysis separates net spend, purchase frequency, income and partial-month comparison", () => {
  const snapshot = buildFinancialSnapshot({
    asOf: "2026-09-27",
    transactions: [
      transaction("2026-09-01", "expense", 30, "FOOD_AND_DRINK", "Cafe A", { account_id: "wallet" }),
      transaction("2026-09-08", "expense", 40, "FOOD_AND_DRINK", "Cafe A", { account_id: "wallet" }),
      transaction("2026-09-09", "refund", 10, "FOOD_AND_DRINK", "Cafe A"),
      transaction("2026-09-15", "expense", 25, "FOOD_AND_DRINK", "Cafe A", { account_id: "wallet" }),
      transaction("2026-09-03", "expense", 100, "SHOPPING", "Store B"),
      transaction("2026-09-02", "income", 1_000, "SALARY"),
      transaction("2026-08-04", "expense", 50, "FOOD_AND_DRINK", "Cafe A"),
      transaction("2026-08-30", "expense", 200, "SHOPPING", "Store B"),
      transaction("2026-09-01", "expense", 500, "BILLS", "Future", { status: "draft" }),
      transaction("2026-09-30", "expense", 500, "BILLS", "Future"),
      transaction("2026-09-12", "expense", 100, "SHOPPING", "Foreign", { currency: "USD" }),
    ],
    budgets: [
      { month_start: "2026-09-01", category: "ALL", amount: 500 },
      { month_start: "2026-08-01", category: "ALL", amount: 300 },
    ],
    accounts: [{ id: "wallet", account_type: "e_wallet", is_archived: false }],
    goals: [{ title: "Spend less on lunch", completed: false, week_start: "2026-09-21" }],
    profileMonthlyIncome: 1_200,
  });

  assert.equal(snapshot.coverage.recordedTransactions, 8);
  assert.equal(snapshot.spending.thisMonthNetRM, 185);
  assert.equal(snapshot.spending.thisMonthPurchases, 4);
  assert.equal(snapshot.spending.thisMonthCategories[0].category, "Shopping");
  assert.equal(snapshot.spending.thisMonthCategories[1].netSpendingRM, 85);
  assert.equal(snapshot.spending.priorMonthSameDayNetRM, 50);
  assert.equal(snapshot.spending.priorMonthSameDayPurchases, 1);
  assert.equal(snapshot.income.recordedThisMonthRM, 1_000);
  assert.equal(snapshot.income.comparisonSource, "recorded this month");
  assert.equal(snapshot.budget.usedPercent, 37);
  assert.equal(snapshot.spending.monthlyTrend.at(-2).budgetRM, 300);
  assert.equal(snapshot.spending.mostFrequentCategory.category, "Food And Drink");
  assert.equal(snapshot.spending.mostFrequentCategory.purchaseCount, 4);
  assert.equal(snapshot.spending.mostFrequentCategory.activeDays, 4);
  assert.equal(snapshot.spending.repeatMerchants[0].purchaseCount, 4);
  assert.equal(snapshot.spending.repeatMerchants[0].activeMonths, 2);
  assert.equal(snapshot.spending.accountActivity[0].accountType, "e_wallet");
  assert.equal(snapshot.goals.recentOpen, 1);
});

test("sparse records do not become a fabricated spending habit", () => {
  const snapshot = buildFinancialSnapshot({
    asOf: "2026-09-27",
    transactions: [transaction("2026-09-20", "expense", 18, "GROCERIES", "Market")],
  });
  const insights = fallbackInsights(snapshot);
  assert.equal(insights.length, 3);
  assert.match(insights[1], /not enough repeated purchases/i);
  assert.match(insights[2], /set an overall monthly budget/i);
});

test("Fin output removes emoji and markup-like bullet prefixes", () => {
  assert.equal(cleanInsight("• 📈 Food spending rose."), "Food spending rose.");
});
