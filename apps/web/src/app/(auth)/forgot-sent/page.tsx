import Link from "next/link";
import { AuthShell } from "../AuthShell";
import { IcoMail } from "../auth-icons";

// Forgot-password confirmation. Ported from docs/design/prototype/auth.jsx →
// ForgotSent. The prototype's "Open the reset link (demo)" shortcut is omitted:
// in the live app the recovery link arrives by email and carries a one-time code
// (there is nothing to open without it). Everything else is verbatim.
export default function ForgotSentPage() {
  return (
    <AuthShell
      footer={
        <Link className="auth-link" href="/login">
          Back to sign in
        </Link>
      }
    >
      <div className="auth-status-mark ok">
        <IcoMail s={26} />
      </div>
      <h1 className="auth-h">Check your inbox.</h1>
      <p className="auth-sub">
        If an account exists for that email, a reset link is on its way. The link expires in 1 hour.
      </p>
    </AuthShell>
  );
}
