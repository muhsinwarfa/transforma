"use client";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { StatusBadge } from "@/components/atoms";
import { IcoCycles, IcoSettings } from "@/components/atoms/icons";
import { IcoReports } from "@/components/admin/icons";
import { CycleMonitor } from "@/components/admin/CycleMonitor";
import { CycleSetupForm } from "@/components/admin/CycleSetupForm";
import type { CycleMonitor as Monitor, CycleSetupData } from "@/lib/admin/data";

type Tab = "overview" | "setup";

export function AdminCycle({
  monitor,
  setup,
  adminLabel,
  initialTab,
}: {
  monitor: Monitor | null;
  setup: CycleSetupData | null;
  adminLabel: string;
  initialTab: Tab;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState<Tab>(initialTab);
  const hasCycle = monitor != null;
  // With no cycle yet we show the empty card UNTIL the admin chooses to create one
  // (then the Setup form is reachable so saveCycleSettings can create the row).
  const showEmpty = !hasCycle && tab !== "setup";

  const go = (t: Tab) => {
    setTab(t);
    // keep the tab URL-addressable so the rig can deep-link / refresh into it
    router.replace(`${pathname}?tab=${t}`, { scroll: false });
  };

  return (
    <div className="tf-page">
      <div className="page-header">
        <div className="ph-left">
          <div className="ph-eyebrow">
            <span className="t-label">
              {adminLabel}
              <span className="tok">{"{admin_label}"}</span>
            </span>
          </div>
          <div className="ph-title">
            <h1>Cycle</h1>
            {!showEmpty ? <StatusBadge status="in-review" sm /> : null}
          </div>
          <p className="ph-sub">
            Set up and oversee the review cycle. This is cycle-level oversight — not reading individual reviews.
          </p>
        </div>
        {!showEmpty ? (
          <div className="ph-actions">
            <button className="btn btn-secondary" onClick={() => go("setup")}>
              <IcoSettings s={17} /> Configure
            </button>
          </div>
        ) : null}
      </div>

      {showEmpty ? (
        <div className="card pad">
          <div className="state-block">
            <span className="state-glyph">
              <IcoCycles s={26} />
            </span>
            <h3>No cycle yet</h3>
            <p>No cycle exists yet. Create one to begin.</p>
            <button className="btn btn-primary" onClick={() => go("setup")}>
              Create a cycle
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="admin-tabs" role="tablist">
            <button
              role="tab"
              className={`admin-tab ${tab === "overview" ? "active" : ""}`}
              aria-selected={tab === "overview"}
              onClick={() => go("overview")}
            >
              <IcoReports s={17} /> Overview
            </button>
            <button
              role="tab"
              className={`admin-tab ${tab === "setup" ? "active" : ""}`}
              aria-selected={tab === "setup"}
              onClick={() => go("setup")}
            >
              <IcoSettings s={17} /> Setup
            </button>
          </div>

          {tab === "setup" || !monitor ? <CycleSetupForm seed={setup} /> : <CycleMonitor monitor={monitor} />}
        </>
      )}
    </div>
  );
}
