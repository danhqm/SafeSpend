import OpenAI from "openai";
import { z } from "zod";
import { prepareResponse, requireUser, serverError } from "../lib/http.js";
import { supabaseAdmin } from "../lib/supabase.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const finiteNumber = z.coerce.number().finite().nonnegative();
const requestSchema = z.object({
  monthlyIncome: finiteNumber.optional(),
  weeklyIncomeEstimate: finiteNumber.optional(),
  weeklyExpense: finiteNumber.default(0),
  topSpendCategories: z
    .array(z.object({ category: z.string().max(80), amount: finiteNumber }))
    .max(10)
    .default([]),
  weeklyGoals: z
    .array(
      z.object({
        title: z.string().max(200),
        notes: z.string().max(500).nullish(),
        completed: z.boolean().optional(),
        week_start: z.string().max(20).nullish(),
      }),
    )
    .max(20)
    .default([]),
  weekStartStr: z.string().max(20).optional(),
  weekEndStr: z.string().max(20).optional(),
});

function extractRMAmount(text) {
  const match = String(text ?? "").match(/rm\s*([0-9]+(?:\.[0-9]+)?)/i);
  const value = match ? Number(match[1]) : NaN;
  return Number.isFinite(value) ? value : null;
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
    return res.status(400).json({ success: false, error: "Invalid insights request" });
  }

  try {
    const body = parsed.data;
    let monthlyIncome = body.monthlyIncome;
    if (monthlyIncome === undefined) {
      let { data, error } = await supabaseAdmin
        .from("users")
        .select("monthly_income")
        .eq("user_id", user.id)
        .maybeSingle();
      // Temporary compatibility with the existing production schema. Remove this
      // fallback after 20260909154818_harden_personal_app.sql is applied.
      if (error?.code === "42703") {
        ({ data, error } = await supabaseAdmin
          .from("users")
          .select("monthy_income")
          .eq("user_id", user.id)
          .maybeSingle());
      }
      if (error) throw error;
      monthlyIncome = Number(data?.monthly_income ?? data?.monthy_income ?? 0);
    }

    let weeklyGoals = body.weeklyGoals;
    if (!weeklyGoals.length && body.weekStartStr) {
      const { data, error } = await supabaseAdmin
        .from("user_goals")
        .select("title, notes, completed, week_start")
        .eq("user_id", user.id)
        .eq("week_start", body.weekStartStr);
      if (error) throw error;
      weeklyGoals = data ?? [];
    }

    if (!monthlyIncome && body.weeklyExpense === 0 && weeklyGoals.length === 0) {
      return res.status(200).json({
        success: true,
        insights: [
          "Set your monthly income and scan a few receipts so Fin can personalize insights for you.",
        ],
      });
    }

    const context = {
      currency: "MYR",
      timeframe: { weekStart: body.weekStartStr ?? null, weekEnd: body.weekEndStr ?? null },
      income: {
        monthly_rm: Number((monthlyIncome ?? 0).toFixed(2)),
        weekly_estimate_rm: Number(
          (body.weeklyIncomeEstimate ?? (monthlyIncome ?? 0) / 4).toFixed(2),
        ),
      },
      spending: {
        weekly_total_rm: Number(body.weeklyExpense.toFixed(2)),
        top_categories: body.topSpendCategories,
      },
      goals: weeklyGoals.map((goal) => ({
        ...goal,
        target_rm: extractRMAmount(goal.title) ?? extractRMAmount(goal.notes),
      })),
    };

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'Return only JSON shaped as {"insights":["..."]}. Provide exactly two short, practical insights for a Malaysian personal-finance app. Use supplied RM amounts, celebrate progress without encouraging reckless spending, and never claim to be a licensed financial adviser.',
        },
        { role: "user", content: JSON.stringify(context) },
      ],
    });

    const content = response.choices[0]?.message?.content;
    const insights = z
      .object({ insights: z.array(z.string().trim().min(1)).min(1).max(5) })
      .parse(JSON.parse(content ?? "{}"))
      .insights;
    return res.status(200).json({ success: true, insights });
  } catch (error) {
    return serverError(res, "Financial insights request failed", error);
  }
}
