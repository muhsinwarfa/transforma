import { AdminCycle } from "@/components/admin/AdminCycle";
import { resolveLabels } from "@/lib/labels/roleLabel";
import { getCycleMonitor, getCycleSetup } from "@/lib/admin/data";

export default async function AdminCyclePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const [monitor, setup, labels] = await Promise.all([getCycleMonitor(), getCycleSetup(), resolveLabels()]);
  const initialTab = tab === "setup" ? "setup" : "overview";
  return <AdminCycle monitor={monitor} setup={setup} adminLabel={labels.admin} initialTab={initialTab} />;
}
