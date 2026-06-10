import Link from "next/link";
import { PeerForm } from "@/components/peer/PeerForm";
import { Button } from "@/components/atoms";
import {
  IcoArrowRight,
  IcoCheck,
  IcoCheckCircle,
  IcoChevLeft,
  IcoClock,
  IcoInfo,
  IcoPeer,
} from "@/components/atoms/icons";
import { getPeerAssignments, getPeerFeedback, PEER_PROMPTS, shortDate } from "@/lib/peer/feedback";
import { resolveLabels } from "@/lib/labels/roleLabel";

export default async function PeerRequestPage({ params }: { params: Promise<{ reviewId: string }> }) {
  const { reviewId } = await params;
  const data = await getPeerFeedback(reviewId);
  const labels = await resolveLabels();

  // Absence at the data layer — peer_request_list only returns this peer's own
  // rows. Hand-typing another request's URL yields null.
  if (!data) {
    return (
      <div className="tf-page subj-narrow">
        <div className="card pad">
          <div className="state-block">
            <span className="state-glyph">
              <IcoInfo s={26} />
            </span>
            <h3>Not available</h3>
            <p>
              This request isn&apos;t available to you. It may belong to a different {labels.peer}, or it may have
              already been handled.
            </p>
            <Link href="/peer">
              <Button variant="secondary">Back to requests</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (data.state === "submitted") {
    // "Remaining" = the peer's other still-open requests (excluding this one).
    const all = await getPeerAssignments();
    const openOthers = all.filter(
      (r) => r.reviewId !== reviewId && (r.state === "new" || r.state === "draft"),
    );
    const remaining = openOthers.length;
    const nextId = openOthers[0]?.reviewId;
    return (
      <div className="tf-page subj-narrow">
        <div className="card pad">
          <div className="confirm-hero">
            <span className="confirm-mark">
              <IcoCheckCircle s={40} sw={1.7} />
            </span>
            <h1>Thank you — that&apos;s in.</h1>
            <p>
              Your feedback for {data.subjectName} has been submitted. It stays confidential and helps make their review
              fuller and fairer.
            </p>
          </div>
          <div className="confirm-next">
            <p className="cn-label">
              {remaining > 0 ? `You have ${remaining} more request${remaining > 1 ? "s" : ""}` : "You’re all caught up"}
            </p>
            {remaining > 0 ? (
              <div className="confirm-row">
                <span className="cr-ico">
                  <IcoPeer s={18} />
                </span>
                <span className="cr-text">
                  Keep the momentum going<span>Next request takes just a few minutes.</span>
                </span>
              </div>
            ) : (
              <div className="confirm-row">
                <span className="cr-ico">
                  <IcoCheck s={18} sw={2.2} />
                </span>
                <span className="cr-text">
                  No more feedback requests<span>We&apos;ll let you know if another comes in.</span>
                </span>
              </div>
            )}
          </div>
          <div className="confirm-actions">
            <Link href="/peer">
              <Button variant="secondary">Back to requests</Button>
            </Link>
            {remaining > 0 && nextId ? (
              <Link href={`/peer/${nextId}`}>
                <Button variant="primary">
                  Next request <IcoArrowRight s={16} />
                </Button>
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (data.state === "declined") {
    return (
      <div className="tf-page subj-narrow">
        <div className="card pad">
          <div className="state-block">
            <span className="state-glyph">
              <IcoCheckCircle s={26} />
            </span>
            <h3>Request declined</h3>
            <p>You declined this request. No further action is needed. Thanks for letting us know.</p>
            <Link href="/peer">
              <Button variant="secondary">Back to requests</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (data.state === "closed") {
    return (
      <div className="tf-page subj-narrow">
        <Link className="form-back" href="/peer">
          <IcoChevLeft s={16} /> All requests
        </Link>
        <div className="card pad">
          <div className="state-block">
            <span className="state-glyph">
              <IcoClock s={26} />
            </span>
            <h3>This request has closed</h3>
            <p>
              The window to give feedback for {data.subjectName} closed on {shortDate(data.deadlineAt)}, so it can no
              longer be submitted. No action is needed from you.
            </p>
            <Link href="/peer">
              <Button variant="secondary">Back to requests</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 'new' | 'draft' → editable
  return <PeerForm data={data} prompts={PEER_PROMPTS} labels={labels} />;
}
