import { z } from "zod";

export const RECEIPT_CATEGORIES = [
  "FOOD_AND_DRINK", "GROCERIES", "TRANSPORT", "SHOPPING", "BILLS",
  "ENTERTAINMENT", "HEALTHCARE", "EDUCATION", "HOUSING", "OTHER",
];

const receiptSchema = z.object({
  is_receipt: z.literal(true),
  currency: z.literal("MYR"),
  merchant_name: z.string().trim().min(1).max(250),
  total_amount: z.number().finite().positive().max(9999999999.99),
  receipt_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return value >= "2000-01-01" && value <= "2100-12-31" &&
      !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }),
  items: z.array(z.object({ name: z.string().max(300), price: z.number().finite() })).max(100),
  category: z.string().optional(),
});

export function parseReceiptExtraction(value) {
  const result = receiptSchema.parse(value);
  return { ...result, category: RECEIPT_CATEGORIES.includes(result.category?.toUpperCase())
    ? result.category.toUpperCase() : "OTHER" };
}
