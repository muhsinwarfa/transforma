"use client";
import { useState, useTransition } from "react";
import { StatusBadge, Avatar } from "@/components/atoms";
import {
  IcoArrowRight,
  IcoCheck,
  IcoCheckCircle,
  IcoChevLeft,
  IcoClock,
  IcoDoc,
  IcoFlag,
  IcoLock,
  IcoShield,
  IcoSpinner,
} from "@/components/atoms/icons";
import { readReviewContent } from "@/app/(app)/admin/actions";
import type { AdminReviewRow, ReviewContent } from "@/lib/admin/content";

// The five Reviews states the gate resolves to.
export type ReviewsMode = "off" | "nogrant" | "empty" | "list";

// Narrative section order/labels — the same keys the approver/subject screens use.
const NARRATIVE_SECTIONS: { key: string; label: string }[] = [
  { key: "summary", label: "Summary" },
  { key: "strengths", label: "Strengths" },
  { key: "areasToGrow", label: "Areas to grow" },
  { key: "focusNextCycle", label: "Focus for next cycle" },
];

// Self-review prompts — the four questions the subject answered.
const SELF_PROMPTS: { key: string; q: string }[] = [
  { key: "q1", q: "What are you proud of this cycle?" },
  { key: "q2", q: "Where did you grow?" },
  { key: "q3", q: "What got in the way?" },
  { key: "q4", q: "What do you want to focus on next?" },
];

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ---------- gated / empty states ----------
function ReviewsGate({ variant }: { variant: Exclude<ReviewsMode, "list"> }) {
  const v =
    variant === "off"
      ? {
          ico: <IcoShield s={26} />,
          title: "Individual review access is off",
          body: "Individual review access is turned off for this workspace. Cycle-level oversight is always available on the Cycle screen.",
        }
      : variant === "nogrant"
        ? {
            ico: <IcoLock s={26} />,
            title: "You don’t hold this capability",
            body: "You don’t hold the review-access capability. Another administrator can grant it in Settings → Review access. Holding the administrator role alone doesn’t grant access.",
          }
        : {
            ico: <IcoDoc s={26} />,
            title: "No finished reviews yet",
            body: "When reviews in this cycle are finalized, the ones you’re able to read will appear here.",
          };
  return (
    <div className="card pad">
      <div className="state-block">
        <span className="state-glyph">{v.ico}</span>
        <h3>{v.title}</h3>
        <p>{v.body}</p>
      </div>
    </div>
  );
}

// ---------- list ----------
function ReviewsList({ reviews, onOpen }: { reviews: AdminReviewRow[]; onOpen: (row: AdminReviewRow) => void }) {
  return (
    <>
      <div className="agg-note" style={{ marginBottom: 16 }}>
        <IcoShield s={15} />
        <span>Reading a review here is recorded in the audit log. Peer feedback is never shown.</span>
      </div>
      <div className="aq-list card" style={{ padding: 0, overflow: "hidden" }}>
        {reviews.map((r) => (
          <button key={r.reviewId} className="aq-row" onClick={() => onOpen(r)}>
            <Avatar name={r.subjectName} cls="lg" />
            <div className="aq-row-main">
              <div className="aq-row-top">
                <span className="aq-row-name">{r.subjectName}</span>
                <StatusBadge status={r.status} sm />
                {r.rating ? <span className="role-chip sm">{r.rating}</span> : null}
              </div>
              <div className="aq-row-meta">
                {r.department ? <span className="am">{r.department}</span> : null}
                {r.status === "locked" ? (
                  <span className="am">
                    <IcoLock s={13} sw={1.8} /> Locked {fmtDate(r.lockedAt)}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="aq-row-right">
              <span className="aq-row-cta">
                Open <IcoArrowRight s={16} />
              </span>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

// ---------- detail (sealed-record reader) ----------
function ReviewDetail({
  row,
  content,
  labels,
  cycleName,
  onBack,
}: {
  row: AdminReviewRow;
  content: ReviewContent;
  labels: { subject: string; approver: string };
  cycleName: string;
  onBack: () => void;
}) {
  const narrative = (content.locked?.narrative as Record<string, unknown> | null) ?? content.narrative ?? {};
  const self = content.selfReview ?? {};
  const rating = content.locked?.rating ?? content.rating;
  const lockedOn = fmtDate(content.locked?.lockedAt ?? content.lockedAt);
  const flagged = content.flaggedInternal;
  const respondedFlag = content.response?.outcome === "responded" || content.response?.outcome === "flagged";

  return (
    <div className="subj-col" style={{ margin: 0 }}>
      <button className="form-back" onClick={onBack}>
        <IcoChevLeft s={16} /> All reviews
      </button>

      <div className="agg-note" style={{ marginBottom: 18 }}>
        <IcoShield s={15} />
        <span>
          You&apos;re viewing a finished, de-identified review. Peer feedback is never shown here, and opening it has
          been recorded in the audit log.
        </span>
      </div>

      <div className="aw-context" style={{ marginBottom: 16 }}>
        <Avatar name={row.subjectName} cls="lg" />
        <div className="awc-body">
          <div className="awc-top">
            <h1 className="awc-name">{row.subjectName}</h1>
            <span className="role-chip sm">
              {labels.subject}
              <span className="tok">{"{subject_label}"}</span>
            </span>
          </div>
          <div className="awc-meta">{[row.department, cycleName].filter(Boolean).join(" · ")}</div>
        </div>
      </div>

      {/* chips row: status · rating · flagged · locked date */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
        <StatusBadge status={content.status} sm />
        {rating ? <span className="role-chip sm">{rating}</span> : null}
        {flagged ? (
          <span className="badge flagged sm">
            <IcoFlag s={11} sw={1.8} />
            Flagged
          </span>
        ) : null}
        {lockedOn ? (
          <span className="t-body-sm" style={{ color: "var(--ink-3)" }}>
            Locked {lockedOn}
          </span>
        ) : null}
      </div>

      {flagged && content.flagReason ? (
        <div className="notice warn" style={{ marginBottom: 18 }}>
          <span className="n-ico">
            <IcoFlag s={18} />
          </span>
          <span>{content.flagReason}</span>
        </div>
      ) : null}

      {/* the finished narrative */}
      <div className="card pad" style={{ marginBottom: 16 }}>
        <p className="t-label" style={{ marginBottom: 6 }}>
          Final review
        </p>
        {NARRATIVE_SECTIONS.map((sec) => {
          const body = narrative[sec.key];
          if (body == null || String(body).trim() === "") return null;
          return (
            <div className="doc-section" key={sec.key}>
              <p className="ds-label">{sec.label}</p>
              <p className="ds-body">{String(body)}</p>
            </div>
          );
        })}
        {rating ? (
          <div className="doc-section">
            <p className="ds-label">Rating · set by their {labels.approver}</p>
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

      {/* the self-review */}
      <div className="card pad" style={{ marginBottom: 16 }}>
        <p className="t-label" style={{ marginBottom: 6 }}>
          Self-review
        </p>
        {SELF_PROMPTS.map((p) => {
          const a = (self as Record<string, unknown>)[p.key];
          if (a == null || String(a).trim() === "") return null;
          return (
            <div className="doc-section" key={p.key}>
              <p className="ds-label">{p.q}</p>
              <p className="ds-body">{String(a)}</p>
            </div>
          );
        })}
      </div>

      {/* the employee's response, stored beside the review */}
      {content.response ? (
        <div className="response-card">
          <div className="rc-head">
            <span className="rc-ico">{respondedFlag ? <IcoFlag s={16} /> : <IcoCheckCircle s={16} />}</span>
            <span className="rc-title">{respondedFlag ? "Flagged by the employee" : "Acknowledged by the employee"}</span>
            <span className="ref-chip">Stored alongside · doesn&apos;t edit the review</span>
          </div>
          {content.response.body ? <p className="rc-body">{content.response.body}</p> : null}
        </div>
      ) : (
        <div className="notice info">
          <span className="n-ico">
            <IcoClock s={18} />
          </span>
          <span>Awaiting the employee&apos;s acknowledgement — no response recorded yet.</span>
        </div>
      )}
    </div>
  );
}

// ---------- section root (five states) ----------
export function ReviewOversight({
  mode,
  reviews,
  labels,
  adminLabel,
  cycleName,
}: {
  mode: ReviewsMode;
  reviews: AdminReviewRow[];
  labels: { subject: string; approver: string };
  adminLabel: string;
  cycleName: string;
}) {
  const [selected, setSelected] = useState<AdminReviewRow | null>(null);
  const [content, setContent] = useState<ReviewContent | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const open = (row: AdminReviewRow) => {
    setErr(null);
    setSelected(row);
    setContent(null);
    start(async () => {
      try {
        const c = await readReviewContent(row.reviewId);
        if (!c) setErr("That review couldn't be opened. Your access may have been turned off.");
        setContent(c);
      } catch {
        setErr("Couldn't open that review.");
      }
    });
  };

  // ----- detail view (no page header, per prototype) -----
  if (selected) {
    return (
      <div className="tf-page">
        {pending ? (
          <div className="card pad">
            <p className="t-body">
              <IcoSpinner s={17} /> Opening…
            </p>
          </div>
        ) : err ? (
          <div className="subj-col" style={{ margin: 0 }}>
            <button className="form-back" onClick={() => { setSelected(null); setContent(null); setErr(null); }}>
              <IcoChevLeft s={16} /> All reviews
            </button>
            <div className="card pad">
              <p className="t-body" style={{ color: "var(--error)" }}>{err}</p>
            </div>
          </div>
        ) : content ? (
          <ReviewDetail
            row={selected}
            content={content}
            labels={labels}
            cycleName={cycleName}
            onBack={() => { setSelected(null); setContent(null); setErr(null); }}
          />
        ) : null}
      </div>
    );
  }

  // ----- list / gate views (with page header) -----
  return (
    <div className="tf-page">
      <div className="page-header">
        <div className="ph-left">
          <div className="ph-eyebrow">
            <span className="t-label">
              {adminLabel}
              <span className="tok">{"{admin_label}"}</span>
            </span>
          </div>
          <div className="ph-title">
            <h1>Reviews</h1>
          </div>
          <p className="ph-sub">
            Read finished reviews, where your workspace allows it. Every view is recorded in the audit log.
          </p>
        </div>
      </div>

      {mode === "list" ? <ReviewsList reviews={reviews} onOpen={open} /> : <ReviewsGate variant={mode} />}
    </div>
  );
}
