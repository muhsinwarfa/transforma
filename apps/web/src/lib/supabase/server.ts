import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Request-scoped RLS client — built from the user's session cookie. ALL normal
 * reads/writes go through this so Postgres RLS is the always-on floor. Runs as
 * the `authenticated` role; never bypasses RLS.
 */
export async function createRlsClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet: { name: string; value: string; options?: Record<string, unknown> }[]) => {
          try {
            for (const { name, value, options } of toSet) cookieStore.set(name, value, options as never);
          } catch {
            // called from a Server Component render — middleware refreshes the session
          }
        },
      },
    },
  );
}
