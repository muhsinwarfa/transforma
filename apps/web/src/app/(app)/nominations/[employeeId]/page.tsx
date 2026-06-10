import Link from "next/link";
import { NominationApproval } from "@/components/approver/NominationApproval";
import { IcoChevLeft, IcoShield } from "@/components/atoms/icons";
import { getNominationDetail } from "@/lib/approver/nominations";
import { pluralize, resolveLabels } from "@/lib/labels/roleLabel";

export default async function NominationDetailPage({ params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params;
  const data = await getNominationDetail(employeeId);
  const labels = await resolveLabels();

  // Absence at the data layer: `nomination_sets` only returns the approver's own
  // reports. A manager hand-typing another report's URL gets null here.
  if (!data) {
    return (
      <div className="tf-page subj-narrow">
        <Link className="form-back" href="/nominations">
          <IcoChevLeft s={16} /> All nominations
        </Link>
        <div className="card pad">
          <div className="state-block">
            <span className="state-glyph">
              <IcoShield s={26} />
            </span>
            <h3>These nominations aren&apos;t available to you</h3>
            <p>They belong to someone whose reviews are routed to a different {labels.approver}.</p>
          </div>
        </div>
      </div>
    );
  }

  // Already decided (approved / sent back) → show read-only context, no actions.
  if (data.status !== "pending") {
    return (
      <div className="tf-page subj-narrow">
        <Link className="form-back" href="/nominations">
          <IcoChevLeft s={16} /> All nominations
        </Link>
        <div className="card pad">
          <h2 className="t-h3" style={{ marginBottom: 6 }}>
            {data.subjectName}
          </h2>
          <p className="t-body">
            {data.status === "approved"
              ? `You've approved this peer set — feedback is open with those ${pluralize(labels.peer)}.`
              : "You've sent this back for changes. It'll return here once it's resubmitted."}
          </p>
        </div>
      </div>
    );
  }

  return <NominationApproval data={data} labels={labels} />;
}
