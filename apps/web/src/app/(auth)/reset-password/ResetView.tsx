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
        <span className="auth-eyebrow">Reset password</span>
        <h1 className="auth-h">This reset link isn&apos;t valid.</h1>
        <p className="auth-sub">
          Reset links are single-use and expire after 1 hour. Request a new one to continue.
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
      <span className="auth-eyebrow">Reset password</span>
      <h1 className="auth-h">Choose a new password.</h1>
      <p className="auth-sub">
        Pick something you haven&apos;t used here before. You&apos;ll use it to sign in next time.
      </p>
      <SetPasswordForm cta="Reset password" busyLabel="Saving…" onSubmit={onSubmit} />
    </AuthShell>
  );
}
