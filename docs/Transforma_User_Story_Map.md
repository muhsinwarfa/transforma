# Transforma — User Story Map (derived from contract-map + BPMN, not invented)

**Purpose:** the alignment artifact before the final trim + QA walk. Every story is atomic
(one user, one goal, one sitting), carries acceptance criteria (AC), and lists its screens.
**TRIM?** flags controls visible on those screens that may serve no end user — the sweep
confirms each. Rule for any trim: remove from the app **and** the design prototype in the
same change, or the pixel matrix breaks one-ground-truth.

Personas use structural names; the product renders tenant labels (Team Member / Peer /
Manager / People Ops at Riverbend Health).

---

## Subject (Team Member)

**S1 — Activate my account.** From an invite link, I set a password and land signed-in.
AC: confirm-password + strength meter + show/hide; expired/used link explains what to do.
Screens: activate-valid / -expired / -used, set-password.

**S2 — Sign in, and recover when I forget.** AC: login works; "Forgot your password?" →
email → reset link → new password → signed in. Screens: login, forgot, forgot-sent, reset.

**S3 — Nominate my peer reviewers.** AC: I can search/pick candidates; submitting fewer
than 3 raises the below-floor warning explaining my review may rely on self-review alone;
I can submit anyway or go back; after submit I see pending; if my manager requests changes
I see their note **verbatim** and can resubmit. Screens: nominate, nominate-floor,
nominate-pending, nominate-changes, nominate-approved.

**S4 — Write and submit my self-review.** AC: answers autosave; submit shows the
what-happens-next explainer (drafts stay private until final); submitted is read-only.
Screens: self-progress, self-submitted.

**S5 — Track where my review is.** AC: timeline shows done / current ("Now") / upcoming
distinctly, with dates; privacy note present. Screens: status.

**S6 — Read and acknowledge my final review.** AC: I see the rating, narrative, and a
**concrete acknowledge-by date**; acknowledging locks the review permanently (warned
before); optional written response is kept on record. Screens: ready, ack-form, locked-ack.

**S7 — Disagree on the record.** AC: flagging requires a written reason; my response is
stored with the review; the locked view shows my response and its date.
Screens: flag-form, locked-flagged.

**S8 — Nothing to do yet.** AC: clear, calm empty state; no dead ends. Screens: no-review.

## Peer

**P1 — See what feedback I owe and by when.** AC: each request shows person, department,
due date; ≤3 days renders the urgency tint; closed requests are separated.
Screens: peer list, closed.

**P2 — Give feedback safely.** AC: answers autosave; submit confirms; my words are only
ever used when the anonymity floor is met and are never attributed to me.
Screens: peer form, submitted.

**P3 — Decline when I'm not the right person.** AC: reason picker; my reason is recorded
(audit) and the request is consumed; confirmation explains no further action.
Screens: decline picker, declined.

## Approver (Manager)

**M1 — Approve or return nominations.** AC: I see each nominee with department; returning
REQUIRES a note (the subject sees it verbatim); approving a below-floor set shows the
consequence note. Screens: nominations queue, detail.

**M2 — Triage my queue.** AC: pending vs Decided sections; submitted/locked dates; flagged
items marked; caught-up empty state. Screens: approver queue, queue-empty.

**M3 — Edit the draft and set the rating.** AC: my edits are never lost — finalizing with
unsaved edits preserves them; below-floor reviews conceal the peer count and tell me the
draft is self-review-only; flagged reviews show the actual reason. Screens: workspace.

**M4 — Finalize and reveal.** AC: the modal states it reveals to the person and locks only
after acknowledgement/window; after finalizing it's read-only for me with status visible.
Screens: workspace modal, locked/finalized.

## Admin (People Ops)

**A1 — Create, configure, and start a cycle.** AC: name/opens/closes/peer-range/ack-window
savable; **Cancel reverts every field to the last-saved values** (and says so — no phantom
"discarded"); Start creates everyone's reviews and is safe to re-run; no-cycle state offers the
create path. Screens: cycles-empty, setup, monitor.

**A2 — Steer a running cycle.** AC: days-left, participant count, milestone meters
(self-reviews / peer feedback / decisions done-of-total), status distribution.
Screens: monitor.

**A3 — Import the roster.** AC: CSV template download; drag-drop upload; every row validated
in a **read-only preview pass that writes nothing** (validate → zero rows in DB); all-or-nothing;
the import **and** its audit entry fire **only** on "Confirm & add to cycle"; the error-report
download and error path are unchanged; the confirmed state states "N people imported to {cycle}".
Screens: roster idle / validating / preview (success) / confirmed / error. *(Trim done: the
"Simulate a clean file" / "Simulate a file with errors" demo togglers were removed from app +
prototype — see the divergence register.)*

**A4 — Name the roles in our language.** AC: editing labels updates every surface; token
annotations visible; saving confirms. Screens: settings-labels.

**A5 — Handle mid-cycle exceptions.** AC: reassign re-checks separation-of-duties and
fails closed; extend covers feedback AND acknowledgement windows; withdraw archives
(never surfaces) feedback; every action audited. Screens: settings-actions.

**A6 — Govern who can read reviews.** AC: company toggle; per-admin grant/revoke; helper
states admin role alone grants nothing; every change audited. Screens: settings-access,
reviews-off, reviews-nogrant.

**A7 — Read a sealed record, accountably.** AC: list shows finished reviews only; opening
one is recorded in the audit log and says so on screen; narrative/rating/self-review/
response visible; **peer feedback structurally absent**. Screens: reviews-list, detail,
empty.

## Cross-cutting

**X1 — One home for all my roles.** AC: tasks grouped per role I hold, live counts, role
filter, deep links land on the exact state. Screens: home.
**X2 — Sign out.** AC: session actually cleared; back to login.
**X3 — Works on my phone.** AC: every section I hold a role for reachable at 375px;
bottom nav + drawer per design.
**X4 — Brand & confidentiality invariants.** AC: tenant labels everywhere (no structural
words); the word "AI" nowhere; no peer count anywhere below the floor; demo-only
affordances nowhere (this sweep).

---

## Sweep instruction (run after stories are locked)
For every screen above, enumerate every interactive control and classify:
USER-VALUE / ADMIN-VALUE / DEMO-ONLY / DEAD. Propose removals for DEMO-ONLY and DEAD with
a screenshot each; apply only after Muhsinka approves the list; mirror every removal in
docs/design/prototype and note it in the divergence register; re-run the pixel matrix for
affected screens only.