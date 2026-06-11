import { NominateForm, NominateStatusCard } from "@/components/subject/Nominate";
import { resolveLabels } from "@/lib/labels/roleLabel";
import { getNominationData } from "@/lib/subject/nominations";

// Always render fresh from live nomination state. The subject reaches this page
// across a manager action that happens in a DIFFERENT session (request-changes /
// approve), so a cached render would strand them on a stale "sent for approval"
// screen after the state has moved to changes-requested.
export const dynamic = "force-dynamic";

export default async function NominatePage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const [data, sp, labels] = await Promise.all([getNominationData(), searchParams, resolveLabels()]);
  if (!data) {
    return (
      <div className="tf-page subj-col">
        <div className="card pad">
          <p className="t-body">You don&apos;t have an active review this cycle yet.</p>
        </div>
      </div>
    );
  }
  if (data.status === "approved") return <NominateStatusCard variant="approved" labels={labels} />;
  if (data.status === "pending") return <NominateStatusCard variant="pending" labels={labels} />;

  // changes_requested: show the status screen by default; the "Edit nominations"
  // CTA links back here with ?edit=1 to open the editable form (seeded with the
  // prior set + the manager's note rendered VERBATIM in the change banner).
  if (data.status === "changes_requested" && sp.edit !== "1") {
    return <NominateStatusCard variant="changes" labels={labels} />;
  }

  // not-started, or changes_requested + edit → editable form
  return (
    <NominateForm
      candidates={data.candidates}
      selectedSeed={data.selectedIds}
      min={data.min}
      max={data.max}
      changeNote={data.status === "changes_requested" ? data.managerNote : null}
      labels={labels}
    />
  );
}
