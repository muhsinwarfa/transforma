import { ApproverQueue } from "@/components/approver/Queue";
import { getApproverQueue } from "@/lib/approver/data";

// The queue is SoD-filtered at the DATA layer: `approver_queue` (RLS view)
// never returns a review the signed-in approver is the subject of or
// contributed input to — ineligible reviews are absent, not merely hidden.
export default async function ApprovalsPage() {
  const items = await getApproverQueue();
  return <ApproverQueue items={items} />;
}
