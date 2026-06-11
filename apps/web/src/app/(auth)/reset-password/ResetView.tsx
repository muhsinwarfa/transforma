"use client";
import Link from "next/link";
import { Button } from "@/components/atoms";
import { AuthShell } from "../AuthShell";
import { SetPasswordForm } from "../SetPasswordForm";
import { updatePasswordFromRecovery } from "../auth-actions";

// Reset-password (recovery). Ported from docs/design/prototype/auth.jsx →
// SetPasswordScreen(mode='reset'). Reuses the SHARED SetPasswordForm; the submit
// exchanges the recovery `code` for a session and sets the new password.
export function ResetView({ code }: { code: string | null }) {
  if (!code) {
    return (
      <AuthShell
        footer={
          <Link className="auth-link" href="/login">
            Back to sign in
          </Link>
        }
      >
        <span className="auth-eyebrow">Set password</span>
        <h1 className="auth-h">This link isn&apos;t valid anymore.</h1>
        <p className="auth-sub">
          Set-up and reset links are single-use and expire after 24 hours. Request a new one to continue — or ask your
          administrator to resend your invite.
        </p>
        <div className="auth-form">
          <Link href="/forgot">
            <Button type="button" variant="primary" lg className="block">
              Request a new link
            </Button>
          </Link>
        </div>
      </AuthShell>
    );
  }

  const onSubmit = (password: string) => updatePasswordFromRecovery(code, password);

  return (
    <AuthShell
      footer={
        <span>
          Remembered it? <Link href="/login">Back to sign in</Link>
        </span>
      }
    >
      <span className="auth-eyebrow">Set password</span>
      <h1 className="auth-h">Choose your password.</h1>
      <p className="auth-sub">
        Pick something you haven&apos;t used here before. You&apos;ll use it to sign in next time.
      </p>
      <SetPasswordForm cta="Set password" busyLabel="Saving…" onSubmit={onSubmit} />
    </AuthShell>
  );
}
