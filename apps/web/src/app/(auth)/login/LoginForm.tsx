"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/atoms";
import { IcoSpinner } from "@/components/atoms/icons";
import { signIn } from "../auth-actions";
import { AuthShell } from "../AuthShell";
import { PasswordInput } from "../PasswordInput";

// Login. Ported from docs/design/prototype/auth.jsx → LoginScreen, re-expressed
// over the existing `signIn` server action (useActionState). The prototype's
// no-op "Keep me signed in" is intentionally not shipped.
export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, null);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");

  return (
    <AuthShell>
      <h1 className="auth-h">Welcome back.</h1>
      <p className="auth-sub">Sign in to your review space.</p>
      <form action={action} className="auth-form">
        <div className="field">
          <label className="field-label" htmlFor="lg-email">
            Email
          </label>
          <input
            id="lg-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className={`input ${email ? "is-filled" : ""}`.trim()}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
        </div>
        <PasswordInput id="lg-pw" name="password" label="Password" value={pw} onChange={setPw} placeholder="Enter your password" />
        <div className="auth-inline-row" style={{ justifyContent: "flex-end" }}>
          <Link className="auth-link" href="/forgot">
            Forgot your password?
          </Link>
        </div>
        {state?.error ? (
          <p className="field-msg" style={{ color: "var(--error)" }}>
            {state.error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" lg className="block" disabled={pending}>
          {pending ? (
            <>
              <IcoSpinner s={18} /> Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </Button>

        {/* Inactive SSO placeholder slot — designed so SSO drops in without rework. */}
        <div className="sso-slot" aria-hidden="true">
          <div className="sso-divider">
            <span>or</span>
          </div>
          <button type="button" className="btn btn-secondary block" disabled title="Single sign-on — available soon">
            <span className="sso-mark">SSO</span> Continue with single sign-on
          </button>
          <span className="sso-note">Single sign-on can be enabled by your administrator.</span>
        </div>
      </form>
    </AuthShell>
  );
}
