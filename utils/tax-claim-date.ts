import { validDate } from "../types/tax.ts";

export function checkClaimDate(value: string, year: number): { date: string | null; message: string | null; receiptYear: number | null } {
  const date = value.trim();
  if (!date) return { date: null, message: null, receiptYear: null };
  const receiptYear = Number(date.slice(0, 4));
  if (!validDate(date, receiptYear)) return {
    date: null, message: "Enter a real date in YYYY-MM-DD format, for example 2025-10-17.", receiptYear: null,
  };
  if (receiptYear !== year) return {
    date, receiptYear,
    message: `This payment date belongs to YA${receiptYear}, but YA${year} is selected. Choose YA${receiptYear}; do not change the purchase date to fit another year.`,
  };
  return { date, message: null, receiptYear };
}
