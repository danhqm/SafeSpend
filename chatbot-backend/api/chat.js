import OpenAI from "openai";
import { prepareResponse, requireUser, serverError } from "../lib/http.js";
import { enforceRateLimit } from "../lib/rate-limit.js";
import { createFinChatHandler } from "../lib/fin-chat.js";

// The handler permits at most three model rounds. Avoid automatic retries that
// silently multiply paid calls after the app has already reached its deadline.
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 15_000, maxRetries: 0 });

export default createFinChatHandler({
  openai, prepareResponse, requireUser, serverError, enforceRateLimit,
  model: process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini",
});
