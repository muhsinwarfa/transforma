import { applyFloor, buildSynthesisInput, type GateContext, runSynthesis } from "@transforma/review-core";
import { q } from "../db.js";
import { buildSynthesisDeps } from "./anthropic.js";

interface ReviewRow {
  company_id: string;
  cycle_id: string;
  employee_id: string;
  status: string;
}
interface BundleRow {
  id: string;
  below_floor: boolean;
  submitted_peer_count: number;
  anonymity_threshold: number;
  self_review_id: string | null;
}

/**
 * PROC-04 — synthesize a review's draft narrative (worker side).
 *
 * Runs while the review is `in-review` (feedback compiled). The anonymity floor
 * decides peer inclusion; below the floor the writer gets self-review only
 * (peers omitted, never filtered downstream). `runSynthesis` (review-core) runs
 * the deterministic gate + Sonnet judge on every attempt. Outcome → persistence:
 *   ready   → attach the draft, stay `in-review` (approver queue shows "ready")
 *   flagged → attach the flagged draft, `in-review → flagged` (needs rework)
 *   aborted → `in-review → aborted` (records the failure; never completes as locked)
 * feedback bodies are read transactionally and NEVER persisted into the draft.
 */
export async function synthesizeReview(reviewId: string): Promise<"ready" | "flagged" | "aborted" | "skipped"> {
  const { rows: reviews } = await q<ReviewRow>(
    "select company_id, cycle_id, employee_id, status from reviews where id = $1",
    [reviewId],
  );
  const review = reviews[0];
  if (!review || review.status !== "in-review") return "skipped";

  const { rows: bundles } = await q<BundleRow>(
    "select id, below_floor, submitted_peer_count, anonymity_threshold, self_review_id from feedback_bundles where review_id = $1",
    [reviewId],
  );
  const bundle = bundles[0];
  if (!bundle) return "skipped";

  // self-review body
  const { rows: selfRows } = await q<{ sections: unknown }>(
    "select sections from self_reviews where cycle_id = $1 and employee_id = $2",
    [review.cycle_id, review.employee_id],
  );
  const selfReview = selfRows[0]?.sections ?? {};

  // peer material — via the tenant-scoped SECURITY DEFINER reader (re-asserts company)
  const { rows: peerRows } = await q<{ payload: unknown[] }>(
    "select app.worker_submitted_peer_responses($1, $2) as payload",
    [reviewId, review.company_id],
  );
  const rawPeer = (peerRows[0]?.payload ?? []).map((p) => JSON.stringify(p));

  // identifiers to strip (names + departments of cycle roster members) for the gate
  const { rows: members } = await q<{ display_name: string; department: string | null }>(
    "select display_name, department from roster_members where cycle_id = $1",
    [review.cycle_id],
  );
  const identifiers = [
    ...members.map((m) => m.display_name),
    ...members.map((m) => m.department).filter((d): d is string => Boolean(d)),
  ];

  const decision = applyFloor(bundle.submitted_peer_count, bundle.anonymity_threshold);
  const input = buildSynthesisInput(selfReview, rawPeer, decision);
  const gateCtx: GateContext = {
    identifiers,
    rawInputs: decision.belowFloor ? [JSON.stringify(selfReview)] : [JSON.stringify(selfReview), ...rawPeer],
    belowFloor: decision.belowFloor,
  };

  const result = await runSynthesis(buildSynthesisDeps(input), gateCtx);

  if (result.outcome === "aborted") {
    await q(
      "update reviews set status = 'aborted', aborted_reason = 'synthesis_integration_failure' where id = $1 and status = 'in-review'",
      [reviewId],
    );
    await q("select app.append_audit($1, 'draft_aborted', null, $2, '{}'::jsonb)", [review.company_id, reviewId]);
    return "aborted";
  }

  const flagged = result.outcome === "flagged";
  const { rows: draftRows } = await q<{ id: string }>(
    `insert into review_drafts (company_id, cycle_id, employee_id, review_id, bundle_id, sections, flagged, flag_reason, attempt_count, generated_by_model)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'claude-opus-4-8')
     on conflict (cycle_id, employee_id) do update
       set sections = excluded.sections, flagged = excluded.flagged, flag_reason = excluded.flag_reason,
           attempt_count = excluded.attempt_count, updated_at = now()
     returning id`,
    [
      review.company_id,
      review.cycle_id,
      review.employee_id,
      reviewId,
      bundle.id,
      JSON.stringify(result.draft ?? {}),
      flagged,
      flagged ? "synthesis_gates_unmet" : null,
      result.attempts,
    ],
  );
  const reviewDraftId = draftRows[0]?.id ?? null;

  if (flagged) {
    await q(
      `update reviews set review_draft_id = $2, flagged_internal = true, flag_reason = 'synthesis_gates_unmet',
                          status = 'flagged'
        where id = $1 and status = 'in-review'`,
      [reviewId, reviewDraftId],
    );
    await q("select app.append_audit($1, 'draft_flagged', null, $2, '{}'::jsonb)", [review.company_id, reviewId]);
    // PROC-04→05: a flagged draft still needs an eligible approver to rework it.
    await q("select app.resolve_approver($1)", [reviewId]);
    return "flagged";
  }

  // ready — attach the draft; stay in-review (the approver queue shows it as ready)
  await q("update reviews set review_draft_id = $2, flagged_internal = false where id = $1 and status = 'in-review'", [
    reviewId,
    reviewDraftId,
  ]);
  await q("select app.append_audit($1, 'draft_synthesized', null, $2, '{}'::jsonb)", [review.company_id, reviewId]);
  // PROC-04→05 boundary: resolve the eligible approver (the subject's manager, SoD-
  // checked) so the ready review reaches their queue — or blocked_sod for admin.
  await q("select app.resolve_approver($1)", [reviewId]);
  return "ready";
}
