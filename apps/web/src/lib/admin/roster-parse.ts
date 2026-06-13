// Pure roster-CSV parsing + validation — NO writes, NO server-only deps. Extracted
// from the admin server actions so the org-chart inference and the guard rails are
// unit-testable. Imported by `(app)/admin/actions.ts`, which re-exports the data types.
//
// THE MODEL: manager_email is the single source of truth — there is no role column.
//   • Anyone WITH a manager_email is a subject (gets reviewed) — managers included;
//     they point at THEIR manager, so chains (Sam → Maya → Director) work naturally.
//   • Anyone REFERENCED as someone's manager_email is an approver. A person can be
//     BOTH (a mid-level manager: has a manager AND is one).
//   • Blank manager_email ⇒ participates (peer/approve) but is NOT reviewed this cycle.
// A role/title column is tolerated for back-compat but ignored (noted in the preview).

export const STRUCTURAL_ROLES = ["subject", "peer", "approver", "admin"] as const;
export type StructuralRole = (typeof STRUCTURAL_ROLES)[number];
export type CanonCol = "name" | "email" | "role" | "manager" | "department";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface RowError {
  row: number;
  col: string;
  msg: string;
  value: string;
}
export interface RosterRow {
  name: string;
  email: string;
  /** structural roles inferred from the org chart: subject and/or approver, or [] */
  roles: string[];
  /** gets a review this cycle (== roles includes "subject" == has a manager_email) */
  reviewed: boolean;
  /** already on the cycle's roster — matched + left untouched on import (no dup, no
   *  re-invite, roles/reviews preserved). Only !existing rows are created + invited. */
  existing: boolean;
  /** manager_email, lowercased; "" for a top-level person */
  manager: string;
  department: string;
}
export interface InvitedMember {
  email: string;
  name: string;
  /** the set-password link to surface for manual distribution; null if generation failed */
  link: string | null;
  /** whether the best-effort branded email was accepted by Supabase/SMTP */
  emailed: boolean;
  error?: string;
}
export interface ImportResult {
  ok: boolean;
  imported: number;
  errors: RowError[];
  // a small preview of the imported rows (for the success table); only set on ok
  rows: RosterRow[];
  // per newly-provisioned member: the surfaced activation link + email status (B5)
  invites?: InvitedMember[];
  // non-error preview notes (e.g. an ignored role column) — surfaced, never silent
  info?: string[];
}

// Lenient CSV line split — honours double-quoted fields (so "Lee, Jordan" or a value
// with a comma survives) and trims each cell. The strict preview then confirms.
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

// Header aliases → canonical column (case / underscore / hyphen / spacing tolerant).
// `role`/`title` is still recognised ONLY so we can notice + announce that we ignored it.
const HEADER_ALIASES: Record<string, CanonCol> = {
  name: "name", "full name": "name", fullname: "name", "display name": "name", person: "name",
  email: "email", "e mail": "email", "email address": "email", "work email": "email",
  role: "role", title: "role", type: "role", access: "role",
  manager: "manager", "manager email": "manager", "managers email": "manager", "manager s email": "manager", "reports to": "manager",
  department: "department", dept: "department", team: "department", group: "department",
};
export const canonHeader = (h: string): CanonCol | undefined =>
  HEADER_ALIASES[h.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ")];

const withInfo = (r: ImportResult, info: string[]): ImportResult => (info.length ? { ...r, info } : r);

// Walk each person's manager chain; return the first reporting LOOP found (the cycle
// members in order), or null. Functional graph (one manager each) → a repeat in the
// current path is a cycle. Self-loops are caught earlier with a clearer message.
function findManagerCycle(emails: string[], managerOf: Map<string, string | null>): string[] | null {
  const done = new Set<string>();
  for (const start of emails) {
    if (done.has(start)) continue;
    const idxInPath = new Map<string, number>();
    const path: string[] = [];
    let cur: string | null = start;
    while (cur && managerOf.has(cur) && !done.has(cur)) {
      const seenAt = idxInPath.get(cur);
      if (seenAt !== undefined) return path.slice(seenAt);
      idxInPath.set(cur, path.length);
      path.push(cur);
      cur = managerOf.get(cur) ?? null;
    }
    for (const e of path) done.add(e);
  }
  return null;
}

// Pure parse + validation — performs NO writes. Lenient on input (quoted fields,
// header aliases, case/whitespace); the strict preview shows the NORMALIZED rows for
// confirm. Shared by validate + commit (identical rules). See THE MODEL above.
//
// INCREMENTAL ADD: `existingEmails` are the people already on the cycle's roster.
// manager_email resolves against (file rows) UNION (existing roster), so a new hire can
// point at a manager who's already on the cycle without re-listing them. Rows whose
// email is already on the roster are flagged `existing` (matched + left untouched on
// import); only genuinely new rows are created + invited.
export function parseAndValidateRoster(csvText: string, existingEmails: string[] = []): ImportResult {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2)
    return { ok: false, imported: 0, errors: [{ row: 0, col: "file", msg: "That file has no data rows — include a header row plus at least one person.", value: "" }], rows: [] };

  const rawHeader = parseCsvLine(lines[0]!);
  const colAt: Partial<Record<CanonCol, number>> = {};
  rawHeader.forEach((h, i) => {
    const c = canonHeader(h);
    if (c && colAt[c] === undefined) colAt[c] = i;
  });
  const required: CanonCol[] = ["name", "email"];
  const missing = required.filter((c) => colAt[c] === undefined);
  if (missing.length > 0) {
    return { ok: false, imported: 0, errors: [{ row: 1, col: "header", msg: `Your file needs a column for: ${missing.join(", ")}. Common names work too — "Full name", "E-mail". Add "manager_email" to say who reports to whom.`, value: rawHeader.join(", ") }], rows: [] };
  }

  // back-compat: a role/title column is no longer used — note it, then ignore it.
  const info: string[] = [];
  if (colAt.role !== undefined) info.push("We read the org chart from manager_email — the role/title column was ignored.");

  const errors: RowError[] = [];
  const parsed: { row: number; name: string; email: string; manager: string; department: string }[] = [];
  const seen = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]!);
    const at = (c: CanonCol) => (colAt[c] !== undefined ? (cells[colAt[c]!] ?? "") : "");
    const name = at("name");
    const email = at("email").toLowerCase();
    const manager = at("manager").toLowerCase();
    const department = at("department");
    if (!name) errors.push({ row: i + 1, col: "name", msg: "Name is required.", value: cells.join(", ") });
    if (!EMAIL_RE.test(email)) errors.push({ row: i + 1, col: "email", msg: "That doesn't look like a valid email address.", value: email });
    else if (seen.has(email)) errors.push({ row: i + 1, col: "email", msg: "This email is listed more than once — put each person on a single row.", value: email });
    else seen.add(email);
    if (manager && !EMAIL_RE.test(manager))
      errors.push({ row: i + 1, col: "manager_email", msg: "Manager should be the manager's email address, e.g. manager@company.com — not a name.", value: manager });
    parsed.push({ row: i + 1, name, email, manager, department });
  }
  if (errors.length > 0) return withInfo({ ok: false, imported: 0, errors, rows: [] }, info);

  // org-chart guard rails: no self-manager; manager must resolve against the file OR the
  // EXISTING cycle roster (incremental add — a new hire's manager may already be on the
  // cycle, so we never force re-listing existing people).
  const existingSet = new Set(existingEmails.map((e) => e.trim().toLowerCase()).filter(Boolean));
  const emails = new Set(parsed.map((p) => p.email));
  const known = new Set([...emails, ...existingSet]);
  for (const p of parsed) {
    if (!p.manager) continue;
    if (p.manager === p.email)
      errors.push({ row: p.row, col: "manager_email", msg: "This person lists their own email as their manager — leave manager_email blank for a top-level person.", value: p.manager });
    else if (!known.has(p.manager))
      errors.push({ row: p.row, col: "manager_email", msg: `We couldn't find "${p.manager}" in this file or on the cycle's roster. Add them as a row, or leave manager_email blank for a top-level person.`, value: p.manager });
  }
  if (errors.length > 0) return withInfo({ ok: false, imported: 0, errors, rows: [] }, info);

  // circular chains (A → B → A): reject with the loop spelled out.
  const managerOf = new Map<string, string | null>(parsed.map((p) => [p.email, p.manager || null]));
  const rowOf = new Map(parsed.map((p) => [p.email, p.row]));
  const cycle = findManagerCycle(parsed.map((p) => p.email), managerOf);
  if (cycle && cycle.length > 0) {
    errors.push({
      row: rowOf.get(cycle[0]!) ?? 1,
      col: "manager_email",
      msg: `These people report to each other in a loop: ${cycle.join(" → ")} → ${cycle[0]}. Fix manager_email so the chain ends at a top-level person (blank manager_email).`,
      value: cycle.join(" → "),
    });
    return withInfo({ ok: false, imported: 0, errors, rows: [] }, info);
  }

  // infer roles from the org chart (see THE MODEL). Rows already on the roster are
  // flagged `existing` — the import matches + leaves them untouched.
  const referenced = new Set(parsed.filter((p) => p.manager).map((p) => p.manager));
  const rows: RosterRow[] = parsed.map((p) => {
    const roles: string[] = [];
    if (p.manager) roles.push("subject"); // has a manager ⇒ reviewed
    if (referenced.has(p.email)) roles.push("approver"); // referenced ⇒ approves others
    return { name: p.name, email: p.email, roles, reviewed: roles.includes("subject"), existing: existingSet.has(p.email), manager: p.manager, department: p.department };
  });
  const matched = rows.filter((r) => r.existing).length;
  if (matched > 0)
    info.push(`${matched} ${matched === 1 ? "person is" : "people are"} already on the cycle — matched and left unchanged (no duplicate, no re-invite). Re-importing doesn't change an existing person's manager, roles, or review.`);
  return withInfo({ ok: true, imported: 0, errors: [], rows }, info);
}
