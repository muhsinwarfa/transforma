import type { ReactNode } from "react";

// Auth routes render the full-bleed two-panel AuthShell (.auth-stage owns its
// own background + min-height). The layout stays a bare passthrough so the stage
// fills the viewport edge-to-edge.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <main>{children}</main>;
}
