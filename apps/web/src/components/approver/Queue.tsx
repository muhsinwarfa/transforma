import Link from "next/link";
import { Avatar, StatusBadge } from "@/components/atoms";
import { IcoApprovals, IcoArrowRight, IcoClock, IcoDoc, IcoFlag, IcoLock, IcoShield } from "@/components/atoms/icons";
import { RoleLabel } from "@/lib/labels/RoleLabelProvider";
import type { QueueItem } from "@/lib/approver/data";

/**
 * Describe the inputs WITHOUT quantifying peer feedback below the floor — the
 * approver never sees a peer count once the confidentiality threshold isn't met
 * (the non-quantifying-boolean decision). At/above the floor, the exact count is
 * shown.
 */
function inputsText(item: QueueItem): string {
  if (item.belowFloor || item.peerCount === null) {
    return "Self-review only · peer feedback below the confidentiality threshold";
  }
  return `Self-review · ${item.peerCount} peer ${item.peerCount === 1 ? "response" : "responses"}`;
}

function Row({ item }: { item: QueueItem }) {
  const isFlagged = item.status === "flagged" || item.flaggedInternal;
  const isLocked = item.status === "locked";
  return (
    <Link
      href={`/approvals/${item.reviewId}`}
      className={`aq-row ${isFlagged ? "flagged" : ""} ${isLocked ? "locked-row" : ""}`.trim()}
    >
      <Avatar name={item.subjectName} cls="lg" />
      <div className="aq-row-main">
        <div className="aq-row-top">
          <span className="aq-row-name">{item.subjectName}</span>
          {isFlagged ? <StatusBadge status="flagged" sm /> : null}
          {isLocked ? <StatusBadge status="locked" sm /> : null}
        </div>
        <div className="aq-row-meta">
          {item.department ? <span className="am">{item.department}</span> : null}
          <span className="am">
            <IcoDoc s={13} sw={1.7} /> {inputsText(item)}
          </span>
          {isLocked ? null : (
            <span className="am">
              <IcoClock s={13} sw={1.8} /> Awaiting your decision
            </span>
          )}
        </div>
      </div>
      <div className="aq-row-right">
        <span className="aq-row-cta" style={isFlagged ? { color: "var(--warn-text)" } : undefined}>
          {isLocked ? "View" : isFlagged ? "Rework & decide" : "Review"} <IcoArrowRight s={16} />
        </span>
      </div>
    </Link>
  );
}

export function ApproverQueue({ items }: { items: QueueItem[] }) {
  const flagged = items.filter((q) => q.status === "flagged" || q.flaggedInternal);
  const ready = items.filter((q) => q.status === "in-review" && !q.flaggedInternal);
  const decided = items.filter((q) => q.status === "awaiting-acknowledgement" || q.status === "locked");
  const pending = [...flagged, ...ready]; // flagged surface first

  return (
    <div className="tf-page">
      <div className="page-header">
        <div className="ph-left">
          <div className="ph-eyebrow">
            <span className="t-label">Queue</span>
          </div>
          <div className="ph-title">
            <h1>Reviews to decide</h1>
          </div>
          <p className="ph-sub">
            Reviews routed to you as <RoleLabel role="approver" />. Open one to read the draft, edit if needed, set a
            rating, and finalize.
          </p>
        </div>
      </div>

      <div className="aq-summary">
        <div className="aq-stat">
          <div className="aqs-num">{pending.length}</div>
          <div className="aqs-label">
            <IcoApprovals s={15} sw={1.8} /> Awaiting your decision
          </div>
        </div>
        <div className="aq-stat flag">
          <div className="aqs-num">{flagged.length}</div>
          <div className="aqs-label">
            <IcoFlag s={15} sw={1.8} /> Flagged — need rework
          </div>
        </div>
        <div className="aq-stat">
          <div className="aqs-num">{decided.filter((q) => q.status === "locked").length}</div>
          <div className="aqs-label">
            <IcoLock s={15} sw={1.8} /> Locked this cycle
          </div>
        </div>
      </div>

      {pending.length > 0 ? (
        <div className="aq-list card" style={{ padding: 0, overflow: "hidden" }}>
          {pending.map((q) => (
            <Row key={q.reviewId} item={q} />
          ))}
        </div>
      ) : (
        <div className="card pad">
          <div className="state-block">
            <span className="state-glyph">
              <IcoApprovals s={26} />
            </span>
            <h3>All caught up</h3>
            <p>No reviews are waiting on your decision right now.</p>
          </div>
        </div>
      )}

      {decided.length > 0 ? (
        <>
          <div className="hub-group-head" style={{ marginTop: 28 }}>
            <div className="hub-group-titles">
              <h2 className="hub-group-title" style={{ fontSize: 15 }}>
                Decided
              </h2>
            </div>
          </div>
          <div className="aq-list card" style={{ padding: 0, overflow: "hidden" }}>
            {decided.map((q) => (
              <Row key={q.reviewId} item={q} />
            ))}
          </div>
        </>
      ) : null}

      <div className="sod-note" style={{ marginTop: 18 }}>
        <IcoShield s={15} />
        <span>
          You won&apos;t see reviews you contributed feedback to, or your own — those are routed to a different{" "}
          <RoleLabel role="approver" /> to keep decisions independent.
        </span>
      </div>
    </div>
  );
}
