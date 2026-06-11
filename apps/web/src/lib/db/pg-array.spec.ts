import { describe, expect, it } from "vitest";
import { parsePgTextArray } from "./pg-array";

// Regression for the /admin/roster crash (digest 1613091571): the raw pg driver
// returned structural_roles (app_role[]) as the array LITERAL string
// "{subject,approver}", and RosterMembers did `roles.map(...)` → "roles.map is not a
// function". The boundary must always yield a string[] so the UI can map it safely.
describe("parsePgTextArray — Postgres array normalization", () => {
  it("parses the EXACT prod shape that crashed: a literal string '{subject,approver}'", () => {
    const roles = parsePgTextArray("{subject,approver}");
    expect(roles).toEqual(["subject", "approver"]);
    // the crash was `.map` on a string — prove the normalized value maps cleanly
    expect(() => roles.map((r) => r)).not.toThrow();
  });

  it("parses a single-role literal '{subject}'", () => {
    expect(parsePgTextArray("{subject}")).toEqual(["subject"]);
  });

  it("returns [] for the empty-array literal '{}'", () => {
    expect(parsePgTextArray("{}")).toEqual([]);
  });

  it("passes through an already-parsed array (the built-in-type path)", () => {
    expect(parsePgTextArray(["subject", "approver"])).toEqual(["subject", "approver"]);
  });

  it("tolerates a bare single value the driver returned unwrapped", () => {
    expect(parsePgTextArray("subject")).toEqual(["subject"]);
  });

  it("returns [] for null / undefined (missing roles)", () => {
    expect(parsePgTextArray(null)).toEqual([]);
    expect(parsePgTextArray(undefined)).toEqual([]);
    expect(parsePgTextArray("")).toEqual([]);
  });

  it("returns [] for unexpected non-string, non-array shapes (never throws)", () => {
    expect(parsePgTextArray(42)).toEqual([]);
    expect(parsePgTextArray({})).toEqual([]);
  });

  it("drops NULL elements and blanks; honours quoted elements with commas", () => {
    expect(parsePgTextArray("{subject,NULL,approver}")).toEqual(["subject", "approver"]);
    expect(parsePgTextArray('{"a, b",c}')).toEqual(["a, b", "c"]);
  });

  it("filters non-string / empty entries out of a real array", () => {
    expect(parsePgTextArray(["subject", "", null, "approver"] as unknown[])).toEqual(["subject", "approver"]);
  });
});

// Mirror of the listRosterMembers boundary mapping: a row whose driver-returned
// structural_roles is the literal string must produce a mappable roles array.
describe("listRosterMembers boundary — roles is always mappable", () => {
  it("maps a Warfa-shaped row (roles as a literal string) without throwing", () => {
    const row = { id: "r1", display_name: "Hodan", email: "hodan@warfa.example", structural_roles: "{subject,approver}" };
    const mapped = { id: row.id, name: row.display_name, email: row.email, roles: parsePgTextArray(row.structural_roles) };
    expect(mapped.roles).toEqual(["subject", "approver"]);
    expect(mapped.roles.map((r) => r.toUpperCase())).toEqual(["SUBJECT", "APPROVER"]);
  });
});
