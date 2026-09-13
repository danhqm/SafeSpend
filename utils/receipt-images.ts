import { supabase } from "./supabase";

function objectPath(value: string) {
  const marker = "/storage/v1/object/public/receipts/";
  const markerIndex = value.indexOf(marker);
  return markerIndex >= 0
    ? decodeURIComponent(value.slice(markerIndex + marker.length))
    : value;
}

export async function addSignedReceiptImage<T extends { image_url?: string | null }>(
  receipt: T,
): Promise<T> {
  if (!receipt.image_url) return receipt;
  const { data, error } = await supabase.storage
    .from("receipts")
    .createSignedUrl(objectPath(receipt.image_url), 300);
  if (error) throw error;
  return { ...receipt, image_url: data.signedUrl };
}
