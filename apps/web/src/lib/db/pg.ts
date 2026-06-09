import "server-only";
import { Pool } from "pg";

/**
 * Direct Postgres pool for the narrow privileged server paths that need exact
 * type marshalling (notably the activation token's `bytea` argument, which is
 * awkward to pass through PostgREST). Connects via SUPABASE_DB_URL as a
 * privileged role; use ONLY for audited server actions, never client code.
 */
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.SUPABASE_DB_URL;
    if (!connectionString) throw new Error("SUPABASE_DB_URL is not set");
    pool = new Pool({ connectionString, max: 4 });
  }
  return pool;
}

export async function pgQuery<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<{ rows: T[]; rowCount: number }> {
  const res = await getPool().query(text, params as unknown[]);
  return { rows: res.rows as T[], rowCount: res.rowCount ?? 0 };
}
