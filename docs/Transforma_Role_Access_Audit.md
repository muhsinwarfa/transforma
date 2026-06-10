# Transforma — Role × Operation Matrix & Access Audit

**The lock model:** every operation = ROLE (do you hold it this cycle?) × SCOPE (on this
specific record?) × STATE (in this lifecycle stage?) [× CAPABILITY for sealed reads].
UI hiding is courtesy; the SERVER (RLS + audited functions) is the actual lock. The audit
therefore tests two layers per cell: (1) UI — is the control/route absent for the wrong
role? (2) SERVER — does the direct action/URL fail closed anyway?

Roles are per-cycle and contextual: "approver" means *for your assigned reports only*;
"peer" means *for requests naming you only*. One person can hold all four (fixture: Amina).

---

## Shared operations (every authenticated user)
Sign in / out · password recovery · activation · home hub (showing ONLY held-role groups)
· mobile nav (ONLY held-role sections) · viewing own identity/roles in the user menu.
**Audit:** home hub and nav must render zero items for roles not held; counts must never
include other people's queues.

## Subject — scope: OWN review only
- Nominate peers / resubmit after changes (state: nomination phase)
- Write & submit self-review (state: open window)
- View own status timeline
- Read revealed review; acknowledge OR flag-with-response (state: awaiting-ack; before
  the window closes)
**Unique danger to test:** subject reaching ANOTHER subject's review/nomination/self-review
by URL or action call → must fail closed at the server, not just hide in UI.

## Peer — scope: requests naming me, this cycle
- View my request list (with deadlines)
- Write/submit feedback OR decline-with-reason (state: window open, request unconsumed)
**Unique dangers:** opening another peer's request URL (the peer-unavailable state must
appear AND the server must refuse the read); a peer who is also the subject's approver —
verify their peer answers never become visible to them through the approver workspace
(anonymity survives the dual role).

## Approver — scope: reviews/nominations where I am the assigned approver
- Approve / return-with-note nominations
- Edit draft narrative; set rating (state: in-review)
- Finalize & reveal (state: rating set)
- View my queue incl. Decided
**Unique dangers (SoD core):**
1. Approver opening a review where THEY are the subject → blocked_sod; workspace
   unreachable; finalize action fails server-side.
2. Approver opening another approver's report by URL/action.
3. Approver deriving sub-floor peer counts from anything in the workspace (concealment
   holds in every state, incl. flagged).

## Admin — scope: own tenant; aggregate-only by default
- Cycle create/configure/start · roster import · role labels · cycle monitor (aggregates)
- Mid-cycle: reassign (re-passes SoD), extend windows, withdraw (archives, never surfaces)
- Review-access governance: company toggle; grant/revoke per admin
- SEALED READ (capability-gated): list + open finished reviews — narrative, rating,
  self-review, response; NEVER peer feedback; every open audited
**Unique dangers:**
1. Admin WITHOUT grant (or with company toggle off) calling the list/read functions
   directly → already proven fail-closed by admincontent dbspec (9/9) — re-verify on prod.
2. Cross-tenant: any admin operation against another company → xtenant specs.
3. Grant escalation: can a grant-holding admin grant THEMSELVES?  Verify grants require
   admin role and check whether self-grant / sole-toggle abuse needs a rule.
4. Aggregate leak: monitor milestones must stay counts-only.

---

## Multi-role hazards (the cells single-role testing misses)
- **Approver+Subject:** own review assigned elsewhere (blocked_sod path); own review never
  in own queue.
- **Peer+Approver for the same subject:** peer anonymity survives — their own submitted
  feedback is never identifiable to them via the workspace (esp. at exactly-floor counts).
- **Admin+Subject:** does admin_review_list include the admin's OWN review? Decide whether
  self-read via the sealed reader is acceptable (they see it as subject post-reveal anyway)
  or should be excluded for audit-trail cleanliness. ← PRODUCT DECISION
- **Admin+Approver:** mid-cycle reassign must not let an admin assign a review to
  themselves in a way that bypasses SoD → covered by reassign-SoD-fails-closed dbspec;
  re-verify live.
- **Home hub:** a 4-role user's hub shows each task under the correct role lens with no
  cross-role data bleed.

## Audit method (two passes per matrix cell)
1. **UI pass:** sign in as a single-role fixture account; confirm forbidden sections are
   absent from nav AND direct URLs bounce gracefully (no flash of content).
2. **Server pass (the one that matters):** replay the forbidden operation as a direct
   server-action/RPC call with that account's session → expect refusal + nothing written
   + no confidential payload on the wire.
Already-proven coverage to reuse, not redo: SoD, token-gate, xtenant, admincontent,
reassign-SoD, audit-integrity dbspecs (95/95) + the live boundary re-check. The NEW work
is: route-guard UI pass per role, the multi-role cells above, the grant-escalation
question, and the home-hub bleed check.

## Open product decisions for Muhsinka
1. Admin self-read in the sealed reader: allow (harmless, still audited) or exclude own
   review from the list (cleaner audit story)?
2. Grant governance: may a grant-holder grant other admins, or only some designated owner?
   Today any admin can toggle/grant — acceptable for pilot, or restrict?
3. Should a subject's direct manager be nominate-able as their PEER (dual-channel
   feedback), or excluded from the candidate list?