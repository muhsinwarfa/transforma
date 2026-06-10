import type { ReactNode } from "react";
import { guardRole } from "@/lib/auth/session";

// Route guard: only the admin role may reach /admin/*. Wrong-role users are
// redirected to /home before any content renders (server redirect, no flash).
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await guardRole("admin");
  return <>{children}</>;
}
