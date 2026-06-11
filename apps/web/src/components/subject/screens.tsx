import Link from "next/link";
import type { NarrativeSections } from "@transforma/review-core";
import { BackToHome, RoleLabel, StatusBadge } from "@/components/atoms";
import {
  IcoArrowRight,
  IcoCheck,
  IcoCheckCircle,
  IcoClock,
  IcoEdit,
  IcoFlag,
  IcoLock,
  IcoShield,
} from "@/components/atoms/icons";
import { resolveLabels } from "@/lib/labels/roleLabel";
import type { MyResponse } from "@/lib/subject/data";
import { getNominationData } from "@/lib/subject/nominations";
import { getSelfReview } from "@/lib/subject/selfReview";
import { formatLongDate, formatShortDate } from "@/lib/subject/format";
import { AckPanel } from "./AckPanel";

const SECTIONS: { key: keyof NarrativeSections; label: string }[] = [
  { key: "summary", label: "Summary" },
  { key: "strengths", label: "Strengths" },
  { key: "areasToGrow", label: "Areas to grow" },
  { key: "focusNextCycle", label: "Focus for next cycle" },
];

/** The finished review — narrative sections + the rating the human approver set. */
export function ReviewDocument({
  narrative,
  rating,
  approverLabel,
}: {
  narrative: NarrativeSections;
  rating: string | null;
  approverLabel: string;
}) {
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
            Rating · set by your <RoleLabel label={approverLabel} token="approver_label" />
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
// "In review" until the finished review is revealed (Non-negotiable #3). Steps
// and dates are derived from LIVE state (nomination status + self-review), never
// demo data: step 1 is the only step the subject drives and the only one carrying
// a real date (the roster's approved_at); later steps stay "upcoming" because the
// subject must never see draft/manager progress.
type StepState = "done" | "current" | "upcoming";
interface TimelineStep {
  title: string;
  meta: string;
  state: StepState;
  roleLabel?: boolean;
  cta?: { href: string; label: string };
}

export async function MyReviewStatus() {
  const [labels, nom, self] = await Promise.all([resolveLabels(), getNominationData(), getSelfReview()]);
  const nomStatus = nom?.status ?? "not-started";
  const approved = nomStatus === "approved";
  const selfSubmitted = Boolean(self?.submitted);
  const approvedDate = nom?.approvedAt ? formatShortDate(nom.approvedAt) : null;

  // Step 1 — peer reviewers: the subject's own step, and the only one with a date.
  let step1: TimelineStep;
  if (approved) {
    step1 = { title: "Peer reviewers approved", meta: approvedDate ? `Approved ${approvedDate}` : "Approved", state: "done" };
  } else if (nomStatus === "pending") {
    step1 = { title: "Peer nominations sent", meta: "With your manager for approval", state: "current" };
  } else if (nomStatus === "changes_requested") {
    step1 = { title: "Adjust your peer nominations", meta: "Your manager asked for a change", state: "current", cta: { href: "/review/nominate", label: "Review" } };
  } else {
    step1 = { title: "Nominate your peer reviewers", meta: "Pick who gives you feedback — at least 3", state: "current", cta: { href: "/review/nominate", label: "Nominate" } };
  }

  // Step 2 — self-review & peer feedback: opens only once reviewers are approved.
  const step2: TimelineStep = !approved
    ? { title: "Self-review & peer feedback", meta: "Opens once your reviewers are approved", state: "upcoming" }
    : selfSubmitted
      ? { title: "Self-review & peer feedback", meta: "Self-review submitted · peer feedback in progress", state: "current" }
      : { title: "Self-review & peer feedback", meta: "Both open now — running in parallel", state: "current", cta: { href: "/review/self", label: "Write self-review" } };

  const steps: TimelineStep[] = [
    step1,
    step2,
    { title: "Draft review", meta: "Prepared once feedback is in", state: "upcoming" },
    { title: "Manager review", meta: "Your manager finalizes and sets the rating", state: "upcoming", roleLabel: true },
    { title: "Ready to read & acknowledge", meta: "Unlocks here when it's shared with you", state: "upcoming" },
  ];

  // Honest header: there IS something to do when the current step carries a CTA.
  const action = step1.cta ?? step2.cta;
  const headline = approved
    ? selfSubmitted
      ? "Your review is on its way."
      : "Time for your self-review."
    : nomStatus === "pending"
      ? "Your nominations are with your manager."
      : nomStatus === "changes_requested"
        ? "Your manager asked for a change."
        : "Let’s line up your peer reviewers.";

  return (
    <div className="tf-page subj-col">
      <div className="page-header">
        <div className="ph-left">
          <div className="ph-eyebrow">
            <span className="t-label">Your review</span>
            <StatusBadge status="in-review" sm />
          </div>
          <div className="ph-title">
            <h1>{headline}</h1>
          </div>
          <p className="ph-sub">
            {action
              ? "Here’s where things stand — one thing needs you, below."
              : "There’s nothing for you to do right now. Here’s where things stand — we’ll let you know the moment it’s ready."}
          </p>
        </div>
      </div>
      <div className="card pad">
        <div className="rv-timeline">
          {steps.map((s, i) => (
            <div className={`rv-step ${s.state}`} key={i}>
              <div className="rv-rail">
                <span className="rv-node">
                  {s.state === "done" ? (
                    <IcoCheck s={15} sw={2.6} />
                  ) : s.state === "current" ? (
                    <span className="as-dot" />
                  ) : (
                    <span style={{ width: 7, height: 7, borderRadius: 999, background: "currentColor" }} />
                  )}
                </span>
                <span className="rv-line" />
              </div>
              <div className="rv-body">
                <h3 className="rv-step-title">
                  {s.roleLabel ? (
                    <>
                      <RoleLabel label={labels.approver} token="approver_label" /> review
                    </>
                  ) : (
                    s.title
                  )}
                  {s.state === "current" ? (
                    <span className="badge in-review sm">
                      <span className="dot" />
                      Now
                    </span>
                  ) : null}
                </h3>
                <p className="rv-step-meta">{s.meta}</p>
                {s.cta ? (
                  <Link href={s.cta.href} className="btn btn-primary sm" style={{ marginTop: 10, display: "inline-flex" }}>
                    {s.cta.label} <IcoArrowRight s={15} />
                  </Link>
                ) : null}
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
      <div style={{ marginTop: 20 }}>
        <BackToHome />
      </div>
    </div>
  );
}

export async function ReviewReady({
  reviewId,
  narrative,
  rating,
  ackWindowEndsAt,
  cycleName,
}: {
  reviewId: string;
  narrative: NarrativeSections;
  rating: string | null;
  ackWindowEndsAt: string | null;
  cycleName: string | null;
}) {
  const labels = await resolveLabels();
  const deadline = formatLongDate(ackWindowEndsAt);
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
            Your <RoleLabel label={labels.approver} token="approver_label" /> has finalized your review
            {cycleName ? ` for ${cycleName}` : ""}. Take your time with it, then let us know you&apos;ve seen it.
          </p>
          <div className="doc-meta">
            <span className="dm">
              <IcoShield s={15} sw={1.8} /> Finalized by your{" "}
              <RoleLabel label={labels.approver} token="approver_label" />
            </span>
            {deadline ? (
              <span className="dm">
                <IcoClock s={15} sw={1.8} /> Acknowledge by {deadline}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <ReviewDocument narrative={narrative} rating={rating} approverLabel={labels.approver} />
      <AckPanel reviewId={reviewId} ackWindowEndsAt={ackWindowEndsAt} approverLabel={labels.approver} />
    </div>
  );
}

export async function ReviewLocked({
  narrative,
  rating,
  response,
  lockedAt,
  cycleName,
}: {
  narrative: NarrativeSections;
  rating: string | null;
  response: MyResponse | null;
  lockedAt: string | null;
  cycleName: string | null;
}) {
  const labels = await resolveLabels();
  const flagged = response?.outcome === "responded";
  const lockedDate = formatShortDate(lockedAt);
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
          <p className="ph-sub">
            This is your final review{cycleName ? ` for ${cycleName}` : ""}. It&apos;s locked and read-only — it
            won&apos;t change.
          </p>
          <div className="doc-meta">
            <span className="dm">
              <IcoShield s={15} sw={1.8} /> Finalized by your{" "}
              <RoleLabel label={labels.approver} token="approver_label" />
            </span>
            <span className="dm">
              <IcoLock s={15} sw={1.8} /> {lockedDate ? `Locked ${lockedDate}` : "Locked"}
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
                <strong>
                  You acknowledged this review{lockedDate ? ` on ${lockedDate}` : ""}.
                </strong>{" "}
                Acknowledging confirms you read it; it doesn&apos;t mean you agreed.
              </>
            )}
          </span>
        </div>
      ) : null}

      <ReviewDocument narrative={narrative} rating={rating} approverLabel={labels.approver} />

      {response?.body ? (
        <div className="response-card">
          <div className="rc-head">
            <span className="rc-ico">{flagged ? <IcoFlag s={16} /> : <IcoEdit s={16} />}</span>
            <span className="rc-title">Your written response</span>
            <span className="ref-chip">Stored alongside · doesn&apos;t edit the review</span>
          </div>
          <p className="rc-body">{response.body}</p>
        </div>
      ) : null}
    </div>
  );
}
