import { ReviewOversight, type ReviewsMode } from "@/components/admin/ReviewOversight";
import { getAdminReviewList, getMyReviewAccess } from "@/lib/admin/content";
import { getActiveCycle } from "@/lib/admin/data";
import { resolveLabels } from "@/lib/labels/roleLabel";

export default async function AdminReviewsPage() {
  // The list is gated server-side (returns [] unless the caller holds the
  // capability AND the setting is on); content is read on click, audited per view.
  // getMyReviewAccess distinguishes the three closed states the list alone collapses
  // to []: OFF (setting off), NO-GRANT (this admin lacks the capability), EMPTY.
  const [reviews, myAccess, labels, cycle] = await Promise.all([
    getAdminReviewList(),
    getMyReviewAccess(),
    resolveLabels(),
    getActiveCycle(),
  ]);

  const mode: ReviewsMode = !myAccess.enabled
    ? "off"
    : !myAccess.granted
      ? "nogrant"
      : reviews.length === 0
        ? "empty"
        : "list";

  return (
    <ReviewOversight
      mode={mode}
      reviews={reviews}
      labels={{ subject: labels.subject, approver: labels.approver }}
      adminLabel={labels.admin}
      cycleName={cycle?.name ?? ""}
    />
  );
}
