import assert from "node:assert/strict";
import test from "node:test";
import handler from "../api/confirm-email.js";

function mockResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: "",
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
  };
}

test("signup confirmation displays a result without asking for another password", () => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";

  try {
    const response = mockResponse();
    handler({ method: "GET" }, response);
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /Email confirmed!/);
    assert.match(response.body, /password you chose when you signed up/);
    assert.doesNotMatch(response.body, /<input[^>]+type=["']password/);
    assert.match(response.headers["Cache-Control"], /no-store/);
    assert.equal(response.headers["Referrer-Policy"], "no-referrer");
  } finally {
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = oldKey;
  }
});

test("signup confirmation rejects non-GET requests", () => {
  const response = mockResponse();
  handler({ method: "POST" }, response);
  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.Allow, "GET");
});
