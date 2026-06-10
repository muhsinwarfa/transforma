import type { ReactNode } from "react";
import { guardRole } from "@/lib/auth/session";

// Route guard: only the subject role may reach /review/*.
export default async function ReviewLayout({ children }: { children: ReactNode }) {
  await guardRole("subject");
  return <>{children}</>;
}
