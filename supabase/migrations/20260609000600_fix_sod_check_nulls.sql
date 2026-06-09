-- ============================================================================
-- Transforma — 0600: correctness fix for the SoD input-author CHECK (ADDITIVE).
--
-- The 0200 constraint `approver_id IS DISTINCT FROM input_author_id` rejects a
-- review where BOTH columns are NULL, because `NULL IS DISTINCT FROM NULL` is
-- FALSE. But the eager fan-out (PROC-MAIN) creates a review with no approver yet
-- and no input author — both NULL — which is legitimate. The constraint must
-- reject only the case where both are SET and equal.
--
-- (The subject CHECK `approver_id IS DISTINCT FROM employee_id` is correct as-is:
-- employee_id is NOT NULL, so the NULL/NULL case can't arise there.)
-- Surfaced by the token-gate integration test (a cross-tenant review with no
-- approver). The full SoD remains enforced by app.is_eligible_approver + the
-- finalize re-check + the approver-queue filter; this CHECK is the DB backstop.
-- ============================================================================

alter table reviews drop constraint sod_approver_not_input_author;

alter table reviews add constraint sod_approver_not_input_author
  check (approver_id is null or input_author_id is null or approver_id <> input_author_id);
