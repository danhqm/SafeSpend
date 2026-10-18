type Session = { user: { id: string }; access_token: string };
type Dependencies = {
  apiUrl: string | undefined;
  getSession(): Promise<{ data: { session: Session | null }; error: unknown }>;
  getAiConsent(userId: string): Promise<boolean>;
  fetch: typeof fetch;
  timeoutMs?: number;
};

export class AiConsentRequiredError extends Error {
  readonly code = "AI_CONSENT_REQUIRED";
  constructor() { super("AI is off on this device. Review data sharing and enable AI in Profile > Privacy & data to use this feature."); }
}
export function isAiConsentRequired(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "AI_CONSENT_REQUIRED";
}

const MAX_RESPONSE_BYTES = 4 * 1_024 * 1_024;

async function bufferResponse(response: Response, aborted: Promise<never>): Promise<Response> {
  if (Number(response.headers.get("Content-Length") ?? 0) > MAX_RESPONSE_BYTES) throw new Error("The server response is too large.");
  const reader = response.body?.getReader?.();
  let bytes: Uint8Array;
  if (reader) {
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const part = await Promise.race([reader.read(), aborted]);
        if (part.done) break;
        size += part.value.byteLength;
        if (size > MAX_RESPONSE_BYTES) throw new Error("The server response is too large.");
        chunks.push(part.value);
      }
      bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    } catch (error) {
      void reader.cancel().catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
  } else {
    // React Native fetch implementations may not expose a streaming reader.
    bytes = new Uint8Array(await Promise.race([response.arrayBuffer(), aborted]));
    if (bytes.byteLength > MAX_RESPONSE_BYTES) throw new Error("The server response is too large.");
  }
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  return new Response([204, 205, 304].includes(response.status) ? null : bytes.buffer as ArrayBuffer, {
    status: response.status, statusText: response.statusText, headers,
  });
}

export function createAuthenticatedApiFetch(deps: Dependencies) {
  return async function authenticatedApiFetch(path: string, init: RequestInit = {}) {
    if (!deps.apiUrl) throw new Error("EXPO_PUBLIC_API_URL is not configured");
    if (init.signal?.aborted) throw init.signal.reason ?? new Error("Request cancelled");
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) throw new Error("Invalid API path");
    const normalized = decodeURIComponent(new URL(path, deps.apiUrl).pathname).replace(/\/{2,}/g, "/").replace(/\/$/, "");
    const aiRequest = ["/api/chat", "/api/ocr", "/api/fin-insights"].includes(normalized);
    const { data: { session }, error } = await deps.getSession();
    if (error || !session) throw new Error("You need to be logged in");
    if (aiRequest && !(await deps.getAiConsent(session.user.id))) throw new AiConsentRequiredError();
    // Consent and session reads are asynchronous. Never send one user's request
    // after a sign-out or account change while those reads were pending.
    const { data: { session: current }, error: currentError } = await deps.getSession();
    if (currentError || !current || current.user.id !== session.user.id) throw new Error("Your session changed. Please try again.");
    const headers = new Headers(init.headers);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    headers.set("Authorization", `Bearer ${current.access_token}`);
    if (aiRequest && !(await deps.getAiConsent(session.user.id))) throw new AiConsentRequiredError();
    if (init.signal?.aborted) throw init.signal.reason ?? new Error("Request cancelled");
    const controller = new AbortController();
    const cancel = () => controller.abort(init.signal?.reason);
    init.signal?.addEventListener("abort", cancel, { once: true });
    let rejectAbort!: (error: unknown) => void;
    const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
    const onAbort = () => rejectAbort(controller.signal.reason ?? new Error("Request cancelled"));
    controller.signal.addEventListener("abort", onAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(new Error("Request timed out. Please try again.")), deps.timeoutMs ?? 60_000);
    try {
      const response = await Promise.race([
        deps.fetch(`${deps.apiUrl}${path}`, { ...init, headers, signal: controller.signal }), aborted,
      ]);
      // Keep the same deadline through body consumption, before callers parse JSON.
      const buffered = await bufferResponse(response, aborted);
      if (aiRequest) {
        const latest = await Promise.race([deps.getSession(), aborted]);
        if (latest.error || latest.data.session?.user.id !== session.user.id) throw new Error("Your session changed. Please try again.");
      }
      return buffered;
    } catch (error) {
      if (controller.signal.aborted) throw controller.signal.reason ?? error;
      controller.abort(error);
      throw error;
    } finally {
      clearTimeout(timeout);
      init.signal?.removeEventListener("abort", cancel);
      controller.signal.removeEventListener("abort", onAbort);
    }
  };
}
