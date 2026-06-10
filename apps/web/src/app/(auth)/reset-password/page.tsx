import { ResetView } from "./ResetView";

// Supabase recovery redirects here with a PKCE `?code=...`. We hand it to the
// client view, which exchanges it for a session on submit and sets the password.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  return <ResetView code={code ?? null} />;
}
