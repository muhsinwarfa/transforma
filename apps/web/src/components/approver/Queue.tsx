import Link from "next/link";
import { Avatar, RoleLabel, StatusBadge } from "@/components/atoms";
import {
  IcoApprovals,
  IcoArrowRight,
  IcoCheckCircle,
  IcoClock,
  IcoDoc,
  IcoFlag,
  IcoLock,
  IcoShield,
} from "@/components/atoms/icons";
import type { RoleLabels } from "@/lib/labels/roleLabel";
import { shortDate, type QueueItem } from "@/lib/approver/data";

// The underlying configurable token behind the tenant role word (revealed by the
// "Show role tokens" toggle; hidden via the .tok / body.show-tokens CSS otherwise).
const SUBJECT_TOKEN = "subject_label";

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

// A review still on the approver's desk (ready or flagged).
function PendingRow({ item, labels }: { item: QueueItem; labels: RoleLabels }) {
  const isFlagged = item.status === "flagged" || item.flaggedInternal;
  return (
    <Link href={`/approvals/${item.reviewId}`} className={`aq-row ${isFlagged ? "flagged" : ""}`.trim()}>
      <Avatar name={item.subjectName} cls="lg" />
      <div className="aq-row-main">
        <div className="aq-row-top">
          <span className="aq-row-name">{item.subjectName}</span>
          <span className="role-chip sm">
            {labels.subject}
            <span className="tok">{`{${SUBJECT_TOKEN}}`}</span>
          </span>
          {isFlagged ? <StatusBadge status="flagged" sm /> : null}
        </div>
        <div className="aq-row-meta">
          {item.department ? <span className="am">{item.department}</span> : null}
          <span className="am">
            <IcoDoc s={13} sw={1.7} /> {inputsText(item)}
          </span>
          {item.submittedAt ? (
            <span className="am">
              <IcoClock s={13} sw={1.8} /> Submitted {shortDate(item.submittedAt)}
            </span>
          ) : null}
        </div>
      </div>
      <div className="aq-row-right">
        <span className="aq-row-cta" style={isFlagged ? { color: "var(--warn-text)" } : undefined}>
          {isFlagged ? "Rework & decide" : "Review"} <IcoArrowRight s={16} />
        </span>
      </div>
    </Link>
  );
}

// A finished review (locked or revealed-awaiting-ack), read-only.
function DecidedRow({ item }: { item: QueueItem }) {
  const isLocked = item.status === "locked";
  return (
    <Link href={`/approvals/${item.reviewId}`} className="aq-row locked-row">
      <Avatar name={item.subjectName} cls="lg" />
      <div className="aq-row-main">
        <div className="aq-row-top">
          <span className="aq-row-name">{item.subjectName}</span>
          <StatusBadge status={isLocked ? "locked" : "awaiting-acknowledgement"} sm />
        </div>
        <div className="aq-row-meta">
          {item.department ? <span className="am">{item.department}</span> : null}
          <span className="am">
            {isLocked ? (
              <>
                <IcoLock s={13} sw={1.8} /> Locked {shortDate(item.lockedAt)}
              </>
            ) : (
              <>
                <IcoClock s={13} sw={1.8} /> Finalized {shortDate(item.finalizedAt)}
              </>
            )}
          </span>
        </div>
      </div>
      <div className="aq-row-right">
        <span className="aq-row-cta">
          View <IcoArrowRight s={16} />
        </span>
      </div>
    </Link>
  );
}

export function ApproverQueue({ items, labels }: { items: QueueItem[]; labels: RoleLabels }) {
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
            Reviews routed to you as <RoleLabel label={labels.approver} token="approver_label" />. Open one to read the
            draft, edit if needed, and lock.
          </p>
        </div>
      </div>

      <div className="aq-summary">
        <div className="aq-stat">
          <div className="aqs-num">{ready.length + flagged.length}</div>
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
          <div className="aqs-num">{decided.length}</div>
          <div className="aqs-label">
            <IcoLock s={15} sw={1.8} /> Decided this cycle
          </div>
        </div>
      </div>

      {pending.length > 0 ? (
        <div className="aq-list card" style={{ padding: 0, overflow: "hidden" }}>
          {pending.map((q) => (
            <PendingRow key={q.reviewId} item={q} labels={labels} />
          ))}
        </div>
      ) : (
        <div className="card pad">
          <div className="state-block">
            <span className="state-glyph">
              <IcoCheckCircle s={26} />
            </span>
            <h3>All caught up</h3>
            <p>All caught up. No reviews are waiting on your decision right now.</p>
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
              <DecidedRow key={q.reviewId} item={q} />
            ))}
          </div>
        </>
      ) : null}

      <div className="sod-note" style={{ marginTop: 18 }}>
        <IcoShield s={15} />
        <span>
          You won&apos;t see reviews you contributed feedback to, or your own — those are routed to a different{" "}
          <RoleLabel label={labels.approver} token="approver_label" /> to keep decisions independent.
        </span>
      </div>
    </div>
  );
}
