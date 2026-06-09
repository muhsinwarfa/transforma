import { MyReviewStatus, ReviewLocked, ReviewReady } from "@/components/subject/screens";
import { getMyResponse, getMyReviewStatus, getRevealedReview } from "@/lib/subject/data";
import { decideSubjectView } from "@/lib/subject/view";

/**
 * The Subject "My review" screen — the reveal boundary in the rendered UI.
 *
 * The finished review (narrative + rating) is fetched ONLY when the status is
 * past reveal. While `in-review`, the page returns status-only and never touches
 * the narrative path at all. Defence in depth: even if `getRevealedReview` were
 * called early, the `revealed_review` view returns zero rows pre-reveal, and RLS
 * denies the subject any direct read of the draft/flag/rating.
 */
export default async function ReviewPage() {
  const status = await getMyReviewStatus();
  if (!status) {
    return (
      <div className="tf-page subj-col">
        <div className="card pad">
          <p className="t-body">You don&apos;t have an active review this cycle yet.</p>
        </div>
      </div>
    );
  }

  if (status.displayStatus === "in-review") {
    return <MyReviewStatus />;
  }

  const review = await getRevealedReview();
  const view = decideSubjectView(status.displayStatus, Boolean(review?.narrative));

  if (view === "reveal" && review?.narrative) {
    return <ReviewReady reviewId={review.reviewId} narrative={review.narrative} rating={review.rating} />;
  }
  if (view === "locked" && review?.narrative) {
    const response = await getMyResponse(review.reviewId);
    return <ReviewLocked narrative={review.narrative} rating={review.rating} response={response} />;
  }
  return <MyReviewStatus />; // safety fallback — never leak content
}
