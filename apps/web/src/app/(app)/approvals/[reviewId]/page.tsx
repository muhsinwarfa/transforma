import Link from "next/link";
import { RATING_OPTIONS } from "@transforma/db";
import { ApproverFinalized } from "@/components/approver/Finalized";
import { ApproverWorkspace } from "@/components/approver/Workspace";
import { IcoChevLeft, IcoShield } from "@/components/atoms/icons";
import { getWorkspace } from "@/lib/approver/data";
import { resolveLabels } from "@/lib/labels/roleLabel";

export default async function ApprovalWorkspacePage({ params }: { params: Promise<{ reviewId: string }> }) {
  const { reviewId } = await params;
  const data = await getWorkspace(reviewId);
  const labels = await resolveLabels();

  // ABSENCE at the data layer, not a hidden UI row. RLS returns the review only
  // to its assigned approver; a SoD-barred approver hand-typing this URL gets
  // `null` here — same wire-not-pixels standard as the subject reveal boundary.
  if (!data) {
    return (
      <div className="tf-page subj-narrow">
        <Link className="form-back" href="/approvals">
          <IcoChevLeft s={16} /> Back to queue
        </Link>
        <div className="card pad">
          <div className="state-block">
            <span className="state-glyph">
              <IcoShield s={26} />
            </span>
            <h3>This review isn&apos;t available to you</h3>
            <p>
              It may belong to another {labels.approver}, or you may have contributed feedback to it — in which case
              the decision is routed elsewhere to keep it independent.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Finalized (revealed, awaiting ack) or locked → read-only; no correction path.
  if (data.status === "awaiting-acknowledgement" || data.status === "locked") {
    return <ApproverFinalized data={data} />;
  }

  // Pre-finalize editable states (in-review / flagged).
  return <ApproverWorkspace data={data} ratingOptions={[...RATING_OPTIONS]} />;
}
