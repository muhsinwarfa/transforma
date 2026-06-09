import "server-only";
import { createHash } from "node:crypto";
import { TransformaError } from "@transforma/review-core";
import { pgQuery } from "@/lib/db/pg";

export interface ConsumedToken {
  rosterMemberId: string;
  companyId: string;
}

export type TokenState = "valid" | "expired" | "used" | "missing";

export interface TokenValidation {
  state: TokenState;
  /** the email bound to the token (the user sets only a password, not their email) */
  email: string | null;
}

/**
 * Read-only validation for the activation landing screen — branches the UI
 * (valid → set password; expired/used → re-request / sign-in) WITHOUT consuming
 * the token (so a link preview/prefetch can't burn it). The actual consume
 * happens atomically on the set-password submit. The email is bound to the token.
 */
export async function validateActivationToken(rawToken: string): Promise<TokenValidation> {
  const hash = createHash("sha256").update(rawToken).digest();
  const { rows } = await pgQuery<{ email: string; consumed_at: string | null; expired: boolean }>(
    `select rm.email, at.consumed_at, (at.expires_at <= now()) as expired
       from activation_tokens at
       join roster_members rm on rm.id = at.roster_member_id
      where at.token_hash = $1`,
    [hash],
  );
  const row = rows[0];
  if (!row) return { state: "missing", email: null };
  if (row.consumed_at) return { state: "used", email: row.email };
  if (row.expired) return { state: "expired", email: row.email };
  return { state: "valid", email: row.email };
}

/**
 * PROC-01 — validate + atomically consume the single-use activation token.
 *
 * The raw token is never stored — only its sha-256 hash (a Buffer → bytea). The
 * single-use / fail-closed guarantee lives inside `app.consume_activation_token`
 * (consumed_at IS NULL AND expires_at > now() compare-and-set; zero rows ⇒ RAISE).
 * We call it over a direct pg connection with a real `Buffer` bytea param so the
 * marshalling is exact and identical to what the embedded-PG gate test proves.
 * One fail-closed path covers expired / used / missing — no leak about which.
 */
export async function consumeActivationToken(rawToken: string, authUserId: string): Promise<ConsumedToken> {
  const hash = createHash("sha256").update(rawToken).digest(); // Buffer ⇒ bytea
  try {
    const { rows } = await pgQuery<{ roster_member_id: string; company_id: string }>(
      "select * from app.consume_activation_token($1::bytea, $2::uuid)",
      [hash, authUserId],
    );
    const row = rows[0];
    if (!row) throw new TransformaError("ERR_TOKEN_INVALID", "Activation link is invalid.", 400);
    return { rosterMemberId: row.roster_member_id, companyId: row.company_id };
  } catch (e) {
    if (e instanceof TransformaError) throw e;
    // the function RAISEs 'ERR_TOKEN_INVALID' for expired / used / missing
    throw new TransformaError("ERR_TOKEN_INVALID", "Activation link is invalid, expired, or already used.", 400);
  }
}
