import { q } from "../db.js";

/**
 * Fail-loud audit-key gate, run at worker boot BEFORE any job loop. Migration 1700
 * removed the dev-insecure fallback entirely — app.audit_key() RAISES if the Vault
 * audit-chain key is absent/unreadable. So this check throws when the key isn't
 * configured, and the worker must REFUSE TO START rather than ever write audit
 * entries that can't be produced (and, by construction, can never silently fall
 * back to an insecure key). Reads only the key's length — never the secret itself.
 */
export async function assertAuditKeyConfigured(): Promise<void> {
  try {
    const { rows } = await q<{ ok: boolean }>("select (length(app.audit_key()) >= 32) as ok");
    if (!rows[0]?.ok) throw new Error("audit_chain_key is present but invalid");
  } catch (e) {
    throw new Error(
      "FATAL: audit-chain key is not configured/readable in Vault — refusing to start so prod never writes audit entries under an insecure key. (" +
        (e instanceof Error ? e.message : String(e)) +
        ")",
    );
  }
}
