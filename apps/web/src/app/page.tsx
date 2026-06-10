import { redirect } from "next/navigation";
import { loadSession } from "@/lib/auth/session";

// Root: a router, not a designed surface (Plan v3). Signed-in users go to their
// home hub; everyone else lands on sign-in. Hitting the bare URL must never show
// the old Foundation scaffolding.
export default async function RootPage() {
  const session = await loadSession();
  redirect(session ? "/home" : "/login");
}
