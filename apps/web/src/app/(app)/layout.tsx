import type { ReactNode } from "react";
import { ToastProvider } from "@/components/Toast";
import { AppShell } from "@/components/shell/AppShell";
import { loadSession } from "@/lib/auth/session";
import { resolveLabels } from "@/lib/labels/roleLabel";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await loadSession();
  const labels = await resolveLabels();

  if (!session) {
    // Sign-in / activation lands in PROC-01; until then this is the honest gate.
    return (
      <main style={{ maxWidth: 560, margin: "0 auto", padding: "64px 24px", font: "var(--body)", color: "var(--ink-2)" }}>
        <h1 style={{ font: "var(--h2)", color: "var(--ink-1)" }}>Sign in required</h1>
        <p style={{ marginTop: 12 }}>Activation and sign-in arrive with the auth slice (PROC-01).</p>
      </main>
    );
  }

  return (
    <ToastProvider>
      <AppShell roles={session.roles} labels={labels}>
        {children}
      </AppShell>
    </ToastProvider>
  );
}
