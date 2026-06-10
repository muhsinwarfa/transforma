"use client";
import { useState } from "react";
import { Button } from "@/components/atoms";
import { IcoSpinner } from "@/components/atoms/icons";
import { PasswordInput } from "./PasswordInput";

// Strength heuristic — ported verbatim from docs/design/prototype/auth.jsx.
function strengthOf(pw: string): number {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/[0-9]/.test(pw) || /[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(3, s);
}

const LEVEL_TEXT = ["Too short", "Weak", "Getting there", "Strong"];

/**
 * Shared set-/reset-password form. Ported from the prototype's SetPasswordForm:
 * password + confirm fields, a 3-bar strength meter, confirm-mismatch error, and
 * show/hide toggles. The prototype is a pure client mock; here the same UI drives
 * a real server action (activate or recovery-reset), passed in as `onSubmit`.
 */
export function SetPasswordForm({
  cta,
  busyLabel,
  onSubmit,
}: {
  cta: string;
  busyLabel: string;
  onSubmit: (password: string) => Promise<{ error?: string } | void>;
}) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState("");

  const s = strengthOf(pw);
  const lvlTxt = LEVEL_TEXT[s];
  const mismatch = touched && confirm.length > 0 && confirm !== pw;
  const valid = pw.length >= 8 && pw === confirm;

  const submit = async () => {
    setTouched(true);
    setServerError("");
    if (!valid || busy) return;
    setBusy(true);
    const res = await onSubmit(pw);
    // On success the action redirects (navigation away); we only land here on error.
    if (res?.error) {
      setServerError(res.error);
      setBusy(false);
    }
  };

  return (
    <div className="auth-form">
      <PasswordInput
        id="sp-pw"
        label="New password"
        value={pw}
        onChange={setPw}
        placeholder="At least 8 characters"
        autoFocus
        hint="Use 8+ characters with a mix of letters and numbers."
      />
      {pw.length > 0 ? (
        <div className="pw-meter" aria-hidden="true">
          <div className="pw-bars">
            {[1, 2, 3].map((i) => (
              <span key={i} className={`pw-bar ${s >= i ? `on lvl-${s}` : ""}`.trim()} />
            ))}
          </div>
          <span className={`pw-meter-label lvl-${s}`}>{lvlTxt}</span>
        </div>
      ) : null}
      <PasswordInput
        id="sp-confirm"
        label="Confirm password"
        value={confirm}
        onChange={setConfirm}
        placeholder="Re-enter your password"
        error={mismatch ? "Passwords don’t match yet." : serverError || ""}
        onEnter={submit}
      />
      <Button type="button" variant="primary" lg className="block" onClick={submit} disabled={busy}>
        {busy ? (
          <>
            <IcoSpinner s={18} /> {busyLabel}
          </>
        ) : (
          cta
        )}
      </Button>
    </div>
  );
}
