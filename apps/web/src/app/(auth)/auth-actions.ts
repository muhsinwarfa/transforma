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
  const { error } = await rls.auth.signInWithPassword({ email, password });
  if (error) return { error: "Incorrect email or password." };
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
