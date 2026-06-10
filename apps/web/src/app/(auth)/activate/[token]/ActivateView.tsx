"use client";
import Link from "next/link";
import { Button } from "@/components/atoms";
import { IcoCheckCircle, IcoClock } from "@/components/atoms/icons";
import type { TokenState } from "@/lib/auth/tokens";
import { AuthShell } from "../../AuthShell";
import { SetPasswordForm } from "../../SetPasswordForm";
import { activateAndSetPassword } from "../../auth-actions";

// Activation landing. Ported from docs/design/prototype/auth.jsx
// (ActivationValid + ActivationState). Valid → the shared SetPasswordForm;
// expired/used/missing → the matching status states pointing at the
// administrator (no "send me a new link" — links are admin-issued).
export function ActivateView({
  token,
  state,
  email,
}: {
  token: string;
  state: TokenState;
  email: string | null;
}) {
  if (state === "valid") {
    return <ActivationValid token={token} email={email ?? ""} />;
  }
  return <ActivationState state={state} />;
}

function ActivationValid({ token, email }: { token: string; email: string }) {
  const onSubmit = async (password: string) => {
    const fd = new FormData();
    fd.set("email", email);
    fd.set("password", password);
    return activateAndSetPassword(token, null, fd);
  };
  return (
    <AuthShell
      footer={
        <span>
          This invite is for <strong>{email}</strong>
        </span>
      }
    >
      <span className="auth-eyebrow">You&apos;re invited</span>
      <h1 className="auth-h">Set up your account.</h1>
      <p className="auth-sub">
        You&apos;ve been invited to take part in H1 2026 Review. Choose a password to activate your account.
      </p>
      <SetPasswordForm cta="Activate account" busyLabel="Saving…" onSubmit={onSubmit} />
    </AuthShell>
  );
}

function ActivationState({ state }: { state: Exclude<TokenState, "valid"> }) {
  // `used` reads as a success (account already active); expired/missing read as a
  // warning. Either way the next step is the administrator, never a self-serve link.
  const used = state === "used";
  const v = used
    ? {
        glyph: "ok" as const,
        ico: <IcoCheckCircle s={26} />,
        title: "This link has already been used",
        body: "Your account is already active. Sign in with the password you set when you activated it.",
        cta: "Go to sign in",
      }
    : {
        glyph: "warn" as const,
        ico: <IcoClock s={26} />,
        title: "This link has expired",
        body: "Activation links are single-use and valid for 7 days. Your administrator can send you a fresh one.",
        cta: "Back to sign in",
      };
  return (
    <AuthShell
      footer={
        <span>
          Need help? <Link href="/login">Contact your administrator</Link>
        </span>
      }
    >
      <div className={`auth-status-mark ${v.glyph}`}>{v.ico}</div>
      <h1 className="auth-h">{v.title}</h1>
      <p className="auth-sub">{v.body}</p>
      <div className="auth-form">
        <Link href="/login">
          <Button type="button" variant="primary" lg className="block">
            {v.cta}
          </Button>
        </Link>
      </div>
    </AuthShell>
  );
}
