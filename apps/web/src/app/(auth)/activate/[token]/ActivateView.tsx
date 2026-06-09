"use client";
import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/atoms";
import type { TokenState } from "@/lib/auth/tokens";
import { activateAndSetPassword, type AuthFormState } from "../../auth-actions";

export function ActivateView({
  token,
  state,
  email,
}: {
  token: string;
  state: TokenState;
  email: string | null;
}) {
  if (state !== "valid") {
    const msg =
      state === "expired"
        ? "This activation link has expired."
        : state === "used"
          ? "This activation link has already been used."
          : "This activation link isn't valid.";
    return (
      <div className="card pad" style={{ width: 380, maxWidth: "100%" }}>
        <h1 style={{ font: "var(--h2)", color: "var(--ink-1)" }}>{msg}</h1>
        <p className="field-hint" style={{ marginTop: 10 }}>
          Ask your administrator for a new link, or sign in if you&apos;ve already activated.
        </p>
        <div style={{ marginTop: 16 }}>
          <Link href="/login">
            <Button variant="secondary">Go to sign in</Button>
          </Link>
        </div>
      </div>
    );
  }
  return <SetPasswordForm token={token} email={email ?? ""} />;
}

function SetPasswordForm({ token, email }: { token: string; email: string }) {
  const bound = activateAndSetPassword.bind(null, token);
  const [result, action, pending] = useActionState<AuthFormState | null, FormData>(bound, null);
  return (
    <div className="card pad" style={{ width: 380, maxWidth: "100%" }}>
      <p style={{ font: "var(--label)", textTransform: "uppercase", letterSpacing: "0.18em", color: "var(--ink-3)" }}>
        You&apos;re invited
      </p>
      <h1 style={{ font: "var(--h2)", marginTop: 6, color: "var(--ink-1)" }}>Set your password</h1>
      <p className="field-hint" style={{ marginTop: 8 }}>
        Activating <strong>{email}</strong>.
      </p>
      <form action={action} style={{ marginTop: 18, display: "grid", gap: 12 }}>
        <input type="hidden" name="email" value={email} />
        <div className="field">
          <label className="field-label" htmlFor="password">Choose a password</label>
          <input
            className="input"
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <span className="field-hint">At least 8 characters.</span>
        </div>
        {result?.error ? <p className="field-msg" style={{ color: "var(--error)" }}>{result.error}</p> : null}
        <Button type="submit" variant="primary" lg disabled={pending}>
          {pending ? "Activating…" : "Activate account"}
        </Button>
      </form>
    </div>
  );
}
