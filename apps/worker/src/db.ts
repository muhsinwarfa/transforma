import { Pool } from "pg";

// The worker connects via SUPABASE_DB_URL as a privileged role (RLS-exempt). Its
// safety comes from the DB immutability triggers + the SECURITY DEFINER tenant
// re-assertion functions (app.worker_*), not from RLS.
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.SUPABASE_DB_URL;
    if (!connectionString) throw new Error("SUPABASE_DB_URL is not set");
    pool = new Pool({ connectionString, max: 4 });
  }
  return pool;
}

export async function q<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<{ rows: T[]; rowCount: number }> {
  const res = await getPool().query(text, params as unknown[]);
  return { rows: res.rows as T[], rowCount: res.rowCount ?? 0 };
}
