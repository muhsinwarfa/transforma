import Link from "next/link";
import { Avatar } from "@/components/atoms";
import { IcoArrowRight, IcoCheckCircle, IcoPeer } from "@/components/atoms/icons";
import { RoleLabel } from "@/lib/labels/RoleLabelProvider";
import type { NominationSetRow } from "@/lib/approver/nominations";

export function NominationQueue({ items }: { items: NominationSetRow[] }) {
  const pending = items.filter((n) => n.status === "pending");

  return (
    <div className="tf-page">
      <div className="page-header">
        <div className="ph-left">
          <div className="ph-eyebrow">
            <span className="t-label">Peer nominations</span>
          </div>
          <div className="ph-title">
            <h1>Approve peer nominations</h1>
          </div>
          <p className="ph-sub">
            Each of your <RoleLabel role="subject" plural /> has nominated who they&apos;d like feedback from. Approve
            the list, or send it back with a note.
          </p>
        </div>
      </div>

      <div className="aq-list card" style={{ padding: 0, overflow: "hidden" }}>
        {pending.length > 0 ? (
          pending.map((n) => (
            <Link key={`${n.cycleId}:${n.employeeId}`} href={`/nominations/${n.employeeId}`} className="aq-row">
              <Avatar name={n.subjectName} cls="lg" />
              <div className="aq-row-main">
                <div className="aq-row-top">
                  <span className="aq-row-name">{n.subjectName}</span>
                </div>
                <div className="aq-row-meta">
                  <span className="am">
                    <IcoPeer s={13} sw={1.7} /> {n.nomineeCount} nominated
                  </span>
                </div>
              </div>
              <div className="aq-row-right">
                <span className="aq-row-cta">
                  Review <IcoArrowRight s={16} />
                </span>
              </div>
            </Link>
          ))
        ) : (
          <div className="state-block">
            <span className="state-glyph">
              <IcoCheckCircle s={26} />
            </span>
            <h3>All caught up</h3>
            <p>No nominations are waiting on you right now.</p>
          </div>
        )}
      </div>
    </div>
  );
}
