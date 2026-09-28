import { buildFinancialSnapshot, malaysiaDate } from "./fin-analysis.js";
import { supabaseAdmin } from "./supabase.js";

const PAGE_SIZE = 500;
const MAX_HISTORY_ROWS = 5_000;

async function loadPostedTransactions(userId, asOf) {
  const rows = [];
  let totalCount = 0;

  for (let offset = 0; offset < MAX_HISTORY_ROWS; offset += PAGE_SIZE) {
    const { data, error, count } = await supabaseAdmin
      .from("transactions")
      .select(
        "id, transaction_type, amount, currency, occurred_on, merchant_name, category, account_id, status",
        offset === 0 ? { count: "exact" } : undefined,
      )
      .eq("user_id", userId)
      .eq("status", "posted")
      .eq("currency", "MYR")
      .lte("occurred_on", asOf)
      .order("occurred_on", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;
    if (offset === 0) totalCount = count ?? 0;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  return { rows, historyLimited: totalCount > rows.length || rows.length === MAX_HISTORY_ROWS };
}

export async function loadFinancialSnapshot(userId) {
  const asOf = malaysiaDate();
  const monthStart = `${asOf.slice(0, 7)}-01`;
  const trendStart = new Date(Date.UTC(
    Number(asOf.slice(0, 4)),
    Number(asOf.slice(5, 7)) - 6,
    1,
  )).toISOString().slice(0, 10);
  const [history, profile, budgets, accounts, goals] = await Promise.all([
    loadPostedTransactions(userId, asOf),
    supabaseAdmin.from("users")
      .select("monthly_income")
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin.from("budgets")
      .select("month_start, category, amount")
      .eq("user_id", userId)
      .gte("month_start", trendStart)
      .lte("month_start", monthStart),
    supabaseAdmin.from("financial_accounts")
      .select("id, account_type, is_archived")
      .eq("user_id", userId),
    supabaseAdmin.from("user_goals")
      .select("title, completed, week_start")
      .eq("user_id", userId)
      .order("week_start", { ascending: false })
      .limit(20),
  ]);

  for (const result of [profile, budgets, accounts, goals]) {
    if (result.error) throw result.error;
  }

  return buildFinancialSnapshot({
    asOf,
    transactions: history.rows,
    budgets: budgets.data ?? [],
    accounts: accounts.data ?? [],
    goals: goals.data ?? [],
    profileMonthlyIncome: Number(profile.data?.monthly_income) || 0,
    historyLimited: history.historyLimited,
  });
}
