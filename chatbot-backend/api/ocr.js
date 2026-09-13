import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import { z } from "zod";
import { prepareResponse, requireUser, serverError } from "../lib/http.js";
import { enforceRateLimit } from "../lib/rate-limit.js";
import { supabaseAdmin } from "../lib/supabase.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const categories = [
  "FOOD_AND_DRINK",
  "GROCERIES",
  "TRANSPORT",
  "SHOPPING",
  "BILLS",
  "ENTERTAINMENT",
  "OTHER",
];
const requestSchema = z.object({
  imageBase64: z.string().min(1),
  lhdnCategory: z.string().trim().max(120).optional(),
  lhdnSubcategory: z.string().trim().max(200).optional(),
});
const receiptSchema = z.object({
  merchant_name: z.string().trim().min(1).max(250),
  total_amount: z.coerce.number().finite().nonnegative(),
  receipt_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z.array(z.object({ name: z.string().max(300), price: z.coerce.number() })).max(100),
  category: z.string().optional(),
  is_valid_claim: z.boolean().optional(),
});

export const config = { api: { bodyParser: { sizeLimit: "7mb" } } };

function identifyImage(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return { contentType: "image/png", extension: "png" };
  }
  return null;
}

function extractionPrompt(lhdnCategory) {
  const common =
    'Extract the receipt and return one JSON object with merchant_name, total_amount, receipt_date in YYYY-MM-DD, and items as [{"name":"...","price":0}]. ';
  if (lhdnCategory) {
    return `${common}The user claims LHDN tax-relief category "${lhdnCategory}". Add is_valid_claim as a boolean after checking whether the visible items support that category.`;
  }
  return `${common}Add category using exactly one of: ${categories.join(", ")}.`;
}

export default async function handler(req, res) {
  if (!prepareResponse(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const user = await requireUser(req, res);
  if (!user) return;

  const parsed = requestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: "Invalid OCR request" });
  }

  let objectPath;
  try {
    const image = Buffer.from(parsed.data.imageBase64, "base64");
    const imageType = identifyImage(image);
    if (!image.length || image.length > MAX_IMAGE_BYTES || !imageType) {
      return res.status(400).json({
        success: false,
        error: "Image must be a JPEG or PNG no larger than 5 MB",
      });
    }

    if (!(await enforceRateLimit(res, user.id, "ocr"))) return;

    objectPath = `${user.id}/${randomUUID()}.${imageType.extension}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("receipts")
      .upload(objectPath, image, { contentType: imageType.contentType, upsert: false });
    if (uploadError) throw uploadError;

    const { data: signed, error: signedError } = await supabaseAdmin.storage
      .from("receipts")
      .createSignedUrl(objectPath, 300);
    if (signedError) throw signedError;

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: extractionPrompt(parsed.data.lhdnCategory) },
            { type: "image_url", image_url: { url: signed.signedUrl } },
          ],
        },
      ],
    });

    const receipt = receiptSchema.parse(
      JSON.parse(response.choices[0]?.message?.content ?? "{}"),
    );
    const category = parsed.data.lhdnCategory
      ? "TAX_RELIEF"
      : categories.includes(receipt.category?.toUpperCase())
        ? receipt.category.toUpperCase()
        : "OTHER";
    const receiptYear = Number(receipt.receipt_date.slice(0, 4));

    const { data, error: insertError } = await supabaseAdmin
      .from("receipts")
      .insert({
        user_id: user.id,
        merchant_name: receipt.merchant_name,
        total_amount: receipt.total_amount,
        receipt_date: receipt.receipt_date,
        items: receipt.items,
        image_url: objectPath,
        category,
        lhdn_category: parsed.data.lhdnCategory ?? null,
        lhdn_subcategory: parsed.data.lhdnSubcategory ?? null,
        tax_year: parsed.data.lhdnCategory ? receiptYear : null,
        ai_validation_passed: receipt.is_valid_claim ?? null,
      })
      .select()
      .single();
    if (insertError) throw insertError;

    return res.status(200).json({ success: true, data });
  } catch (error) {
    if (objectPath) {
      const { error: cleanupError } = await supabaseAdmin.storage
        .from("receipts")
        .remove([objectPath]);
      if (cleanupError) console.error("Failed to clean up OCR upload", cleanupError);
    }
    return serverError(res, "OCR request failed", error);
  }
}
