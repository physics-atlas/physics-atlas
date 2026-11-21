// The part of Cloudflare D1's API the maps backend uses (server/maps.ts) — kept
// small so the tests can stand in for it with Node's built-in SQLite.

export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

export interface D1Database {
  prepare(sql: string): D1Statement;
  /** Runs the statements in one transaction: all of them, or none */
  batch(statements: D1Statement[]): Promise<unknown[]>;
}
