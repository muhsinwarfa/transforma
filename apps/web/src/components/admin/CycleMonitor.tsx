import { StatusBadge } from "@/components/atoms";
import { IcoClock, IcoShield } from "@/components/atoms/icons";
import { RoleLabel } from "@/lib/labels/RoleLabelProvider";
import type { CycleMonitor as Monitor } from "@/lib/admin/data";

export function CycleMonitor({ monitor }: { monitor: Monitor }) {
  const { cycle, counts, activeTotal, participants, daysLeft, milestones } = monitor;
  // segment widths use the same denominator the prototype does (sum of statuses)
  const total = activeTotal;
  const seg = (k: keyof typeof counts) => (total > 0 ? `${(counts[k] / total) * 100}%` : "0%");
  const window =
    cycle.opensAt && cycle.closesAt
      ? `${new Date(cycle.opensAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(
          cycle.closesAt,
        ).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
      : "Window not set";

  return (
    <>
      <div className="mon-head">
        <div className="mh-body">
          <h2 className="mh-title">{cycle.name}</h2>
          <div className="mh-meta">
            {window} · {participants} participants
          </div>
        </div>
        {daysLeft != null ? (
          <span className="deadline calm">
            <IcoClock s={14} sw={1.9} /> {daysLeft} days left
          </span>
        ) : null}
      </div>

      <div className="stat-grid">
        <div className="stat-tile">
          <div className="st-top">
            <StatusBadge status="draft" sm />
          </div>
          <div className="st-num">{counts.draft}</div>
          <div className="st-label">Not yet submitted</div>
        </div>
        <div className="stat-tile">
          <div className="st-top">
            <StatusBadge status="in-review" sm />
          </div>
          <div className="st-num">{counts["in-review"]}</div>
          <div className="st-label">Moving through review</div>
        </div>
        <div className="stat-tile">
          <div className="st-top">
            <StatusBadge status="awaiting-acknowledgement" sm />
          </div>
          <div className="st-num">{counts["awaiting-acknowledgement"]}</div>
          <div className="st-label">With the person to read</div>
        </div>
        <div className="stat-tile">
          <div className="st-top">
            <StatusBadge status="locked" sm />
          </div>
          <div className="st-num">{counts.locked}</div>
          <div className="st-label">Finalized &amp; locked</div>
        </div>
        <div className="stat-tile flag">
          <div className="st-top">
            <StatusBadge status="flagged" sm />
          </div>
          <div className="st-num">{counts.flagged}</div>
          <div className="st-label">Need rework</div>
        </div>
      </div>

      <div className="dist-card">
        <h3>Status across the cycle</h3>
        <div className="dist-bar">
          <div className="dist-seg draft" style={{ width: seg("draft") }} />
          <div className="dist-seg in-review" style={{ width: seg("in-review") }} />
          <div className="dist-seg awaiting-ack" style={{ width: seg("awaiting-acknowledgement") }} />
          <div className="dist-seg locked" style={{ width: seg("locked") }} />
          <div className="dist-seg flagged" style={{ width: seg("flagged") }} />
        </div>
        <div className="dist-legend">
          <span className="dist-leg">
            <span className="lg-dot" style={{ background: "rgba(0,0,77,0.22)" }} />
            <span className="lg-num">{counts.draft}</span> <span className="lg-name">Draft</span>
          </span>
          <span className="dist-leg">
            <span className="lg-dot" style={{ background: "var(--blue)" }} />
            <span className="lg-num">{counts["in-review"]}</span> <span className="lg-name">In review</span>
          </span>
          <span className="dist-leg">
            <span className="lg-dot" style={{ background: "var(--cyan)" }} />
            <span className="lg-num">{counts["awaiting-acknowledgement"]}</span>{" "}
            <span className="lg-name">Awaiting acknowledgement</span>
          </span>
          <span className="dist-leg">
            <span className="lg-dot" style={{ background: "var(--ink-3)" }} />
            <span className="lg-num">{counts.locked}</span> <span className="lg-name">Locked</span>
          </span>
          <span className="dist-leg">
            <span className="lg-dot" style={{ background: "var(--warn-text)" }} />
            <span className="lg-num">{counts.flagged}</span> <span className="lg-name">Flagged</span>
          </span>
        </div>
      </div>

      <div className="dist-card">
        <h3>Progress</h3>
        <div className="ms-list">
          {milestones.map((ms, i) => (
            <div className="ms-row" key={i}>
              <div className="ms-top">
                <span className="ms-label">{ms.label}</span>
                <span className="ms-frac">
                  {ms.done} / {ms.total}
                </span>
              </div>
              <div className="ms-track">
                <div className="ms-fill" style={{ width: `${ms.total > 0 ? (ms.done / ms.total) * 100 : 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="agg-note">
        <IcoShield s={15} />
        <span>
          This dashboard shows cycle-level counts only. To act on a single flagged review, open the{" "}
          <RoleLabel role="approver" /> queue — individual review content isn&apos;t shown here.
        </span>
      </div>
    </>
  );
}
