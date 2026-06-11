// Pure roster-CSV parsing + validation — NO writes, NO server-only deps. Extracted
// from the admin server actions so the lenient parser, the role inference, and the
// teaching error copy are unit-testable. Imported by `(app)/admin/actions.ts`, which
// re-exports the data types for the import UI.

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
  role: string;
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
const HEADER_ALIASES: Record<string, CanonCol> = {
  name: "name", "full name": "name", fullname: "name", "display name": "name", person: "name",
  email: "email", "e mail": "email", "email address": "email", "work email": "email",
  role: "role", title: "role", type: "role", access: "role",
  manager: "manager", "manager email": "manager", "managers email": "manager", "manager s email": "manager", "reports to": "manager",
  department: "department", dept: "department", team: "department", group: "department",
};
export const canonHeader = (h: string): CanonCol | undefined =>
  HEADER_ALIASES[h.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ")];

// Role words → structural role: the structural names, common synonyms, AND the
// tenant's own configured labels (whatever each role is called in this workspace).
export function roleResolver(roleLabels: Record<string, string>): (raw: string) => StructuralRole | null {
  const map = new Map<string, StructuralRole>();
  const add = (k: string, r: StructuralRole) => {
    const key = k.trim().toLowerCase().replace(/\s+/g, " ");
    if (key) map.set(key, r);
  };
  STRUCTURAL_ROLES.forEach((r) => add(r, r));
  ["team member", "employee", "reviewee", "member", "staff", "individual contributor"].forEach((k) => add(k, "subject"));
  ["people manager", "lead", "supervisor", "reviewer"].forEach((k) => add(k, "approver"));
  ["administrator", "people ops", "people operations", "hr", "hr admin", "workspace admin"].forEach((k) => add(k, "admin"));
  for (const r of STRUCTURAL_ROLES) add(roleLabels[r] ?? "", r);
  return (raw) => map.get(raw.trim().toLowerCase().replace(/\s+/g, " ")) ?? null;
}

// Pure parse + validation — performs NO writes. Lenient on input (quoted fields,
// header aliases, role synonyms + tenant labels, case/whitespace); the strict preview
// shows the NORMALIZED rows for confirm. Shared by validate + commit (identical rules).
//
// ROLE is OPTIONAL and INFERRED: anyone who appears as someone's manager_email is an
// approver; everyone else defaults to subject. Explicit subject/approver values
// override. The admin capability is assigned in setup, never via CSV; peer is granted
// automatically by the approval trigger — neither is a CSV value. Error copy is built
// from the tenant's own role labels (never hardcoded role words).
export function parseAndValidateRoster(csvText: string, roleLabels: Record<string, string>): ImportResult {
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
    return { ok: false, imported: 0, errors: [{ row: 1, col: "header", msg: `Your file needs a column for: ${missing.join(", ")}. Common names work too — "Full name", "E-mail". Add "manager_email" to set reporting lines.`, value: rawHeader.join(", ") }], rows: [] };
  }

  const resolveRole = roleResolver(roleLabels);
  // tenant labels for the teaching copy (lint-safe fallbacks; never hardcode role words)
  const subjectLabel = roleLabels.subject || "team member";
  const approverLabel = roleLabels.approver || "manager";
  const adminLabel = roleLabels.admin || "the admin role";
  const orRoles = `${subjectLabel} or ${approverLabel}`;
  const errors: RowError[] = [];
  // first pass: parse + per-row validation + the EXPLICIT role (if any).
  const parsed: { name: string; email: string; explicitRole: StructuralRole | null; manager: string; department: string }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]!);
    const at = (c: CanonCol) => (colAt[c] !== undefined ? (cells[colAt[c]!] ?? "") : "");
    const name = at("name");
    const email = at("email").toLowerCase();
    const roleRaw = at("role").trim();
    const manager = at("manager").toLowerCase();
    const department = at("department");
    if (!name) errors.push({ row: i + 1, col: "name", msg: "Name is required.", value: cells.join(", ") });
    if (!EMAIL_RE.test(email)) errors.push({ row: i + 1, col: "email", msg: "That doesn't look like a valid email address.", value: email });

    let explicitRole: StructuralRole | null = null;
    if (roleRaw) {
      const r = resolveRole(roleRaw);
      if (r === "subject" || r === "approver") explicitRole = r;
      else if (r === "admin")
        errors.push({ row: i + 1, col: "role", msg: `${adminLabel} is assigned during setup, not the roster — leave this blank, or use ${orRoles}.`, value: roleRaw });
      else if (r === "peer")
        errors.push({ row: i + 1, col: "role", msg: `${roleLabels.peer || "Peer"} access is automatic (granted when nominations are approved) — leave this blank, or use ${orRoles}.`, value: roleRaw });
      else
        errors.push({ row: i + 1, col: "role", msg: `"${roleRaw}" looks like a job title — this column is the person's part in the review cycle, not their title. Leave it blank (we infer it from manager_email) or use ${orRoles}.`, value: roleRaw });
    }
    if (manager && !EMAIL_RE.test(manager))
      errors.push({ row: i + 1, col: "manager_email", msg: "Manager should be the manager's email address, e.g. manager@company.com — not a name.", value: manager });

    parsed.push({ name, email, explicitRole, manager, department });
  }
  // all-or-nothing: any bad row fails the whole file (contract: validate-before-import)
  if (errors.length > 0) return { ok: false, imported: 0, errors, rows: [] };

  // second pass: infer the role. Anyone listed as a manager_email becomes an approver;
  // everyone else defaults to subject. An explicit value wins.
  const managerEmails = new Set(parsed.map((p) => p.manager).filter(Boolean));
  const rows: RosterRow[] = parsed.map((p) => ({
    name: p.name,
    email: p.email,
    manager: p.manager,
    department: p.department,
    role: p.explicitRole ?? (managerEmails.has(p.email) ? "approver" : "subject"),
  }));
  return { ok: true, imported: 0, errors: [], rows };
}
