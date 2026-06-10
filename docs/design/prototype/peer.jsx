// Transforma — PEER track. The screens a person sees when asked to give
// feedback on SOMEONE ELSE. Reuses Foundation + Subject components (card, field,
// badge, autosave bar, confirmation hero, deadline pill). Mobile-first.
// Scope rule: the peer NEVER sees the subject's self-review, other peers, the
// draft, or the outcome — these views show only the peer's own contribution.
const { useState: useStatePe, useEffect: useEffectPe, useRef: useRefPe } = React;

// Deadline urgency → calm vs. warning tint (reused .deadline from subject.css)
function deadlineClass(daysLeft) {
  if (daysLeft < 0) return 'closed';
  if (daysLeft <= 3) return '';        // warning tint (default .deadline)
  return 'calm';
}
function deadlineText(req) {
  if (req.daysLeft < 0) return `Closed ${req.deadline}`;
  if (req.daysLeft === 0) return `Due today · ${req.deadline}`;
  return `Due ${req.deadline} · ${req.daysLeft} days left`;
}

// =============================================================
// PEER REQUESTS LIST — all pending requests (the Peer nav section)
// =============================================================
function PeerList({ requests, onOpen }) {
  const open = requests.filter((r) => r.state !== 'submitted' && r.state !== 'closed');
  const done = requests.filter((r) => r.state === 'submitted');
  const closed = requests.filter((r) => r.state === 'closed');

  return (
    <div className="tf-page subj-col">
      <div className="page-header">
        <div className="ph-left">
          <div className="ph-eyebrow"><span className="t-label">Peer feedback</span></div>
          <div className="ph-title"><h1>Feedback others asked you for</h1></div>
          <p className="ph-sub">Each request is about one person and is private — they won't see who said what. Take them one at a time; we save as you go.</p>
        </div>
      </div>

      {open.length > 0 && (
        <section className="peer-sec">
          <div className="peer-sec-head"><span className="t-label">To do</span><span className="peer-sec-count">{open.length}</span></div>
          <div className="peer-list">
            {open.map((r) => <PeerRequestRow key={r.id} req={r} onOpen={() => onOpen(r.id)} />)}
          </div>
        </section>
      )}

      {done.length > 0 && (
        <section className="peer-sec">
          <div className="peer-sec-head"><span className="t-label">Submitted</span><span className="peer-sec-count">{done.length}</span></div>
          <div className="peer-list">
            {done.map((r) => <PeerRequestRow key={r.id} req={r} onOpen={() => onOpen(r.id)} done />)}
          </div>
        </section>
      )}

      {closed.length > 0 && (
        <section className="peer-sec">
          <div className="peer-sec-head"><span className="t-label">Closed</span><span className="peer-sec-count">{closed.length}</span></div>
          <div className="peer-list">
            {closed.map((r) => <PeerRequestRow key={r.id} req={r} onOpen={() => onOpen(r.id)} />)}
          </div>
        </section>
      )}

      {open.length === 0 && done.length === 0 && closed.length === 0 && (
        <div className="card pad">
          <div className="state-block">
            <span className="state-glyph"><IcoCheckCircle s={26} /></span>
            <h3>No feedback requests right now</h3>
            <p>When a colleague asks for your feedback, it'll show up here.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function PeerRequestRow({ req, onOpen, done }) {
  const closed = req.state === 'closed';
  return (
    <button className="card pad peer-row interactive" onClick={onOpen} disabled={false}>
      <Avatar name={req.subject} initial={req.initials} cls="lg" />
      <div className="peer-row-main">
        <div className="peer-row-top">
          <span className="peer-row-name">{req.subject}</span>
          <span className="role-chip sm">{TENANT.labels[req.subjectRole]}<span className="tok">{`{${TENANT.tokens[req.subjectRole]}}`}</span></span>
        </div>
        <span className="peer-row-rel">{req.dept}</span>
        <div className="peer-row-foot">
          {done
            ? <span className="badge in-review sm" style={{ background: 'rgba(0,0,77,0.05)', color: 'var(--ink-2)', borderColor: 'var(--hairline)' }}><IcoCheck s={11} sw={2.4} />Submitted</span>
            : closed
              ? <span className={`deadline closed`}><IcoClock s={13} sw={1.9} /> {deadlineText(req)}</span>
              : <span className={`deadline ${deadlineClass(req.daysLeft)}`}><IcoClock s={13} sw={1.9} /> {deadlineText(req)}</span>}
          {req.state === 'draft' && <span className="badge draft sm"><span className="dot" />In progress</span>}
        </div>
      </div>
      {!done && <span className="peer-row-cta">{closed ? 'View' : req.state === 'draft' ? 'Continue' : 'Start'} <IcoArrowRight s={16} /></span>}
    </button>
  );
}

// =============================================================
// PEER FEEDBACK FORM — one subject (empty/start, in-progress + autosave)
// =============================================================
function PeerForm({ req, onSubmit, onBack, onDecline }) {
  const [answers, setAnswers] = useStatePe(req.seed || { pq1: '', pq2: '', pq3: '', pq4: '' });
  const [save, setSave] = useStatePe('idle');
  const timer = useRefPe(null);
  const required = PEER_PROMPTS.filter((p) => !p.optional);
  const answered = required.filter((p) => (answers[p.id] || '').trim().length > 0).length;
  const pct = Math.round((answered / required.length) * 100);
  const canSubmit = answered === required.length;

  const onChange = (id, val) => {
    setAnswers((a) => ({ ...a, [id]: val }));
    setSave('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSave('saved'), 900);
  };
  useEffectPe(() => () => timer.current && clearTimeout(timer.current), []);

  return (
    <div className="tf-page subj-col">
      <button className="form-back" onClick={onBack}><IcoChevLeft s={16} /> All requests</button>

      <div className="peer-subject-head">
        <Avatar name={req.subject} initial={req.initials} cls="lg" />
        <div className="psh-body">
          <div className="psh-top">
            <h1 className="psh-name">Feedback for {req.subject}</h1>
            <span className="role-chip sm">{TENANT.labels[req.subjectRole]}<span className="tok">{`{${TENANT.tokens[req.subjectRole]}}`}</span></span>
          </div>
          <span className="psh-rel">{req.dept}</span>
        </div>
        <span className={`deadline ${deadlineClass(req.daysLeft)} psh-deadline`}><IcoClock s={13} sw={1.9} /> {deadlineText(req)}</span>
      </div>

      <div className="rv-reassure" style={{ marginBottom: 18 }}>
        <span className="ico"><IcoLock s={18} /></span>
        <p><strong>Your feedback is confidential.</strong> It's one of several inputs that inform {req.subject.split(' ')[0]}'s review — shared constructively, never attributed to you by name.</p>
      </div>

      <div className="sr-intro-card" style={{ background: 'var(--paper)', marginBottom: 18 }}>
        <div className="sr-progress" style={{ marginTop: 0 }}>
          <div className="sr-progress-track"><div className="sr-progress-fill" style={{ width: `${pct}%` }} /></div>
          <span className="sr-progress-label">{answered} of {required.length} answered</span>
        </div>
      </div>

      {PEER_PROMPTS.map((p, i) => (
        <div className="sr-prompt" key={p.id}>
          <div className="sr-q-head">
            <span className="sr-q-num">{i + 1}</span>
            <label className="sr-q" htmlFor={`pf-${p.id}`}>{p.q}{p.optional && <span className="sr-optional"> · optional</span>}</label>
          </div>
          <p className="sr-hint">{p.hint}</p>
          {p.type === 'short'
            ? <input id={`pf-${p.id}`} className={`input ${(answers[p.id] || '').trim() ? 'is-filled' : ''}`} value={answers[p.id] || ''} placeholder="A line or two…" onChange={(e) => onChange(p.id, e.target.value)} />
            : <textarea id={`pf-${p.id}`} className={`textarea ${(answers[p.id] || '').trim() ? 'is-filled' : ''}`} value={answers[p.id] || ''} placeholder="Write a few sentences…" onChange={(e) => onChange(p.id, e.target.value)} />}
        </div>
      ))}

      <div className="peer-decline-row">
        <button className="btn btn-ghost sm" onClick={onDecline}>I'm not the right person to give this feedback</button>
      </div>

      <div className="sr-actionbar">
        <span className={`autosave ${save}`}>
          {save === 'saving'
            ? <><span className="as-dot" /> Saving…</>
            : save === 'saved'
              ? <><span className="as-ico"><IcoSaved s={16} sw={1.8} /></span> Saved · just now</>
              : <><span className="as-ico"><IcoSaved s={16} sw={1.8} /></span> Saved automatically</>}
        </span>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={onBack}>Save &amp; close</button>
          <button className="btn btn-primary" onClick={onSubmit} disabled={!canSubmit}>Submit feedback</button>
        </div>
      </div>
      {!canSubmit && (
        <p className="tf-scope-note" style={{ justifyContent: 'flex-end' }}><IcoInfo s={15} /> Answer the {required.length} required prompts to submit. The last one's optional.</p>
      )}
    </div>
  );
}

// =============================================================
// SUBMITTED / CONFIRMATION
// =============================================================
function PeerSubmitted({ req, remaining, onNext, onList }) {
  return (
    <div className="tf-page subj-narrow">
      <div className="card pad">
        <div className="confirm-hero">
          <span className="confirm-mark"><IcoCheckCircle s={40} sw={1.7} /></span>
          <h1>Thank you — that's in.</h1>
          <p>Your feedback for {req.subject} has been submitted. It stays confidential and helps make their review fuller and fairer.</p>
        </div>
        <div className="confirm-next">
          <p className="cn-label">{remaining > 0 ? `You have ${remaining} more request${remaining > 1 ? 's' : ''}` : 'You\u2019re all caught up'}</p>
          {remaining > 0 ? (
            <div className="confirm-row">
              <span className="cr-ico"><IcoPeer s={18} /></span>
              <span className="cr-text">Keep the momentum going<span>Next request takes just a few minutes.</span></span>
            </div>
          ) : (
            <div className="confirm-row">
              <span className="cr-ico"><IcoCheck s={18} sw={2.2} /></span>
              <span className="cr-text">No more feedback requests<span>We'll let you know if another comes in.</span></span>
            </div>
          )}
        </div>
        <div className="confirm-actions">
          <button className="btn btn-secondary" onClick={onList}>Back to requests</button>
          {remaining > 0 && <button className="btn btn-primary" onClick={onNext}>Next request <IcoArrowRight s={16} /></button>}
        </div>
      </div>
    </div>
  );
}

// =============================================================
// CLOSED / WINDOW PASSED
// =============================================================
function PeerClosed({ req, onList }) {
  return (
    <div className="tf-page subj-narrow">
      <button className="form-back" onClick={onList}><IcoChevLeft s={16} /> All requests</button>
      <div className="card pad">
        <div className="state-block">
          <span className="state-glyph"><IcoClock s={26} /></span>
          <h3>This request has closed</h3>
          <p>The window to give feedback for {req.subject} closed on {req.deadline}, so it can no longer be submitted. No action is needed from you.</p>
          <button className="btn btn-secondary" onClick={onList}>Back to requests</button>
        </div>
      </div>
    </div>
  );
}

// =============================================================
// DECLINE (lightweight "not the right reviewer" path)
// =============================================================
function PeerDecline({ req, onConfirm, onCancel }) {
  const [reason, setReason] = useStatePe('');
  const reasons = ['I haven\u2019t worked with them closely enough', 'I\u2019ve only just started working with them', 'There\u2019s a conflict of interest', 'Another reason'];
  return (
    <div className="tf-page subj-narrow">
      <button className="form-back" onClick={onCancel}><IcoChevLeft s={16} /> Back to feedback</button>
      <div className="page-header">
        <div className="ph-left">
          <div className="ph-eyebrow"><span className="t-label">Decline request</span></div>
          <div className="ph-title"><h1>Not the right person?</h1></div>
          <p className="ph-sub">No problem — if you can't give useful feedback for {req.subject}, let us know and we'll take it off your list. This is private.</p>
        </div>
      </div>
      <div className="form-fields">
        <div className="field">
          <span className="field-label">A quick reason helps <span className="field-hint" style={{ fontWeight: 400 }}>(optional)</span></span>
          <div className="reason-list" role="radiogroup" aria-label="Reason for declining">
            {reasons.map((r) => (
              <label className={`reason-opt ${reason === r ? 'sel' : ''}`} key={r}>
                <input type="radio" name="decline" checked={reason === r} onChange={() => setReason(r)} />
                <span className="ro-radio" aria-hidden="true" />
                <span className="ro-text">{r}</span>
              </label>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-primary lg" onClick={onConfirm}>Decline this request</button>
          <button className="btn btn-ghost lg" onClick={onCancel}>Keep it</button>
        </div>
      </div>
    </div>
  );
}

// Router for the Peer section.
function PeerTrack({ view, setView, activeId, setActiveId, onToast }) {
  const reqById = (id) => PEER_REQUESTS.find((r) => r.id === id) || PEER_REQUESTS[0];
  const openReqs = PEER_REQUESTS.filter((r) => r.state === 'new' || r.state === 'draft');

  const openForm = (id) => {
    const r = reqById(id);
    setActiveId(id);
    if (r.state === 'closed') setView('closed');
    else setView('form');
  };

  const req = reqById(activeId);

  switch (view) {
    case 'form':
      if (req.state === 'closed') return <PeerClosed req={req} onList={() => setView('list')} />;
      return <PeerForm req={req}
        onSubmit={() => { setView('submitted'); setTimeout(() => onToast(`Feedback for ${req.subject} submitted.`), 150); }}
        onBack={() => setView('list')}
        onDecline={() => setView('decline')} />;
    case 'submitted': {
      const remaining = openReqs.filter((r) => r.id !== activeId).length;
      const nextId = openReqs.find((r) => r.id !== activeId)?.id;
      return <PeerSubmitted req={req} remaining={remaining}
        onNext={() => { if (nextId) { setActiveId(nextId); setView('form'); } }}
        onList={() => setView('list')} />;
    }
    case 'closed':
      return <PeerClosed req={req} onList={() => setView('list')} />;
    case 'decline':
      return <PeerDecline req={req}
        onConfirm={() => { setView('declined'); setTimeout(() => onToast(`Request for ${req.subject} declined.`), 150); }}
        onCancel={() => setView('form')} />;
    case 'declined':
      return (
        <div className="tf-page subj-narrow">
          <div className="card pad">
            <div className="state-block">
              <span className="state-glyph"><IcoCheckCircle s={26} /></span>
              <h3>Request declined</h3>
              <p>You declined this request. No further action is needed. Thanks for letting us know.</p>
              <button className="btn btn-secondary" onClick={() => setView('list')}>Back to requests</button>
            </div>
          </div>
        </div>
      );
    case 'unavailable':
      return (
        <div className="tf-page subj-narrow">
          <div className="card pad">
            <div className="state-block">
              <span className="state-glyph"><IcoInfo s={26} /></span>
              <h3>Not available</h3>
              <p>This request isn't available to you. It may belong to a different {TENANT.labels.peer}, or it may have already been handled.</p>
              <button className="btn btn-secondary" onClick={() => setView('list')}>Back to requests</button>
            </div>
          </div>
        </div>
      );
    case 'list':
    default:
      return <PeerList requests={PEER_REQUESTS} onOpen={openForm} />;
  }
}

Object.assign(window, { PeerTrack, PeerList, PeerForm, PeerSubmitted, PeerClosed, PeerDecline });
