export interface PaginatedResult<T> {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  items: T[];
}

export function paginate<T>(items: T[], page: number, limit: number): PaginatedResult<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * limit;

  return {
    total,
    page: safePage,
    limit,
    totalPages,
    items: items.slice(start, start + limit),
  };
}
