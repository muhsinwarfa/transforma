import "server-only";
import { createRlsClient } from "@/lib/supabase/server";

// Admin content oversight — the gated, audited read path (migrations 1800/1900).
// Everything here runs through the RLS (authenticated) client, so auth.uid()
// binds to the signed-in admin and the DB functions (app.admin_review_list /
// app.admin_read_review) enforce the capability + setting + tenant gate and
// write the audit entry. The web layer NEVER reaches review content directly.

export interface AdminReviewRow {
  reviewId: string;
  subjectName: string;
  department: string | null;
  status: string;
  flaggedInternal: boolean;
}

/** The per-review list the admin clicks into. Returns [] unless the caller holds
 *  the review-content capability AND the setting is on (gated in the DB). */
export async function getAdminReviewList(): Promise<AdminReviewRow[]> {
  const supabase = await createRlsClient();
  const { data } = await supabase.schema("app").rpc("admin_review_list");
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    reviewId: r.review_id as string,
    subjectName: r.subject_name as string,
    department: (r.department as string | null) ?? null,
    status: r.status as string,
    flaggedInternal: Boolean(r.flagged_internal),
  }));
}

export interface ReviewContent {
  reviewId: string;
  status: string;
  rating: string | null;
  flaggedInternal: boolean;
  flagReason: string | null;
  revealedAt: string | null;
  lockedAt: string | null;
  narrative: Record<string, unknown> | null;
  selfReview: Record<string, unknown> | null;
  locked: { narrative: unknown; rating: string; lockReason: string; lockedAt: string } | null;
  response: { outcome: string; body: string | null } | null;
}

/** Read ONE review's synthesized content. The DB function audits every
 *  successful read and returns null for any unauthorized / cross-tenant call.
 *  Never returns peer feedback — only the narrative the approver sees, the
 *  subject's own self-review/response, the rating, and the locked snapshot. */
export async function getAdminReviewContent(reviewId: string): Promise<ReviewContent | null> {
  const supabase = await createRlsClient();
  const { data } = await supabase.schema("app").rpc("admin_read_review", { p_review_id: reviewId });
  if (!data) return null;
  const d = data as Record<string, unknown>;
  return {
    reviewId: d.reviewId as string,
    status: d.status as string,
    rating: (d.rating as string | null) ?? null,
    flaggedInternal: Boolean(d.flaggedInternal),
    flagReason: (d.flagReason as string | null) ?? null,
    revealedAt: (d.revealedAt as string | null) ?? null,
    lockedAt: (d.lockedAt as string | null) ?? null,
    narrative: (d.narrative as Record<string, unknown> | null) ?? null,
    selfReview: (d.selfReview as Record<string, unknown> | null) ?? null,
    locked: (d.locked as ReviewContent["locked"]) ?? null,
    response: (d.response as ReviewContent["response"]) ?? null,
  };
}

export interface ReviewContentAccess {
  enabled: boolean; // the company setting (default on)
  admins: { accountId: string; name: string; granted: boolean }[];
}

/** Settings-screen view of the access policy: the company toggle + every
 *  admin and whether they hold the review-content capability. Admin RLS already
 *  permits reading the company's accounts/roles + the grants table. */
export async function getReviewContentAccess(): Promise<ReviewContentAccess> {
  const supabase = await createRlsClient();
  const { data: company } = await supabase.from("companies").select("default_settings").limit(1).maybeSingle();
  const settings = (company?.default_settings ?? {}) as Record<string, unknown>;
  const enabled = settings.adminContentAccessEnabled !== false; // absent ⇒ on

  const { data: roleRows } = await supabase.from("account_roles").select("account_id").eq("role", "admin");
  const adminIds = [...new Set((roleRows ?? []).map((r) => r.account_id as string))];
  if (adminIds.length === 0) return { enabled, admins: [] };

  const { data: accts } = await supabase.from("accounts").select("id, display_name").in("id", adminIds);
  const { data: grants } = await supabase.from("review_content_grants").select("account_id");
  const grantedSet = new Set((grants ?? []).map((g) => g.account_id as string));
  const admins = (accts ?? [])
    .map((a) => ({
      accountId: a.id as string,
      name: a.display_name as string,
      granted: grantedSet.has(a.id as string),
    }))
    .sort((x, y) => x.name.localeCompare(y.name));
  return { enabled, admins };
}
