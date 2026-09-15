export const TRANSACTION_CATEGORIES = [
  "FOOD_AND_DRINK",
  "GROCERIES",
  "TRANSPORT",
  "SHOPPING",
  "BILLS",
  "ENTERTAINMENT",
  "HEALTHCARE",
  "EDUCATION",
  "HOUSING",
  "SAVINGS",
  "SALARY",
  "OTHER",
] as const;

export type TransactionCategory = (typeof TRANSACTION_CATEGORIES)[number];
export const EXPENSE_CATEGORIES = TRANSACTION_CATEGORIES.filter(
  (category) => category !== "SALARY" && category !== "SAVINGS",
) as Exclude<TransactionCategory, "SALARY" | "SAVINGS">[];

export const BUDGET_CATEGORIES = ["ALL", ...EXPENSE_CATEGORIES] as const;
export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number];
export type TransactionType = "expense" | "income" | "refund";
export type TransactionStatus = "draft" | "posted";
export type TransactionSource = "manual" | "receipt";

export const ACCOUNT_TYPES = ["cash", "bank", "e_wallet", "credit_card"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export type ReceiptItem = {
  name: string;
  price: number;
};

export type StoredReceipt = {
  id: string;
  merchant_name: string | null;
  total_amount: number | string | null;
  receipt_date: string | null;
  category: string | null;
  items: ReceiptItem[] | null;
  image_url: string | null;
};

export type LedgerTransaction = {
  id: string;
  user_id: string;
  receipt_id: string | null;
  account_id: string | null;
  transaction_type: TransactionType;
  amount: number | string;
  currency: string;
  occurred_on: string;
  merchant_name: string | null;
  category: TransactionCategory;
  notes: string | null;
  source: TransactionSource;
  status: TransactionStatus;
  created_at: string;
  receipts?: Pick<StoredReceipt, "items" | "image_url"> | null;
  financial_accounts?: Pick<FinancialAccount, "name"> | null;
};

export type FinancialAccount = {
  id: string;
  user_id: string;
  name: string;
  account_type: AccountType;
  opening_balance: number | string;
  currency: "MYR";
  is_archived: boolean;
  created_at: string;
};

export type AccountTransfer = {
  id: string;
  user_id: string;
  from_account_id: string;
  to_account_id: string;
  amount: number | string;
  currency: "MYR";
  occurred_on: string;
  notes: string | null;
  created_at: string;
};

export type MonthlyBudget = {
  id: string;
  user_id: string;
  month_start: string;
  category: BudgetCategory;
  amount: number | string;
  currency: "MYR";
};

export function formatCategory(category?: string | null) {
  if (!category) return "Other";
  return category
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function monthStartString(date = new Date()) {
  return localDateString(new Date(date.getFullYear(), date.getMonth(), 1));
}

export function shiftMonth(monthStart: string, offset: number) {
  const [year, month] = monthStart.split("-").map(Number);
  return monthStartString(new Date(year, month - 1 + offset, 1));
}

export function monthDisplayName(monthStart: string) {
  const [year, month] = monthStart.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-MY", {
    month: "long",
    year: "numeric",
  });
}

export function expenseEffect(
  transactionType: Pick<LedgerTransaction, "transaction_type">["transaction_type"],
  amount: number | string,
) {
  const numericAmount = Number(amount) || 0;
  if (transactionType === "refund") return -numericAmount;
  if (transactionType === "expense") return numericAmount;
  return 0;
}

export function formatAccountType(accountType: AccountType) {
  if (accountType === "e_wallet") return "E-wallet";
  if (accountType === "credit_card") return "Credit card";
  return accountType.charAt(0).toUpperCase() + accountType.slice(1);
}

export function calculateAccountBalance(
  account: Pick<FinancialAccount, "id" | "account_type" | "opening_balance">,
  transactions: Pick<
    LedgerTransaction,
    "account_id" | "transaction_type" | "amount" | "status"
  >[],
  transfers: Pick<
    AccountTransfer,
    "from_account_id" | "to_account_id" | "amount"
  >[],
) {
  const isCreditCard = account.account_type === "credit_card";
  let balance = Number(account.opening_balance) || 0;

  for (const transaction of transactions) {
    if (transaction.account_id !== account.id || transaction.status !== "posted") continue;
    const amount = Number(transaction.amount) || 0;
    if (isCreditCard) {
      balance += transaction.transaction_type === "expense" ? amount : -amount;
    } else {
      balance += transaction.transaction_type === "expense" ? -amount : amount;
    }
  }

  for (const transfer of transfers) {
    const amount = Number(transfer.amount) || 0;
    if (transfer.from_account_id === account.id) {
      balance += isCreditCard ? amount : -amount;
    }
    if (transfer.to_account_id === account.id) {
      balance += isCreditCard ? -amount : amount;
    }
  }

  return Math.round(balance * 100) / 100;
}
