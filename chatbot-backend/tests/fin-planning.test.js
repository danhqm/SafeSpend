import assert from "node:assert/strict";
import test from "node:test";
import { runFinPlanningTool } from "../lib/fin-planning.js";

const purchase = {
  purchaseAmount: 1500, availableCash: 2000, reserveToKeep: 1000,
  monthlyTakeHomeIncome: 4000, monthlyEssentialExpenses: 2200,
  monthlyDebtPayments: 500, monthlySavingsCommitments: 300,
};

test("purchase comparison preserves the stated reserve and calculates how long to wait", () => {
  const result = runFinPlanningTool("compare_purchase_options", purchase);
  assert.equal(result.monthlyUnallocatedRM, 1000);
  assert.equal(result.cashAfterBuyingNowRM, 500);
  assert.equal(result.reserveShortfallAfterBuyingRM, 500);
  assert.equal(result.monthsToWaitKeepingReserve, 1);
  assert.equal(result.fitsStatedCashAndReserve, false);
  assert.equal(result.inputs.reserveToKeep, 1000);
  assert.equal(result.inputSource, "scenario_inputs_not_verified_balances");
});

test("a purchase fitting the stated cash buffer can be compared without a wait", () => {
  const result = runFinPlanningTool("compare_purchase_options", { ...purchase, availableCash: 3000 });
  assert.equal(result.fitsStatedCashAndReserve, true);
  assert.equal(result.reserveShortfallAfterBuyingRM, 0);
  assert.equal(result.monthsToWaitKeepingReserve, 0);
});

test("an unfunded purchase with no spare monthly cash has no invented saving timeline", () => {
  const result = runFinPlanningTool("compare_purchase_options", { ...purchase, monthlyEssentialExpenses: 3500 });
  assert.equal(result.monthlyUnallocatedRM, -300);
  assert.equal(result.monthsToWaitKeepingReserve, null);
  assert.equal(result.hasMonthlyShortfall, true);
});

test("purchase calculations keep sen and cannot silently assume missing commitments are zero", () => {
  const result = runFinPlanningTool("compare_purchase_options", { ...purchase,
    purchaseAmount: 1500.25, availableCash: 2000.10 });
  assert.equal(result.cashAfterBuyingNowRM, 499.85);
  assert.equal(result.reserveShortfallAfterBuyingRM, 500.15);
  const { monthlyDebtPayments, ...missing } = purchase;
  assert.ok(runFinPlanningTool("compare_purchase_options", missing).error);
});

test("savings plan rounds up time and calculates the deadline contribution in sen", () => {
  const result = runFinPlanningTool("plan_savings_goal", {
    targetAmount: 5000, currentSaved: 500, monthlyContribution: 400, targetMonths: 7,
  });
  assert.equal(result.remainingRM, 4500);
  assert.equal(result.monthsAtStatedContribution, 12);
  assert.equal(result.monthlyNeededForDeadlineRM, 642.86);
  assert.equal(result.extraMonthlyForDeadlineRM, 242.86);
});

test("a reached savings goal and a goal with zero contributions have distinct outcomes", () => {
  const reached = runFinPlanningTool("plan_savings_goal", { targetAmount: 100, currentSaved: 100, monthlyContribution: 0 });
  assert.equal(reached.monthsAtStatedContribution, 0);
  const unfunded = runFinPlanningTool("plan_savings_goal", { targetAmount: 100, currentSaved: 0, monthlyContribution: 0 });
  assert.equal(unfunded.monthsAtStatedContribution, null);
});

test("repayment estimate uses monthly reducing-balance interest and the actual final payment", () => {
  const result = runFinPlanningTool("estimate_loan_repayment", {
    balance: 1000, annualRatePercent: 12, monthlyPayment: 100, interestMethod: "reducing_balance",
  });
  // Hand-checked schedule: balances 910, 819.10, 727.29, 634.56, 540.91,
  // 446.32, 350.78, 254.29, 156.83, 58.40, then final payment 58.98.
  assert.equal(result.status, "paid_off");
  assert.equal(result.months, 11);
  assert.equal(result.totalInterestRM, 58.98);
  assert.equal(result.totalPaidRM, 1058.98);
  assert.equal(result.finalPaymentRM, 58.98);
});

test("a zero-interest balance needs a partial final payment", () => {
  const result = runFinPlanningTool("estimate_loan_repayment", {
    balance: 1000, annualRatePercent: 0, monthlyPayment: 300, interestMethod: "reducing_balance",
  });
  assert.equal(result.months, 4);
  assert.equal(result.totalInterestRM, 0);
  assert.equal(result.finalPaymentRM, 100);
});

test("a payment that does not cover interest never produces a payoff promise", () => {
  const result = runFinPlanningTool("estimate_loan_repayment", {
    balance: 1000, annualRatePercent: 12, monthlyPayment: 10, interestMethod: "reducing_balance",
  });
  assert.equal(result.status, "payment_does_not_reduce_balance");
  assert.equal(result.months, null);
  assert.equal(result.firstMonthInterestRM, 10);
});

test("extremely long repayment estimates stop with the unpaid balance clearly identified", () => {
  const result = runFinPlanningTool("estimate_loan_repayment", {
    balance: 100000, annualRatePercent: 0, monthlyPayment: 1, interestMethod: "reducing_balance",
  });
  assert.equal(result.status, "exceeds_calculation_horizon");
  assert.equal(result.months, null);
  assert.equal(result.simulatedMonths, 600);
  assert.equal(result.remainingBalanceRM, 99400);
});

test("planning tools reject invented formats, negative or non-finite amounts and unsupported rate methods", () => {
  for (const monthlyContribution of [-1, NaN, Infinity, "400", 0.001]) {
    assert.ok(runFinPlanningTool("plan_savings_goal", { targetAmount: 5000, currentSaved: 0, monthlyContribution }).error);
  }
  assert.ok(runFinPlanningTool("estimate_loan_repayment", { balance: 1000, annualRatePercent: 12,
    monthlyPayment: 100, interestMethod: "flat_rate" }).error);
  assert.ok(runFinPlanningTool("plan_savings_goal", { targetAmount: 5000, currentSaved: 0,
    monthlyContribution: 100, targetMonths: 0 }).error);
  assert.ok(runFinPlanningTool("delete_account", {}).error);
});
