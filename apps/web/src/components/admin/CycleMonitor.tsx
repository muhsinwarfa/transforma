import { StatusBadge } from "@/components/atoms";
import { IcoClock, IcoShield } from "@/components/atoms/icons";
import { RoleLabel } from "@/lib/labels/RoleLabelProvider";
import type { CycleMonitor as Monitor } from "@/lib/admin/data";

const TILES: { key: keyof Monitor["counts"]; status: string; label: string; flag?: boolean }[] = [
  { key: "draft", status: "draft", label: "Not yet submitted" },
  { key: "in-review", status: "in-review", label: "Moving through review" },
  { key: "awaiting-acknowledgement", status: "awaiting-acknowledgement", label: "With the person to read" },
  { key: "locked", status: "locked", label: "Finalized & locked" },
  { key: "flagged", status: "flagged", label: "Need rework", flag: true },
];

const SEG = [
  { key: "draft", cls: "draft", name: "Draft" },
  { key: "in-review", cls: "in-review", name: "In review" },
  { key: "awaiting-acknowledgement", cls: "awaiting-ack", name: "Awaiting acknowledgement" },
  { key: "locked", cls: "locked", name: "Locked" },
  { key: "flagged", cls: "flagged", name: "Flagged" },
] as const;

export function CycleMonitor({ monitor }: { monitor: Monitor }) {
  const { cycle, counts, activeTotal } = monitor;
  const pct = (k: keyof typeof counts) => (activeTotal > 0 ? `${(counts[k] / activeTotal) * 100}%` : "0%");
  const window =
    cycle.opensAt && cycle.closesAt
      ? `${new Date(cycle.opensAt).toLocaleDateString()} – ${new Date(cycle.closesAt).toLocaleDateString()}`
      : "Window not set";

  return (
    <>
      <div className="mon-head">
        <div className="mh-body">
          <h2 className="mh-title">{cycle.name}</h2>
          <div className="mh-meta">
            {window} · {activeTotal} active {activeTotal === 1 ? "review" : "reviews"}
          </div>
        </div>
        <span className="deadline calm">
          <IcoClock s={14} sw={1.9} /> Cycle oversight
        </span>
      </div>

      <div className="stat-grid">
        {TILES.map((t) => (
          <div className={`stat-tile ${t.flag ? "flag" : ""}`.trim()} key={t.key}>
            <div className="st-top">
              <StatusBadge status={t.status} sm />
            </div>
            <div className="st-num">{counts[t.key]}</div>
            <div className="st-label">{t.label}</div>
          </div>
        ))}
      </div>

      <div className="dist-card">
        <h3>Status across the cycle</h3>
        <div className="dist-bar">
          {SEG.map((s) => (
            <div className={`dist-seg ${s.cls}`} key={s.key} style={{ width: pct(s.key as keyof typeof counts) }} />
          ))}
        </div>
        <div className="dist-legend">
          {SEG.map((s) => (
            <span className="dist-leg" key={s.key}>
              <span className={`lg-dot dist-seg ${s.cls}`} />
              <span className="lg-num">{counts[s.key as keyof typeof counts]}</span>{" "}
              <span className="lg-name">{s.name}</span>
            </span>
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
