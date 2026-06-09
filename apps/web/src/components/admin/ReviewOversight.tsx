"use client";
import { useState, useTransition } from "react";
import { StatusBadge } from "@/components/atoms";
import { IcoChevLeft, IcoFlag, IcoLock, IcoShield, IcoSpinner } from "@/components/atoms/icons";
import { readReviewContent } from "@/app/(app)/admin/actions";
import type { AdminReviewRow, ReviewContent } from "@/lib/admin/content";

function humanize(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

function Sections({ data }: { data: Record<string, unknown> | null }) {
  const entries = data ? Object.entries(data).filter(([, v]) => v != null && String(v).trim() !== "") : [];
  if (entries.length === 0) return <p className="t-body-sm" style={{ color: "var(--ink-3)" }}>Nothing recorded.</p>;
  return (
    <>
      {entries.map(([k, v]) => (
        <div key={k} style={{ marginBottom: 14 }}>
          <h4 style={{ margin: "0 0 4px", fontSize: 13, color: "var(--ink-2)" }}>{humanize(k)}</h4>
          <p className="t-body" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{String(v)}</p>
        </div>
      ))}
    </>
  );
}

function ReviewDetail({ content }: { content: ReviewContent }) {
  return (
    <div className="subj-col" style={{ margin: 0 }}>
      <div className="agg-note" style={{ marginBottom: 16 }}>
        <IcoShield s={15} />
        <span>
          You&apos;re viewing a finished, de-identified review. Peer feedback is never shown here, and opening it has
          been recorded in the audit log.
        </span>
      </div>

      <div className="card pad" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <StatusBadge status={content.status} />
          {content.rating ? <span className="role-chip sm">Rating · {content.rating}</span> : null}
          {content.flaggedInternal ? (
            <span className="role-chip sm" style={{ color: "var(--error)" }}>
              <IcoFlag s={13} /> Flagged {content.flagReason ? `· ${content.flagReason}` : ""}
            </span>
          ) : null}
          {content.lockedAt ? (
            <span className="role-chip sm">
              <IcoLock s={13} /> Locked {new Date(content.lockedAt).toLocaleDateString()}
            </span>
          ) : null}
        </div>
      </div>

      <div className="card pad" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>{content.locked ? "Locked review" : "Review narrative"}</h3>
        <Sections data={(content.locked?.narrative as Record<string, unknown> | undefined) ?? content.narrative} />
      </div>

      <div className="card pad" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Self-review</h3>
        <Sections data={content.selfReview} />
      </div>

      {content.response ? (
        <div className="card pad">
          <h3 style={{ marginTop: 0 }}>Their response</h3>
          <p className="t-body-sm" style={{ color: "var(--ink-3)", marginTop: 0 }}>Outcome: {humanize(content.response.outcome)}</p>
          {content.response.body ? <p className="t-body" style={{ whiteSpace: "pre-wrap" }}>{content.response.body}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export function ReviewOversight({ reviews, enabled }: { reviews: AdminReviewRow[]; enabled: boolean }) {
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

  if (selected) {
    return (
      <div className="tf-page">
        <div className="page-header">
          <div className="ph-left">
            <button className="btn btn-ghost sm" onClick={() => { setSelected(null); setContent(null); setErr(null); }}>
              <IcoChevLeft s={16} /> All reviews
            </button>
            <div className="ph-title" style={{ marginTop: 8 }}>
              <h1>{selected.subjectName}</h1>
            </div>
            {selected.department ? <p className="ph-sub">{selected.department}</p> : null}
          </div>
        </div>
        {pending ? (
          <div className="card pad"><p className="t-body"><IcoSpinner s={17} /> Opening…</p></div>
        ) : err ? (
          <div className="card pad"><p className="t-body" style={{ color: "var(--error)" }}>{err}</p></div>
        ) : content ? (
          <ReviewDetail content={content} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="tf-page">
      <div className="page-header">
        <div className="ph-left">
          <div className="ph-eyebrow"><span className="t-label">Administrator</span></div>
          <div className="ph-title"><h1>Reviews</h1></div>
          <p className="ph-sub">Open a finished review for oversight. Peer feedback is never shown, and every time you open one it&apos;s recorded.</p>
        </div>
      </div>

      {!enabled ? (
        <div className="card pad">
          <p className="t-body">Review content access is turned off for this workspace. An administrator can enable it in Settings.</p>
        </div>
      ) : reviews.length === 0 ? (
        <div className="card pad">
          <p className="t-body">No reviews to show. If you expect to see reviews here, ask an administrator to grant you review-content access.</p>
        </div>
      ) : (
        <div className="card pad">
          <ul className="rev-list">
            {reviews.map((r) => (
              <li key={r.reviewId}>
                <button className="rev-row" onClick={() => open(r)}>
                  <span className="rr-name">{r.subjectName}</span>
                  {r.department ? <span className="rr-dept">{r.department}</span> : <span className="rr-dept" />}
                  <span className="rr-status">
                    {r.flaggedInternal ? <IcoFlag s={14} /> : null}
                    <StatusBadge status={r.status} sm />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
