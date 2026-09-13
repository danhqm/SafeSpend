import { z } from "zod";
import { prepareResponse, requireUser, serverError } from "../lib/http.js";
import { supabaseAdmin } from "../lib/supabase.js";

function receiptObjectPath(value) {
  if (!value) return null;
  const marker = "/storage/v1/object/public/receipts/";
  const markerIndex = value.indexOf(marker);
  return markerIndex >= 0
    ? decodeURIComponent(value.slice(markerIndex + marker.length))
    : value;
}

export default async function handler(req, res) {
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

      const { error: deleteError } = await supabaseAdmin
        .from("receipts")
        .delete()
        .eq("id", receipt.id)
        .eq("user_id", user.id);
      if (deleteError) throw deleteError;

      const objectPath = receiptObjectPath(receipt.image_url);
      if (objectPath) {
        const { error: storageError } = await supabaseAdmin.storage
          .from("receipts")
          .remove([objectPath]);
        if (storageError) console.error("Receipt image cleanup failed", storageError);
      }
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, error: "Method not allowed" });
  } catch (error) {
    return serverError(res, "Receipt request failed", error);
  }
}
