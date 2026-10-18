import type { ReceiptItem, TransactionCategory } from "../types/finance";
import { getErrorMessage } from "./error-message.ts";
import { MAX_RECEIPT_BASE64_LENGTH, RECEIPT_IMAGE_TOO_LARGE } from "./receipt-upload-size.ts";

type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>;
export type ScannedReceipt = {
  id: string; transaction_id: string; merchant_name: string; total_amount: number | string;
  receipt_date: string; category: TransactionCategory; items: ReceiptItem[];
  image_url: string | null; status: "draft" | "posted"; reused?: boolean;
};
export type ReceiptScanResult = { kind: "saved"; receipt: ScannedReceipt } | { kind: "duplicate"; receiptId: string };

const backendUpdate = () => new Error("Receipt scanning needs a service update before it can continue. Please try again after SafeSpend is updated. Your image has not been uploaded.");
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
async function readBody(response: Response): Promise<Record<string, unknown> | null> {
  const value: unknown = await response.json().catch(() => null);
  return isRecord(value) ? value : null;
}
function responseError(response: Response, payload: unknown): Error {
  if (response.status === 413) return new Error(RECEIPT_IMAGE_TOO_LARGE);
  const fallback = response.status === 401 ? "Your sign-in expired. Sign in again before scanning."
    : response.status === 429 ? "The receipt scanning limit was reached. Wait before trying again."
    : response.status === 422 ? "The receipt could not be read. Use a clear MYR receipt with a visible date and total."
    : "Receipt scanning failed. Please try again.";
  return new Error(`${getErrorMessage(payload, fallback)} (HTTP ${response.status})`);
}

export async function scanReceiptImage(api: ApiFetch, imageBase64: string,
  options: { taxReview?: boolean; allowDuplicate?: boolean } = {}): Promise<ReceiptScanResult> {
  if (imageBase64.length > MAX_RECEIPT_BASE64_LENGTH) throw new Error(RECEIPT_IMAGE_TOO_LARGE);
  // Check before sending image bytes: an older backend can post tax scans or
  // create duplicates before the new app gets a chance to inspect the response.
  const compatibility = await api("/api/ocr", { method: "GET" });
  if ([404, 405].includes(compatibility.status)) throw backendUpdate();
  const capabilities = await readBody(compatibility);
  if (!compatibility.ok) throw responseError(compatibility, capabilities);
  if (capabilities?.success !== true || capabilities.receiptProtocol !== 2) throw backendUpdate();

  const response = await api("/api/ocr", { method: "POST", body: JSON.stringify({ imageBase64, ...options }) });
  const payload = await readBody(response);
  if (response.status === 409 && payload?.code === "POSSIBLE_DUPLICATE" && typeof payload.receiptId === "string") {
    return { kind: "duplicate", receiptId: payload.receiptId };
  }
  if (!response.ok || payload?.success !== true) throw responseError(response, payload);
  if (!isRecord(payload.data) || typeof payload.data.id !== "string" || typeof payload.data.transaction_id !== "string"
    || !["draft", "posted"].includes(String(payload.data.status))) throw new Error("The server returned an incomplete receipt. Refresh your saved records before rescanning.");
  return { kind: "saved", receipt: payload.data as ScannedReceipt };
}
