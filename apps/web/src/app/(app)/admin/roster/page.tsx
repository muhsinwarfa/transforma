import { RosterImport } from "@/components/admin/RosterImport";
import { listRosterMembers } from "@/app/(app)/admin/actions";
import { resolveLabels } from "@/lib/labels/roleLabel";
import { getActiveCycle } from "@/lib/admin/data";

export default async function AdminRosterPage() {
  const [cycle, labels, members] = await Promise.all([getActiveCycle(), resolveLabels(), listRosterMembers()]);
  return <RosterImport cycleName={cycle?.name ?? "this cycle"} roleLabels={labels} members={members} />;
}
