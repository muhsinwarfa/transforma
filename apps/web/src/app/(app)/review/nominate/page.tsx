import { NominateForm, NominateStatusCard } from "@/components/subject/Nominate";
import { getNominationData } from "@/lib/subject/nominations";

export default async function NominatePage() {
  const data = await getNominationData();
  if (!data) {
    return (
      <div className="tf-page subj-col">
        <div className="card pad">
          <p className="t-body">You don&apos;t have an active review this cycle yet.</p>
        </div>
      </div>
    );
  }
  if (data.status === "approved") return <NominateStatusCard variant="approved" />;
  if (data.status === "pending") return <NominateStatusCard variant="pending" />;
  // not-started or changes_requested → editable form (seeded with the prior set)
  return (
    <NominateForm
      candidates={data.candidates}
      selectedSeed={data.selectedIds}
      min={data.min}
      max={data.max}
      changeNote={data.status === "changes_requested" ? "Please take another look at your nominations." : null}
    />
  );
}
