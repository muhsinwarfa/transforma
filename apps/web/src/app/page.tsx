import { resolveLabels } from "@/lib/labels/roleLabel";

/**
 * Foundation placeholder home. The adaptive shell + persona hubs land in the
 * next slice; this verifies the app boots and that role words resolve from
 * tenant config (rendered below as proof, not hardcoded).
 */
export default async function HomePage() {
  const labels = await resolveLabels();
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px", font: "var(--body)", color: "var(--ink-1)" }}>
      <p style={{ font: "var(--label)", textTransform: "uppercase", letterSpacing: "0.18em", color: "var(--ink-3)" }}>
        Foundation
      </p>
      <h1 style={{ font: "var(--h1)", marginTop: 8 }}>Transforma</h1>
      <p style={{ color: "var(--ink-2)", marginTop: 12 }}>
        The enforcement spine is in place. Role words resolve from tenant configuration:
      </p>
      <ul style={{ marginTop: 16, color: "var(--ink-2)" }}>
        <li>subject → {labels.subject}</li>
        <li>peer → {labels.peer}</li>
        <li>approver → {labels.approver}</li>
        <li>admin → {labels.admin}</li>
      </ul>
    </main>
  );
}
