// Normalize a Postgres array value coming back from the raw `pg` driver into a
// JS string[]. node-postgres only auto-parses arrays of BUILT-IN element types; a
// custom enum array (e.g. `app_role[]`) has a per-database dynamic OID the driver
// can't recognise, so it hands back the raw array LITERAL string — e.g.
// "{subject,approver}" — instead of an array. Callers that `.map()` such a value
// crash with "x.map is not a function". Normalize here, at the data boundary, so the
// value is ALWAYS a string[] regardless of how the driver marshalled it.
//
// Tolerates: a real array, a Postgres array literal string ("{a,b}", "{}"), a bare
// single value ("subject"), and null/undefined/non-string — never throws.
export function parsePgTextArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string" && x.length > 0);
  if (raw == null || typeof raw !== "string") return [];

  const s = raw.trim();
  if (s === "" || s === "{}") return [];

  if (s.startsWith("{") && s.endsWith("}")) {
    const inner = s.slice(1, -1);
    if (inner.trim() === "") return [];
    const out: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < inner.length; i++) {
      const c = inner[i];
      if (quoted) {
        if (c === "\\") { cur += inner[i + 1] ?? ""; i++; }
        else if (c === '"') quoted = false;
        else cur += c;
      } else if (c === '"') quoted = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    // unquoted NULL is Postgres' null element; drop it (and any blanks)
    return out.map((x) => x.trim()).filter((x) => x.length > 0 && x.toUpperCase() !== "NULL");
  }

  // a single bare value the driver returned unwrapped
  return [s];
}
