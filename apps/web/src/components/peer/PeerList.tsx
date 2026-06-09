import Link from "next/link";
import { Avatar } from "@/components/atoms";
import { IcoArrowRight, IcoCheck, IcoCheckCircle, IcoClock } from "@/components/atoms/icons";
import type { PeerAssignment } from "@/lib/peer/feedback";

function daysLeft(deadlineAt: string | null): number | null {
  if (!deadlineAt) return null;
  return Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / 86_400_000);
}
function deadlineClass(d: number | null): string {
  if (d === null) return "calm";
  if (d < 0) return "closed";
  if (d <= 3) return "";
  return "calm";
}
function deadlineText(deadlineAt: string | null): string {
  const d = daysLeft(deadlineAt);
  if (d === null) return "No deadline set";
  if (d < 0) return "Window closed";
  if (d === 0) return "Due today";
  return `${d} ${d === 1 ? "day" : "days"} left`;
}

function Row({ req }: { req: PeerAssignment }) {
  const done = req.state === "submitted";
  const closed = req.state === "closed" || req.state === "declined";
  return (
    <Link href={`/peer/${req.reviewId}`} className="card pad peer-row interactive">
      <Avatar name={req.subjectName} cls="lg" />
      <div className="peer-row-main">
        <div className="peer-row-top">
          <span className="peer-row-name">{req.subjectName}</span>
        </div>
        {req.department ? <span className="peer-row-rel">{req.department}</span> : null}
        <div className="peer-row-foot">
          {done ? (
            <span className="badge in-review sm">
              <IcoCheck s={11} sw={2.4} />
              Submitted
            </span>
          ) : closed ? (
            <span className="deadline closed">
              <IcoClock s={13} sw={1.9} /> {req.state === "declined" ? "Declined" : "Window closed"}
            </span>
          ) : (
            <span className={`deadline ${deadlineClass(daysLeft(req.deadlineAt))}`}>
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
      {!done ? (
        <span className="peer-row-cta">
          {closed ? "View" : req.state === "draft" ? "Continue" : "Start"} <IcoArrowRight s={16} />
        </span>
      ) : null}
    </Link>
  );
}

export function PeerList({ requests }: { requests: PeerAssignment[] }) {
  const open = requests.filter((r) => r.state === "new" || r.state === "draft");
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
              <Row key={r.reviewId} req={r} />
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
              <Row key={r.reviewId} req={r} />
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
              <Row key={r.reviewId} req={r} />
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
