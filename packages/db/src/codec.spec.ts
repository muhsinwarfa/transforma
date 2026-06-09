import { describe, expect, it } from "vitest";
import { camelToSnake, domainToRow, rowToDomain, snakeToCamel } from "./codec.js";

describe("snake↔camel codec (the verbatim TS/API boundary)", () => {
  it("maps canonical names both ways", () => {
    expect(snakeToCamel("company_id")).toBe("companyId");
    expect(snakeToCamel("review_draft_id")).toBe("reviewDraftId");
    expect(snakeToCamel("input_author_id")).toBe("inputAuthorId");
    expect(camelToSnake("companyId")).toBe("company_id");
    expect(camelToSnake("reviewDraftId")).toBe("review_draft_id");
  });

  it("transforms TOP-LEVEL keys only and leaves jsonb payloads untouched", () => {
    const row = { company_id: "c", review_draft_id: "d", sections: { areas_to_grow: "x" } };
    const dom = rowToDomain<{ companyId: string; reviewDraftId: string; sections: unknown }>(row);
    expect(dom.companyId).toBe("c");
    expect(dom.reviewDraftId).toBe("d");
    expect(dom.sections).toEqual({ areas_to_grow: "x" }); // payload key not mangled
  });

  it("round-trips", () => {
    expect(domainToRow(rowToDomain({ company_id: "c", employee_id: "e" }))).toEqual({
      company_id: "c",
      employee_id: "e",
    });
  });
});
