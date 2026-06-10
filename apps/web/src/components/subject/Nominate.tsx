"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Avatar, Button, RoleLabel } from "@/components/atoms";
import {
  IcoArrowRight,
  IcoCheck,
  IcoCheckCircle,
  IcoClock,
  IcoEdit,
  IcoInfo,
  IcoPeer,
  IcoSaved,
  IcoSpinner,
} from "@/components/atoms/icons";
import { useToast } from "@/components/Toast";
import type { RoleLabels } from "@/lib/labels/roleLabel";
import { submitNominations } from "@/app/(app)/review/nominate/actions";
import type { Candidate } from "@/lib/subject/nominations";

// Confirmation dialog shown when the subject submits with fewer than the
// suggested minimum. Submitting is never blocked — the floor is encouraged,
// not enforced (the >=1 submit rule holds). Below the floor, the review may be
// built from the self-review alone.
function BelowFloorModal({
  min,
  onBack,
  onSubmitAnyway,
}: {
  min: number;
  onBack: () => void;
  onSubmitAnyway: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="modal-scrim" onClick={onBack}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bf-title"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="modal-mark">
          <IcoPeer s={26} />
        </span>
        <h2 id="bf-title">Submit with fewer than {min} peer reviewers?</h2>
        <p>
          Peer feedback is only included when at least {min} people respond. With fewer nominated, your review may be
          built from your self-review alone.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onSubmitAnyway}>
            Submit anyway
          </button>
          <button type="button" className="btn btn-primary" ref={ref} onClick={onBack}>
            Go back and add more
          </button>
        </div>
      </div>
    </div>
  );
}

export function NominateForm({
  candidates,
  selectedSeed,
  min,
  max,
  changeNote,
  labels,
}: {
  candidates: Candidate[];
  selectedSeed: string[];
  min: number;
  max: number;
  changeNote?: string | null;
  labels: RoleLabels;
}) {
  const [selected, setSelected] = useState<string[]>(selectedSeed);
  const [showFloorWarn, setShowFloorWarn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < max ? [...s, id] : s));

  const underMin = selected.length < min;
  const canSubmit = selected.length >= 1; // encourages the floor, but never blocks below it

  const doSubmit = () => {
    setError(null);
    start(async () => {
      try {
        await submitNominations(selected);
        toast(changeNote ? "Updated nominations sent." : "Nominations sent for approval.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't submit nominations.");
      }
    });
  };

  const trySubmit = () => {
    if (!canSubmit) return;
    if (underMin) {
      setShowFloorWarn(true);
      return;
    }
    doSubmit();
  };

  return (
    <div className="tf-page subj-col">
      <div className="page-header">
        <div className="ph-left">
          <div className="ph-eyebrow">
            <span className="t-label">Peer reviewers</span>
          </div>
          <div className="ph-title">
            <h1>Nominate your peer reviewers</h1>
          </div>
          <p className="ph-sub">
            Choose the people best placed to speak to your work this cycle. Your{" "}
            <RoleLabel label={labels.approver} token="approver_label" /> approves the list before anyone&apos;s asked.
          </p>
        </div>
      </div>

      {changeNote ? (
        <div className="doc-note accent" style={{ marginBottom: 18 }}>
          <span className="ico">
            <IcoEdit s={18} />
          </span>
          <span>
            <strong>
              Your <RoleLabel label={labels.approver} token="approver_label" /> asked for a change.
            </strong>{" "}
            “{changeNote}”
          </span>
        </div>
      ) : null}

      <div className="nom-bar">
        <span className="nom-count">
          {selected.length} of up to {max} selected
        </span>
        <span className={`nom-req ${!underMin ? "ok" : ""}`}>
          {!underMin ? (
            <>
              <IcoCheck s={13} sw={2.4} /> Suggested minimum met
            </>
          ) : (
            `We suggest at least ${min}`
          )}
        </span>
      </div>

      <div className="nom-grid">
        {candidates.map((p) => {
          const on = selected.includes(p.accountId);
          const disabled = pending || (!on && selected.length >= max);
          return (
            <button
              key={p.accountId}
              type="button"
              className={`nom-card ${on ? "sel" : ""}`}
              onClick={() => toggle(p.accountId)}
              disabled={disabled}
              aria-pressed={on}
            >
              <Avatar name={p.name} cls="sm" />
              <div className="nom-card-main">
                <span className="nom-card-name">{p.name}</span>
                <span className="nom-card-rel">{p.department ?? "—"}</span>
              </div>
              <span className="nom-check" aria-hidden="true">
                {on ? <IcoCheck s={14} sw={2.6} /> : null}
              </span>
            </button>
          );
        })}
      </div>

      {error ? (
        <p className="field-msg" style={{ color: "var(--error)" }}>
          {error}
        </p>
      ) : null}

      <div className="sr-actionbar">
        <span className="autosave">
          <span className="as-ico">
            <IcoSaved s={16} sw={1.8} />
          </span>{" "}
          Saved as you go
        </span>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/home" className="btn btn-ghost">
            Save &amp; close
          </Link>
          <Button variant="primary" disabled={!canSubmit || pending} onClick={trySubmit}>
            {pending ? (
              <>
                <IcoSpinner s={18} /> Submitting…
              </>
            ) : (
              "Submit for approval"
            )}
          </Button>
        </div>
      </div>
      {underMin ? (
        <p className="tf-scope-note" style={{ justifyContent: "flex-end" }}>
          <IcoInfo s={15} /> Fewer than {min} means your review may rely on your self-review alone — you can still
          submit.
        </p>
      ) : null}

      {showFloorWarn ? (
        <BelowFloorModal
          min={min}
          onBack={() => setShowFloorWarn(false)}
          onSubmitAnyway={() => {
            setShowFloorWarn(false);
            doSubmit();
          }}
        />
      ) : null}
    </div>
  );
}

export function NominateStatusCard({
  variant,
  labels,
}: {
  variant: "pending" | "approved" | "changes";
  labels: RoleLabels;
}) {
  const content =
    variant === "approved"
      ? {
          mark: <IcoCheckCircle s={40} sw={1.7} />,
          title: "Your peer reviewers are approved.",
          body: (
            <>
              Your <RoleLabel label={labels.approver} token="approver_label" /> approved your nominations. We&apos;ve
              asked them for feedback — there&apos;s nothing more you need to do here.
            </>
          ),
        }
      : variant === "changes"
        ? {
            mark: <IcoEdit s={36} />,
            title: (
              <>
                Your <RoleLabel label={labels.approver} token="approver_label" /> asked for a change.
              </>
            ),
            body: (
              <>
                They&apos;d like you to adjust your nominations before they&apos;re approved. Open the list, make the
                change, and resubmit.
              </>
            ),
          }
        : {
            mark: <IcoClock s={36} />,
            title: "Sent for approval.",
            body: (
              <>
                Your <RoleLabel label={labels.approver} token="approver_label" /> will review your nominations shortly.
                We&apos;ll let you know as soon as they&apos;re approved — then peer feedback begins.
              </>
            ),
          };
  return (
    <div className="tf-page subj-narrow">
      <div className="card pad">
        <div className="confirm-hero">
          <span className="confirm-mark">{content.mark}</span>
          <h1>{content.title}</h1>
          <p>{content.body}</p>
        </div>
        <div className="confirm-actions">
          <Link href="/home" className="btn btn-secondary">
            Back to home
          </Link>
          {variant === "changes" ? (
            <Link href="/review/nominate?edit=1" className="btn btn-primary">
              Edit nominations <IcoArrowRight s={16} />
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
