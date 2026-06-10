import type { ReactNode } from "react";
import { guardRole } from "@/lib/auth/session";

// Route guard: only the approver role may reach /nominations/*.
export default async function NominationsLayout({ children }: { children: ReactNode }) {
  await guardRole("approver");
  return <>{children}</>;
}
