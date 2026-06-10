"use client";
import Link from "next/link";
import { useState, type MouseEvent } from "react";
import type { StructuralRole } from "@transforma/db";
import type { RoleLabels } from "@/lib/labels/roleLabel";
import { StatusBadge } from "@/components/atoms";
import { type IconProps, IcoArrowRight, IcoCheckCircle, IcoClock } from "@/components/atoms/icons";

// Three-dot "More options" glyph — ported from the design icon set (icons.jsx
// IcoMore). Defined locally because the shared atom set (Lane 0, frozen) does not
// yet expose it; uses the same 24x24 / currentColor wrapper as every other icon.
function IcoMore({ s = 22, sw = 1.7 }: IconProps) {
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

// The underlying configurable token behind each tenant role word (revealed by the
// shell's "Show role tokens" toggle via the .tok / body.show-tokens CSS).
const TOKENS: Record<StructuralRole, string> = {
  subject: "subject_label",
  peer: "peer_label",
  approver: "approver_label",
  admin: "admin_label",
};

export interface HubTask {
  id: string;
  title: string;
  status: string;
  due: string;
  meta: string;
  cta: string;
  href: string;
}

export interface HubGroup {
  role: StructuralRole;
  blurb: string;
  tasks: HubTask[];
}

function TaskCard({ task }: { task: HubTask }) {
  const swallow = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  return (
    <Link href={task.href} className="card pad task-card interactive">
      <div className="card-head">
        <StatusBadge status={task.status} sm />
        <button className="iconbtn sm-icon" aria-label="More options" type="button" onClick={swallow}>
          <IcoMore s={18} />
        </button>
      </div>
      <h3 className="task-title">{task.title}</h3>
      <p className="task-meta">{task.meta}</p>
      <div className="card-foot">
        <span className="task-due">
          <IcoClock s={15} sw={1.8} /> {task.due}
        </span>
        <span className="task-cta">
          {task.cta} <IcoArrowRight s={15} />
        </span>
      </div>
    </Link>
  );
}

export function HomeHub({
  firstName,
  cycleName,
  labels,
  groups,
}: {
  firstName: string;
  cycleName: string | null;
  labels: RoleLabels;
  groups: HubGroup[];
}) {
  const [filter, setFilter] = useState<"all" | StructuralRole>("all");
  const total = groups.reduce((n, g) => n + g.tasks.length, 0);
  const visible = filter === "all" ? groups : groups.filter((g) => g.role === filter);

  return (
    <div className="tf-page">
      <div className="page-header">
        <div className="ph-left">
          <div className="ph-eyebrow">
            <span className="t-label">Home</span>
            {cycleName ? (
              <span className="t-body-sm" style={{ color: "var(--ink-3)" }}>
                · {cycleName}
              </span>
            ) : null}
          </div>
          <div className="ph-title">
            <h1>Good morning, {firstName}.</h1>
          </div>
          <p className="ph-sub">
            You have <strong>{total} things</strong> that need you across the roles you hold this cycle.
          </p>
        </div>
      </div>

      {/* Role/context filter switcher — filters the unified hub, does not hard-switch. */}
      <div className="hub-filterbar">
        <div className="segmented" role="tablist" aria-label="Filter tasks by role">
          <button
            role="tab"
            className={filter === "all" ? "active" : ""}
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            All <span className="seg-count">{total}</span>
          </button>
          {groups.map((g) => (
            <button
              key={g.role}
              role="tab"
              className={filter === g.role ? "active" : ""}
              aria-pressed={filter === g.role}
              onClick={() => setFilter(g.role)}
            >
              {labels[g.role]} <span className="seg-count">{g.tasks.length}</span>
            </button>
          ))}
        </div>
        <span className="hub-filter-hint">One home for every role you hold.</span>
      </div>

      {visible.map((g) => (
        <section key={g.role} className="hub-group" aria-label={labels[g.role]}>
          <div className="hub-group-head">
            <div className="hub-group-titles">
              <h2 className="hub-group-title">
                As {labels[g.role]}
                <span className="tok">{`{${TOKENS[g.role]}}`}</span>
              </h2>
              <p className="hub-group-blurb">{g.blurb}</p>
            </div>
            <span className="hub-group-count">
              {g.tasks.length} {g.tasks.length === 1 ? "task" : "tasks"}
            </span>
          </div>
          <div className="hub-grid">
            {g.tasks.map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </div>
        </section>
      ))}

      {visible.length === 0 && (
        <div className="card pad">
          <div className="state-block">
            <span className="state-glyph">
              <IcoCheckCircle s={26} />
            </span>
            <h3>Nothing here right now</h3>
            <p>When something needs you in this role, it&apos;ll show up here.</p>
          </div>
        </div>
      )}
    </div>
  );
}
