// Transforma — ADMIN · "Reviews" (A1): gated individual-review reader.
// A sober, read-only, accountability-heavy surface — opening a sealed record,
// not browsing a feed. Composed from .aq-row, .doc-section, .agg-note,
// StatusBadge, role-chip, and the subject's response-card.
// HARD RULE: nothing here implies peer feedback exists or is reachable.
const { useState: useStateAr } = React;

function ratingChip(rating) {
  return <span className="chip" style={{ cursor: 'default' }}>{rating}</span>;
}

// ---------- gated / empty states ----------
function AdminReviewsGate({ variant }) {
  const v = variant === 'off'
    ? { ico: <IcoShield s={26} />, title: 'Individual review access is off',
        body: 'Individual review access is turned off for this workspace. Cycle-level oversight is always available on the Cycle screen.' }
    : variant === 'nogrant'
      ? { ico: <IcoLock s={26} />, title: 'You don\u2019t hold this capability',
          body: 'You don\u2019t hold the review-access capability. Another administrator can grant it in Settings \u2192 Review access. Holding the administrator role alone doesn\u2019t grant access.' }
      : { ico: <IcoDoc s={26} />, title: 'No finished reviews yet',
          body: 'When reviews in this cycle are finalized, the ones you\u2019re able to read will appear here.' };
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
function AdminReviewsList({ onOpen }) {
  return (
    <>
      <div className="agg-note" style={{ marginBottom: 16 }}>
        <IcoShield s={15} />
        <span>Reading a review here is recorded in the audit log. Peer feedback is never shown.</span>
      </div>
      <div className="aq-list card" style={{ padding: 0, overflow: 'hidden' }}>
        {ADMIN_REVIEWS.map((r) => (
          <button key={r.id} className="aq-row" onClick={() => onOpen(r.id)}>
            <Avatar name={r.subject} initial={r.initials} cls="lg" />
            <div className="aq-row-main">
              <div className="aq-row-top">
                <span className="aq-row-name">{r.subject}</span>
                <StatusBadge status={r.status} sm />
                {r.rating && <span className="role-chip sm">{r.rating}</span>}
              </div>
              <div className="aq-row-meta">
                <span className="am">{r.dept}</span>
                {r.status === 'locked' && <span className="am"><IcoLock s={13} sw={1.8} /> Locked {r.lockedOn}</span>}
              </div>
            </div>
            <div className="aq-row-right"><span className="aq-row-cta">Open <IcoArrowRight s={16} /></span></div>
          </button>
        ))}
      </div>
    </>
  );
}

// ---------- detail (sealed-record reader) ----------
function AdminReviewDetail({ item, onBack }) {
  return (
    <div className="subj-col" style={{ margin: 0 }}>
      <button className="form-back" onClick={onBack}><IcoChevLeft s={16} /> All reviews</button>

      <div className="agg-note" style={{ marginBottom: 18 }}>
        <IcoShield s={15} />
        <span>You're viewing a finished, de-identified review. Peer feedback is never shown here, and opening it has been recorded in the audit log.</span>
      </div>

      <div className="aw-context" style={{ marginBottom: 16 }}>
        <Avatar name={item.subject} initial={item.initials} cls="lg" />
        <div className="awc-body">
          <div className="awc-top"><h1 className="awc-name">{item.subject}</h1><span className="role-chip sm">{TENANT.labels.subject}<span className="tok">{`{subject_label}`}</span></span></div>
          <div className="awc-meta">{item.dept} · {TENANT.cycle}</div>
        </div>
      </div>

      {/* chips row: status · rating · flagged reason · locked date */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
        <StatusBadge status={item.status} sm />
        {item.rating && <span className="role-chip sm">{item.rating}</span>}
        {item.flagged && <span className="badge flagged sm"><IcoFlag s={11} sw={1.8} />Flagged</span>}
        {item.lockedOn && <span className="t-body-sm" style={{ color: 'var(--ink-3)' }}>Locked {item.lockedOn}</span>}
      </div>

      {item.flagged && (
        <div className="notice warn" style={{ marginBottom: 18 }}>
          <span className="n-ico"><IcoFlag s={18} /></span>
          <span>{item.flagNote}</span>
        </div>
      )}

      {/* the finished narrative */}
      <div className="card pad" style={{ marginBottom: 16 }}>
        <p className="t-label" style={{ marginBottom: 6 }}>Final review</p>
        {(DRAFT_REVIEWS[item.id === 'rv3' ? 'maryan' : 'generic'] || DRAFT_REVIEWS.generic).sections.filter((s) => s.body).map((sec, i) => (
          <div className="doc-section" key={i}>
            <p className="ds-label">{sec.label}</p>
            <p className="ds-body">{sec.body}</p>
          </div>
        ))}
        <div className="doc-section">
          <p className="ds-label">Rating · set by their {TENANT.labels.approver}</p>
          <div className="doc-outcome">
            <span className="oc-mark"><IcoCheck s={22} sw={2.4} /></span>
            <span><span className="oc-label">Overall</span><span className="oc-value">{item.rating}</span></span>
          </div>
        </div>
      </div>

      {/* the self-review */}
      <div className="card pad" style={{ marginBottom: 16 }}>
        <p className="t-label" style={{ marginBottom: 6 }}>Self-review</p>
        {item.selfAnswers.map((sa, i) => (
          <div className="doc-section" key={i}>
            <p className="ds-label">{sa.q}</p>
            <p className="ds-body">{sa.a}</p>
          </div>
        ))}
      </div>

      {/* the employee's response, stored beside the review */}
      {item.response ? (
        <div className="response-card">
          <div className="rc-head">
            <span className="rc-ico">{item.ackOutcome === 'flagged' ? <IcoFlag s={16} /> : <IcoCheckCircle s={16} />}</span>
            <span className="rc-title">{item.ackOutcome === 'flagged' ? 'Flagged by the employee' : 'Acknowledged by the employee'}{item.ackOn ? ` · ${item.ackOn}` : ''}</span>
            <span className="ref-chip">Stored alongside · doesn't edit the review</span>
          </div>
          <p className="rc-body">{item.response}</p>
        </div>
      ) : (
        <div className="notice info">
          <span className="n-ico"><IcoClock s={18} /></span>
          <span>Awaiting the employee's acknowledgement — no response recorded yet.</span>
        </div>
      )}
    </div>
  );
}

// ---------- section root (five states via `mode`) ----------
function AdminReviews({ mode, setMode, activeId, setActiveId }) {
  let body = null;
  if (mode === 'off' || mode === 'nogrant' || mode === 'empty') body = <AdminReviewsGate variant={mode} />;
  else if (mode === 'detail') {
    const item = ADMIN_REVIEWS.find((r) => r.id === activeId) || ADMIN_REVIEWS[0];
    body = <AdminReviewDetail item={item} onBack={() => setMode('list')} />;
  } else body = <AdminReviewsList onOpen={(id) => { setActiveId(id); setMode('detail'); }} />;

  return (
    <div className="tf-page">
      {mode !== 'detail' && (
        <div className="page-header">
          <div className="ph-left">
            <div className="ph-eyebrow"><span className="t-label">People Ops<span className="tok">{`{admin_label}`}</span></span></div>
            <div className="ph-title"><h1>Reviews</h1></div>
            <p className="ph-sub">Read finished reviews, where your workspace allows it. Every view is recorded in the audit log.</p>
          </div>
        </div>
      )}
      {body}
    </div>
  );
}

Object.assign(window, { AdminReviews, AdminReviewsList, AdminReviewDetail, AdminReviewsGate });
