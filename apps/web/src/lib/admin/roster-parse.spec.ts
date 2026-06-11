import { describe, expect, it } from "vitest";
import { parseAndValidateRoster } from "./roster-parse";

// Custom (non-default) tenant labels — keeps this spec free of the literal role words
// contract-lint bans, and proves the parser + error copy are label-driven, not hardcoded.
const LABELS = { subject: "Crew", peer: "Peer", approver: "Lead", admin: "Owner" };

const ok = (csv: string, labels = LABELS) => {
  const r = parseAndValidateRoster(csv, labels);
  if (!r.ok) throw new Error(`expected ok; got errors: ${JSON.stringify(r.errors)}`);
  return r;
};
const fail = (csv: string, labels = LABELS) => {
  const r = parseAndValidateRoster(csv, labels);
  if (r.ok) throw new Error("expected failure; parsed clean");
  return r;
};
const byEmail = (r: ReturnType<typeof ok>, email: string) => r.rows.find((row) => row.email === email)!;

describe("parseAndValidateRoster — role is optional and inferred", () => {
  it("infers approver for anyone listed as a manager_email; subject for everyone else", () => {
    const csv = [
      "name,email,role,manager_email,department",
      "Alice,alice@example.com,,bob@example.com,Ops",
      "Carol,carol@example.com,,bob@example.com,Ops",
      "Bob,bob@example.com,,,Ops",
    ].join("\n");
    const r = ok(csv);
    expect(byEmail(r, "alice@example.com").role).toBe("subject");
    expect(byEmail(r, "carol@example.com").role).toBe("subject");
    expect(byEmail(r, "bob@example.com").role).toBe("approver"); // appears as a manager_email
  });

  it("works with NO role column at all (role fully inferred)", () => {
    const csv = ["name,email,manager_email", "Alice,alice@example.com,bob@example.com", "Bob,bob@example.com,"].join("\n");
    const r = ok(csv);
    expect(byEmail(r, "bob@example.com").role).toBe("approver");
    expect(byEmail(r, "alice@example.com").role).toBe("subject");
  });

  it("matches manager_email case-insensitively", () => {
    const csv = ["name,email,manager_email", "Alice,alice@example.com,BOB@Example.com", "Bob,bob@example.com,"].join("\n");
    expect(byEmail(ok(csv), "bob@example.com").role).toBe("approver");
  });

  it("an explicit role overrides the inference", () => {
    // Bob is a manager_email (would infer approver) but is explicitly the subject label.
    const csv = ["name,email,role,manager_email", "Alice,alice@example.com,,bob@example.com", "Bob,bob@example.com,Crew,"].join("\n");
    expect(byEmail(ok(csv), "bob@example.com").role).toBe("subject");
  });
});

describe("parseAndValidateRoster — teaching errors", () => {
  it("a job-title-looking role value is rejected with a teaching message in tenant labels", () => {
    const csv = ["name,email,role", "Pat,pat@example.com,Product Manager"].join("\n");
    const r = fail(csv);
    const e = r.errors[0]!;
    expect(e.col).toBe("role");
    expect(e.msg).toContain("looks like a job title");
    expect(e.msg).toContain("Crew or Lead"); // tenant labels, not hardcoded role words
  });

  it("a name (not an email) in manager_email is rejected with a teaching message", () => {
    const csv = ["name,email,manager_email", "Pat,pat@example.com,Bob Jones"].join("\n");
    const r = fail(csv);
    const e = r.errors[0]!;
    expect(e.col).toBe("manager_email");
    expect(e.msg).toContain("email address");
  });

  it("the admin label is rejected as a CSV role (assigned in setup, never via CSV)", () => {
    const csv = ["name,email,role", "Pat,pat@example.com,Owner"].join("\n");
    const r = fail(csv);
    expect(r.errors[0]!.msg).toContain("assigned during setup");
  });

  it("'people ops' synonym is also rejected as a CSV role", () => {
    const csv = ["name,email,role", "Pat,pat@example.com,people ops"].join("\n");
    expect(fail(csv).errors[0]!.msg).toContain("assigned during setup");
  });

  it("the peer label is rejected as a CSV role (granted by the approval trigger)", () => {
    const csv = ["name,email,role", "Pat,pat@example.com,Peer"].join("\n");
    expect(fail(csv).errors[0]!.msg).toContain("automatic");
  });

  it("an invalid email fails the row", () => {
    const csv = ["name,email", "Pat,not-an-email"].join("\n");
    expect(fail(csv).errors.some((e) => e.col === "email")).toBe(true);
  });

  it("a missing name/email column fails the whole file", () => {
    const csv = ["role,department", "Crew,Ops"].join("\n");
    expect(fail(csv).errors[0]!.col).toBe("header");
  });
});

describe("parseAndValidateRoster — lenient input", () => {
  it("accepts header aliases (Full name / Work Email / Reports To / Dept)", () => {
    const csv = ["Full name,Work Email,Reports To,Dept", "Alice,alice@example.com,bob@example.com,Ops", "Bob,bob@example.com,,Ops"].join("\n");
    const r = ok(csv);
    expect(byEmail(r, "bob@example.com").role).toBe("approver");
    expect(byEmail(r, "alice@example.com").department).toBe("Ops");
  });

  it("honours quoted fields containing commas", () => {
    const csv = ['name,email', '"Lee, Jordan",jordan@example.com'].join("\n");
    expect(ok(csv).rows[0]!.name).toBe("Lee, Jordan");
  });

  it("resolves the tenant's own approver label as an explicit role", () => {
    const csv = ["name,email,role", "Bob,bob@example.com,Lead"].join("\n");
    expect(ok(csv).rows[0]!.role).toBe("approver");
  });
});
