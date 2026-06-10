// Transforma — APPROVER track. Desktop-first review/edit/decide/lock workspace.
// Reuses Foundation + Subject/Peer atoms (card, badge, field, reason cards,
// confirmation hero, .deadline). The DRAFT/REVIEW CARD is realized fully here.
const { useState: useStateAp, useEffect: useEffectAp, useRef: useRefAp } = React;

function qById(id) { return APPROVER_QUEUE.find((q) => q.id === id) || APPROVER_QUEUE[0]; }
// ANONYMITY FLOOR: below the floor, never render a peer count.
function inputsText(inp) {
  if (inp.belowFloor) return 'Self-review only · peer feedback below the confidentiality threshold';
  return `Self-review · ${inp.peers} peer ${inp.peers === 1 ? 'response' : 'responses'}`;
}

// =============================================================
// QUEUE
// =============================================================
function ApproverQueue({ onOpen, empty }) {
  const ready = empty ? [] : APPROVER_QUEUE.filter((q) => q.queueState === 'ready');
  const flagged = empty ? [] : APPROVER_QUEUE.filter((q) => q.queueState === 'flagged');
  const decided = empty ? [] : APPROVER_QUEUE.filter((q) => q.queueState === 'locked' || q.queueState === 'awaiting-ack');
  const pending = [...flagged, ...ready]; // flagged surface first

  return (
    <div className="tf-page">
      <div className="page-header">
        <div className="ph-left">
          <div className="ph-eyebrow"><span className="t-label">Queue</span></div>
          <div className="ph-title"><h1>Reviews to decide</h1></div>
          <p className="ph-sub">Reviews routed to you as <RoleLabel role="approver" />. Open one to read the draft, edit if needed, and lock.</p>
        </div>
      </div>

      <div className="aq-summary">
        <div className="aq-stat"><div className="aqs-num">{ready.length + flagged.length}</div><div className="aqs-label"><IcoInbox s={15} sw={1.8} /> Awaiting your decision</div></div>
        <div className="aq-stat flag"><div className="aqs-num">{flagged.length}</div><div className="aqs-label"><IcoFlag s={15} sw={1.8} /> Flagged — need rework</div></div>
        <div className="aq-stat"><div className="aqs-num">{decided.length}</div><div className="aqs-label"><IcoLock s={15} sw={1.8} /> Decided this cycle</div></div>
      </div>

      {pending.length === 0 ? (
        <div className="card pad">
          <div className="state-block">
            <span className="state-glyph"><IcoCheckCircle s={26} /></span>
            <h3>All caught up</h3>
            <p>All caught up. No reviews are waiting on your decision right now.</p>
          </div>
        </div>
      ) : (
      <div className="aq-list card" style={{ padding: 0, overflow: 'hidden' }}>
        {pending.map((q) => (
          <button key={q.id} className={`aq-row ${q.queueState === 'flagged' ? 'flagged' : ''}`} onClick={() => onOpen(q.id)}>
            <Avatar name={q.subject} initial={q.initials} cls="lg" />
            <div className="aq-row-main">
              <div className="aq-row-top">
                <span className="aq-row-name">{q.subject}</span>
                <span className="role-chip sm">{TENANT.labels[q.subjectRole]}<span className="tok">{`{${TENANT.tokens[q.subjectRole]}}`}</span></span>
                {q.queueState === 'flagged' && <StatusBadge status="flagged" sm />}
              </div>
              <div className="aq-row-meta">
                <span className="am">{q.dept}</span>
                <span className="am"><IcoDoc s={13} sw={1.7} /> {inputsText(q.inputs)}</span>
                <span className="am"><IcoClock s={13} sw={1.8} /> Submitted {q.submitted}</span>
              </div>
            </div>
            <div className="aq-row-right">
              {q.queueState === 'flagged'
                ? <span className="aq-row-cta" style={{ color: 'var(--warn-text)' }}>Rework &amp; decide <IcoArrowRight s={16} /></span>
                : <span className="aq-row-cta">Review <IcoArrowRight s={16} /></span>}
            </div>
          </button>
        ))}
      </div>
      )}

      {decided.length > 0 && (
        <>
          <div className="hub-group-head" style={{ marginTop: 28 }}>
            <div className="hub-group-titles"><h2 className="hub-group-title" style={{ fontSize: 15 }}>Decided</h2></div>
          </div>
          <div className="aq-list card" style={{ padding: 0, overflow: 'hidden' }}>
            {decided.map((q) => (
              <button key={q.id} className="aq-row locked-row" onClick={() => onOpen(q.id)}>
                <Avatar name={q.subject} initial={q.initials} cls="lg" />
                <div className="aq-row-main">
                  <div className="aq-row-top"><span className="aq-row-name">{q.subject}</span><StatusBadge status={q.queueState === 'locked' ? 'locked' : 'awaiting-ack'} sm /></div>
                  <div className="aq-row-meta"><span className="am">{q.dept}</span><span className="am">{q.queueState === 'locked' ? <><IcoLock s={13} sw={1.8} /> Locked {q.lockedOn}</> : <><IcoClock s={13} sw={1.8} /> Finalized {q.finalizedOn}</>}</span></div>
                </div>
                <div className="aq-row-right"><span className="aq-row-cta">View <IcoArrowRight s={16} /></span></div>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="sod-note" style={{ marginTop: 18 }}>
        <IcoShield s={15} />
        <span>You won't see reviews you contributed feedback to, or your own — those are routed to a different <RoleLabel role="approver" /> to keep decisions independent.</span>
      </div>
    </div>
  );
}

// =============================================================
// WORKSPACE — read / edit narrative / set rating / finalize
// The system drafts NARRATIVE ONLY. The manager edits freely (no justification
// step) and sets the rating themselves before finalizing.
// =============================================================
function ApproverWorkspace({ item, onBack, onFinalized, onToast }) {
  const baseDraft = DRAFT_REVIEWS[item.draftKey] || DRAFT_REVIEWS.generic;
  const isFlagged = item.queueState === 'flagged';
  const [editing, setEditing] = useStateAp(isFlagged);
  const [sections, setSections] = useStateAp(baseDraft.sections.map((s) => ({ ...s })));
  const [rating, setRating] = useStateAp('');           // manager sets this; starts unset
  const [touched, setTouched] = useStateAp({});
  const [showConfirm, setShowConfirm] = useStateAp(false);

  const markEdited = (i, val) => {
    setSections((arr) => arr.map((s, j) => j === i ? { ...s, body: val } : s));
    setTouched((t) => ({ ...t, [i]: true }));
  };
  const anyEdited = Object.keys(touched).length > 0;
  const canFinalize = rating !== '';

  return (
    <div className="tf-page">
      <button className="form-back" onClick={onBack}><IcoChevLeft s={16} /> Back to queue</button>

      {/* subject context */}
      <div className="aw-context">
        <Avatar name={item.subject} initial={item.initials} cls="lg" />
        <div className="awc-body">
          <div className="awc-top">
            <h1 className="awc-name">{item.subject}</h1>
            <span className="role-chip sm">{TENANT.labels[item.subjectRole]}<span className="tok">{`{${TENANT.tokens[item.subjectRole]}}`}</span></span>
            {isFlagged && <StatusBadge status="flagged" sm />}
          </div>
          <div className="awc-meta">{item.dept} · {TENANT.cycle}</div>
        </div>
        <div className="aw-inputs">
          <span className="input-chip"><IcoReview s={14} sw={1.7} /> Self-review</span>
          {item.inputs.belowFloor
            ? <span className="input-chip"><IcoPeer s={14} sw={1.7} /> Peer feedback below threshold</span>
            : <span className="input-chip"><IcoPeer s={14} sw={1.7} /> {item.inputs.peers} peer {item.inputs.peers === 1 ? 'response' : 'responses'}</span>}
        </div>
      </div>

      {isFlagged && (
        <div className="flag-banner">
          <span className="ico"><IcoFlag s={18} /></span>
          <div className="fb-body"><strong>This review is flagged.</strong> Peer feedback didn't meet the confidentiality threshold, so the draft is built from the self-review only. Review it carefully, edit as needed, set a rating, then finalize.</div>
        </div>
      )}

      <div className="aw-grid">
        {/* LEFT: draft/review card — narrative only */}
        <div className="draft-card">
          <div className="draft-card-head">
            <div className="dch-left">
              <div>
                <h2 className="draft-card-title">Draft review</h2>
                <div className="draft-card-sub">Synthesized from {inputsText(item.inputs).toLowerCase()}</div>
              </div>
              <StatusBadge status={isFlagged ? 'flagged' : 'in-review'} sm />
            </div>
            <div className="draft-edit-toggle">
              {editing
                ? <button className="btn btn-secondary sm" onClick={() => setEditing(false)}><IcoCheck s={15} sw={2.2} /> Done editing</button>
                : <button className="btn btn-outline sm" onClick={() => { setEditing(true); }}><IcoEdit s={15} /> Edit draft</button>}
            </div>
          </div>

          {editing && <div className="edit-banner"><IcoEdit s={15} /> You're editing the narrative — your wording is what's saved. The draft is a starting point; change it as much as you need.</div>}

          <div className="draft-body">
            {sections.map((s, i) => (
              <div className="draft-sec" key={i}>
                <div className="draft-sec-label">
                  <span>{s.label}</span>
                  {touched[i] && <span className="edited-tag">Edited</span>}
                </div>
                {editing
                  ? <textarea className="draft-edit" value={s.body} placeholder={`Write the ${s.label.toLowerCase()}…`} onChange={(e) => markEdited(i, e.target.value)} />
                  : (s.body
                      ? <p className="draft-sec-body">{s.body}</p>
                      : <p className="draft-sec-body empty">{isFlagged ? 'Empty — needs your input before this can be finalized.' : 'Not provided.'}</p>)}
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: rating + finalize rail */}
        <div className="decision-rail">
          <div className="decision-card">
            <h3>Set the rating</h3>
            <p className="dc-hint">The draft is narrative only — the rating is yours to set. Pick the one that best reflects this review.</p>
            <div className="rating-opts" role="radiogroup" aria-label="Overall rating">
              {RATING_OPTIONS.map((r) => (
                <button key={r} className={`rating-opt ${rating === r ? 'sel' : ''}`} onClick={() => setRating(r)} role="radio" aria-checked={rating === r}>
                  <span className="ro-radio" aria-hidden="true" />
                  <span className="ro-text">{r}</span>
                </button>
              ))}
            </div>

            <div className="decision-foot">
              <button className="btn btn-primary block" disabled={!canFinalize} onClick={() => setShowConfirm(true)}>
                <IcoLock s={17} /> Finalize &amp; reveal
              </button>
              {!canFinalize && <p className="decision-meta"><IcoInfo s={14} /> Set a rating to finalize. {anyEdited ? 'Your narrative edits are saved.' : ''}</p>}
              {canFinalize && <p className="decision-meta"><IcoInfo s={14} /> {item.subject.split(' ')[0]} will be able to read and acknowledge this once you finalize.</p>}
            </div>
          </div>
        </div>
      </div>

      {showConfirm && (
        <FinalizeModal item={item} rating={rating}
          onCancel={() => setShowConfirm(false)}
          onConfirm={() => { setShowConfirm(false); onFinalized(item.id, rating); }} />
      )}
    </div>
  );
}

// =============================================================
// FINALIZE CONFIRM (sends to the subject to acknowledge, then locks)
// =============================================================
function FinalizeModal({ item, rating, onCancel, onConfirm }) {
  const ref = useRefAp(null);
  useEffectAp(() => { ref.current && ref.current.focus(); }, []);
  return (
    <div className="modal-scrim" onClick={onCancel}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="fz-title" onClick={(e) => e.stopPropagation()}>
        <span className="modal-mark"><IcoCheckCircle s={26} /></span>
        <h2 id="fz-title">Finalize this review?</h2>
        <p>You're about to finalize {item.subject}'s review for {TENANT.cycle}.</p>
        <div className="modal-summary">
          <div className="ms-row"><IcoDoc s={16} sw={1.8} /> Rating you set: <strong>{rating}</strong></div>
          <div className="ms-row"><IcoBell s={16} sw={1.8} /> {item.subject.split(' ')[0]} will be notified to read and acknowledge it.</div>
        </div>
        <div className="modal-irreversible">
          <IcoInfo s={16} sw={1.9} />
          <span>The review moves to Awaiting acknowledgement and is revealed to {item.subject.split(' ')[0]}. It locks permanently once {item.subject.split(' ')[0]} acknowledges, or when the acknowledgement window closes — not before.</span>
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" ref={ref} onClick={onCancel}>Keep editing</button>
          <button className="btn btn-primary" onClick={onConfirm}><IcoCheck s={17} sw={2.2} /> Finalize &amp; reveal</button>
        </div>
      </div>
    </div>
  );
}

// =============================================================
// FINALIZED — read-only for the manager (awaiting subject, or locked)
// =============================================================
function ApproverLocked({ item, rating, onBack }) {
  const baseDraft = DRAFT_REVIEWS[item.draftKey] || DRAFT_REVIEWS.generic;
  const finalRating = rating || item.rating || 'Meets expectations';
  const isLocked = item.queueState === 'locked';
  return (
    <div className="tf-page">
      <button className="form-back" onClick={onBack}><IcoChevLeft s={16} /> Back to queue</button>

      <div className="locked-ribbon">
        <span className="lr-ico">{isLocked ? <IcoLock s={20} /> : <IcoCheckCircle s={20} />}</span>
        <div className="lr-body">
          <div className="lr-title">{isLocked ? 'This review is locked' : 'Finalized — awaiting acknowledgement'}</div>
          <div className="lr-meta">{isLocked
            ? 'Read-only and permanent. No further edits are possible.'
            : `Read-only for you now · ${item.subject.split(' ')[0]} has been notified to read and acknowledge it. It locks once they do, or when the window closes.`}</div>
        </div>
        <StatusBadge status={isLocked ? 'locked' : 'awaiting-ack'} />
      </div>

      <div className="aw-context" style={{ marginBottom: 18 }}>
        <Avatar name={item.subject} initial={item.initials} cls="lg" />
        <div className="awc-body">
          <div className="awc-top"><h1 className="awc-name">{item.subject}</h1><span className="role-chip sm">{TENANT.labels[item.subjectRole]}</span></div>
          <div className="awc-meta">{item.dept} · {TENANT.cycle}</div>
        </div>
      </div>

      <div className="draft-card is-locked">
        <div className="draft-card-head">
          <div className="dch-left"><h2 className="draft-card-title">Final review</h2><StatusBadge status={isLocked ? 'locked' : 'awaiting-ack'} sm /></div>
        </div>
        <div className="draft-body">
          {baseDraft.sections.filter((s) => s.body).map((s, i) => (
            <div className="draft-sec" key={i}>
              <div className="draft-sec-label"><span>{s.label}</span></div>
              <p className="draft-sec-body">{s.body}</p>
            </div>
          ))}
          <div className="draft-sec">
            <div className="draft-sec-label"><span>Rating</span></div>
            <div className="draft-outcome"><span className="doc-mark"><IcoCheck s={20} sw={2.4} /></span><span><span className="oc-label">Overall · set by you</span><span className="oc-value">{finalRating}</span></span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================
// MANAGER — approve peer nominations (one task per direct report)
// =============================================================
function NominationApprovals({ onOpen }) {
  const pending = NOMINATION_QUEUE.filter((n) => n.state === 'pending');
  return (
    <div className="tf-page">
      <div className="page-header">
        <div className="ph-left">
          <div className="ph-eyebrow"><span className="t-label">Peer nominations</span></div>
          <div className="ph-title"><h1>Approve peer nominations</h1></div>
          <p className="ph-sub">Each of your <RoleLabel role="subject" plural /> has nominated who they’d like feedback from. Approve the list, or send it back with a note.</p>
        </div>
      </div>
      <div className="aq-list card" style={{ padding: 0, overflow: 'hidden' }}>
        {pending.map((n) => (
          <button key={n.id} className="aq-row" onClick={() => onOpen(n.id)}>
            <Avatar name={n.subject} initial={n.initials} cls="lg" />
            <div className="aq-row-main">
              <div className="aq-row-top">
                <span className="aq-row-name">{n.subject}</span>
                <span className="role-chip sm">{TENANT.labels[n.subjectRole]}<span className="tok">{`{${TENANT.tokens[n.subjectRole]}}`}</span></span>
              </div>
              <div className="aq-row-meta">
                <span className="am">{n.dept}</span>
                <span className="am"><IcoPeer s={13} sw={1.7} /> {n.nominees.length} nominated</span>
              </div>
            </div>
            <div className="aq-row-right"><span className="aq-row-cta">Review <IcoArrowRight s={16} /></span></div>
          </button>
        ))}
        {pending.length === 0 && (
          <div className="state-block"><span className="state-glyph"><IcoCheckCircle s={26} /></span><h3>All caught up</h3><p>No nominations are waiting on you right now.</p></div>
        )}
      </div>
    </div>
  );
}

function NominationDetail({ item, onApprove, onRequestChanges, onBack }) {
  const [mode, setMode] = useStateAp(null); // null | 'changes'
  const [note, setNote] = useStateAp('');
  return (
    <div className="tf-page subj-col">
      <button className="form-back" onClick={onBack}><IcoChevLeft s={16} /> All nominations</button>
      <div className="aw-context">
        <Avatar name={item.subject} initial={item.initials} cls="lg" />
        <div className="awc-body">
          <div className="awc-top"><h1 className="awc-name">{item.subject}</h1><span className="role-chip sm">{TENANT.labels[item.subjectRole]}</span></div>
          <div className="awc-meta">{item.dept} · nominated {item.nominees.length} {item.nominees.length === 1 ? 'peer' : 'peers'}</div>
        </div>
      </div>

      <div className="card pad" style={{ marginBottom: 16 }}>
        <h2 className="t-h3" style={{ marginBottom: 4 }}>Nominated reviewers</h2>
        <p className="t-body-sm" style={{ marginBottom: 16 }}>Minimum {NOMINATION.min} · maximum {NOMINATION.max} for this cycle.</p>
        <div className="nom-review-list">
          {item.nominees.map((p, i) => (
            <div className="nom-review-row" key={i}>
              <Avatar name={p.name} initial={p.initials} cls="sm" />
              <div className="nrr-main"><span className="nrr-name">{p.name}</span><span className="nrr-rel">{p.dept}</span></div>
            </div>
          ))}
        </div>
        {item.nominees.length < NOMINATION.min && (
          <div className="notice warn" style={{ marginTop: 14 }}>
            <span className="n-ico"><IcoAlert s={18} sw={1.9} /></span>
            <span>This is below the confidentiality floor of {NOMINATION.min} peers. You can still approve — if too few submit, the review draws on the self-review only.</span>
          </div>
        )}
      </div>

      {mode === 'changes' ? (
        <div className="card pad">
          <div className="field">
            <label className="field-label" htmlFor="nom-note">What should they change?</label>
            <span className="field-hint">This note goes back to {item.subject.split(' ')[0]} so they can adjust and resubmit.</span>
            <textarea id="nom-note" className={`textarea ${note.trim() ? 'is-filled' : ''}`} value={note} placeholder={NOMINATION.changeNote} onChange={(e) => setNote(e.target.value)} style={{ minHeight: 100 }} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" disabled={!note.trim()} onClick={() => onRequestChanges(item.id)}>Send back with note</button>
            <button className="btn btn-ghost" onClick={() => setMode(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => onApprove(item.id)}><IcoCheck s={17} sw={2.2} /> Approve nominations</button>
          <button className="btn btn-secondary" onClick={() => setMode('changes')}><IcoEdit s={16} /> Request changes</button>
        </div>
      )}
    </div>
  );
}

// Router for the Approver section.
function ApproverTrack({ view, setView, activeId, setActiveId, rating, setRating, nomActive, setNomActive, onToast }) {
  const item = qById(activeId);
  const openItem = (id) => {
    const q = qById(id);
    setActiveId(id);
    if (q.queueState === 'locked' || q.queueState === 'awaiting-ack') { setView('locked'); }
    else setView('workspace');
  };
  const nomById = (id) => NOMINATION_QUEUE.find((n) => n.id === id) || NOMINATION_QUEUE[0];
  switch (view) {
    case 'workspace':
      if (item.queueState === 'locked' || item.queueState === 'awaiting-ack') return <ApproverLocked item={item} rating={rating} onBack={() => setView('queue')} />;
      return <ApproverWorkspace item={item} onBack={() => setView('queue')}
        onFinalized={(id, r) => { setRating(r); setView('locked'); setTimeout(() => onToast(`${item.subject}'s review finalized — sent to acknowledge.`), 150); }}
        onToast={onToast} />;
    case 'locked':
      return <ApproverLocked item={item} rating={rating} onBack={() => setView('queue')} />;
    case 'nominations':
      return <NominationApprovals onOpen={(id) => { setNomActive(id); setView('nomination'); }} />;
    case 'nomination':
      return <NominationDetail item={nomById(nomActive)} onBack={() => setView('nominations')}
        onApprove={() => { setView('nominations'); setTimeout(() => onToast('Nominations approved.'), 150); }}
        onRequestChanges={() => { setView('nominations'); setTimeout(() => onToast('Sent back with your note.'), 150); }} />;
    case 'queue-empty':
      return <ApproverQueue onOpen={openItem} empty />;
    case 'queue':
    default:
      return <ApproverQueue onOpen={openItem} />;
  }
}

Object.assign(window, { ApproverTrack, ApproverQueue, ApproverWorkspace, FinalizeModal, ApproverLocked, NominationApprovals, NominationDetail });
