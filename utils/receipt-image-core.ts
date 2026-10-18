import { MAX_RECEIPT_BASE64_LENGTH, RECEIPT_IMAGE_TOO_LARGE } from "./receipt-upload-size.ts";

export type ReceiptImageSource = { uri: string; width: number; height: number };
export type ReceiptImageEncoding = { resize?: { width: number; height: number }; quality: number };
export type ReceiptImageEncoder = (source: ReceiptImageSource, encoding: ReceiptImageEncoding) => Promise<string>;

export async function prepareReceiptImage(source: ReceiptImageSource, encode: ReceiptImageEncoder): Promise<string> {
  if (!source.uri || !Number.isFinite(source.width) || source.width <= 0
    || !Number.isFinite(source.height) || source.height <= 0) {
    throw new Error("Could not read this image. Choose the receipt again.");
  }
  // Re-encode from the source each time, avoiding cumulative JPEG degradation.
  // Try reducing quality before reducing the resolution used to read small text.
  for (const { edge, quality } of [{ edge: 2800, quality: 0.85 }, { edge: 2800, quality: 0.65 }, { edge: 2000, quality: 0.65 }]) {
    const scale = Math.min(1, edge / Math.max(source.width, source.height));
    const resize = scale < 1 ? {
      width: Math.max(1, Math.round(source.width * scale)),
      height: Math.max(1, Math.round(source.height * scale)),
    } : undefined;
    const base64 = await encode(source, { resize, quality });
    if (!base64) throw new Error("Could not prepare this receipt image. Choose it again or take a new photo.");
    if (base64.length <= MAX_RECEIPT_BASE64_LENGTH) return base64;
  }
  throw new Error(RECEIPT_IMAGE_TOO_LARGE);
}
