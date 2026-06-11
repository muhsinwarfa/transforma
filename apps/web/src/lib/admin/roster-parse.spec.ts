import { describe, expect, it } from "vitest";
import { parseAndValidateRoster, type RosterRow } from "./roster-parse";

const ok = (csv: string) => {
  const r = parseAndValidateRoster(csv);
  if (!r.ok) throw new Error(`expected ok; got errors: ${JSON.stringify(r.errors)}`);
  return r;
};
const fail = (csv: string) => {
  const r = parseAndValidateRoster(csv);
  if (r.ok) throw new Error("expected failure; parsed clean");
  return r;
};
const by = (r: { rows: RosterRow[] }, email: string) => r.rows.find((row) => row.email === email)!;

// THE MODEL: manager_email is the whole org chart; there is no role column.
describe("parseAndValidateRoster — org chart drives roles (chains)", () => {
  // Sam, Jordan -> Maya -> Avery (director, blank). The canonical 4-row chain.
  const CHAIN = [
    "name,email,manager_email,department",
    "Sam Rivera,sam@example.com,maya@example.com,Ops",
    "Jordan Lee,jordan@example.com,maya@example.com,Ops",
    "Maya Chen,maya@example.com,avery@example.com,Ops",
    "Avery Diaz,avery@example.com,,Ops",
  ].join("\n");

  it("an IC with a manager is a reviewed subject", () => {
    expect(by(ok(CHAIN), "sam@example.com").roles).toEqual(["subject"]);
    expect(by(ok(CHAIN), "sam@example.com").reviewed).toBe(true);
  });

  it("a mid-level manager is BOTH subject and approver, and is reviewed", () => {
    const maya = by(ok(CHAIN), "maya@example.com");
    expect(maya.roles).toEqual(["subject", "approver"]); // has a manager (Avery) AND is one (Sam/Jordan)
    expect(maya.reviewed).toBe(true);
  });

  it("a top-level person (blank manager_email) referenced as a manager is approver-only and NOT reviewed", () => {
    const avery = by(ok(CHAIN), "avery@example.com");
    expect(avery.roles).toEqual(["approver"]);
    expect(avery.reviewed).toBe(false);
  });

  it("chains resolve naturally — every IC and the manager are reviewed, the director is not", () => {
    const r = ok(CHAIN);
    expect(r.rows.filter((x) => x.reviewed).map((x) => x.email).sort()).toEqual(
      ["jordan@example.com", "maya@example.com", "sam@example.com"],
    );
  });

  it("a person with no manager and never referenced participates but is not reviewed (roles [])", () => {
    const csv = ["name,email,manager_email", "Pat,pat@example.com,boss@example.com", "Boss,boss@example.com,", "Lonervoter,lone@example.com,"].join("\n");
    const r = ok(csv);
    expect(by(r, "lone@example.com").roles).toEqual([]); // blank manager + not referenced
    expect(by(r, "lone@example.com").reviewed).toBe(false);
    expect(by(r, "boss@example.com").roles).toEqual(["approver"]); // referenced by Pat
  });
});

describe("parseAndValidateRoster — guard rails", () => {
  it("rejects a manager_email that isn't a row in the file", () => {
    const csv = ["name,email,manager_email", "Sam,sam@example.com,ghost@example.com"].join("\n");
    const e = fail(csv).errors[0]!;
    expect(e.col).toBe("manager_email");
    expect(e.msg).toContain("isn't in this file");
  });

  it("rejects a self-manager (own email as manager_email)", () => {
    const csv = ["name,email,manager_email", "Sam,sam@example.com,sam@example.com"].join("\n");
    expect(fail(csv).errors[0]!.msg).toContain("their own email");
  });

  it("rejects a 2-person reporting loop A <-> B", () => {
    const csv = ["name,email,manager_email", "A,a@example.com,b@example.com", "B,b@example.com,a@example.com"].join("\n");
    const e = fail(csv).errors[0]!;
    expect(e.msg).toContain("report to each other in a loop");
    expect(e.msg).toContain("a@example.com");
    expect(e.msg).toContain("b@example.com");
  });

  it("rejects a longer loop A -> B -> C -> A", () => {
    const csv = ["name,email,manager_email", "A,a@example.com,b@example.com", "B,b@example.com,c@example.com", "C,c@example.com,a@example.com"].join("\n");
    expect(fail(csv).errors[0]!.msg).toContain("report to each other in a loop");
  });

  it("accepts a deep acyclic chain (no false loop positive)", () => {
    const csv = ["name,email,manager_email", "A,a@example.com,b@example.com", "B,b@example.com,c@example.com", "C,c@example.com,d@example.com", "D,d@example.com,"].join("\n");
    expect(ok(csv).rows.length).toBe(4);
  });

  it("rejects a duplicate email", () => {
    const csv = ["name,email,manager_email", "Sam,sam@example.com,", "Sam Again,sam@example.com,"].join("\n");
    expect(fail(csv).errors.some((e) => e.col === "email" && e.msg.includes("more than once"))).toBe(true);
  });

  it("rejects a name in manager_email", () => {
    const csv = ["name,email,manager_email", "Sam,sam@example.com,Maya Chen"].join("\n");
    expect(fail(csv).errors[0]!.col).toBe("manager_email");
  });

  it("rejects an invalid email and a missing required column", () => {
    expect(fail(["name,email", "Sam,nope"].join("\n")).errors.some((e) => e.col === "email")).toBe(true);
    expect(fail(["department", "Ops"].join("\n")).errors[0]!.col).toBe("header");
  });
});

describe("parseAndValidateRoster — back-compat + lenient input", () => {
  it("ignores a legacy role/title column and says so, still inferring from manager_email", () => {
    const csv = ["name,email,role,manager_email", "Sam,sam@example.com,Product Manager,maya@example.com", "Maya,maya@example.com,VP,"].join("\n");
    const r = ok(csv);
    expect(r.info?.some((n) => n.includes("ignored"))).toBe(true);
    expect(by(r, "sam@example.com").roles).toEqual(["subject"]);
    expect(by(r, "maya@example.com").roles).toEqual(["approver"]); // referenced, blank manager → not reviewed
  });

  it("accepts header aliases (Full name / Work Email / Reports To / Dept)", () => {
    const csv = ["Full name,Work Email,Reports To,Dept", "Sam,sam@example.com,maya@example.com,Ops", "Maya,maya@example.com,,Ops"].join("\n");
    const r = ok(csv);
    expect(by(r, "maya@example.com").roles).toEqual(["approver"]);
    expect(by(r, "sam@example.com").department).toBe("Ops");
  });

  it("honours quoted fields containing commas", () => {
    const csv = ['name,email,manager_email', '"Lee, Jordan",jordan@example.com,'].join("\n");
    expect(ok(csv).rows[0]!.name).toBe("Lee, Jordan");
  });
});
