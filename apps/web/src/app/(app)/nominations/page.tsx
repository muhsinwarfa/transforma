import { NominationQueue } from "@/components/approver/NominationQueue";
import { getNominationQueue } from "@/lib/approver/nominations";

// PROC-02 approver side. `nomination_sets` (RLS view) returns only the sets this
// account is the approver/manager of — other managers' reports are absent.
export default async function NominationsPage() {
  const items = await getNominationQueue();
  return <NominationQueue items={items} />;
}
