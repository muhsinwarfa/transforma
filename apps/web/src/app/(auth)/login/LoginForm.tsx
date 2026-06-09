"use client";
import { useActionState } from "react";
import { Button } from "@/components/atoms";
import { signIn } from "../auth-actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, null);
  return (
    <div className="card pad" style={{ width: 380, maxWidth: "100%" }}>
      <p style={{ font: "var(--label)", textTransform: "uppercase", letterSpacing: "0.18em", color: "var(--ink-3)" }}>
        Welcome back
      </p>
      <h1 style={{ font: "var(--h2)", marginTop: 6, color: "var(--ink-1)" }}>Sign in to Transforma</h1>
      <form action={action} style={{ marginTop: 18, display: "grid", gap: 12 }}>
        <div className="field">
          <label className="field-label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {state?.error ? <p className="field-msg" style={{ color: "var(--error)" }}>{state.error}</p> : null}
        <Button type="submit" variant="primary" lg disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="field-hint" style={{ marginTop: 14 }}>
        Single sign-on can be enabled by your administrator.
      </p>
    </div>
  );
}
