import { RosterImport } from "@/components/admin/RosterImport";
import { resolveLabels } from "@/lib/labels/roleLabel";
import { getActiveCycle } from "@/lib/admin/data";

export default async function AdminRosterPage() {
  const [cycle, labels] = await Promise.all([getActiveCycle(), resolveLabels()]);
  return <RosterImport cycleName={cycle?.name ?? "this cycle"} roleLabels={labels} />;
}
