import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export * from "./ids.js";
export * from "./codec.js";
export type { Database } from "./generated/database.types.js";

/**
 * Service-role client — RLS-EXEMPT by design. Use ONLY in the narrow, audited
 * paths the plan names (activation-token consume, lock commit, roster ingest)
 * and inside the Render Background Worker. Its safety comes from the DB-level
 * immutability triggers/grants and the SECURITY DEFINER tenant-scoping functions
 * (`app.assert_company`), NOT from RLS. NEVER import this into client/browser
 * code or pass the key to the browser.
 */
export function createServiceRoleClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "public" },
  });
}
