import { z } from "zod";

const money = z.number().finite().min(0).max(100_000_000).multipleOf(0.01);
const positiveMoney = money.refine(value => value > 0);
const schemas = {
  compare_purchase_options: z.object({
    purchaseAmount: positiveMoney, availableCash: money, reserveToKeep: money,
    monthlyTakeHomeIncome: money, monthlyEssentialExpenses: money,
    monthlyDebtPayments: money, monthlySavingsCommitments: money,
  }).strict(),
  plan_savings_goal: z.object({
    targetAmount: positiveMoney, currentSaved: money, monthlyContribution: money,
    targetMonths: z.number().int().min(1).max(600).optional(),
  }).strict(),
  estimate_loan_repayment: z.object({
    balance: positiveMoney, annualRatePercent: z.number().finite().min(0).max(100),
    monthlyPayment: positiveMoney, interestMethod: z.literal("reducing_balance"),
  }).strict(),
};
const amountProperty = description => ({ type: "number", minimum: 0, maximum: 100_000_000, description });
function tool(name, description, properties, required = Object.keys(properties)) {
  return { type: "function", function: { name, description,
    parameters: { type: "object", properties, required, additionalProperties: false } } };
}

export const finPlanningTools = [
  tool("compare_purchase_options",
    "Compare buying a purchase with cash now against waiting while keeping a stated cash reserve. Read-only scenario, not proof of affordability. All inputs must be stated or explicitly confirmed by the user; never infer cash balances or silently fill missing bills/debts/savings with zero. Ask for missing inputs first.", {
      purchaseAmount: amountProperty("Upfront purchase cost in RM, greater than zero"),
      availableCash: amountProperty("Cash actually available today, supplied by the user; not profile income or a credit limit"),
      reserveToKeep: amountProperty("Cash the user wants left untouched after buying; ask if not stated"),
      monthlyTakeHomeIncome: amountProperty("User-confirmed regular monthly take-home income"),
      monthlyEssentialExpenses: amountProperty("User-confirmed total regular monthly essentials, including bills still due"),
      monthlyDebtPayments: amountProperty("User-confirmed monthly debt repayments; zero only if explicitly confirmed"),
      monthlySavingsCommitments: amountProperty("User-confirmed monthly savings already earmarked for other purposes"),
    }),
  tool("plan_savings_goal",
    "Calculate a no-interest savings scenario from the user's stated target, current savings and monthly contribution. Never assume existing savings are zero. An optional deadline calculates the monthly contribution needed. No account changes or investment return forecast.", {
      targetAmount: amountProperty("Savings target in RM, greater than zero"),
      currentSaved: amountProperty("Amount already saved for this target, stated by the user"),
      monthlyContribution: amountProperty("Stated monthly contribution, or an explicitly labelled hypothetical contribution"),
      targetMonths: { type: "integer", minimum: 1, maximum: 600, description: "Optional deadline in whole months, only if provided" },
    }, ["targetAmount", "currentSaved", "monthlyContribution"]),
  tool("estimate_loan_repayment",
    "Estimate repayment using monthly reducing-balance interest and a stated nominal annual rate (not a flat rate or an APR including fees). Ask for the rate method if unknown. Excludes fees, daily-interest effects, new borrowing and rate changes. This is a comparison, not a lender quote or instruction to refinance.", {
      balance: amountProperty("Current outstanding principal in RM, greater than zero"),
      annualRatePercent: { type: "number", minimum: 0, maximum: 100, description: "User-stated nominal annual interest rate, as a percentage; do not look up or invent a rate" },
      monthlyPayment: amountProperty("Proposed fixed monthly payment in RM, greater than zero"),
      interestMethod: { type: "string", enum: ["reducing_balance"], description: "Only use if the user confirms a reducing-balance scenario; flat-rate loans are unsupported" },
    }),
];

const sen = value => Math.round(value * 100);
const rm = value => value / 100;

export function runFinPlanningTool(name, rawInputs) {
  const schema = Object.hasOwn(schemas, name) ? schemas[name] : null;
  if (!schema) return { error: "Unknown planning calculation" };
  const parsed = schema.safeParse(rawInputs);
  if (!parsed.success) return { error: "Invalid scenario inputs. Ask for missing values or correct the stated amounts; do not assume zero.",
    fields: [...new Set(parsed.error.issues.map(issue => issue.path.join(".") || "inputs"))] };
  const inputs = parsed.data;
  const common = { currency: "MYR", inputSource: "scenario_inputs_not_verified_balances", inputs };

  if (name === "compare_purchase_options") {
    const monthly = sen(inputs.monthlyTakeHomeIncome) - sen(inputs.monthlyEssentialExpenses)
      - sen(inputs.monthlyDebtPayments) - sen(inputs.monthlySavingsCommitments);
    const afterBuying = sen(inputs.availableCash) - sen(inputs.purchaseAmount);
    const shortfall = Math.max(0, sen(inputs.reserveToKeep) - afterBuying);
    return { ...common, monthlyUnallocatedRM: rm(monthly), cashAfterBuyingNowRM: rm(afterBuying),
      reserveShortfallAfterBuyingRM: rm(shortfall), fitsStatedCashAndReserve: shortfall === 0,
      hasMonthlyShortfall: monthly < 0,
      monthsToWaitKeepingReserve: shortfall === 0 ? 0 : monthly > 0 ? Math.ceil(shortfall / monthly) : null,
      assumptions: ["Upfront cash purchase; no borrowing or purchase fees included.",
        "Income, commitments and contributions remain constant; stated cash must also cover bills due before the next income payment.",
        "A cash-buffer comparison is not a full affordability assessment."] };
  }

  if (name === "plan_savings_goal") {
    const remaining = Math.max(0, sen(inputs.targetAmount) - sen(inputs.currentSaved));
    const contribution = sen(inputs.monthlyContribution);
    const needed = inputs.targetMonths ? Math.ceil(remaining / inputs.targetMonths) : null;
    return { ...common, remainingRM: rm(remaining),
      monthsAtStatedContribution: remaining === 0 ? 0 : contribution > 0 ? Math.ceil(remaining / contribution) : null,
      monthlyNeededForDeadlineRM: needed === null ? null : rm(needed),
      extraMonthlyForDeadlineRM: needed === null ? null : rm(Math.max(0, needed - contribution)),
      assumptions: ["Contributions are made monthly with no withdrawals, interest, fees or investment returns.",
        "The target and monthly contribution remain constant."] };
  }

  let balance = sen(inputs.balance);
  const payment = sen(inputs.monthlyPayment);
  const monthlyRate = inputs.annualRatePercent / 1200;
  const firstMonthInterest = Math.round(balance * monthlyRate);
  const assumptions = ["Nominal annual rate divided by 12; monthly interest rounded to sen before payment.",
    "Fixed end-of-month payments; no fees, new borrowing or rate changes. Actual lender calculations may differ."];
  if (payment <= firstMonthInterest) return { ...common, assumptions,
    status: "payment_does_not_reduce_balance", months: null, firstMonthInterestRM: rm(firstMonthInterest) };
  let totalPaid = 0;
  let totalInterest = 0;
  let finalPayment = 0;
  let months = 0;
  while (balance > 0 && months < 600) {
    const interest = Math.round(balance * monthlyRate);
    finalPayment = Math.min(payment, balance + interest);
    totalInterest += interest;
    totalPaid += finalPayment;
    balance += interest - finalPayment;
    months++;
  }
  return { ...common, assumptions, status: balance === 0 ? "paid_off" : "exceeds_calculation_horizon",
    months: balance === 0 ? months : null, simulatedMonths: months,
    remainingBalanceRM: rm(balance), totalInterestRM: rm(totalInterest), totalPaidRM: rm(totalPaid),
    finalPaymentRM: balance === 0 ? rm(finalPayment) : null };
}
