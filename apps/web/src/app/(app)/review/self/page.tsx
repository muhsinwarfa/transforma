import { SelfReviewForm, SelfSubmittedCard } from "@/components/subject/SelfReview";
import { resolveLabels } from "@/lib/labels/roleLabel";
import { SELF_PROMPTS, getSelfReview } from "@/lib/subject/selfReview";

export default async function SelfReviewPage() {
  const [data, labels] = await Promise.all([getSelfReview(), resolveLabels()]);
  if (!data) {
    return (
      <div className="tf-page subj-col">
        <div className="card pad">
          <p className="t-body">You don&apos;t have an active review this cycle yet.</p>
        </div>
      </div>
    );
  }
  if (data.submitted) return <SelfSubmittedCard labels={labels} />;
  return <SelfReviewForm prompts={SELF_PROMPTS} seed={data.answers} />;
}
