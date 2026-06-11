import Link from "next/link";
import { Avatar } from "@/components/atoms";
import { IcoArrowRight, IcoCheck, IcoCheckCircle, IcoClock } from "@/components/atoms/icons";
import type { RoleLabels } from "@/lib/labels/roleLabel";
import { daysLeft, deadlineClass, deadlineText, type PeerAssignment } from "@/lib/peer/feedback";

// The underlying configurable token behind each tenant role word (revealed by the
// "Show role tokens" toggle; hidden via the .tok / body.show-tokens CSS otherwise).
const SUBJECT_TOKEN = "subject_label";

function Row({ req, labels, done }: { req: PeerAssignment; labels: RoleLabels; done?: boolean }) {
  // A declined request is just as terminal as a window-closed one — both are
  // non-actionable. (The bug: declined fell through to the active branch, rendering a
  // live "Due … · N days left" + a "Start" CTA on a request that can't be acted on.)
  const closed = req.state === "closed" || req.state === "declined";
  return (
    <Link href={`/peer/${req.reviewId}`} className="card pad peer-row interactive">
      <Avatar name={req.subjectName} cls="lg" />
      <div className="peer-row-main">
        <div className="peer-row-top">
          <span className="peer-row-name">{req.subjectName}</span>
          <span className="role-chip sm">
            {labels.subject}
            <span className="tok">{`{${SUBJECT_TOKEN}}`}</span>
          </span>
        </div>
        {req.department ? <span className="peer-row-rel">{req.department}</span> : null}
        <div className="peer-row-foot">
          {done ? (
            <span
              className="badge in-review sm"
              style={{
                background: "rgba(0,0,77,0.05)",
                color: "var(--ink-2)",
                borderColor: "var(--hairline)",
              }}
            >
              <IcoCheck s={11} sw={2.4} />
              Submitted
            </span>
          ) : closed ? (
            // Terminal: no live deadline countdown — just the closed/declined state.
            <span className="deadline closed">
              <IcoClock s={13} sw={1.9} /> {req.state === "declined" ? "Declined" : "Closed"}
            </span>
          ) : (
            <span className={`deadline ${deadlineClass(daysLeft(req.deadlineAt))}`.trim()}>
              <IcoClock s={13} sw={1.9} /> {deadlineText(req.deadlineAt)}
            </span>
          )}
          {req.state === "draft" ? (
            <span className="badge draft sm">
              <span className="dot" />
              In progress
            </span>
          ) : null}
        </div>
      </div>
      {!done && !closed ? (
        // No CTA on terminal (submitted / closed / declined) cards — only an
        // actionable request invites Start/Continue.
        <span className="peer-row-cta">
          {req.state === "draft" ? "Continue" : "Start"} <IcoArrowRight s={16} />
        </span>
      ) : null}
    </Link>
  );
}

export function PeerList({ requests, labels }: { requests: PeerAssignment[]; labels: RoleLabels }) {
  // declined rows are a terminal, non-actionable outcome — they sit with closed.
  const open = requests.filter((r) => r.state !== "submitted" && r.state !== "closed" && r.state !== "declined");
  const done = requests.filter((r) => r.state === "submitted");
  const closed = requests.filter((r) => r.state === "closed" || r.state === "declined");

  return (
    <div className="tf-page subj-col">
      <div className="page-header">
        <div className="ph-left">
          <div className="ph-eyebrow">
            <span className="t-label">Peer feedback</span>
          </div>
          <div className="ph-title">
            <h1>Feedback others asked you for</h1>
          </div>
          <p className="ph-sub">
            Each request is about one person and is private — they won&apos;t see who said what. Take them one at a time;
            we save as you go.
          </p>
        </div>
      </div>

      {open.length > 0 ? (
        <section className="peer-sec">
          <div className="peer-sec-head">
            <span className="t-label">To do</span>
            <span className="peer-sec-count">{open.length}</span>
          </div>
          <div className="peer-list">
            {open.map((r) => (
              <Row key={r.reviewId} req={r} labels={labels} />
            ))}
          </div>
        </section>
      ) : null}

      {done.length > 0 ? (
        <section className="peer-sec">
          <div className="peer-sec-head">
            <span className="t-label">Submitted</span>
            <span className="peer-sec-count">{done.length}</span>
          </div>
          <div className="peer-list">
            {done.map((r) => (
              <Row key={r.reviewId} req={r} labels={labels} done />
            ))}
          </div>
        </section>
      ) : null}

      {closed.length > 0 ? (
        <section className="peer-sec">
          <div className="peer-sec-head">
            <span className="t-label">Closed</span>
            <span className="peer-sec-count">{closed.length}</span>
          </div>
          <div className="peer-list">
            {closed.map((r) => (
              <Row key={r.reviewId} req={r} labels={labels} />
            ))}
          </div>
        </section>
      ) : null}

      {requests.length === 0 ? (
        <div className="card pad">
          <div className="state-block">
            <span className="state-glyph">
              <IcoCheckCircle s={26} />
            </span>
            <h3>No feedback requests right now</h3>
            <p>When a colleague asks for your feedback, it&apos;ll show up here.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
