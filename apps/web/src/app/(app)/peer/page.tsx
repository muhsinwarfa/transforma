import { PeerList } from "@/components/peer/PeerList";
import { resolveLabels } from "@/lib/labels/roleLabel";
import { getPeerAssignments } from "@/lib/peer/feedback";

// PROC-03 peer side. `peer_request_list` (owner-run view) returns ONLY this
// peer's own requests — never another peer's, the self-review, the draft, or the
// outcome. Self-review and peer feedback are collected in parallel; this surface
// never gates on the subject's self-review.
export default async function PeerPage() {
  const [requests, labels] = await Promise.all([getPeerAssignments(), resolveLabels()]);
  return <PeerList requests={requests} labels={labels} />;
}
