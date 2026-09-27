const DAY_MS = 24 * 60 * 60 * 1000;

function shiftDate(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function shiftMonth(month, offset) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + offset, 1))
    .toISOString()
    .slice(0, 7);
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function cleanLabel(value, fallback = "Other") {
  const cleaned = String(value ?? "")
    .replace(/[\r\n\t\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned || fallback;
}

function categoryLabel(value) {
  return cleanLabel(value).replace(/_/g, " ").toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function malaysiaDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function cleanInsight(value) {
  return String(value ?? "")
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, "")
    .replace(/^[\s\u2022*\-–]+/u, "")
    .replace(/^\d+[.)]\s*/u, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}

export function buildFinancialSnapshot({
  asOf,
  transactions = [],
  budgets = [],
  accounts = [],
  goals = [],
  profileMonthlyIncome = 0,
  historyLimited = false,
}) {
  const currentMonth = asOf.slice(0, 7);
  const previousMonth = shiftMonth(currentMonth, -1);
  const dayOfMonth = Number(asOf.slice(8, 10));
  const [previousYear, previousNumber] = previousMonth.split("-").map(Number);
  const previousMonthLastDay = new Date(Date.UTC(previousYear, previousNumber, 0)).getUTCDate();
  const previousComparableEnd = `${previousMonth}-${String(Math.min(dayOfMonth, previousMonthLastDay)).padStart(2, "0")}`;
  const recentStart = shiftDate(asOf, -89);
  const accountTypes = new Map(accounts.map((account) => [account.id, account.account_type]));
  const accountCounts = {};
  for (const account of accounts) {
    if (account.is_archived) continue;
    accountCounts[account.account_type] = (accountCounts[account.account_type] ?? 0) + 1;
  }

  const monthly = Array.from({ length: 6 }, (_, index) => ({
    month: shiftMonth(currentMonth, index - 5),
    spendingRM: 0,
    recordedIncomeRM: 0,
    purchaseCount: 0,
  }));
  const monthMap = new Map(monthly.map((item) => [item.month, item]));
  const currentCategoryMap = new Map();
  const categoryMap = new Map();
  const merchantMap = new Map();
  const accountActivity = new Map();
  let currentMonthSpending = 0;
  let currentMonthPurchases = 0;
  let previousComparableSpending = 0;
  let previousComparablePurchases = 0;
  let recentSpending = 0;
  let recentPurchases = 0;
  let earliestDate = null;
  let latestDate = null;
  let recordedCount = 0;

  for (const row of transactions) {
    const date = String(row.occurred_on ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > asOf || row.status !== "posted" || row.currency !== "MYR") continue;
    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (!["expense", "refund", "income"].includes(row.transaction_type)) continue;
    recordedCount += 1;
    if (!earliestDate || date < earliestDate) earliestDate = date;
    if (!latestDate || date > latestDate) latestDate = date;
    const month = date.slice(0, 7);
    const monthlyRow = monthMap.get(month);

    if (row.transaction_type === "income") {
      if (monthlyRow) monthlyRow.recordedIncomeRM += amount;
      continue;
    }

    const effect = row.transaction_type === "refund" ? -amount : amount;
    if (monthlyRow) monthlyRow.spendingRM += effect;
    if (monthlyRow && row.transaction_type === "expense") monthlyRow.purchaseCount += 1;
    if (month === currentMonth) {
      currentMonthSpending += effect;
      if (row.transaction_type === "expense") currentMonthPurchases += 1;
      const category = categoryLabel(row.category);
      const currentCategory = currentCategoryMap.get(category) ?? {
        category,
        netSpendingRM: 0,
        purchaseCount: 0,
      };
      currentCategory.netSpendingRM += effect;
      if (row.transaction_type === "expense") currentCategory.purchaseCount += 1;
      currentCategoryMap.set(category, currentCategory);
    }
    if (month === previousMonth && date <= previousComparableEnd) {
      previousComparableSpending += effect;
      if (row.transaction_type === "expense") previousComparablePurchases += 1;
    }
    if (date < recentStart) continue;

    recentSpending += effect;
    const category = categoryLabel(row.category);
    const item = categoryMap.get(category) ?? {
      category,
      netSpendingRM: 0,
      purchaseCount: 0,
      purchaseDays: new Set(),
      purchaseMonths: new Set(),
    };
    item.netSpendingRM += effect;
    if (row.transaction_type === "expense") {
      recentPurchases += 1;
      item.purchaseCount += 1;
      item.purchaseDays.add(date);
      item.purchaseMonths.add(month);
      const merchant = cleanLabel(row.merchant_name, "");
      if (merchant) {
        const key = merchant.toLocaleLowerCase("en-MY");
        const merchantItem = merchantMap.get(key) ?? {
          merchant,
          purchaseCount: 0,
          purchaseMonths: new Set(),
          grossPurchasesRM: 0,
        };
        merchantItem.purchaseCount += 1;
        merchantItem.purchaseMonths.add(month);
        merchantItem.grossPurchasesRM += amount;
        merchantMap.set(key, merchantItem);
      }

      const accountType = accountTypes.get(row.account_id) ?? "unassigned";
      const activity = accountActivity.get(accountType) ?? { accountType, purchaseCount: 0, grossPurchasesRM: 0 };
      activity.purchaseCount += 1;
      activity.grossPurchasesRM += amount;
      accountActivity.set(accountType, activity);
    }
    categoryMap.set(category, item);
  }

  const categoryPatterns = [...categoryMap.values()]
    .map((item) => ({
      category: item.category,
      netSpendingRM: roundMoney(Math.max(0, item.netSpendingRM)),
      purchaseCount: item.purchaseCount,
      activeDays: item.purchaseDays.size,
      activeMonths: item.purchaseMonths.size,
    }))
    .filter((item) => item.netSpendingRM > 0 || item.purchaseCount > 0)
    .sort((left, right) => right.netSpendingRM - left.netSpendingRM);
  const thisMonthCategories = [...currentCategoryMap.values()]
    .map((item) => ({ ...item, netSpendingRM: roundMoney(Math.max(0, item.netSpendingRM)) }))
    .filter((item) => item.netSpendingRM > 0 || item.purchaseCount > 0)
    .sort((left, right) => right.netSpendingRM - left.netSpendingRM);
  const frequentCategory = [...categoryPatterns]
    .sort((left, right) => right.purchaseCount - left.purchaseCount)[0] ?? null;
  const repeatMerchants = [...merchantMap.values()]
    .filter((item) => item.purchaseCount >= 2)
    .map((item) => ({
      merchant: item.merchant,
      purchaseCount: item.purchaseCount,
      activeMonths: item.purchaseMonths.size,
      grossPurchasesRM: roundMoney(item.grossPurchasesRM),
    }))
    .sort((left, right) => right.purchaseCount - left.purchaseCount)
    .slice(0, 3);
  const currentBudgets = budgets.filter((row) => row.month_start?.slice(0, 7) === currentMonth);
  const monthlyBudgetMap = new Map(
    budgets
      .filter((row) => row.category === "ALL")
      .map((row) => [row.month_start?.slice(0, 7), roundMoney(row.amount)]),
  );
  const overallBudget = currentBudgets.find((row) => row.category === "ALL");
  const categoryBudgets = currentBudgets
    .filter((row) => row.category !== "ALL")
    .map((row) => {
      const category = categoryLabel(row.category);
      const limitRM = roundMoney(row.amount);
      const usedRM = roundMoney(Math.max(0, currentCategoryMap.get(category)?.netSpendingRM ?? 0));
      return {
        category,
        limitRM,
        usedRM,
        usedPercent: limitRM > 0 ? Math.round((usedRM / limitRM) * 100) : null,
      };
    });
  const currentIncome = roundMoney(monthMap.get(currentMonth)?.recordedIncomeRM ?? 0);
  const budgetRM = overallBudget ? roundMoney(overallBudget.amount) : null;
  const sortedGoals = [...goals].sort((a, b) => String(b.week_start).localeCompare(String(a.week_start)));

  return {
    asOf,
    currency: "MYR",
    coverage: {
      recordedTransactions: recordedCount,
      earliestDate,
      latestDate,
      historyLimited,
      includes: "posted MYR transactions, recorded income, budgets, account types and goals",
      excludes: "unconfirmed receipt drafts, internal transfers, non-MYR transactions, tax claims and learning data",
    },
    income: {
      recordedThisMonthRM: currentIncome,
      profileMonthlyEstimateRM: roundMoney(profileMonthlyIncome),
      comparisonSource: currentIncome > 0 ? "recorded this month" : "profile estimate",
    },
    budget: {
      overallThisMonthRM: budgetRM,
      usedPercent: budgetRM && budgetRM > 0
        ? Math.round((Math.max(0, currentMonthSpending) / budgetRM) * 100)
        : null,
      categoryLimits: categoryBudgets,
    },
    spending: {
      thisMonth: currentMonth,
      thisMonthNetRM: roundMoney(Math.max(0, currentMonthSpending)),
      thisMonthPurchases: currentMonthPurchases,
      thisMonthCategories,
      priorMonthSameDayNetRM: roundMoney(Math.max(0, previousComparableSpending)),
      priorMonthSameDayPurchases: previousComparablePurchases,
      priorMonthComparisonEnd: previousComparableEnd,
      last90DaysStart: recentStart,
      last90DaysNetRM: roundMoney(Math.max(0, recentSpending)),
      last90DaysPurchases: recentPurchases,
      categoryPatterns: categoryPatterns.slice(0, 10),
      mostFrequentCategory: frequentCategory,
      repeatMerchants,
      monthlyTrend: monthly.map((item) => ({
        ...item,
        spendingRM: roundMoney(Math.max(0, item.spendingRM)),
        recordedIncomeRM: roundMoney(item.recordedIncomeRM),
        budgetRM: monthlyBudgetMap.get(item.month) ?? null,
      })),
      accountActivity: [...accountActivity.values()]
        .map((item) => ({ ...item, grossPurchasesRM: roundMoney(item.grossPurchasesRM) }))
        .sort((left, right) => right.purchaseCount - left.purchaseCount),
    },
    accounts: { activeByType: accountCounts },
    goals: {
      recentCompleted: sortedGoals.filter((goal) => goal.completed).length,
      recentOpen: sortedGoals.filter((goal) => !goal.completed).length,
      latestOpenTitles: sortedGoals
        .filter((goal) => !goal.completed)
        .slice(0, 3)
        .map((goal) => cleanLabel(goal.title)),
    },
  };
}

export function fallbackInsights(snapshot) {
  const spending = snapshot.spending;
  if (snapshot.coverage.recordedTransactions === 0) {
    return [
      "There are no confirmed transactions to analyse yet. Add a few expenses and income entries to reveal your spending pattern.",
      "A monthly budget will give Fin a useful reference for comparing your recorded spending.",
    ];
  }

  const insights = [spending.thisMonthPurchases > 0
    ? `You recorded RM${spending.thisMonthNetRM.toFixed(2)} of net spending across ${spending.thisMonthPurchases} purchases this month. Review the category breakdown to spot what matters most.`
    : "There are no confirmed purchases this month. Record new spending as it happens so Fin can spot a current pattern."];
  const frequent = spending.mostFrequentCategory;
  if (frequent?.purchaseCount >= 3 && frequent.activeDays >= 2) {
    insights.push(`${frequent.category} appears most often in the last 90 days: ${frequent.purchaseCount} purchases across ${frequent.activeDays} days. Check whether any of these are easy to plan ahead.`);
  } else {
    insights.push("There are not enough repeated purchases yet to identify a reliable spending rhythm. Keep recording transactions for a clearer picture.");
  }
  if (snapshot.budget.overallThisMonthRM) {
    insights.push(`You have used ${snapshot.budget.usedPercent}% of your RM${snapshot.budget.overallThisMonthRM.toFixed(2)} monthly budget. Review your remaining limit before new discretionary purchases.`);
  } else {
    insights.push("Set an overall monthly budget so Fin can compare your actual spending with a limit you chose.");
  }
  return insights;
}
