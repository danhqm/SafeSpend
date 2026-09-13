import OpenAI from "openai";
import { z } from "zod";
import { prepareResponse, requireUser, serverError } from "../lib/http.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const requestSchema = z.object({
  message: z.string().trim().min(1).max(2_000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(2_000),
      }),
    )
    .max(10)
    .default([]),
});

export default async function handler(req, res) {
  if (!prepareResponse(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const user = await requireUser(req, res);
  if (!user) return;

  const parsed = requestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: "Invalid chat request" });
  }

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Your name is Fin, a helpful financial mentor. Keep responses short, clear, practical, and grounded in the user's supplied context. Use MYR (RM) where relevant. Do not claim to be a licensed financial adviser.",
        },
        ...parsed.data.history,
        { role: "user", content: parsed.data.message },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim();
    if (!text) throw new Error("OpenAI returned an empty response");
    return res.status(200).json({ success: true, text });
  } catch (error) {
    return serverError(res, "Chat request failed", error);
  }
}
