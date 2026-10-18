import { z } from "zod";

export function receiptObjectPath(value, userId) {
  if (!value) return null;
  if (typeof value !== "string") throw new Error("Invalid receipt image path");
  const marker = "/storage/v1/object/public/receipts/";
  let path = value;
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (!url.pathname.startsWith(marker)) throw new Error("Invalid receipt image URL");
    path = decodeURIComponent(url.pathname.slice(marker.length));
  }
  if (!path.startsWith(`${userId}/`) || /[\\?#\x00-\x1f\x7f]/.test(path)
      || path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Receipt image path is outside the authenticated user's folder");
  }
  return path;
}

export function createReceiptHandler({ db: supabaseAdmin, prepareResponse, requireUser, serverError }) {
  return async function handler(req, res) {
    if (!prepareResponse(req, res)) return;
    const user = await requireUser(req, res);
    if (!user) return;

    try {
      if (req.method === "GET") {
        const { data, error } = await supabaseAdmin
          .from("receipts")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return res.status(200).json({ success: true, data });
      }

      if (req.method === "DELETE") {
        const parsed = z.string().uuid().safeParse(req.query.id);
        if (!parsed.success) {
          return res.status(400).json({ success: false, error: "Invalid receipt id" });
        }

        const { data: receipt, error: findError } = await supabaseAdmin
          .from("receipts")
          .select("id, image_url")
          .eq("id", parsed.data)
          .eq("user_id", user.id)
          .maybeSingle();
        if (findError) throw findError;
        if (!receipt) {
          return res.status(404).json({ success: false, error: "Receipt not found" });
        }

        // Keep the row and its image path until storage cleanup succeeds. Storage
        // removal is idempotent, so a later database failure can safely be retried.
        const objectPath = receiptObjectPath(receipt.image_url, user.id);
        if (objectPath) {
          const { error: storageError } = await supabaseAdmin.storage
            .from("receipts")
            .remove([objectPath]);
          if (storageError) throw storageError;
        }

        const { error: deleteError } = await supabaseAdmin
          .from("receipts")
          .delete()
          .eq("id", receipt.id)
          .eq("user_id", user.id);
        if (deleteError) throw deleteError;

        return res.status(200).json({ success: true });
      }

      return res.status(405).json({ success: false, error: "Method not allowed" });
    } catch (error) {
      return serverError(res, "Receipt request failed", error);
    }
  };
}
