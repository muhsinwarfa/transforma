import type { ReactNode } from "react";
import type { StructuralRole } from "@transforma/db";
import { ToastProvider } from "@/components/Toast";
import { AppShell } from "@/components/shell/AppShell";
import { loadSession } from "@/lib/auth/session";
import { resolveLabels } from "@/lib/labels/roleLabel";
import { getActiveCycle } from "@/lib/admin/data";
import { getPeerAssignments } from "@/lib/peer/feedback";
import { getApproverQueue } from "@/lib/approver/data";
import { getNominationQueue } from "@/lib/approver/nominations";
import { createRlsClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await loadSession();

  if (!session) {
    // Sign-in / activation lands in PROC-01; until then this is the honest gate.
    return (
      <main style={{ maxWidth: 560, margin: "0 auto", padding: "64px 24px", font: "var(--body)", color: "var(--ink-2)" }}>
        <h1 style={{ font: "var(--h2)", color: "var(--ink-1)" }}>Sign in required</h1>
        <p style={{ marginTop: 12 }}>Activation and sign-in arrive with the auth slice (PROC-01).</p>
      </main>
    );
  }

  const has = (r: StructuralRole) => session.roles.includes(r);
  // Nav badges count only items that NEED ACTION — each badge mirrors the actionable
  // predicate of the queue it links to, so it decrements as work is cleared. Counting
  // every row (the old `.length`) left the badge stuck after approvals (the Nominations
  // bug). Peer → PeerList "To do"; Approvals → ApproverQueue "pending" (in-review /
  // flagged, never the decided rows); Nominations → pending sets only.
  const [labels, cycle, peer, approvals, nominations] = await Promise.all([
    resolveLabels(),
    getActiveCycle(),
    has("peer")
      ? getPeerAssignments().then(
          (a) => a.filter((r) => r.state !== "submitted" && r.state !== "closed" && r.state !== "declined").length,
        )
      : Promise.resolve(undefined),
    has("approver")
      ? getApproverQueue().then((a) => a.filter((q) => q.status === "in-review" || q.status === "flagged").length)
      : Promise.resolve(undefined),
    has("approver")
      ? getNominationQueue().then((a) => a.filter((n) => n.status === "pending").length)
      : Promise.resolve(undefined),
  ]);

  // Workspace (tenant) name for the account menu — the product brand stays "Transforma".
  const supabase = await createRlsClient();
  const { data: company } = await supabase.from("companies").select("name").limit(1).maybeSingle();
  const tenantName = (company?.name as string | undefined) ?? "Transforma";

  return (
    <ToastProvider>
      <AppShell
        roles={session.roles}
        labels={labels}
        user={{ name: session.name, email: session.email }}
        cycleName={cycle?.name ?? null}
        tenantName={tenantName}
        counts={{ peer, approvals, nominations }}
      >
        {children}
      </AppShell>
    </ToastProvider>
  );
}
