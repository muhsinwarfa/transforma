// Transforma — SUBJECT track. The screens a person sees about THEIR OWN review.
// Mobile-first, composed from Hogaan + Foundation atoms.
// Flow: nominate peers → (self-review ∥ peer feedback, in parallel) → in review →
// reveal & acknowledge/flag → locked (read-only, response stored beside).
const { useState: useStateSj, useEffect: useEffectSj, useRef: useRefSj } = React;

// ---- Self-review prompts ----
const SELF_PROMPTS = [
  { id: 'q1', q: 'What are you proud of this cycle?', hint: 'A project, a moment, or a habit you built.' },
  { id: 'q2', q: 'Where did you grow?', hint: 'A skill, a relationship, or a way of working.' },
  { id: 'q3', q: 'What got in the way?', hint: 'Be honest — this helps your review stay fair.' },
  { id: 'q4', q: 'What do you want to focus on next?', hint: 'One or two things, not ten.' },
];
const SEED_ANSWERS = {
  q1: 'I led the intake-redesign rollout end to end — scoped it, ran the pilot on two units, and shipped it without a single missed handoff.',
  q2: 'I got much more comfortable giving direct feedback in the moment instead of saving it for later.',
  q3: '', q4: '',
};

// ---- Final, locked review (narrative + the rating the manager set) ----
const FINAL_REVIEW = {
  rating: 'Exceeds expectations',
  sections: [
    { label: 'Summary', body: [
      'Amina had a strong cycle. She took ownership of the intake redesign at a moment when it badly needed an owner, and she carried it from a rough idea to a working process used on two units — calmly, and without dropping the day-to-day.',
      'What stands out most is how she works with people under pressure. Colleagues trust her, and that trust is earned.',
    ] },
    { label: 'Strengths', body: [
      'Follow-through. Once Amina commits to something, it gets done — and the people around her can feel that certainty. The intake rollout is the clearest example, but it shows up in the small things too.',
      'She also grew visibly in giving feedback directly and kindly, which is exactly the edge she set out to work on.',
    ] },
    { label: 'Areas to grow', body: [
      'Amina tends to absorb work rather than delegate it. The next step is trusting others with pieces she could comfortably hold herself — both to protect her own bandwidth and to grow the people around her.',
    ] },
    { label: 'Focus for next cycle', body: [
      'Hand off one meaningful workstream to a teammate and coach them through it. Success looks like the work getting done well without Amina in the room.',
    ] },
  ],
};

const ACK_WINDOW = { deadline: 'June 23, 2026', daysLeft: 7 };

// =============================================================
// 0 · NOMINATE PEER REVIEWERS  (new stage, before feedback)
// Submit is enabled from 1 selection; under the suggested minimum a
// confirmation dialog (below-floor warning) intervenes.
// =============================================================
function BelowFloorModal({ min, onBack, onSubmitAnyway }) {
  const ref = useRefSj(null);
  useEffectSj(() => { ref.current && ref.current.focus(); }, []);
  return (
    <div className="modal-scrim" onClick={onBack}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="bf-title" onClick={(e) => e.stopPropagation()}>
        <span className="modal-mark"><IcoPeer s={26} /></span>
        <h2 id="bf-title">Submit with fewer than {min} peer reviewers?</h2>
        <p>Peer feedback is only included when at least {min} people respond. With fewer nominated, your review may be built from your self-review alone.</p>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onSubmitAnyway}>Submit anyway</button>
          <button className="btn btn-primary" ref={ref} onClick={onBack}>Go back and add more</button>
        </div>
      </div>
    </div>
  );
}

function NominatePeers({ seedSelected, locked, changeNote, floorWarnOpen, onSubmit, onHome }) {
  const [selected, setSelected] = useStateSj(seedSelected || []);
  const [showFloorWarn, setShowFloorWarn] = useStateSj(!!floorWarnOpen);
  const { min, max, population } = NOMINATION;
  const toggle = (id) => {
    if (locked) return;
    setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : (s.length < max ? [...s, id] : s));
  };
  const underMin = selected.length < min;
  const canSubmit = selected.length >= 1;
  const trySubmit = () => {
    if (!canSubmit) return;
    if (underMin) { setShowFloorWarn(true); return; }
    onSubmit();
  };

  return (
    <div className="tf-page subj-col">
      <div className="page-header">
        <div className="ph-left">
          <div className="ph-eyebrow"><span className="t-label">Peer reviewers</span></div>
          <div className="ph-title"><h1>Nominate your peer reviewers</h1></div>
          <p className="ph-sub">Choose the people best placed to speak to your work this cycle. Your <RoleLabel role="approver" /> approves the list before anyone's asked.</p>
        </div>
      </div>

      {changeNote && (
        <div className="doc-note accent" style={{ marginBottom: 18 }}>
          <span className="ico"><IcoEdit s={18} /></span>
          <span><strong>Your <RoleLabel role="approver" /> asked for a change.</strong> “{changeNote}”</span>
        </div>
      )}

      <div className="nom-bar">
        <span className="nom-count">{selected.length} of up to {max} selected</span>
        <span className={`nom-req ${!underMin ? 'ok' : ''}`}>{!underMin ? <><IcoCheck s={13} sw={2.4} /> Suggested minimum met</> : `We suggest at least ${min}`}</span>
      </div>

      <div className="nom-grid">
        {population.map((p) => {
          const on = selected.includes(p.id);
          const disabled = locked || (!on && selected.length >= max);
          return (
            <button key={p.id} className={`nom-card ${on ? 'sel' : ''}`} onClick={() => toggle(p.id)} disabled={disabled} aria-pressed={on}>
              <Avatar name={p.name} initial={p.initials} cls="sm" />
              <div className="nom-card-main">
                <span className="nom-card-name">{p.name}</span>
                <span className="nom-card-rel">{p.dept}</span>
              </div>
              <span className="nom-check" aria-hidden="true">{on && <IcoCheck s={14} sw={2.6} />}</span>
            </button>
          );
        })}
      </div>

      <div className="sr-actionbar">
        <span className="autosave"><span className="as-ico"><IcoSaved s={16} sw={1.8} /></span> Saved as you go</span>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={onHome}>Save &amp; close</button>
          <button className="btn btn-primary" disabled={!canSubmit} onClick={trySubmit}>Submit for approval</button>
        </div>
      </div>
      {underMin && <p className="tf-scope-note" style={{ justifyContent: 'flex-end' }}><IcoInfo s={15} /> Fewer than {min} means your review may rely on your self-review alone — you can still submit.</p>}

      {showFloorWarn && (
        <BelowFloorModal min={min}
          onBack={() => setShowFloorWarn(false)}
          onSubmitAnyway={() => { setShowFloorWarn(false); onSubmit(); }} />
      )}
    </div>
  );
}

function NominateStatus({ variant, onHome, onEdit }) {
  // variant: 'pending' | 'approved' | 'changes'
  const v = variant === 'approved'
    ? { mark: <IcoCheckCircle s={40} sw={1.7} />, title: 'Your peer reviewers are approved.', body: 'Your manager approved your nominations. We\u2019ve asked them for feedback — there\u2019s nothing more you need to do here.', badge: null }
    : variant === 'changes'
      ? { mark: <IcoEdit s={36} />, title: 'Your manager asked for a change.', body: 'They\u2019d like you to adjust your nominations before they\u2019re approved. Open the list, make the change, and resubmit.', badge: null }
      : { mark: <IcoClock s={36} />, title: 'Sent for approval.', body: 'Your manager will review your nominations shortly. We\u2019ll let you know as soon as they\u2019re approved — then peer feedback begins.', badge: null };
  return (
    <div className="tf-page subj-narrow">
      <div className="card pad">
        <div className="confirm-hero">
          <span className="confirm-mark">{v.mark}</span>
          <h1>{v.title}</h1>
          <p>{v.body}</p>
        </div>
        <div className="confirm-actions">
          <button className="btn btn-secondary" onClick={onHome}>Back to home</button>
          {variant === 'changes' && <button className="btn btn-primary" onClick={onEdit}>Edit nominations <IcoArrowRight s={16} /></button>}
        </div>
      </div>
    </div>
  );
}

// =============================================================
// 1 · SELF-REVIEW  (runs in parallel with peer feedback)
// =============================================================
function SelfReview({ seed, onSubmit, onHome }) {
  const [answers, setAnswers] = useStateSj(seed || { q1: '', q2: '', q3: '', q4: '' });
  const [save, setSave] = useStateSj('idle');
  const timer = useRefSj(null);
  const answered = SELF_PROMPTS.filter((p) => (answers[p.id] || '').trim().length > 0).length;
  const pct = Math.round((answered / SELF_PROMPTS.length) * 100);
  const onChange = (id, val) => {
    setAnswers((a) => ({ ...a, [id]: val }));
    setSave('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSave('saved'), 900);
  };
  useEffectSj(() => () => timer.current && clearTimeout(timer.current), []);

  return (
    <div className="tf-page subj-col">
      <div className="page-header">
        <div className="ph-left">
          <div className="ph-eyebrow">
            <span className="t-label">Self-review</span>
            <span className="badge draft sm"><span className="dot" />Draft</span>
          </div>
          <div className="ph-title"><h1>Your self-review</h1></div>
          <p className="ph-sub">This is yours, in your words. Take it section by section; we save as you go.</p>
        </div>
      </div>

      <div className="parallel-note">
        <span className="ico"><IcoInfo s={16} /></span>
        <span>Your self-review and your peer feedback are both open now — do them in any order, whenever suits you.</span>
      </div>

      <div className="sr-intro-card">
        <p className="t-body" style={{ color: 'var(--ink-1)' }}>There are no wrong answers here. Write the way you'd talk — <span className="t-em">short and honest beats long and polished.</span></p>
        <div className="sr-progress">
          <div className="sr-progress-track"><div className="sr-progress-fill" style={{ width: `${pct}%` }} /></div>
          <span className="sr-progress-label">{answered} of {SELF_PROMPTS.length} answered</span>
        </div>
      </div>

      {SELF_PROMPTS.map((p, i) => (
        <div className="sr-prompt" key={p.id}>
          <div className="sr-q-head">
            <span className="sr-q-num">{i + 1}</span>
            <label className="sr-q" htmlFor={`sr-${p.id}`}>{p.q}</label>
          </div>
          <p className="sr-hint">{p.hint}</p>
          <textarea id={`sr-${p.id}`} className={`textarea ${(answers[p.id] || '').trim() ? 'is-filled' : ''}`}
            value={answers[p.id] || ''} placeholder="Write a few sentences…" onChange={(e) => onChange(p.id, e.target.value)} />
        </div>
      ))}

      <div className="sr-actionbar">
        <span className={`autosave ${save}`}>
          {save === 'saving' ? <><span className="as-dot" /> Saving…</>
            : save === 'saved' ? <><span className="as-ico"><IcoSaved s={16} sw={1.8} /></span> Saved · just now</>
              : <><span className="as-ico"><IcoSaved s={16} sw={1.8} /></span> All changes saved</>}
        </span>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={onHome}>Save &amp; close</button>
          <button className="btn btn-primary" onClick={onSubmit} disabled={answered < SELF_PROMPTS.length}>Submit self-review</button>
        </div>
      </div>
      {answered < SELF_PROMPTS.length && (
        <p className="tf-scope-note" style={{ justifyContent: 'flex-end' }}><IcoInfo s={15} /> Answer all {SELF_PROMPTS.length} prompts to submit. You can edit anything until you do.</p>
      )}
    </div>
  );
}

function SelfSubmitted({ onViewStatus, onHome }) {
  return (
    <div className="tf-page subj-narrow">
      <div className="card pad">
        <div className="confirm-hero">
          <span className="confirm-mark"><IcoCheckCircle s={40} sw={1.7} /></span>
          <h1>Your self-review is in.</h1>
          <p>Thank you — that's a big piece done. It's locked for editing so everyone's working from the same version.</p>
        </div>
        <div className="confirm-next">
          <p className="cn-label">What happens next</p>
          <div className="confirm-row">
            <span className="cr-ico"><IcoPeer s={18} /></span>
            <span className="cr-text">Peer feedback runs alongside this<span>Your nominated <RoleLabel role="peer" plural /> share their input in parallel — you won't see who said what.</span></span>
          </div>
          <div className="confirm-row">
            <span className="cr-ico"><IcoDoc s={18} /></span>
            <span className="cr-text">A draft review is prepared<span>Your real feedback is synthesized into a narrative draft. Drafts stay private until your review is final.</span></span>
          </div>
          <div className="confirm-row">
            <span className="cr-ico"><IcoShield s={18} /></span>
            <span className="cr-text">Your <RoleLabel role="approver" /> finalizes it<span>They edit the narrative and set your rating, then send it to you to read.</span></span>
          </div>
        </div>
        <div className="confirm-actions">
          <button className="btn btn-secondary" onClick={onHome}>Back to home</button>
          <button className="btn btn-primary" onClick={onViewStatus}>See where it is <IcoArrowRight s={16} /></button>
        </div>
      </div>
    </div>
  );
}

// =============================================================
// 2 · MY-REVIEW STATUS — self + peer shown as one parallel stage
// =============================================================
const STATUS_STEPS = [
  { title: 'Peer reviewers approved', meta: 'Approved Jun 6', state: 'done' },
  { title: 'Self-review & peer feedback', meta: 'Both open now — running in parallel', state: 'current', parallel: true },
  { title: 'Draft review', meta: 'Prepared once feedback is in', state: 'upcoming' },
  { title: 'Manager review', meta: 'Your manager finalizes and sets the rating', state: 'upcoming', roleLabel: 'approver' },
  { title: 'Ready to read & acknowledge', meta: 'Unlocks here when it\u2019s shared with you', state: 'upcoming' },
];

function MyReviewStatus({ onHome }) {
  return (
    <div className="tf-page subj-col">
      <div className="page-header">
        <div className="ph-left">
          <div className="ph-eyebrow"><span className="t-label">Your review</span><span className="badge in-review sm"><span className="dot" />In review</span></div>
          <div className="ph-title"><h1>Your review is on its way.</h1></div>
          <p className="ph-sub">There's nothing for you to do right now. Here's where things stand — we'll let you know the moment it's ready.</p>
        </div>
      </div>
      <div className="card pad">
        <div className="rv-timeline">
          {STATUS_STEPS.map((s, i) => (
            <div className={`rv-step ${s.state}`} key={i}>
              <div className="rv-rail">
                <span className="rv-node">
                  {s.state === 'done' ? <IcoCheck s={15} sw={2.6} /> : s.state === 'current' ? <span className="as-dot" /> : <span style={{ width: 7, height: 7, borderRadius: 999, background: 'currentColor' }} />}
                </span>
                <span className="rv-line" />
              </div>
              <div className="rv-body">
                <h3 className="rv-step-title">
                  {s.roleLabel ? <><RoleLabel role={s.roleLabel} /> review</> : s.title}
                  {s.state === 'current' && <span className="badge in-review sm"><span className="dot" />Now</span>}
                </h3>
                <p className="rv-step-meta">{s.meta}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="rv-reassure" style={{ marginTop: 16 }}>
        <span className="ico"><IcoLock s={18} /></span>
        <p><strong>Drafts stay private until your review is final.</strong> You'll only ever see the finished version — never work in progress.</p>
      </div>
      <div style={{ marginTop: 20 }}><button className="btn btn-secondary" onClick={onHome}>Back to home</button></div>
    </div>
  );
}

// =============================================================
// 3 · REVIEW READY — reveal + acknowledge/flag  (pre-lock)
//     and LOCKED — read-only with the response stored beside.
// =============================================================
function ReviewDocument() {
  return (
    <div className="card pad">
      {FINAL_REVIEW.sections.map((sec, i) => (
        <div className="doc-section" key={i}>
          <p className="ds-label">{sec.label}</p>
          {sec.body.map((para, j) => <p className="ds-body" key={j}>{para}</p>)}
        </div>
      ))}
      <div className="doc-section">
        <p className="ds-label">Rating · set by your {TENANT.labels.approver}</p>
        <div className="doc-outcome">
          <span className="oc-mark"><IcoCheck s={22} sw={2.4} /></span>
          <span><span className="oc-label">Overall</span><span className="oc-value">{FINAL_REVIEW.rating}</span></span>
        </div>
      </div>
    </div>
  );
}

function ReviewReady({ onAcknowledge, onFlag }) {
  return (
    <div className="tf-page subj-col">
      <div className="page-header doc-head">
        <div className="ph-left">
          <div className="ph-eyebrow"><span className="t-label">Your review</span><StatusBadge status="awaiting-ack" sm /></div>
          <div className="ph-title"><h1>Your review is ready to read.</h1></div>
          <p className="ph-sub">Your <RoleLabel role="approver" /> has finalized your review for {TENANT.cycle}. Take your time with it, then let us know you've seen it.</p>
          <div className="doc-meta">
            <span className="dm"><IcoShield s={15} sw={1.8} /> Finalized by your <RoleLabel role="approver" /></span>
            <span className="dm"><IcoClock s={15} sw={1.8} /> Acknowledge by {ACK_WINDOW.deadline}</span>
          </div>
        </div>
      </div>

      <ReviewDocument />

      {/* Acknowledge / flag — acknowledging is not agreeing */}
      <div className="ack-panel">
        <div className="ack-head">
          <h3>Let your <RoleLabel role="approver" /> know you've seen it</h3>
          <p>Acknowledging confirms you've read your review — <strong>it doesn't mean you agree with it.</strong> You can add a written response either way; it's stored alongside your review and never changes it.</p>
        </div>
        <div className="ack-actions">
          <button className="btn btn-primary lg" onClick={onAcknowledge}><IcoCheckCircle s={18} /> Acknowledge</button>
          <button className="btn btn-outline lg" onClick={onFlag}><IcoFlag s={17} /> Flag an error or disagree</button>
        </div>
        <p className="ack-deadline"><IcoClock s={14} sw={1.9} /> If you don't respond by {ACK_WINDOW.deadline} ({ACK_WINDOW.daysLeft} days), your review locks automatically.</p>
      </div>
    </div>
  );
}

// Acknowledge (optional response) OR flag (response required)
function AckForm({ mode, onSubmit, onCancel }) {
  const isFlag = mode === 'flag';
  const [response, setResponse] = useStateSj('');
  const [busy, setBusy] = useStateSj(false);
  const valid = !isFlag || response.trim().length > 0;
  const submit = () => { if (!valid) return; setBusy(true); setTimeout(() => onSubmit(response.trim()), 750); };
  return (
    <div className="tf-page subj-narrow">
      <button className="form-back" onClick={onCancel}><IcoChevLeft s={16} /> Back to your review</button>
      <div className="page-header">
        <div className="ph-left">
          <div className="ph-eyebrow"><span className="t-label">{isFlag ? 'Flag / disagree' : 'Acknowledge'}</span></div>
          <div className="ph-title"><h1>{isFlag ? 'Flag an error or disagree' : 'Acknowledge your review'}</h1></div>
          <p className="ph-sub">{isFlag
            ? 'Tell us what\u2019s wrong or where you disagree. Your written response is stored beside your review — it doesn\u2019t change the review itself.'
            : 'You\u2019re confirming you\u2019ve read your review. Acknowledging isn\u2019t agreeing — and you can add a written response if you\u2019d like.'}</p>
        </div>
      </div>

      <div className={`rv-reassure ${isFlag ? '' : ''}`} style={{ marginBottom: 18 }}>
        <span className="ico"><IcoLock s={18} /></span>
        <p>Once you {isFlag ? 'submit this' : 'acknowledge'}, your review locks and becomes read-only. Your response is kept on record alongside it, permanently.</p>
      </div>

      <div className="form-fields">
        <div className="field">
          <label className="field-label" htmlFor="ack-response">{isFlag ? 'Your response' : 'Add a response'} {isFlag ? <span className="req">*</span> : <span className="field-hint" style={{ fontWeight: 400 }}>(optional)</span>}</label>
          {isFlag && <span className="field-hint">What\u2019s inaccurate, or where do you disagree? Be specific.</span>}
          <textarea id="ack-response" className={`textarea ${response.trim() ? 'is-filled' : ''}`} value={response} placeholder={isFlag ? 'Share what you\u2019d like on record…' : 'Anything you\u2019d like noted alongside your review…'} onChange={(e) => setResponse(e.target.value)} style={{ minHeight: 130 }} />
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-primary lg" onClick={submit} disabled={!valid || busy}>
            {busy ? <><IcoSpinner s={18} /> Saving…</> : (isFlag ? 'Submit & lock' : 'Acknowledge & lock')}
          </button>
          <button className="btn btn-ghost lg" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// Locked, read-only. Shows the employee's stored response beside the review.
function ReviewLocked({ ack }) {
  // ack: { outcome: 'acknowledged'|'flagged', response: string }
  const flagged = ack && ack.outcome === 'flagged';
  return (
    <div className="tf-page subj-col">
      <div className="page-header doc-head">
        <div className="ph-left">
          <div className="ph-eyebrow"><span className="t-label">Your review · Final</span><StatusBadge status="locked" sm /></div>
          <div className="ph-title"><h1>Your review is locked.</h1></div>
          <p className="ph-sub">This is your final review for {TENANT.cycle}. It's locked and read-only — it won't change.</p>
          <div className="doc-meta">
            <span className="dm"><IcoShield s={15} sw={1.8} /> Finalized by your <RoleLabel role="approver" /></span>
            <span className="dm"><IcoLock s={15} sw={1.8} /> Locked Jun 16, 2026</span>
          </div>
        </div>
      </div>

      {ack && (
        <div className={`doc-note ${flagged ? 'warn' : 'neutral'}`}>
          <span className="ico">{flagged ? <IcoFlag s={18} /> : <IcoCheckCircle s={18} />}</span>
          <span>{flagged
            ? <><strong>You flagged this review.</strong> Acknowledging or flagging never changes the review — your response is stored beside it, below.</>
            : <><strong>You acknowledged this review on Jun 16, 2026.</strong> Acknowledging confirms you read it; it doesn't mean you agreed.</>}</span>
        </div>
      )}

      <ReviewDocument />

      {ack && ack.response && (
        <div className="response-card">
          <div className="rc-head"><span className="rc-ico">{flagged ? <IcoFlag s={16} /> : <IcoEdit s={16} />}</span><span className="rc-title">Your written response</span><span className="ref-chip">Stored alongside · doesn't edit the review</span></div>
          <p className="rc-body">{ack.response}</p>
        </div>
      )}
    </div>
  );
}

// Router for the Subject's "My review" section.
function MyReview({ view, setView, ack, setAck, onHome, onToast }) {
  switch (view) {
    // --- canon: no active review this cycle ---
    case 'no-review':
      return (
        <div className="tf-page subj-narrow">
          <div className="card pad">
            <div className="state-block">
              <span className="state-glyph"><IcoReview s={26} /></span>
              <h3>No active review</h3>
              <p>You don't have an active review this cycle yet.</p>
              <button className="btn btn-secondary" onClick={onHome}>Back to home</button>
            </div>
          </div>
        </div>
      );
    // --- nomination ---
    case 'nominate':
      return <NominatePeers onSubmit={() => { setView('nominate-pending'); setTimeout(() => onToast('Nominations sent for approval.'), 150); }} onHome={onHome} />;
    case 'nominate-floor':
      return <NominatePeers seedSelected={['c1', 'c3']} floorWarnOpen onSubmit={() => { setView('nominate-pending'); setTimeout(() => onToast('Nominations sent for approval.'), 150); }} onHome={onHome} />;
    case 'nominate-pending':
      return <NominateStatus variant="pending" onHome={onHome} />;
    case 'nominate-approved':
      return <NominateStatus variant="approved" onHome={onHome} />;
    case 'nominate-changes':
      return <NominateStatus variant="changes" onHome={onHome} onEdit={() => setView('nominate-edit')} />;
    case 'nominate-edit':
      return <NominatePeers seedSelected={NOMINATION.preselected} changeNote={NOMINATION.changeNote} onSubmit={() => { setView('nominate-pending'); setTimeout(() => onToast('Updated nominations sent.'), 150); }} onHome={onHome} />;
    // --- self-review ---
    case 'self-empty':
      return <SelfReview seed={{ q1: '', q2: '', q3: '', q4: '' }} onSubmit={() => { setView('self-submitted'); setTimeout(() => onToast('Self-review submitted.'), 150); }} onHome={onHome} />;
    case 'self-progress':
      return <SelfReview seed={{ ...SEED_ANSWERS }} onSubmit={() => { setView('self-submitted'); setTimeout(() => onToast('Self-review submitted.'), 150); }} onHome={onHome} />;
    case 'self-submitted':
      return <SelfSubmitted onViewStatus={() => setView('status')} onHome={onHome} />;
    // --- in review ---
    case 'status':
      return <MyReviewStatus onHome={onHome} />;
    // --- reveal / acknowledge / flag ---
    case 'ready':
      return <ReviewReady onAcknowledge={() => setView('ack-form')} onFlag={() => setView('flag-form')} />;
    case 'ack-form':
      return <AckForm mode="ack" onCancel={() => setView('ready')}
        onSubmit={(resp) => { setAck({ outcome: 'acknowledged', response: resp }); setView('locked'); setTimeout(() => onToast('Acknowledged — your review is locked.'), 150); }} />;
    case 'flag-form':
      return <AckForm mode="flag" onCancel={() => setView('ready')}
        onSubmit={(resp) => { setAck({ outcome: 'flagged', response: resp }); setView('locked'); setTimeout(() => onToast('Response recorded — your review is locked.'), 150); }} />;
    // --- locked ---
    case 'locked':
      return <ReviewLocked ack={ack} />;
    case 'locked-ack':
      return <ReviewLocked ack={{ outcome: 'acknowledged', response: 'Thanks — this is fair and I\u2019m glad the intake work landed. I\u2019d add that the late-cycle staffing crunch shaped a lot of my choices.' }} />;
    case 'locked-flagged':
      return <ReviewLocked ack={{ outcome: 'flagged', response: 'I don\u2019t think “absorbs work rather than delegates” is accurate — I handed off two workstreams this cycle. I\u2019d like that reflected on record.' }} />;
    default:
      return <NominatePeers onSubmit={() => setView('nominate-pending')} onHome={onHome} />;
  }
}

Object.assign(window, { MyReview, NominatePeers, NominateStatus, SelfReview, SelfSubmitted, MyReviewStatus, ReviewReady, AckForm, ReviewLocked, SELF_PROMPTS });
