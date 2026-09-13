import { supabaseAdmin } from "./supabase.js";

const DEFAULT_LIMITS = {
  chat: { burstLimit: 10, burstWindowSeconds: 60, dailyLimit: 100 },
  ocr: { burstLimit: 5, burstWindowSeconds: 600, dailyLimit: 20 },
  "fin-insights": { burstLimit: 10, burstWindowSeconds: 3600, dailyLimit: 30 },
};

const DAILY_WINDOW_SECONDS = 24 * 60 * 60;

function positiveInteger(value, fallback) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function limitsFor(endpoint) {
  const defaults = DEFAULT_LIMITS[endpoint];
  if (!defaults) throw new Error(`Unknown rate-limit endpoint: ${endpoint}`);

  const prefix = endpoint.replaceAll("-", "_").toUpperCase();
  return {
    burstLimit: positiveInteger(process.env[`${prefix}_BURST_LIMIT`], defaults.burstLimit),
    burstWindowSeconds: positiveInteger(
      process.env[`${prefix}_BURST_WINDOW_SECONDS`],
      defaults.burstWindowSeconds,
    ),
    dailyLimit: positiveInteger(process.env[`${prefix}_DAILY_LIMIT`], defaults.dailyLimit),
  };
}

export async function enforceRateLimit(res, userId, endpoint) {
  const limits = limitsFor(endpoint);
  let data;
  let error;
  try {
    ({ data, error } = await supabaseAdmin.rpc("consume_api_quota", {
      p_user_id: userId,
      p_endpoint: endpoint,
      p_burst_limit: limits.burstLimit,
      p_burst_window_seconds: limits.burstWindowSeconds,
      p_daily_limit: limits.dailyLimit,
      p_daily_window_seconds: DAILY_WINDOW_SECONDS,
    }));
  } catch (quotaError) {
    error = quotaError;
  }

  if (error || !data?.[0]) {
    console.error("API quota check failed", error);
    res.status(503).json({
      success: false,
      error: "Usage protection is temporarily unavailable",
    });
    return false;
  }

  const result = data[0];
  res.setHeader("X-RateLimit-Burst-Remaining", String(result.burst_remaining));
  res.setHeader("X-RateLimit-Daily-Remaining", String(result.daily_remaining));

  if (!result.allowed) {
    res.setHeader("Retry-After", String(result.retry_after));
    res.status(429).json({
      success: false,
      error:
        result.limit_scope === "daily"
          ? "Daily usage limit reached. Please try again tomorrow."
          : "Too many requests. Please wait and try again.",
    });
    return false;
  }

  return true;
}
