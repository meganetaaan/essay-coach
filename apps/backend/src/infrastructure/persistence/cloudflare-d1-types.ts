export interface D1Result<T = unknown> {
  results?: T[];
  success?: boolean;
  meta?: {
    changes?: number;
  };
}

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
}
