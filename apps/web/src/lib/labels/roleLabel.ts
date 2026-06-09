import "server-only";
import { cache } from "react";
import type { StructuralRole } from "@transforma/db";
import { createRlsClient } from "@/lib/supabase/server";

export type RoleLabels = Record<StructuralRole, string>;

/**
 * Every role WORD a user sees is resolved here from company.role_labels at
 * request time — NEVER hardcoded (enforced by the contract lint). If labels are
 * unavailable, fall back to the lowercase STRUCTURAL key (an identifier, not a
 * tenant display word) so nothing crashes and no tenant label is invented.
 * `cache` dedupes the read per request.
 */
export const resolveLabels = cache(async (): Promise<RoleLabels> => {
  const fallback: RoleLabels = { subject: "subject", peer: "peer", approver: "approver", admin: "admin" };
  try {
    const supabase = await createRlsClient();
    const { data } = await supabase.from("companies").select("role_labels").limit(1).maybeSingle();
    const labels = (data?.role_labels ?? {}) as Partial<RoleLabels>;
    return {
      subject: labels.subject ?? fallback.subject,
      peer: labels.peer ?? fallback.peer,
      approver: labels.approver ?? fallback.approver,
      admin: labels.admin ?? fallback.admin,
    };
  } catch {
    return fallback;
  }
});

export function pluralize(word: string): string {
  return word.endsWith("s") ? word : `${word}s`;
}
