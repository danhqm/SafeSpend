import assert from "node:assert/strict";
import test from "node:test";

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SECRET_KEY = "test-only-placeholder";
const rateLimits = await import("../lib/rate-limit.js");
const { createFinChatHandler } = await import("../lib/fin-chat.js");

const permitted = { allowed: true, limit_scope: null, burst_remaining: 4, daily_remaining: 19, retry_after: 0 };
const denied = { allowed: false, limit_scope: "daily", burst_remaining: 2, daily_remaining: 0, retry_after: 600 };

function response() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

function chatWithQuota(enforceRateLimit, onPaidCall) {
  return createFinChatHandler({
    prepareResponse: () => true,
    requireUser: async (req) => ({ id: req.testUserId }),
    enforceRateLimit,
    openai: { chat: { completions: { async create() {
      onPaidCall();
      return { choices: [{ message: { content: JSON.stringify({ scope: "off_topic", answer: "Refused" }) } }] };
    } } } },
    serverError: (res) => res.status(500).json({ success: false }),
  });
}

const requestFor = (testUserId) => ({ method: "POST", testUserId, body: { message: "Show my saved transactions" } });

test("an account already over its own limit cannot exhaust shared AI capacity", async () => {
  const calls = [];
  const enforce = rateLimits.createRateLimitEnforcer({ async rpc(name) {
    calls.push(name);
    return { data: [name === "consume_api_quota" ? denied : permitted], error: null };
  } }, {});
  assert.equal(await enforce(response(), "limited-user", "chat"), false);
  assert.deepEqual(calls, ["consume_api_quota"]);
});

test("different eligible accounts share the paid AI counter", async () => {
  const calls = [];
  let globalRequests = 0;
  const enforce = rateLimits.createRateLimitEnforcer({
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "consume_global_api_quota") {
        globalRequests += 1;
        return { data: [globalRequests > 1 ? denied : permitted], error: null };
      }
      return { data: [permitted], error: null };
    },
  }, {});
  const first = response();
  const second = response();
  let paidCalls = 0;
  const chat = chatWithQuota(enforce, () => { paidCalls += 1; });
  await chat(requestFor("user-1"), first);
  await chat(requestFor("user-2"), second);
  assert.equal(paidCalls, 1);
  assert.equal(second.statusCode, 429);
  assert.equal(second.headers["Retry-After"], "600");
  assert.deepEqual(calls.map(({ name }) => name), ["consume_api_quota", "consume_global_api_quota", "consume_api_quota", "consume_global_api_quota"]);
  assert.equal("p_user_id" in calls[1].args, false);
  assert.deepEqual(calls[1].args, calls[3].args);
});

for (const failure of ["returned", "thrown", "empty", "malformed"]) {
  test(`${failure} global quota failure blocks paid work`, async (t) => {
    t.mock.method(console, "error", () => {});
    const calls = [];
    const enforce = rateLimits.createRateLimitEnforcer({
      async rpc(name) {
        calls.push(name);
        if (name === "consume_api_quota") return { data: [permitted], error: null };
        if (failure === "thrown") throw new Error("database offline");
        if (failure === "returned") return { data: null, error: { message: "database offline" } };
        return { data: failure === "empty" ? [] : [{ allowed: "yes" }], error: null };
      },
    }, {});
    const res = response();
    let paidCalls = 0;
    const chat = chatWithQuota(enforce, () => { paidCalls += 1; });
    await chat(requestFor("user-1"), res);
    assert.equal(paidCalls, 0);
    assert.equal(res.statusCode, 503);
    assert.deepEqual(calls, ["consume_api_quota", "consume_global_api_quota"]);
  });
}

test("per-user failure fails closed before shared quota", async (t) => {
  t.mock.method(console, "error", () => {});
  const enforce = rateLimits.createRateLimitEnforcer({
    async rpc(name) {
      return name === "consume_global_api_quota"
        ? { data: [permitted], error: null }
        : { data: null, error: { message: "database offline" } };
    },
  }, {});
  const res = response();
  assert.equal(await enforce(res, "user-1", "chat"), false);
  assert.equal(res.statusCode, 503);
});

test("account deletion has its own conservative quota without consuming paid AI capacity", async () => {
  const calls = [];
  const enforce = rateLimits.createRateLimitEnforcer({
    async rpc(name, args) { calls.push({ name, args }); return { data: [permitted], error: null }; },
  }, {});
  assert.equal(await enforce(response(), "user-1", "account-delete"), true);
  assert.deepEqual(calls, [{ name: "consume_api_quota", args: {
    p_user_id: "user-1", p_endpoint: "account-delete", p_burst_limit: 3,
    p_burst_window_seconds: 600, p_daily_limit: 10, p_daily_window_seconds: 86400,
  } }]);
});

test("shared endpoint limits use conservative defaults and independent configuration", async () => {
  const calls = [];
  const enforce = rateLimits.createRateLimitEnforcer({
    async rpc(name, args) { calls.push({ name, args }); return { data: [permitted], error: null }; },
  }, { GLOBAL_CHAT_DAILY_LIMIT: "25", CHAT_DAILY_LIMIT: "2", GLOBAL_OCR_DAILY_LIMIT: "NaN" });
  for (const endpoint of ["chat", "ocr", "fin-insights"]) await enforce(response(), "user-1", endpoint);
  assert.deepEqual(calls.map(({ args }) => [args.p_endpoint, args.p_burst_limit, args.p_burst_window_seconds, args.p_daily_limit]), [
    ["chat", 10, 60, 2], ["chat", 60, 60, 25],
    ["ocr", 5, 600, 20], ["ocr", 20, 600, 200],
    ["fin-insights", 10, 3600, 30], ["fin-insights", 60, 3600, 300],
  ]);
});
