import { supabaseAdmin } from "./supabase.js";

const DEFAULT_LIMITS = {
  chat: { burstLimit: 10, burstWindowSeconds: 60, dailyLimit: 100 },
  ocr: { burstLimit: 5, burstWindowSeconds: 600, dailyLimit: 20 },
  "fin-insights": { burstLimit: 10, burstWindowSeconds: 3600, dailyLimit: 30 },
  "account-delete": { burstLimit: 3, burstWindowSeconds: 600, dailyLimit: 10 },
};

const GLOBAL_LIMITS = {
  chat: { burstLimit: 60, burstWindowSeconds: 60, dailyLimit: 1000 },
  ocr: { burstLimit: 20, burstWindowSeconds: 600, dailyLimit: 200 },
  "fin-insights": { burstLimit: 60, burstWindowSeconds: 3600, dailyLimit: 300 },
};

const DAILY_WINDOW_SECONDS = 24 * 60 * 60;

function positiveInteger(value, fallback) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function limitsFor(endpoint, env, global = false) {
  const defaults = (global ? GLOBAL_LIMITS : DEFAULT_LIMITS)[endpoint];
  if (!defaults) throw new Error(`Unknown rate-limit endpoint: ${endpoint}`);

  const prefix = `${global ? "GLOBAL_" : ""}${endpoint.replaceAll("-", "_").toUpperCase()}`;
  return {
    burstLimit: positiveInteger(env[`${prefix}_BURST_LIMIT`], defaults.burstLimit),
    burstWindowSeconds: positiveInteger(
      env[`${prefix}_BURST_WINDOW_SECONDS`],
      defaults.burstWindowSeconds,
    ),
    dailyLimit: positiveInteger(env[`${prefix}_DAILY_LIMIT`], defaults.dailyLimit),
  };
}

function isQuotaResult(result) {
  return result && typeof result.allowed === "boolean" &&
    Number.isSafeInteger(result.burst_remaining) && result.burst_remaining >= 0 &&
    Number.isSafeInteger(result.daily_remaining) && result.daily_remaining >= 0 &&
    Number.isSafeInteger(result.retry_after) && result.retry_after >= 0 &&
    (result.allowed ? result.limit_scope === null && result.retry_after === 0
      : ["daily", "burst"].includes(result.limit_scope) && result.retry_after > 0);
}

async function consumeQuota(database, res, endpoint, limits, userId) {
  let data;
  let error;
  try {
    ({ data, error } = await database.rpc(userId === undefined ? "consume_global_api_quota" : "consume_api_quota", {
      ...(userId === undefined ? {} : { p_user_id: userId }),
      p_endpoint: endpoint,
      p_burst_limit: limits.burstLimit,
      p_burst_window_seconds: limits.burstWindowSeconds,
      p_daily_limit: limits.dailyLimit,
      p_daily_window_seconds: DAILY_WINDOW_SECONDS,
    }));
  } catch (quotaError) {
    error = quotaError;
  }

  if (error || !isQuotaResult(data?.[0])) {
    console.error("API quota check failed", error);
    res.status(503).json({
      success: false,
      error: "Usage protection is temporarily unavailable",
    });
    return false;
  }

  const result = data[0];
  const headerPrefix = userId === undefined ? "X-RateLimit-Global" : "X-RateLimit";
  res.setHeader(`${headerPrefix}-Burst-Remaining`, String(result.burst_remaining));
  res.setHeader(`${headerPrefix}-Daily-Remaining`, String(result.daily_remaining));

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

export function createRateLimitEnforcer(database, env = process.env) {
  return async (res, userId, endpoint) => {
    const limits = limitsFor(endpoint, env);
    // Reject an exhausted account before touching the shared capacity. Otherwise
    // denied requests could drain the deployment budget without doing paid work.
    if (!(await consumeQuota(database, res, endpoint, limits, userId))) return false;
    if (Object.hasOwn(GLOBAL_LIMITS, endpoint)) {
      const globalLimits = limitsFor(endpoint, env, true);
      if (!(await consumeQuota(database, res, endpoint, globalLimits))) return false;
    }
    return true;
  };
}

export const enforceRateLimit = createRateLimitEnforcer(supabaseAdmin);
