// API and Supabase failures can be plain objects rather than Error instances.
// Read only meaningful messages; coercing a nested object produces [object Object].
export function getErrorMessage(value: unknown, fallback = "Please try again."): string {
  const visited = new Set<object>();
  function read(input: unknown, depth: number): string | null {
    if (typeof input === "string") {
      const message = input.trim();
      return message && message !== "[object Object]" ? message : null;
    }
    if (!input || typeof input !== "object" || depth > 4 || visited.has(input)) return null;
    visited.add(input);
    const record = input as Record<string, unknown>;
    return read(record.message, depth + 1) ?? read(record.error, depth + 1);
  }
  return read(value, 0) ?? fallback;
}
