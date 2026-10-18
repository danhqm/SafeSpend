type PageResult<T> = { data: T[] | null; error: unknown; count: number | null };
type PageQuery<T> = {
  order(column: string, options: { ascending: boolean }): {
    range(from: number, to: number): PromiseLike<PageResult<T>>;
  };
};

export async function fetchAllPages<T extends { id: string }>(
  query: () => PageQuery<T>,
): Promise<T[]> {
  const pageSize = 500;
  const rows: T[] = [];
  const ids = new Set<string>();
  let expectedCount: number | undefined;
  // Callers must select with { count: "exact" }. A short page can be a
  // server-side row cap, so only the exact count establishes completeness.
  for (;;) {
    const offset = rows.length;
    const { data, error, count } = await query().order("id", { ascending: true }).range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (count === null || !Number.isSafeInteger(count) || count < 0) {
      throw new Error("An exact row count is required to load complete totals");
    }
    if (expectedCount !== undefined && count !== expectedCount) {
      throw new Error("Financial records changed while loading. Please retry.");
    }
    expectedCount = count;
    if (!data || (data.length === 0 && rows.length < count)) {
      throw new Error("Incomplete financial records. Please retry.");
    }
    for (const row of data) {
      if (!row.id || ids.has(row.id)) {
        throw new Error("Financial record pages overlap. Please retry.");
      }
      ids.add(row.id);
      rows.push(row);
    }
    if (rows.length > count) throw new Error("Financial records changed while loading. Please retry.");
    if (rows.length === count) return rows;
  }
}
