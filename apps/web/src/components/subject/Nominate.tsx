"use client";
import { useState, useTransition } from "react";
import { Avatar, Button } from "@/components/atoms";
import { IcoCheck, IcoInfo, IcoSaved, IcoSpinner } from "@/components/atoms/icons";
import { RoleLabel } from "@/lib/labels/RoleLabelProvider";
import { submitNominations } from "@/app/(app)/review/nominate/actions";
import type { Candidate } from "@/lib/subject/nominations";

export function NominateForm({
  candidates,
  selectedSeed,
  min,
  max,
  changeNote,
}: {
  candidates: Candidate[];
  selectedSeed: string[];
  min: number;
  max: number;
  changeNote?: string | null;
}) {
  const [selected, setSelected] = useState<string[]>(selectedSeed);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < max ? [...s, id] : s));

  const enough = selected.length >= min;
  const canSubmit = selected.length >= 1; // encourages the floor, but never blocks below it

  const submit = () => {
    setError(null);
    start(async () => {
      try {
        await submitNominations(selected);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't submit nominations.");
      }
    });
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
            Choose the people best placed to speak to your work this cycle. Your <RoleLabel role="approver" /> approves
            the list before anyone&apos;s asked.
          </p>
        </div>
      </div>

      {changeNote ? (
        <div className="doc-note accent" style={{ marginBottom: 18 }}>
          <span>
            <strong>
              Your <RoleLabel role="approver" /> asked for a change.
            </strong>{" "}
            “{changeNote}”
          </span>
        </div>
      ) : null}

      <div className="nom-bar">
        <span className="nom-count">
          {selected.length} of up to {max} selected
        </span>
        <span className={`nom-req ${enough ? "ok" : ""}`}>
          {enough ? (
            <>
              <IcoCheck s={13} sw={2.4} /> Minimum of {min} met
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

      {error ? <p className="field-msg" style={{ color: "var(--error)" }}>{error}</p> : null}

      <div className="sr-actionbar">
        <span className="autosave">
          <span className="as-ico">
            <IcoSaved s={16} sw={1.8} />
          </span>{" "}
          Saved as you go
        </span>
        <Button variant="primary" disabled={!canSubmit || pending} onClick={submit}>
          {pending ? (
            <>
              <IcoSpinner s={18} /> Submitting…
            </>
          ) : (
            "Submit for approval"
          )}
        </Button>
      </div>
      {!enough ? (
        <p className="tf-scope-note" style={{ justifyContent: "flex-end" }}>
          <IcoInfo s={15} /> Fewer than {min} means your review may rely on your self-review alone — you can still
          submit.
        </p>
      ) : null}
    </div>
  );
}

export function NominateStatusCard({ variant }: { variant: "pending" | "approved" }) {
  const approved = variant === "approved";
  return (
    <div className="tf-page subj-narrow">
      <div className="card pad">
        <div className="confirm-hero">
          <span className="confirm-mark">{approved ? <IcoCheck s={40} sw={1.7} /> : <IcoSaved s={36} />}</span>
          <h1>{approved ? "Your peer reviewers are approved." : "Sent for approval."}</h1>
          <p>
            {approved ? (
              <>
                Your <RoleLabel role="approver" /> approved your nominations — there&apos;s nothing more you need to do
                here.
              </>
            ) : (
              <>
                Your <RoleLabel role="approver" /> will review your nominations shortly. We&apos;ll let you know as soon
                as they&apos;re approved.
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
