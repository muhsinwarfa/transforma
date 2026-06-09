import { CycleMonitor } from "@/components/admin/CycleMonitor";
import { CycleSetup } from "@/components/admin/CycleSetup";
import { getCycleMonitor } from "@/lib/admin/data";

export default async function AdminCyclePage() {
  const monitor = await getCycleMonitor();
  if (!monitor) {
    return (
      <div className="tf-page">
        <div className="card pad">
          <p className="t-body">No cycle exists yet. Create one to begin.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="tf-page">
      <div className="page-header">
        <div className="ph-left">
          <div className="ph-eyebrow">
            <span className="t-label">Administrator</span>
          </div>
          <div className="ph-title">
            <h1>Cycle</h1>
          </div>
          <p className="ph-sub">Set up and oversee the review cycle. This is cycle-level oversight — not reading individual reviews.</p>
        </div>
      </div>
      <CycleSetup cycleName={monitor.cycle.name} />
      <CycleMonitor monitor={monitor} />
    </div>
  );
}
