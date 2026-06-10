import { SettingsPanel } from "@/components/admin/SettingsPanel";
import { resolveLabels } from "@/lib/labels/roleLabel";
import { getReviewContentAccess } from "@/lib/admin/content";
import { getActiveCycle, getCycleDefaults, getParticipants, getRoleLabels } from "@/lib/admin/data";

type Tab = "labels" | "defaults" | "access" | "actions";
const TABS: Tab[] = ["labels", "defaults", "access", "actions"];

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const [labels, defaults, cycle, reviewAccess, resolved] = await Promise.all([
    getRoleLabels(),
    getCycleDefaults(),
    getActiveCycle(),
    getReviewContentAccess(),
    resolveLabels(),
  ]);
  const participants = cycle ? await getParticipants(cycle.id) : [];
  const initialTab: Tab = TABS.includes(tab as Tab) ? (tab as Tab) : "labels";
  return (
    <SettingsPanel
      labels={labels}
      defaults={defaults}
      participants={participants}
      reviewAccess={reviewAccess}
      adminLabel={resolved.admin}
      initialTab={initialTab}
    />
  );
}
