import assert from "node:assert/strict";
import test from "node:test";
import { createAiConsentStore } from "../utils/ai-consent-core.ts";
import { createAuthenticatedApiFetch, isAiConsentRequired } from "../utils/api-core.ts";

function storage() {
  const values = new Map<string, string>();
  return { values, getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
    removeItem: async (key: string) => { values.delete(key); } };
}
const session = (id: string) => ({ user: { id }, access_token: `token-${id}` });

test("AI consent defaults off, persists explicitly per user and device, and can be revoked", async () => {
  const device = storage();
  const consent = createAiConsentStore(device);
  assert.equal(await consent.get("user-a"), false);
  await consent.set("user-a", true);
  assert.equal(await createAiConsentStore(device).get("user-a"), true);
  assert.equal(await consent.get("user-b"), false);
  assert.equal(await createAiConsentStore(storage()).get("user-a"), false);
  await consent.set("user-a", false);
  assert.equal(await createAiConsentStore(device).get("user-a"), false);
});

test("unreadable or corrupt consent is never interpreted as permission", async () => {
  const device = storage();
  device.values.set("safespend.ai-consent.v1.user-a", "true");
  assert.equal(await createAiConsentStore(device).get("user-a"), false);
  const consent = createAiConsentStore({ ...device, getItem: async () => { throw new Error("locked storage"); } });
  assert.equal(await consent.get("user-a"), false);
});

test("revoking during an unfinished enable never permits a request or resurrects old consent", async () => {
  const device = storage();
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  let writes = 0;
  const consent = createAiConsentStore({ ...device, setItem: async (key, value) => {
    if (++writes === 1) await waiting;
    await device.setItem(key, value);
  } });
  const enable = consent.set("user-a", true);
  const revoke = consent.set("user-a", false);
  assert.equal(await consent.get("user-a"), false);
  release();
  await Promise.all([enable, revoke]);
  assert.equal(await createAiConsentStore(device).get("user-a"), false);
});

test("failed consent writes do not enable AI for the current session", async () => {
  const consent = createAiConsentStore({ ...storage(), setItem: async () => { throw new Error("disk full"); } });
  await assert.rejects(consent.set("user-a", true), /disk full/);
  assert.equal(await consent.get("user-a"), false);
});

for (const path of ["/api/chat", "/api/ocr", "/api/fin-insights", "/api/chat?mode=1", "/api/chat/", "/api/%63hat"]) {
  test(`paid AI request is blocked before fetch without consent: ${path}`, async () => {
    let networkCalls = 0;
    const request = createAuthenticatedApiFetch({ apiUrl: "https://example.test", getSession: async () => ({ data: { session: session("user-a") }, error: null }), getAiConsent: async () => false,
      fetch: async () => { networkCalls++; return new Response(); } });
    await assert.rejects(request(path), error => isAiConsentRequired(error) && /Privacy/.test((error as Error).message));
    assert.equal(networkCalls, 0);
  });
}

test("manual data operations remain available without AI consent and preserve the authenticated bearer", async () => {
  let sent: RequestInit | undefined;
  const request = createAuthenticatedApiFetch({ apiUrl: "https://example.test", getSession: async () => ({ data: { session: session("user-a") }, error: null }), getAiConsent: async () => false,
    fetch: async (_url, init) => { sent = init; return new Response("{}", { status: 200 }); } });
  assert.equal((await request("/api/receipts", { method: "DELETE", headers: { Authorization: "untrusted" } })).status, 200);
  assert.equal(new Headers(sent?.headers).get("Authorization"), "Bearer token-user-a");
});

test("consented AI request uses the signed-in user's permission only", async () => {
  const checked: string[] = [];
  const request = createAuthenticatedApiFetch({ apiUrl: "https://example.test", getSession: async () => ({ data: { session: session("user-b") }, error: null }), getAiConsent: async id => { checked.push(id); return id === "user-b"; },
    fetch: async () => new Response("known answer") });
  assert.equal(await (await request("/api/chat")).text(), "known answer");
  assert.ok(checked.length > 0);
  assert.ok(checked.every(id => id === "user-b"));
});

test("switching accounts while consent loads aborts before any network request", async () => {
  let current = session("user-a");
  let release!: (value: boolean) => void;
  const consent = new Promise<boolean>(resolve => { release = resolve; });
  let calls = 0;
  const request = createAuthenticatedApiFetch({ apiUrl: "https://example.test", getSession: async () => ({ data: { session: current }, error: null }), getAiConsent: () => consent,
    fetch: async () => { calls++; return new Response(); } });
  const pending = request("/api/ocr");
  await new Promise(resolve => setImmediate(resolve));
  current = session("user-b");
  release(true);
  await assert.rejects(pending, /session changed/i);
  assert.equal(calls, 0);
});

test("AI requests abort at their deadline instead of waiting indefinitely", async () => {
  let aborted = false;
  const request = createAuthenticatedApiFetch({ apiUrl: "https://example.test", timeoutMs: 5,
    getSession: async () => ({ data: { session: session("user-a") }, error: null }), getAiConsent: async () => true,
    fetch: async (_url, init) => new Promise<Response>((_resolve, reject) => {
      const fallback = setTimeout(() => reject(new Error("Fetch continued without a deadline")), 25);
      init?.signal?.addEventListener("abort", () => { clearTimeout(fallback); aborted = true; reject(init.signal?.reason); }, { once: true });
    }) });
  await assert.rejects(request("/api/ocr"), /timed out/i);
  assert.equal(aborted, true);
});

test("external cancellation reaches fetch and abort listeners are removed afterward", async () => {
  const controller = new AbortController();
  let added = 0;
  let removed = 0;
  const add = controller.signal.addEventListener.bind(controller.signal);
  const remove = controller.signal.removeEventListener.bind(controller.signal);
  controller.signal.addEventListener = (...args) => { added++; add(...args); };
  controller.signal.removeEventListener = (...args) => { removed++; remove(...args); };
  const request = createAuthenticatedApiFetch({ apiUrl: "https://example.test", timeoutMs: 100,
    getSession: async () => ({ data: { session: session("user-a") }, error: null }), getAiConsent: async () => true,
    fetch: async (_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      controller.abort(new Error("User cancelled"));
    }) });
  await assert.rejects(request("/api/chat", { signal: controller.signal }), /User cancelled/);
  assert.equal(added, 1);
  assert.equal(removed, 1);
});

test("an already cancelled request never reaches fetch", async () => {
  const controller = new AbortController();
  controller.abort(new Error("Cancelled earlier"));
  let calls = 0;
  const request = createAuthenticatedApiFetch({ apiUrl: "https://example.test",
    getSession: async () => ({ data: { session: session("user-a") }, error: null }), getAiConsent: async () => true,
    fetch: async () => { calls++; return new Response(); } });
  await assert.rejects(request("/api/chat", { signal: controller.signal }), /Cancelled earlier/);
  assert.equal(calls, 0);
});

test("consent revoked while the session identity check is pending stops the paid request", async () => {
  let allowed = true;
  let reads = 0;
  let calls = 0;
  const request = createAuthenticatedApiFetch({ apiUrl: "https://example.test",
    getSession: async () => { if (++reads === 2) allowed = false; return { data: { session: session("user-a") }, error: null }; },
    getAiConsent: async () => allowed,
    fetch: async () => { calls++; return new Response(); } });
  await assert.rejects(request("/api/chat"), isAiConsentRequired);
  assert.equal(calls, 0);
});

test("the request deadline includes a stalled response body after headers have arrived", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  const request = createAuthenticatedApiFetch({ apiUrl: "https://example.test", timeoutMs: 5,
    getSession: async () => ({ data: { session: session("user-a") }, error: null }), getAiConsent: async () => true,
    fetch: async () => new Response(body, { status: 200, headers: { "Content-Type": "application/json" } }) });
  await assert.rejects(request("/api/ocr"), /timed out/i);
  assert.equal(cancelled, true);
});

test("a completed response from a previous account is discarded after an account switch", async () => {
  let current = session("user-a");
  const request = createAuthenticatedApiFetch({ apiUrl: "https://example.test",
    getSession: async () => ({ data: { session: current }, error: null }), getAiConsent: async () => true,
    fetch: async () => { current = session("user-b"); return new Response(JSON.stringify({ secret: "old user's records" })); } });
  await assert.rejects(request("/api/fin-insights"), /session changed/i);
});

test("bounded response buffering preserves JSON and HTTP failure status", async () => {
  const request = createAuthenticatedApiFetch({ apiUrl: "https://example.test",
    getSession: async () => ({ data: { session: session("user-a") }, error: null }), getAiConsent: async () => true,
    fetch: async () => new Response(JSON.stringify({ error: "Usage protection" }), { status: 429, headers: { "Retry-After": "60" } }) });
  const response = await request("/api/chat");
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "60");
  assert.deepEqual(await response.json(), { error: "Usage protection" });
});
