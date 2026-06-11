import { BackToHome } from "@/components/atoms";
import { IcoReview } from "@/components/atoms/icons";
import { MyReviewStatus, ReviewLocked, ReviewReady } from "@/components/subject/screens";
import { getActiveCycle } from "@/lib/admin/data";
import { getMyResponse, getMyReviewStatus, getRevealedReview } from "@/lib/subject/data";
import { decideSubjectView } from "@/lib/subject/view";

// Always fresh: the status timeline mirrors live nomination/review state that a
// manager moves from another session, so it must never serve a cached render.
export const dynamic = "force-dynamic";

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
      <div className="tf-page subj-narrow">
        <div className="card pad">
          <div className="state-block">
            <span className="state-glyph">
              <IcoReview s={26} />
            </span>
            <h3>No active review</h3>
            <p>You don&apos;t have an active review this cycle yet.</p>
            <BackToHome />
          </div>
        </div>
      </div>
    );
  }

  if (status.displayStatus === "in-review") {
    return <MyReviewStatus />;
  }

  const [review, cycle] = await Promise.all([getRevealedReview(), getActiveCycle()]);
  const cycleName = cycle?.name ?? null;
  const view = decideSubjectView(status.displayStatus, Boolean(review?.narrative));

  if (view === "reveal" && review?.narrative) {
    return (
      <ReviewReady
        reviewId={review.reviewId}
        narrative={review.narrative}
        rating={review.rating}
        ackWindowEndsAt={review.ackWindowEndsAt}
        cycleName={cycleName}
      />
    );
  }
  if (view === "locked" && review?.narrative) {
    const response = await getMyResponse(review.reviewId);
    return (
      <ReviewLocked
        narrative={review.narrative}
        rating={review.rating}
        response={response}
        lockedAt={review.lockedAt}
        cycleName={cycleName}
      />
    );
  }
  return <MyReviewStatus />; // safety fallback — never leak content
}
