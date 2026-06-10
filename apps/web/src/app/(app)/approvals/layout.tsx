import type { ReactNode } from "react";
import { guardRole } from "@/lib/auth/session";

// Route guard: only the approver role may reach /approvals/*.
export default async function ApprovalsLayout({ children }: { children: ReactNode }) {
  await guardRole("approver");
  return <>{children}</>;
}
