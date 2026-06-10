import type { ReactNode } from "react";
import { guardRole } from "@/lib/auth/session";

// Route guard: only the peer role (this cycle) may reach /peer/*.
export default async function PeerLayout({ children }: { children: ReactNode }) {
  await guardRole("peer");
  return <>{children}</>;
}
