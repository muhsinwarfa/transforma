import { describe, expect, it } from "vitest";
import { parseAndValidateRoster, type RosterRow } from "./roster-parse";

const ok = (csv: string, existing: string[] = []) => {
  const r = parseAndValidateRoster(csv, existing);
  if (!r.ok) throw new Error(`expected ok; got errors: ${JSON.stringify(r.errors)}`);
  return r;
};
const fail = (csv: string, existing: string[] = []) => {
  const r = parseAndValidateRoster(csv, existing);
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
  it("rejects a manager_email in neither the file nor the cycle roster", () => {
    const csv = ["name,email,manager_email", "Sam,sam@example.com,ghost@example.com"].join("\n");
    const e = fail(csv).errors[0]!;
    expect(e.col).toBe("manager_email");
    expect(e.msg).toMatch(/couldn't find|this file or/i);
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

// The real-world "add a new hire mid-cycle" workflow: a single-row upload whose manager
// is already on the cycle, with no need to re-list existing people. manager_email
// resolves against (file rows) UNION (existing cycle roster).
describe("parseAndValidateRoster — incremental add against an existing roster", () => {
  it("(a) a new hire whose manager is an EXISTING cycle member passes — no manager row needed", () => {
    const csv = ["name,email,manager_email", "New Hire,newhire@example.com,hodan@example.com"].join("\n");
    const r = ok(csv, ["hodan@example.com", "other@example.com"]); // Hodan already a Manager this cycle
    expect(r.rows.length).toBe(1);
    const nh = by(r, "newhire@example.com");
    expect(nh.roles).toEqual(["subject"]);
    expect(nh.existing).toBe(false);
    // the manager is NOT echoed as a row — the file stays a clean single-row add
    expect(r.rows.find((x) => x.email === "hodan@example.com")).toBeUndefined();
  });

  it("still errors when the manager is in NEITHER the file nor the cycle roster", () => {
    const csv = ["name,email,manager_email", "New,new@example.com,ghost@example.com"].join("\n");
    expect(fail(csv, ["hodan@example.com"]).errors[0]!.col).toBe("manager_email");
  });

  it("(b) re-importing an EXISTING member flags it `existing` (matched, not a duplicate) + notes it", () => {
    const csv = ["name,email,manager_email", "Hodan,hodan@example.com,"].join("\n");
    const r = ok(csv, ["hodan@example.com"]);
    expect(by(r, "hodan@example.com").existing).toBe(true);
    expect(r.info?.some((n) => /already on the cycle/i.test(n))).toBe(true);
    // (importRoster filters !existing, so this row is matched + left untouched: no
    //  duplicate insert, no re-invite, roles/reviews preserved.)
  });

  it("mixes new + existing in one file — only the genuinely new row is flagged for creation", () => {
    const csv = ["name,email,manager_email", "Hodan,hodan@example.com,", "New,new@example.com,hodan@example.com"].join("\n");
    const r = ok(csv, ["hodan@example.com"]); // Hodan already on roster; New reports to Hodan
    expect(by(r, "hodan@example.com").existing).toBe(true);
    expect(by(r, "new@example.com").existing).toBe(false);
    expect(by(r, "new@example.com").roles).toEqual(["subject"]);
  });

  it("matching is case-insensitive (existing email in any case)", () => {
    const csv = ["name,email,manager_email", "New,new@example.com,HODAN@Example.com"].join("\n");
    const r = ok(csv, ["hodan@example.com"]);
    expect(by(r, "new@example.com").roles).toEqual(["subject"]); // resolved against existing, no error
  });

  it("default existing=[] preserves file-only behaviour (no regression)", () => {
    const csv = ["name,email,manager_email", "A,a@example.com,b@example.com", "B,b@example.com,"].join("\n");
    expect(by(ok(csv), "b@example.com").roles).toEqual(["approver"]);
    expect(by(ok(csv), "a@example.com").existing).toBe(false);
  });

  it("matches the existing-flag case-insensitively (existing email supplied in mixed case)", () => {
    const csv = ["name,email,manager_email", "Hodan,hodan@example.com,"].join("\n");
    expect(by(ok(csv, ["HODAN@Example.com"]), "hodan@example.com").existing).toBe(true);
  });

  it("self-manager still errors even when the email is an existing member", () => {
    const csv = ["name,email,manager_email", "Hodan,hodan@example.com,hodan@example.com"].join("\n");
    expect(fail(csv, ["hodan@example.com"]).errors[0]!.msg).toContain("their own email");
  });

  it("a file row can be a manager (referenced) while its own manager is an existing member", () => {
    // B is existing-only (not a file row); A reports to B (existing) and manages C (file).
    const csv = ["name,email,manager_email", "A,a@example.com,b@example.com", "C,c@example.com,a@example.com"].join("\n");
    const r = ok(csv, ["b@example.com"]);
    expect(by(r, "a@example.com").roles).toEqual(["subject", "approver"]); // has mgr B (existing) + referenced by C
    expect(by(r, "c@example.com").roles).toEqual(["subject"]);
    expect(by(r, "a@example.com").existing).toBe(false);
  });
});
