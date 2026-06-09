import type { NarrativeSections } from "@transforma/review-core";
import { StatusBadge } from "@/components/atoms";
import { IcoCheck, IcoCheckCircle, IcoFlag, IcoLock, IcoShield } from "@/components/atoms/icons";
import { RoleLabel } from "@/lib/labels/RoleLabelProvider";
import type { MyResponse } from "@/lib/subject/data";
import { AckPanel } from "./AckPanel";

const SECTIONS: { key: keyof NarrativeSections; label: string }[] = [
  { key: "summary", label: "Summary" },
  { key: "strengths", label: "Strengths" },
  { key: "areasToGrow", label: "Areas to grow" },
  { key: "focusNextCycle", label: "Focus for next cycle" },
];

/** The finished review — narrative sections + the rating the human approver set. */
export function ReviewDocument({ narrative, rating }: { narrative: NarrativeSections; rating: string | null }) {
  return (
    <div className="card pad">
      {SECTIONS.map((s) => (
        <div className="doc-section" key={s.key}>
          <p className="ds-label">{s.label}</p>
          <p className="ds-body">{narrative[s.key]}</p>
        </div>
      ))}
      {rating ? (
        <div className="doc-section">
          <p className="ds-label">
            Rating · set by your <RoleLabel role="approver" />
          </p>
          <div className="doc-outcome">
            <span className="oc-mark">
              <IcoCheck s={22} sw={2.4} />
            </span>
            <span>
              <span className="oc-label">Overall</span>
              <span className="oc-value">{rating}</span>
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// Status-only timeline. Contains NO narrative/rating/flag — the subject sees
// "In review" until the finished review is revealed. (Non-negotiable #3.)
const STATUS_STEPS = [
  { title: "Peer reviewers approved", meta: "Done", state: "done" as const },
  { title: "Self-review & peer feedback", meta: "Both open now — running in parallel", state: "current" as const },
  { title: "Draft review", meta: "Prepared once feedback is in", state: "upcoming" as const },
  { title: "Manager review", meta: "finalizes and sets the rating", state: "upcoming" as const, roleLabel: true },
  { title: "Ready to read & acknowledge", meta: "Unlocks here when it's shared with you", state: "upcoming" as const },
];

export function MyReviewStatus() {
  return (
    <div className="tf-page subj-col">
      <div className="page-header">
        <div className="ph-left">
          <div className="ph-eyebrow">
            <span className="t-label">Your review</span>
            <StatusBadge status="in-review" sm />
          </div>
          <div className="ph-title">
            <h1>Your review is on its way.</h1>
          </div>
          <p className="ph-sub">
            There&apos;s nothing for you to do right now. Here&apos;s where things stand — we&apos;ll let you know the
            moment it&apos;s ready.
          </p>
        </div>
      </div>
      <div className="card pad">
        <div className="rv-timeline">
          {STATUS_STEPS.map((s, i) => (
            <div className={`rv-step ${s.state}`} key={i}>
              <div className="rv-rail">
                <span className="rv-node">
                  {s.state === "done" ? <IcoCheck s={15} sw={2.6} /> : <span className="as-dot" />}
                </span>
                <span className="rv-line" />
              </div>
              <div className="rv-body">
                <h3 className="rv-step-title">
                  {s.roleLabel ? (
                    <>
                      <RoleLabel role="approver" /> review
                    </>
                  ) : (
                    s.title
                  )}
                </h3>
                <p className="rv-step-meta">{s.meta}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="rv-reassure" style={{ marginTop: 16 }}>
        <span className="ico">
          <IcoLock s={18} />
        </span>
        <p>
          <strong>Drafts stay private until your review is final.</strong> You&apos;ll only ever see the finished
          version — never work in progress.
        </p>
      </div>
    </div>
  );
}

export function ReviewReady({
  reviewId,
  narrative,
  rating,
}: {
  reviewId: string;
  narrative: NarrativeSections;
  rating: string | null;
}) {
  return (
    <div className="tf-page subj-col">
      <div className="page-header doc-head">
        <div className="ph-left">
          <div className="ph-eyebrow">
            <span className="t-label">Your review</span>
            <StatusBadge status="awaiting-acknowledgement" sm />
          </div>
          <div className="ph-title">
            <h1>Your review is ready to read.</h1>
          </div>
          <p className="ph-sub">
            Your <RoleLabel role="approver" /> has finalized your review. Take your time with it, then let us know
            you&apos;ve seen it.
          </p>
          <div className="doc-meta">
            <span className="dm">
              <IcoShield s={15} sw={1.8} /> Finalized by your <RoleLabel role="approver" />
            </span>
          </div>
        </div>
      </div>
      <ReviewDocument narrative={narrative} rating={rating} />
      <AckPanel reviewId={reviewId} />
    </div>
  );
}

export function ReviewLocked({
  narrative,
  rating,
  response,
}: {
  narrative: NarrativeSections;
  rating: string | null;
  response: MyResponse | null;
}) {
  const flagged = response?.outcome === "responded";
  return (
    <div className="tf-page subj-col">
      <div className="page-header doc-head">
        <div className="ph-left">
          <div className="ph-eyebrow">
            <span className="t-label">Your review · Final</span>
            <StatusBadge status="locked" sm />
          </div>
          <div className="ph-title">
            <h1>Your review is locked.</h1>
          </div>
          <p className="ph-sub">This is your final review. It&apos;s locked and read-only — it won&apos;t change.</p>
          <div className="doc-meta">
            <span className="dm">
              <IcoShield s={15} sw={1.8} /> Finalized by your <RoleLabel role="approver" />
            </span>
            <span className="dm">
              <IcoLock s={15} sw={1.8} /> Locked
            </span>
          </div>
        </div>
      </div>

      {response ? (
        <div className={`doc-note ${flagged ? "warn" : "neutral"}`}>
          <span className="ico">{flagged ? <IcoFlag s={18} /> : <IcoCheckCircle s={18} />}</span>
          <span>
            {flagged ? (
              <>
                <strong>You flagged this review.</strong> Acknowledging or flagging never changes the review — your
                response is stored beside it, below.
              </>
            ) : (
              <>
                <strong>You acknowledged this review.</strong> Acknowledging confirms you read it; it doesn&apos;t mean
                you agreed.
              </>
            )}
          </span>
        </div>
      ) : null}

      <ReviewDocument narrative={narrative} rating={rating} />

      {response?.body ? (
        <div className="response-card">
          <div className="rc-head">
            <span className="rc-title">Your written response</span>
            <span className="ref-chip">Stored alongside · doesn&apos;t edit the review</span>
          </div>
          <p className="rc-body">{response.body}</p>
        </div>
      ) : null}
    </div>
  );
}
