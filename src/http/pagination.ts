const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export type Pagination = { limit: number; offset: number };

export function parsePagination(query: Record<string, string | undefined>): Pagination {
  const rawLimit = query.limit;
  const rawOffset = query.offset;
  let limit = rawLimit === undefined ? DEFAULT_LIMIT : Number.parseInt(rawLimit, 10);
  let offset = rawOffset === undefined ? 0 : Number.parseInt(rawOffset, 10);
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;
  if (!Number.isFinite(offset) || offset < 0) offset = 0;
  return { limit, offset };
}
