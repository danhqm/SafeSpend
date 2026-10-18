import OpenAI from "openai";
import { prepareResponse, requireUser, serverError } from "../lib/http.js";
import { enforceRateLimit } from "../lib/rate-limit.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { createReceiptOcrHandler } from "../lib/receipt-ocr.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 45_000, maxRetries: 0 });
export const config = { api: { bodyParser: { sizeLimit: "7mb" } } };
export default createReceiptOcrHandler({
  db: supabaseAdmin, openai, prepareResponse, requireUser, serverError, enforceRateLimit,
  visionModel: process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini",
});
