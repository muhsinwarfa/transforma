/**
 * The ONE place the snake_case DB ↔ verbatim camelCase boundary is crossed.
 *
 * Physical Postgres columns are snake_case (`company_id`); the application/API
 * vocabulary is the contract's canonical camelCase (`companyId`). These helpers
 * are the only sanctioned translation. JSONB column VALUES are opaque payloads
 * we author in our own shape, so the transform is applied to TOP-LEVEL column
 * keys only and never recurses into a value — a `sections`/`responses`/
 * `role_labels`/`target` payload passes through untouched.
 */

export function snakeToCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

export function camelToSnake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

type Row = Record<string, unknown>;

/** snake_case DB row → verbatim camelCase domain object (top-level keys only). */
export function rowToDomain<T extends Row = Row>(row: Row): T {
  const out: Row = {};
  for (const key of Object.keys(row)) {
    out[snakeToCamel(key)] = row[key];
  }
  return out as T;
}

/** verbatim camelCase domain object → snake_case row (top-level keys only). */
export function domainToRow<T extends Row = Row>(obj: Row): T {
  const out: Row = {};
  for (const key of Object.keys(obj)) {
    out[camelToSnake(key)] = obj[key];
  }
  return out as T;
}

export function rowsToDomain<T extends Row = Row>(rows: Row[]): T[] {
  return rows.map((r) => rowToDomain<T>(r));
}
