"use server";
import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@transforma/db";
import { provisionAccount } from "@/lib/auth/provision";
import { consumeActivationToken } from "@/lib/auth/tokens";
import { createRlsClient } from "@/lib/supabase/server";

export interface AuthFormState {
  error?: string;
}

export async function signIn(_prev: AuthFormState | null, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const rls = await createRlsClient();
  const { data, error } = await rls.auth.signInWithPassword({ email, password });
  if (error) return { error: "Incorrect email or password." };
  // First successful sign-in activates an invited account (status invited → active),
  // so the admin roster can distinguish who has actually set up + signed in.
  if (data.user?.id) {
    await createServiceRoleClient()
      .from("accounts")
      .update({ status: "active" })
      .eq("auth_user_id", data.user.id)
      .eq("status", "invited")
      .then(undefined, () => {});
  }
  redirect("/home");
}

/**
 * PROC-01 set-password → activate. Creates the GoTrue auth user, then atomically
 * consumes the single-use token (binding it to this user) and provisions the
 * account + roles. If the token is invalid (expired/used/missing) AFTER the user
 * was created, the orphaned auth user is rolled back. Then signs in.
 *
 * The GoTrue createUser + sign-in run against live Supabase — see
 * docs/deferred-live-supabase-checks.md. The consume/replay/expired/binding
 * guarantees are already proven in token-gate.dbspec.ts.
 */
export async function activateAndSetPassword(
  rawToken: string,
  _prev: AuthFormState | null,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters." };

  const svc = createServiceRoleClient();
  const { data: created, error: createErr } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) return { error: createErr?.message ?? "Could not create your account." };
  const authUserId = created.user.id;

  try {
    const { rosterMemberId } = await consumeActivationToken(rawToken, authUserId);
    await provisionAccount(rosterMemberId, authUserId);
  } catch (e) {
    await svc.auth.admin.deleteUser(authUserId).catch(() => {});
    return { error: e instanceof Error ? e.message.replace(/^ERR_[A-Z_]+:\s*/, "") : "Activation failed." };
  }

  const rls = await createRlsClient();
  await rls.auth.signInWithPassword({ email, password });
  redirect("/home");
}

/**
 * PROC-01 recovery — request a password-reset email. Always returns success
 * (never reveals whether the email is registered — the /forgot-sent copy says
 * "If an account exists…"). Supabase mails a recovery link back to
 * <APP_BASE>/reset-password (allowlisted in the project's redirect URLs).
 */
export async function resetPasswordForEmail(email: string): Promise<AuthFormState> {
  const trimmed = email.trim();
  if (!trimmed) return { error: "Enter the email you use for Transforma." };
  const rls = await createRlsClient();
  await rls.auth.resetPasswordForEmail(trimmed, { redirectTo: `${appBaseUrl()}/reset-password` });
  // Intentionally ignore the result — do not leak account existence.
  return {};
}

/**
 * PROC-01 recovery — finish a reset from the emailed link. Exchanges the recovery
 * `code` for a session, then sets the new password. On success, signs the user in
 * (the recovery exchange already established the session) and lands on /home.
 */
export async function updatePasswordFromRecovery(
  code: string,
  password: string,
): Promise<AuthFormState> {
  if (password.length < 8) return { error: "Use at least 8 characters." };
  const rls = await createRlsClient();
  const { error: exchangeErr } = await rls.auth.exchangeCodeForSession(code);
  if (exchangeErr) {
    return { error: "This reset link is invalid or has expired. Ask for a new one." };
  }
  const { error: updateErr } = await rls.auth.updateUser({ password });
  if (updateErr) return { error: "Could not update your password. Please try again." };
  redirect("/home");
}

/** Sign out — clears the Supabase session cookie, then returns to /login. */
export async function signOut() {
  const rls = await createRlsClient();
  await rls.auth.signOut();
  redirect("/login");
}

/**
 * App origin used to build the recovery-email redirect target. Prefers the
 * explicit site URL; falls back to the prod base. The /reset-password path under
 * this origin is allowlisted in Supabase's redirect URLs.
 */
function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://transforma-re46.onrender.com"
  );
}
