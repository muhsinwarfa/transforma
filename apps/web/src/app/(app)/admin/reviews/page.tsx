import { ReviewOversight } from "@/components/admin/ReviewOversight";
import { getAdminReviewList, getReviewContentAccess } from "@/lib/admin/content";

export default async function AdminReviewsPage() {
  // The list is gated server-side (returns [] unless the caller holds the
  // capability AND the setting is on); content is read on click, audited per view.
  const [reviews, access] = await Promise.all([getAdminReviewList(), getReviewContentAccess()]);
  return <ReviewOversight reviews={reviews} enabled={access.enabled} />;
}
