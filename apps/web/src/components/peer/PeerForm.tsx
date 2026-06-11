"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/atoms";
import { IcoChevLeft, IcoClock, IcoInfo, IcoLock, IcoSaved, IcoSpinner } from "@/components/atoms/icons";
import { useToast } from "@/components/Toast";
import { declinePeerFeedback, savePeerFeedback, submitPeerFeedback } from "@/app/(app)/peer/actions";
import type { RoleLabels } from "@/lib/labels/roleLabel";
import type { PeerAnswers, PeerFeedbackView, PeerPrompt } from "@/lib/peer/feedback";

type SaveState = "idle" | "saving" | "saved";

// Ported verbatim from the design (peer.jsx). Inlined here because the lib helpers
// live in a `server-only` module; these are pure and identical.
const SUBJECT_TOKEN = "subject_label";
function shortDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}
function deadlineClass(d: number | null): string {
  if (d === null) return "calm";
  if (d < 0) return "closed";
  if (d <= 3) return "";
  return "calm";
}
function deadlineText(iso: string | null): string {
  const d = daysLeft(iso);
  const date = shortDate(iso);
  if (d === null) return "No deadline set";
  if (d < 0) return `Closed ${date}`;
  if (d === 0) return `Due today · ${date}`;
  return `Due ${date} · ${d} ${d === 1 ? "day" : "days"} left`;
}

const DECLINE_REASONS = [
  "I haven't worked with them closely enough",
  "I've only just started working with them",
  "There's a conflict of interest",
  "Another reason",
];

export function PeerForm({
  data,
  prompts,
  labels,
}: {
  data: PeerFeedbackView;
  prompts: readonly PeerPrompt[];
  labels: RoleLabels;
}) {
  const router = useRouter();
  const toast = useToast();
  const firstName = data.subjectName.split(" ")[0] || "them";
  const required = prompts.filter((p) => !p.optional);

  const [answers, setAnswers] = useState<PeerAnswers>(data.answers);
  const [save, setSave] = useState<SaveState>("idle");
  const [mode, setMode] = useState<"form" | "decline">("form");
  const [declineReason, setDeclineReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const answered = required.filter((p) => (answers[p.id] ?? "").trim().length > 0).length;
  const pct = Math.round((answered / required.length) * 100);
  const canSubmit = answered === required.length;
  const dClass = deadlineClass(daysLeft(data.deadlineAt));

  const onChange = (id: string, val: string) => {
    const next = { ...answers, [id]: val };
    setAnswers(next);
    setSave("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void savePeerFeedback(data.reviewId, next)
        .then(() => setSave("saved"))
        .catch(() => setSave("idle"));
    }, 900);
  };

  const submit = () => {
    setError(null);
    start(async () => {
      try {
        await submitPeerFeedback(data.reviewId, answers);
        toast(`Feedback for ${data.subjectName} submitted.`);
        router.push("/peer");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't submit your feedback.");
      }
    });
  };

  const confirmDecline = () => {
    setError(null);
    start(async () => {
      try {
        // The reason is optional; it rides into the audit target jsonb, not a
        // schema column (no silently-dropped field).
        await declinePeerFeedback(data.reviewId, declineReason || undefined);
        toast(`Request for ${data.subjectName} declined.`);
        router.push("/peer");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't decline this request.");
      }
    });
  };

  if (mode === "decline") {
    return (
      <div className="tf-page subj-narrow">
        <button className="form-back" onClick={() => setMode("form")}>
          <IcoChevLeft s={16} /> Back to feedback
        </button>
        <div className="page-header">
          <div className="ph-left">
            <div className="ph-eyebrow">
              <span className="t-label">Decline request</span>
            </div>
            <div className="ph-title">
              <h1>Not the right person?</h1>
            </div>
            <p className="ph-sub">
              No problem — if you can&apos;t give useful feedback for {firstName}, let us know and we&apos;ll take it off
              your list. This is private.
            </p>
          </div>
        </div>
        <div className="form-fields">
          <div className="field">
            <span className="field-label">
              A quick reason helps{" "}
              <span className="field-hint" style={{ fontWeight: 400 }}>
                (optional)
              </span>
            </span>
            <div className="reason-list" role="radiogroup" aria-label="Reason for declining">
              {DECLINE_REASONS.map((r) => (
                <label className={`reason-opt ${declineReason === r ? "sel" : ""}`} key={r}>
                  <input
                    type="radio"
                    name="decline"
                    checked={declineReason === r}
                    onChange={() => setDeclineReason(r)}
                  />
                  <span className="ro-radio" aria-hidden="true" />
                  <span className="ro-text">{r}</span>
                </label>
              ))}
            </div>
          </div>
          {error ? (
            <p className="field-msg" style={{ color: "var(--error)" }}>
              {error}
            </p>
          ) : null}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn-primary lg" onClick={confirmDecline} disabled={pending}>
              {pending ? <IcoSpinner s={17} /> : null} Decline this request
            </button>
            <button className="btn btn-ghost lg" onClick={() => setMode("form")} disabled={pending}>
              Keep it
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tf-page subj-col">
      <button className="form-back" onClick={() => router.push("/peer")}>
        <IcoChevLeft s={16} /> All requests
      </button>

      <div className="peer-subject-head">
        <Avatar name={data.subjectName} cls="lg" />
        <div className="psh-body">
          <div className="psh-top">
            <h1 className="psh-name">Feedback for {data.subjectName}</h1>
            <span className="role-chip sm">
              {labels.subject}
              <span className="tok">{`{${SUBJECT_TOKEN}}`}</span>
            </span>
          </div>
          {data.department ? <span className="psh-rel">{data.department}</span> : null}
        </div>
        {data.deadlineAt ? (
          <span className={`deadline ${dClass} psh-deadline`.replace(/\s+/g, " ").trim()}>
            <IcoClock s={13} sw={1.9} /> {deadlineText(data.deadlineAt)}
          </span>
        ) : null}
      </div>

      <div className="rv-reassure" style={{ marginBottom: 18 }}>
        <span className="ico">
          <IcoLock s={18} />
        </span>
        <p>
          <strong>Your feedback is confidential.</strong> It&apos;s one of several inputs that inform {firstName}&apos;s
          review — shared constructively, never attributed to you by name.
        </p>
      </div>

      <div className="sr-intro-card" style={{ background: "var(--paper)", marginBottom: 18 }}>
        <div className="sr-progress" style={{ marginTop: 0 }}>
          <div className="sr-progress-track">
            <div className="sr-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="sr-progress-label">
            {answered} of {required.length} answered
          </span>
        </div>
      </div>

      {prompts.map((p, i) => (
        <div className="sr-prompt" key={p.id}>
          <div className="sr-q-head">
            <span className="sr-q-num">{i + 1}</span>
            <label className="sr-q" htmlFor={`pf-${p.id}`}>
              {p.q}
              {p.optional ? <span className="sr-optional"> · optional</span> : null}
            </label>
          </div>
          <p className="sr-hint">{p.hint}</p>
          {p.type === "short" ? (
            <input
              id={`pf-${p.id}`}
              className={`input ${(answers[p.id] ?? "").trim() ? "is-filled" : ""}`}
              value={answers[p.id] ?? ""}
              placeholder="A line or two…"
              onChange={(e) => onChange(p.id, e.target.value)}
            />
          ) : (
            <textarea
              id={`pf-${p.id}`}
              className={`textarea ${(answers[p.id] ?? "").trim() ? "is-filled" : ""}`}
              value={answers[p.id] ?? ""}
              placeholder="Write a few sentences…"
              onChange={(e) => onChange(p.id, e.target.value)}
            />
          )}
        </div>
      ))}

      <div className="peer-decline-row">
        <button className="btn btn-outline" onClick={() => setMode("decline")} disabled={pending}>
          I&apos;m not the right person to give this feedback
        </button>
      </div>

      {error ? (
        <p className="field-msg" style={{ color: "var(--error)" }}>
          {error}
        </p>
      ) : null}

      <div className="sr-actionbar">
        <span className={`autosave ${save}`}>
          {save === "saving" ? (
            <>
              <span className="as-dot" /> Saving…
            </>
          ) : save === "saved" ? (
            <>
              <span className="as-ico">
                <IcoSaved s={16} sw={1.8} />
              </span>{" "}
              Saved · just now
            </>
          ) : (
            <>
              <span className="as-ico">
                <IcoSaved s={16} sw={1.8} />
              </span>{" "}
              Saved automatically
            </>
          )}
        </span>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-ghost" onClick={() => router.push("/peer")} disabled={pending}>
            Save &amp; close
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={!canSubmit || pending}>
            {pending ? (
              <>
                <IcoSpinner s={18} /> Submitting…
              </>
            ) : (
              "Submit feedback"
            )}
          </button>
        </div>
      </div>
      {!canSubmit ? (
        <p className="tf-scope-note" style={{ justifyContent: "flex-end" }}>
          <IcoInfo s={15} /> Answer the {required.length} required prompts to submit. The last one&apos;s optional.
        </p>
      ) : null}
    </div>
  );
}
