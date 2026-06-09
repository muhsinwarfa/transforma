"use client";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/atoms";
import { IcoCheck, IcoInfo, IcoSaved, IcoSpinner } from "@/components/atoms/icons";
import { RoleLabel } from "@/lib/labels/RoleLabelProvider";
import { saveSelfReview, submitSelfReview } from "@/app/(app)/review/self/actions";
import type { SelfAnswers } from "@/lib/subject/selfReview";

type Prompt = { id: string; q: string; hint: string };
type SaveState = "idle" | "saving" | "saved";

export function SelfReviewForm({ prompts, seed }: { prompts: readonly Prompt[]; seed: SelfAnswers }) {
  const [answers, setAnswers] = useState<SelfAnswers>(seed);
  const [save, setSave] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const answered = prompts.filter((p) => (answers[p.id] ?? "").trim().length > 0).length;
  const pct = Math.round((answered / prompts.length) * 100);

  const onChange = (id: string, val: string) => {
    const next = { ...answers, [id]: val };
    setAnswers(next);
    setSave("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void saveSelfReview(next)
        .then(() => setSave("saved"))
        .catch(() => setSave("idle"));
    }, 900);
  };

  const submit = () => {
    setError(null);
    start(async () => {
      try {
        await submitSelfReview(answers);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't submit your self-review.");
      }
    });
  };

  return (
    <div className="tf-page subj-col">
      <div className="page-header">
        <div className="ph-left">
          <div className="ph-eyebrow">
            <span className="t-label">Self-review</span>
            <span className="badge draft sm">
              <span className="dot" />
              Draft
            </span>
          </div>
          <div className="ph-title">
            <h1>Your self-review</h1>
          </div>
          <p className="ph-sub">This is yours, in your words. Take it section by section; we save as you go.</p>
        </div>
      </div>

      <div className="parallel-note">
        <span className="ico">
          <IcoInfo s={16} />
        </span>
        <span>
          Your self-review and your peer feedback are both open now — do them in any order, whenever suits you.
        </span>
      </div>

      <div className="sr-intro-card">
        <div className="sr-progress">
          <div className="sr-progress-track">
            <div className="sr-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="sr-progress-label">
            {answered} of {prompts.length} answered
          </span>
        </div>
      </div>

      {prompts.map((p, i) => (
        <div className="sr-prompt" key={p.id}>
          <div className="sr-q-head">
            <span className="sr-q-num">{i + 1}</span>
            <label className="sr-q" htmlFor={`sr-${p.id}`}>
              {p.q}
            </label>
          </div>
          <p className="sr-hint">{p.hint}</p>
          <textarea
            id={`sr-${p.id}`}
            className={`textarea ${(answers[p.id] ?? "").trim() ? "is-filled" : ""}`}
            value={answers[p.id] ?? ""}
            placeholder="Write a few sentences…"
            onChange={(e) => onChange(p.id, e.target.value)}
          />
        </div>
      ))}

      {error ? <p className="field-msg" style={{ color: "var(--error)" }}>{error}</p> : null}

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
              We save as you go
            </>
          )}
        </span>
        <Button variant="primary" onClick={submit} disabled={answered < prompts.length || pending}>
          {pending ? (
            <>
              <IcoSpinner s={18} /> Submitting…
            </>
          ) : (
            "Submit self-review"
          )}
        </Button>
      </div>
      {answered < prompts.length ? (
        <p className="tf-scope-note" style={{ justifyContent: "flex-end" }}>
          <IcoInfo s={15} /> Answer all {prompts.length} prompts to submit. You can edit anything until you do.
        </p>
      ) : null}
    </div>
  );
}

export function SelfSubmittedCard() {
  return (
    <div className="tf-page subj-narrow">
      <div className="card pad">
        <div className="confirm-hero">
          <span className="confirm-mark">
            <IcoCheck s={40} sw={1.7} />
          </span>
          <h1>Your self-review is in.</h1>
          <p>
            Thank you — that&apos;s a big piece done. It&apos;s locked for editing so everyone&apos;s working from the
            same version. Your <RoleLabel role="peer" plural /> share their input in parallel.
          </p>
        </div>
      </div>
    </div>
  );
}
