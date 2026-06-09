"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar, StatusBadge } from "@/components/atoms";
import {
  IcoBell,
  IcoCheck,
  IcoCheckCircle,
  IcoChevLeft,
  IcoDoc,
  IcoEdit,
  IcoFlag,
  IcoInfo,
  IcoLock,
  IcoPeer,
  IcoReview,
  IcoSpinner,
} from "@/components/atoms/icons";
import { editDraftNarrative, finalizeReview, setReviewRating } from "@/app/(app)/approvals/actions";
import type { Workspace } from "@/lib/approver/data";

// The four narrative sections, in display order. Keys are the canonical
// NarrativeSections keys; there is NO rating section — the rating is the
// manager's separate, structured field.
const SECTIONS = [
  { key: "summary", label: "Summary" },
  { key: "strengths", label: "Strengths" },
  { key: "areasToGrow", label: "Areas to grow" },
  { key: "focusNextCycle", label: "Focus for next cycle" },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];
type Sections = Record<SectionKey, string>;

function seedSections(narrative: Workspace["narrative"]): Sections {
  return {
    summary: narrative?.summary ?? "",
    strengths: narrative?.strengths ?? "",
    areasToGrow: narrative?.areasToGrow ?? "",
    focusNextCycle: narrative?.focusNextCycle ?? "",
  };
}

export function ApproverWorkspace({ data, ratingOptions }: { data: Workspace; ratingOptions: string[] }) {
  const router = useRouter();
  const isFlagged = data.status === "flagged" || data.flagged;
  const firstName = data.subjectName.split(" ")[0] || "they";

  const [editing, setEditing] = useState(isFlagged);
  const [sections, setSections] = useState<Sections>(seedSections(data.narrative));
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [rating, setRating] = useState<string>(data.rating ?? "");
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingNarrative, startSave] = useTransition();
  const [finalizing, startFinalize] = useTransition();

  const canFinalize = rating !== "";
  const anyEdited = Object.keys(touched).length > 0;

  const markEdited = (key: SectionKey, val: string) => {
    setSections((s) => ({ ...s, [key]: val }));
    setTouched((t) => ({ ...t, [key]: true }));
  };

  const doneEditing = () => {
    setError(null);
    startSave(async () => {
      try {
        await editDraftNarrative(data.reviewId, sections);
        setEditing(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save your edits.");
      }
    });
  };

  const pickRating = (r: string) => {
    setRating(r);
    setError(null);
    // persist immediately so the rating is durable before finalize
    void setReviewRating(data.reviewId, r).catch((e) => {
      setRating(data.rating ?? "");
      setError(e instanceof Error ? e.message : "Couldn't set the rating.");
    });
  };

  const confirmFinalize = () => {
    setError(null);
    startFinalize(async () => {
      try {
        await finalizeReview(data.reviewId);
        setShowConfirm(false);
        router.push("/approvals");
        router.refresh();
      } catch (e) {
        setShowConfirm(false);
        setError(e instanceof Error ? e.message : "Couldn't finalize this review.");
      }
    });
  };

  return (
    <div className="tf-page">
      <button className="form-back" onClick={() => router.push("/approvals")}>
        <IcoChevLeft s={16} /> Back to queue
      </button>

      <div className="aw-context">
        <Avatar name={data.subjectName} cls="lg" />
        <div className="awc-body">
          <div className="awc-top">
            <h1 className="awc-name">{data.subjectName}</h1>
            {isFlagged ? <StatusBadge status="flagged" sm /> : null}
          </div>
          {data.department ? <div className="awc-meta">{data.department}</div> : null}
        </div>
        <div className="aw-inputs">
          <span className="input-chip">
            <IcoReview s={14} sw={1.7} /> Self-review
          </span>
          {data.belowFloor || data.peerCount === null ? (
            <span className="input-chip">
              <IcoPeer s={14} sw={1.7} /> Peer feedback below threshold
            </span>
          ) : (
            <span className="input-chip">
              <IcoPeer s={14} sw={1.7} /> {data.peerCount} peer {data.peerCount === 1 ? "response" : "responses"}
            </span>
          )}
        </div>
      </div>

      {isFlagged ? (
        <div className="flag-banner">
          <span className="ico">
            <IcoFlag s={18} />
          </span>
          <div className="fb-body">
            <strong>This review is flagged.</strong>{" "}
            {data.belowFloor
              ? "Peer feedback didn't meet the confidentiality threshold, so the draft is built from the self-review only. Review it carefully, edit as needed, set a rating, then finalize."
              : "The draft needs your attention before it can be finalized. Edit it to fill any gaps, set a rating, then finalize."}
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="field-msg" style={{ color: "var(--error)", marginBottom: 14 }}>
          {error}
        </p>
      ) : null}

      <div className="aw-grid">
        {/* LEFT: draft narrative (narrative only — never a rating) */}
        <div className="draft-card">
          <div className="draft-card-head">
            <div className="dch-left">
              <div>
                <h2 className="draft-card-title">Draft review</h2>
                <div className="draft-card-sub">Synthesized from real feedback — narrative only</div>
              </div>
              <StatusBadge status={isFlagged ? "flagged" : "in-review"} sm />
            </div>
            <div className="draft-edit-toggle">
              {editing ? (
                <button className="btn btn-secondary sm" onClick={doneEditing} disabled={savingNarrative}>
                  {savingNarrative ? <IcoSpinner s={15} /> : <IcoCheck s={15} sw={2.2} />} Done editing
                </button>
              ) : (
                <button className="btn btn-outline sm" onClick={() => setEditing(true)}>
                  <IcoEdit s={15} /> Edit draft
                </button>
              )}
            </div>
          </div>

          {editing ? (
            <div className="edit-banner">
              <IcoEdit s={15} /> You&apos;re editing the narrative — your wording is what&apos;s saved. The draft is a
              starting point; change it as much as you need.
            </div>
          ) : null}

          <div className="draft-body">
            {SECTIONS.map((sec) => (
              <div className="draft-sec" key={sec.key}>
                <div className="draft-sec-label">
                  <span>{sec.label}</span>
                  {touched[sec.key] ? <span className="edited-tag">Edited</span> : null}
                </div>
                {editing ? (
                  <textarea
                    className="draft-edit"
                    value={sections[sec.key]}
                    placeholder={`Write the ${sec.label.toLowerCase()}…`}
                    onChange={(e) => markEdited(sec.key, e.target.value)}
                  />
                ) : sections[sec.key].trim() ? (
                  <p className="draft-sec-body">{sections[sec.key]}</p>
                ) : (
                  <p className="draft-sec-body empty">
                    {isFlagged ? "Empty — needs your input before this can be finalized." : "Not provided."}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: rating + finalize rail */}
        <div className="decision-rail">
          <div className="decision-card">
            <h3>Set the rating</h3>
            <p className="dc-hint">
              The draft is narrative only — the rating is yours to set. Pick the one that best reflects this review.
            </p>
            <div className="rating-opts" role="radiogroup" aria-label="Overall rating">
              {ratingOptions.map((r) => (
                <button
                  key={r}
                  className={`rating-opt ${rating === r ? "sel" : ""}`}
                  onClick={() => pickRating(r)}
                  role="radio"
                  aria-checked={rating === r}
                >
                  <span className="ro-radio" aria-hidden="true" />
                  <span className="ro-text">{r}</span>
                </button>
              ))}
            </div>

            <div className="decision-foot">
              <button
                className="btn btn-primary block"
                disabled={!canFinalize || finalizing}
                onClick={() => setShowConfirm(true)}
              >
                <IcoCheck s={17} sw={2.2} /> Finalize &amp; reveal
              </button>
              {!canFinalize ? (
                <p className="decision-meta">
                  <IcoInfo s={14} /> Set a rating to finalize.{anyEdited ? " Your narrative edits are saved." : ""}
                </p>
              ) : (
                <p className="decision-meta">
                  <IcoInfo s={14} /> {firstName} will be able to read and acknowledge this once you finalize. It locks
                  only after they do.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {showConfirm ? (
        <FinalizeModal
          subjectName={data.subjectName}
          rating={rating}
          finalizing={finalizing}
          onCancel={() => setShowConfirm(false)}
          onConfirm={confirmFinalize}
        />
      ) : null}
    </div>
  );
}

function FinalizeModal({
  subjectName,
  rating,
  finalizing,
  onCancel,
  onConfirm,
}: {
  subjectName: string;
  rating: string;
  finalizing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const firstName = subjectName.split(" ")[0] || "they";
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="modal-scrim" onClick={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fz-title"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="modal-mark">
          <IcoCheckCircle s={26} />
        </span>
        <h2 id="fz-title">Finalize this review?</h2>
        <p>You&apos;re about to finalize {subjectName}&apos;s review.</p>
        <div className="modal-summary">
          <div className="ms-row">
            <IcoDoc s={16} sw={1.8} /> Rating you set: <strong>{rating}</strong>
          </div>
          <div className="ms-row">
            <IcoBell s={16} sw={1.8} /> {firstName} will be notified to read and acknowledge it.
          </div>
        </div>
        <div className="modal-irreversible">
          <IcoInfo s={16} sw={1.9} />
          <span>
            The review moves to <strong>Awaiting acknowledgement</strong> and is revealed to {firstName}. It locks
            permanently once {firstName} acknowledges, or when the acknowledgement window closes — not before.
          </span>
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" ref={ref} onClick={onCancel} disabled={finalizing}>
            Keep editing
          </button>
          <button className="btn btn-primary" onClick={onConfirm} disabled={finalizing}>
            {finalizing ? <IcoSpinner s={17} /> : <IcoLock s={17} />} Finalize &amp; reveal
          </button>
        </div>
      </div>
    </div>
  );
}
