import Link from "next/link";
import { PeerForm } from "@/components/peer/PeerForm";
import { IcoCheckCircle, IcoChevLeft, IcoClock, IcoShield } from "@/components/atoms/icons";
import { getPeerFeedback, PEER_PROMPTS } from "@/lib/peer/feedback";
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
        <Link className="form-back" href="/peer">
          <IcoChevLeft s={16} /> All requests
        </Link>
        <div className="card pad">
          <div className="state-block">
            <span className="state-glyph">
              <IcoShield s={26} />
            </span>
            <h3>This request isn&apos;t available to you</h3>
            <p>It may belong to a different {labels.peer}, or it may have already been handled.</p>
          </div>
        </div>
      </div>
    );
  }

  const firstName = data.subjectName.split(" ")[0] || "them";

  if (data.state === "submitted") {
    return (
      <div className="tf-page subj-narrow">
        <Link className="form-back" href="/peer">
          <IcoChevLeft s={16} /> All requests
        </Link>
        <div className="card pad">
          <div className="confirm-hero">
            <span className="confirm-mark">
              <IcoCheckCircle s={40} sw={1.7} />
            </span>
            <h1>Thank you — that&apos;s in.</h1>
            <p>
              Your feedback for {data.subjectName} has been submitted. It stays confidential and helps make {firstName}
              &apos;s review fuller and fairer.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (data.state === "declined") {
    return (
      <div className="tf-page subj-narrow">
        <Link className="form-back" href="/peer">
          <IcoChevLeft s={16} /> All requests
        </Link>
        <div className="card pad">
          <div className="state-block">
            <span className="state-glyph">
              <IcoCheckCircle s={26} />
            </span>
            <h3>You declined this request</h3>
            <p>No further action is needed. Thanks for letting us know.</p>
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
            <p>The window to give feedback for {data.subjectName} has closed, so it can no longer be submitted. No action is needed from you.</p>
          </div>
        </div>
      </div>
    );
  }

  // 'new' | 'draft' → editable
  return <PeerForm data={data} prompts={PEER_PROMPTS} />;
}
