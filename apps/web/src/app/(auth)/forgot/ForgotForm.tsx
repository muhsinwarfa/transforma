"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/atoms";
import { IcoSpinner } from "@/components/atoms/icons";
import { resetPasswordForEmail } from "../auth-actions";
import { AuthShell } from "../AuthShell";

// Forgot-password request. Ported from docs/design/prototype/auth.jsx →
// ForgotScreen, over the real `resetPasswordForEmail` action. Always advances to
// /forgot-sent (the action never reveals whether the email is registered).
export function ForgotForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (busy) return;
    setError("");
    setBusy(true);
    const res = await resetPasswordForEmail(email);
    if (res?.error) {
      setError(res.error);
      setBusy(false);
      return;
    }
    router.push("/forgot-sent");
  };

  return (
    <AuthShell
      footer={
        <Link className="auth-link" href="/login">
          Back to sign in
        </Link>
      }
    >
      <span className="auth-eyebrow">Forgot password</span>
      <h1 className="auth-h">Reset your password.</h1>
      <p className="auth-sub">Enter the email you use for Transforma and we&apos;ll send a reset link.</p>
      <div className="auth-form">
        <div className="field">
          <label className="field-label" htmlFor="fg-email">
            Email
          </label>
          <input
            id="fg-email"
            type="email"
            className={`input ${email ? "is-filled" : ""}`.trim()}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
        </div>
        {error ? (
          <p className="field-msg" style={{ color: "var(--error)" }}>
            {error}
          </p>
        ) : null}
        <Button type="button" variant="primary" lg className="block" onClick={submit} disabled={busy}>
          {busy ? (
            <>
              <IcoSpinner s={18} /> Sending…
            </>
          ) : (
            "Send reset link"
          )}
        </Button>
      </div>
    </AuthShell>
  );
}
