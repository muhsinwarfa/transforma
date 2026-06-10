import Link from "next/link";
import { Avatar, StatusBadge } from "@/components/atoms";
import { IcoCheck, IcoCheckCircle, IcoChevLeft, IcoLock } from "@/components/atoms/icons";
import type { RoleLabels } from "@/lib/labels/roleLabel";
import type { Workspace } from "@/lib/approver/data";

const SECTIONS = [
  { key: "summary", label: "Summary" },
  { key: "strengths", label: "Strengths" },
  { key: "areasToGrow", label: "Areas to grow" },
  { key: "focusNextCycle", label: "Focus for next cycle" },
] as const;

/**
 * Read-only view once the approver has finalized. `awaiting-acknowledgement`
 * means revealed-to-subject-but-not-yet-locked; `locked` is terminal. Either
 * way the approver can no longer edit — there is no post-finalize correction
 * path. The rating is shown as a separate, human-set field (never a section).
 */
export function ApproverFinalized({
  data,
  labels,
  cycleName,
}: {
  data: Workspace;
  labels: RoleLabels;
  cycleName: string | null;
}) {
  const isLocked = data.status === "locked";
  const firstName = data.subjectName.split(" ")[0] || "They";
  const sections = data.narrative;

  return (
    <div className="tf-page">
      <Link className="form-back" href="/approvals">
        <IcoChevLeft s={16} /> Back to queue
      </Link>

      <div className="locked-ribbon">
        <span className="lr-ico">{isLocked ? <IcoLock s={20} /> : <IcoCheckCircle s={20} />}</span>
        <div className="lr-body">
          <div className="lr-title">{isLocked ? "This review is locked" : "Finalized — awaiting acknowledgement"}</div>
          <div className="lr-meta">
            {isLocked
              ? "Read-only and permanent. No further edits are possible."
              : `Read-only for you now · ${firstName} has been notified to read and acknowledge it. It locks once they do, or when the window closes.`}
          </div>
        </div>
        <StatusBadge status={isLocked ? "locked" : "awaiting-acknowledgement"} />
      </div>

      <div className="aw-context" style={{ marginBottom: 18 }}>
        <Avatar name={data.subjectName} cls="lg" />
        <div className="awc-body">
          <div className="awc-top">
            <h1 className="awc-name">{data.subjectName}</h1>
            <span className="role-chip sm">{labels.subject}</span>
          </div>
          <div className="awc-meta">{[data.department, cycleName].filter(Boolean).join(" · ")}</div>
        </div>
      </div>

      <div className="draft-card is-locked">
        <div className="draft-card-head">
          <div className="dch-left">
            <h2 className="draft-card-title">Final review</h2>
            <StatusBadge status={isLocked ? "locked" : "awaiting-acknowledgement"} sm />
          </div>
        </div>
        <div className="draft-body">
          {SECTIONS.map((sec) => {
            const body = sections?.[sec.key] ?? "";
            if (!body.trim()) return null;
            return (
              <div className="draft-sec" key={sec.key}>
                <div className="draft-sec-label">
                  <span>{sec.label}</span>
                </div>
                <p className="draft-sec-body">{body}</p>
              </div>
            );
          })}
          <div className="draft-sec">
            <div className="draft-sec-label">
              <span>Rating</span>
            </div>
            <div className="draft-outcome">
              <span className="doc-mark">
                <IcoCheck s={20} sw={2.4} />
              </span>
              <span>
                <span className="oc-label">Overall · set by you</span>
                <span className="oc-value">{data.rating ?? "—"}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
