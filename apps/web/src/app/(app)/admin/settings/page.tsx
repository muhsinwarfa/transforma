import { SettingsPanel } from "@/components/admin/SettingsPanel";
import { getReviewContentAccess } from "@/lib/admin/content";
import { getActiveCycle, getCycleDefaults, getParticipants, getRoleLabels } from "@/lib/admin/data";

export default async function AdminSettingsPage() {
  const [labels, defaults, cycle, reviewAccess] = await Promise.all([
    getRoleLabels(),
    getCycleDefaults(),
    getActiveCycle(),
    getReviewContentAccess(),
  ]);
  const participants = cycle ? await getParticipants(cycle.id) : [];
  return <SettingsPanel labels={labels} defaults={defaults} participants={participants} reviewAccess={reviewAccess} />;
}
