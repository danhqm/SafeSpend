import { z } from "zod";
import { malaysiaDate } from "./fin-analysis.js";
import { loadFinancialSnapshot } from "./fin-data.js";
import { supabaseAdmin } from "./supabase.js";

const MAX_SEARCH_ROWS = 500;
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
});
const CATEGORIES = [
  "FOOD_AND_DRINK", "GROCERIES", "TRANSPORT", "SHOPPING", "BILLS",
  "ENTERTAINMENT", "HEALTHCARE", "EDUCATION", "HOUSING", "SAVINGS",
  "SALARY", "OTHER",
];
const searchSchema = z.object({
  record_type: z.enum(["receipt", "transaction"]),
  date_basis: z.enum(["scanned_at", "purchase_date"]),
  from: dateSchema.optional(),
  through: dateSchema.optional(),
  category: z.enum(CATEGORIES).optional(),
  merchant: z.string().trim().max(80).optional(),
  transaction_type: z.enum(["expense", "income", "refund"]).optional(),
  limit: z.number().int().min(1).max(30).default(15),
}).refine((value) => !value.from || !value.through || value.from <= value.through);

export const OFF_TOPIC_REPLY = "I can help with your SafeSpend records and personal finance, but not unrelated questions. Ask me about a receipt, spending, income, budgets, accounts, goals, or a finance concept.";

export const finChatTools = [
  {
    type: "function",
    function: {
      name: "search_financial_records",
      description: "Search the signed-in user's saved receipts or posted transactions. For 'scanned/uploaded' use receipt with scanned_at; for purchase/spending dates use purchase_date. Returns exact record fields and coverage limits.",
      parameters: {
        type: "object",
        properties: {
          record_type: { type: "string", enum: ["receipt", "transaction"] },
          date_basis: { type: "string", enum: ["scanned_at", "purchase_date"] },
          from: { type: "string", description: "Inclusive YYYY-MM-DD date in Malaysia time" },
          through: { type: "string", description: "Inclusive YYYY-MM-DD date in Malaysia time" },
          category: { type: "string", enum: CATEGORIES },
          merchant: { type: "string", description: "Merchant name fragment, if specified" },
          transaction_type: { type: "string", enum: ["expense", "income", "refund"] },
          limit: { type: "integer", minimum: 1, maximum: 30 },
        },
        required: ["record_type", "date_basis"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_financial_overview",
      description: "Get a calculated summary of the signed-in user's posted MYR transactions, spending habits, income, current budgets, account types and recent goals. Use for behaviour, frequency and budget questions; not to identify a specific receipt.",
      parameters: { type: "object", properties: {} },
    },
  },
];

export function malaysiaWeekBounds(now = new Date()) {
  const today = malaysiaDate(now);
  const day = new Date(`${today}T00:00:00Z`).getUTCDay();
  const monday = new Date(Date.parse(`${today}T00:00:00Z`) - ((day + 6) % 7) * 86_400_000)
    .toISOString().slice(0, 10);
  return { today, weekStart: monday };
}

export function isUnrelatedMathQuestion(message) {
  const text = String(message ?? "").trim().replace(/\s+/g, " ");
  return /^(?:(?:what is|what's|calculate|solve|evaluate)\s+)?[\d\s+*/().=%^xX-]+\??$/i.test(text)
    && /\d/.test(text);
}

export function cleanChatText(value) {
  return String(value ?? "")
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D\u20E3]/gu, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function nextDate(date) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000)
    .toISOString().slice(0, 10);
}

function malaysiaMidnightUtc(date) {
  return new Date(`${date}T00:00:00+08:00`).toISOString();
}

function receiptItems(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 12).map((item) => ({
    name: String(item?.name ?? "").slice(0, 120),
    priceRM: item?.price != null && Number.isFinite(Number(item.price)) ? Number(item.price) : null,
  }));
}

export function presentReceipt(receipt, linkedTransaction = null) {
  const transaction = linkedTransaction ?? {};
  return {
    merchant: transaction.merchant_name || receipt.merchant_name || "Unknown merchant",
    receiptDate: receipt.receipt_date,
    scannedAt: receipt.created_at,
    scannedOnMalaysia: receipt.created_at ? malaysiaDate(new Date(receipt.created_at)) : null,
    amountRM: transaction.amount ?? receipt.total_amount,
    category: transaction.category || receipt.category || "OTHER",
    items: receiptItems(receipt.items),
    itemsLimited: Array.isArray(receipt.items) && receipt.items.length > 12,
    status: transaction.status ?? "saved without a transaction",
    countedInSpending: transaction.status === "posted" && transaction.transaction_type === "expense",
  };
}

async function searchReceipts(userId, filters, db) {
  const dateColumn = filters.date_basis === "scanned_at" ? "created_at" : "receipt_date";
  let query = db.from("receipts")
    .select("id, merchant_name, total_amount, receipt_date, created_at, items, category", { count: "exact" })
    .eq("user_id", userId);
  if (filters.from) query = query.gte(dateColumn, dateColumn === "created_at" ? malaysiaMidnightUtc(filters.from) : filters.from);
  if (filters.through) query = dateColumn === "created_at"
    ? query.lt(dateColumn, malaysiaMidnightUtc(nextDate(filters.through)))
    : query.lte(dateColumn, filters.through);
  const { data, error, count } = await query.order(dateColumn, { ascending: false })
    .order("id", { ascending: false }).limit(MAX_SEARCH_ROWS);
  if (error) throw error;
  const receipts = data ?? [];
  const transactions = [];
  for (let offset = 0; offset < receipts.length; offset += 100) {
    const ids = receipts.slice(offset, offset + 100).map((row) => row.id);
    const linked = await db.from("transactions")
      .select("receipt_id, merchant_name, amount, category, status, transaction_type")
      .eq("user_id", userId).in("receipt_id", ids);
    if (linked.error) throw linked.error;
    transactions.push(...(linked.data ?? []));
  }
  const byReceipt = new Map();
  for (const row of transactions) {
    if (row.status === "posted" || !byReceipt.has(row.receipt_id)) byReceipt.set(row.receipt_id, row);
  }
  const merchantTerm = filters.merchant?.toLocaleLowerCase("en-MY");
  const matches = receipts
    .map((receipt) => ({ row: presentReceipt(receipt, byReceipt.get(receipt.id)), transaction: byReceipt.get(receipt.id) }))
    .filter(({ row }) => !filters.category || row.category === filters.category)
    .filter(({ row }) => !merchantTerm || row.merchant.toLocaleLowerCase("en-MY").includes(merchantTerm))
    .filter(({ transaction }) => !filters.transaction_type || transaction?.transaction_type === filters.transaction_type);
  return {
    records: matches.slice(0, filters.limit).map(({ row }) => row),
    matchingRecordsInSearchedWindow: matches.length,
    searchedRecords: receipts.length,
    totalRecordsInDateWindow: count ?? receipts.length,
    searchLimited: (count ?? receipts.length) > receipts.length,
    resultLimited: matches.length > filters.limit,
    dateBasis: filters.date_basis,
    searchedFrom: filters.from ?? null,
    searchedThrough: filters.through ?? null,
    categoryFilter: filters.category ?? null,
  };
}

async function searchTransactions(userId, filters, db) {
  let query = db.from("transactions")
    .select("merchant_name, amount, currency, occurred_on, category, transaction_type, source, notes", { count: "exact" })
    .eq("user_id", userId).eq("status", "posted");
  if (filters.from) query = query.gte("occurred_on", filters.from);
  if (filters.through) query = query.lte("occurred_on", filters.through);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.transaction_type) query = query.eq("transaction_type", filters.transaction_type);
  if (filters.merchant) {
    const literalMerchant = filters.merchant.replace(/[\\%_]/g, "\\$&");
    query = query.ilike("merchant_name", `%${literalMerchant}%`);
  }
  const { data, error, count } = await query.order("occurred_on", { ascending: false })
    .limit(MAX_SEARCH_ROWS);
  if (error) throw error;
  const rows = data ?? [];
  const merchantTerm = filters.merchant?.toLocaleLowerCase("en-MY");
  const matches = rows.filter((row) => !merchantTerm
    || String(row.merchant_name ?? "").toLocaleLowerCase("en-MY").includes(merchantTerm));
  return {
    records: matches.slice(0, filters.limit).map((row) => ({
      merchant: row.merchant_name,
      purchaseDate: row.occurred_on,
      amount: row.amount,
      currency: row.currency,
      category: row.category,
      type: row.transaction_type,
      source: row.source,
      notes: String(row.notes ?? "").slice(0, 200),
    })),
    matchingRecordsInSearchedWindow: matches.length,
    searchedRecords: rows.length,
    totalRecordsInDateWindow: count ?? rows.length,
    searchLimited: (count ?? rows.length) > rows.length,
    resultLimited: matches.length > filters.limit,
    dateBasis: "purchase_date",
    searchedFrom: filters.from ?? null,
    searchedThrough: filters.through ?? null,
    categoryFilter: filters.category ?? null,
  };
}

export async function runFinChatTool(name, rawArguments, userId, db = supabaseAdmin) {
  if (name === "get_financial_overview") return loadFinancialSnapshot(userId);
  if (name !== "search_financial_records") return { error: "Unknown lookup" };
  const parsed = searchSchema.safeParse(rawArguments);
  if (!parsed.success) return { error: "Invalid lookup filters" };
  const filters = parsed.data;
  if (filters.record_type === "transaction" && filters.date_basis === "scanned_at") {
    return { error: "Use receipt records to search by scan date" };
  }
  return filters.record_type === "receipt"
    ? searchReceipts(userId, filters, db)
    : searchTransactions(userId, filters, db);
}
