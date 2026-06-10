import "server-only";
import type { StructuralRole } from "@transforma/db";
import { TransformaError } from "@transforma/review-core";
import { createRlsClient } from "@/lib/supabase/server";

export interface Session {
  accountId: string;
  companyId: string;
  name: string;
  email: string;
  roles: StructuralRole[];
}

/**
 * Resolves the app session from the Supabase auth user via RLS-scoped reads.
 * companyId + roles come from the DB (not client claims). Returns null if signed
 * out or not provisioned.
 */
export async function loadSession(): Promise<Session | null> {
  const supabase = await createRlsClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: account } = await supabase
    .from("accounts")
    .select("id, company_id, display_name, email")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!account) return null;

  const { data: roleRows } = await supabase
    .from("account_roles")
    .select("role")
    .eq("account_id", account.id);

  return {
    accountId: account.id as string,
    companyId: account.company_id as string,
    name: account.display_name as string,
    email: account.email as string,
    roles: (roleRows ?? []).map((r) => r.role as StructuralRole),
  };
}

export async function requireSession(): Promise<Session> {
  const session = await loadSession();
  if (!session) throw new TransformaError("ERR_FORBIDDEN", "Not authenticated", 401);
  return session;
}

export async function requireRole(role: StructuralRole): Promise<Session> {
  const session = await requireSession();
  if (!session.roles.includes(role)) {
    throw new TransformaError("ERR_FORBIDDEN", `Requires the ${role} role`, 403);
  }
  return session;
}
