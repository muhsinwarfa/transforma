// Transforma — Home / My tasks hub + section placeholder pages.
const { useState: useStateH } = React;

// Task card (placeholder content; real card shell). Becomes the review/draft card later.
function TaskCard({ task, onAct }) {
  return (
    <div className="card pad task-card interactive" tabIndex={0} role="button"
      onClick={onAct} onKeyDown={(e) => { if (e.key === 'Enter') onAct(); }}>
      <div className="card-head">
        <StatusBadge status={task.status} sm />
      </div>
      <h3 className="task-title">{task.title}</h3>
      <p className="task-meta">{task.meta}</p>
      <div className="card-foot">
        <span className="task-due"><IcoClock s={15} sw={1.8} /> {task.due}</span>
        <span className="task-cta">{task.cta} <IcoArrowRight s={15} /></span>
      </div>
    </div>
  );
}

// Map the Subject's current review stage to a single live hub card.
function subjectHubCard(view) {
  if (['nominate', 'nominate-edit'].includes(view))
    return { id: 'subj', title: 'Nominate your peer reviewers', status: 'draft', due: 'Action needed', meta: 'Pick who gives you feedback', cta: 'Nominate', goto: view };
  if (view === 'nominate-changes')
    return { id: 'subj', title: 'Adjust your peer nominations', status: 'flagged', due: 'Changes requested', meta: 'Your manager asked for a change', cta: 'Review', goto: view };
  if (view === 'nominate-pending')
    return { id: 'subj', title: 'Nominations sent for approval', status: 'in-review', due: 'With your manager', meta: 'Awaiting nomination approval', cta: 'View status', goto: view };
  if (['nominate-approved', 'self-empty', 'self-progress'].includes(view))
    return { id: 'subj', title: 'Write your self-review', status: 'draft', due: 'Due Jun 14', meta: 'Self-review · 4 prompts · peer feedback open too', cta: 'Continue', goto: 'self-progress' };
  if (['self-submitted', 'status'].includes(view))
    return { id: 'subj', title: 'Your review is on its way', status: 'in-review', due: 'In review', meta: 'Nothing needed from you yet', cta: 'View status', goto: 'status' };
  if (['ready', 'ack-form', 'flag-form'].includes(view))
    return { id: 'subj', title: 'Your review is ready to read', status: 'awaiting-ack', due: 'Acknowledge by Jun 23', meta: 'Read it, then acknowledge or flag', cta: 'Read & acknowledge', goto: 'ready' };
  return { id: 'subj', title: 'Your review is locked', status: 'locked', due: 'Complete', meta: 'Final review · read-only', cta: 'View', goto: view };
}

// Build live peer hub cards from pending requests (each links into its form).
function peerHubCards() {
  return PEER_REQUESTS.filter((r) => r.state === 'new' || r.state === 'draft').map((r) => ({
    id: r.id,
    title: `Feedback for ${r.subject}`,
    status: r.state === 'draft' ? 'in-review' : 'draft',
    due: r.daysLeft <= 3 ? `Due ${r.deadline} · ${r.daysLeft}d` : `Due ${r.deadline}`,
    meta: r.dept,
    cta: r.state === 'draft' ? 'Continue' : 'Start',
    goto: r.id,
  }));
}

// Build live approver hub cards: peer-nomination approvals + reviews to decide.
function approverHubCards() {
  const noms = NOMINATION_QUEUE.filter((n) => n.state === 'pending').map((n) => ({
    id: n.id, kind: 'nomination',
    title: `Approve peer nominations — ${n.subject}`,
    status: 'in-review', due: 'Awaiting approval',
    meta: `${n.dept} · ${n.nominees.length} nominated`, cta: 'Review', goto: n.id,
  }));
  const reviews = APPROVER_QUEUE.filter((q) => q.queueState !== 'locked').map((q) => ({
    id: q.id, kind: 'review',
    title: q.queueState === 'flagged' ? `Flagged — ${q.subject}` : `Review — ${q.subject}`,
    status: q.queueState === 'flagged' ? 'flagged' : 'in-review',
    due: q.queueState === 'flagged' ? 'Needs rework' : 'Awaiting decision',
    meta: `${q.dept} · ${q.inputs.peers} peer ${q.inputs.peers === 1 ? 'response' : 'responses'}`,
    cta: q.queueState === 'flagged' ? 'Rework' : 'Review draft',
    goto: q.id,
  }));
  return [...noms, ...reviews];
}

// Admin attention items for the hub (People Ops). Deep-link into admin screens.
function adminHubCards() {
  return [
    { id: 'ad-roster', title: 'Roster needs attention', status: 'flagged', due: '4 rows to fix', meta: 'Latest import had validation errors', cta: 'Open roster', goto: { section: 'roster', rosterState: 'error', label: 'Roster upload · errors' } },
    { id: 'ad-noms', title: 'Nomination approvals waiting', status: 'in-review', due: '2 to review', meta: 'Direct reports’ peer nominations', cta: 'Open nominations', goto: { section: 'nominations' } },
    { id: 'ad-mon', title: 'Cycle in progress', status: 'in-review', due: '9 days left', meta: '128 participants · 38 locked', cta: 'View cycle', goto: { section: 'cycles', cycleTab: 'monitor', label: 'Cycle monitoring' } },
  ];
}

function HomeHub({ roles, onToast, subjectView, onGoReview, peerView, onGoPeer, onGoApprovals, onGoAdmin }) {
  // Subject + Peer + Approver + Admin groups are live (reflect real state).
  const subjectGroup = roles.includes('subject')
    ? { role: 'subject', blurb: 'Your own review in this cycle.', live: 'subject', tasks: [subjectHubCard(subjectView)] }
    : null;
  const peerGroup = roles.includes('peer')
    ? { role: 'peer', blurb: 'Feedback others have asked you for.', live: 'peer', tasks: peerHubCards() }
    : null;
  const approverGroup = roles.includes('approver')
    ? { role: 'approver', blurb: 'Reviews waiting for your decision.', live: 'approver', tasks: approverHubCards() }
    : null;
  const adminGroup = roles.includes('admin')
    ? { role: 'admin', blurb: 'Cycle health and setup across the workspace.', live: 'admin', tasks: adminHubCards() }
    : null;
  const otherGroups = HUB.filter((g) => !['subject', 'peer', 'approver', 'admin'].includes(g.role) && roles.includes(g.role));
  const groups = [subjectGroup, peerGroup, approverGroup, adminGroup, ...otherGroups].filter((g) => g && g.tasks.length > 0);
  const [filter, setFilter] = useStateH('all');
  const total = groups.reduce((n, g) => n + g.tasks.length, 0);
  const visible = filter === 'all' ? groups : groups.filter((g) => g.role === filter);

  const actFor = (g, t) => {
    if (g.live === 'subject') return () => onGoReview(t.goto);
    if (g.live === 'peer') return () => onGoPeer(t.goto);
    if (g.live === 'approver') return () => onGoApprovals(t.goto, t.kind === 'nomination' ? 'nomination' : null);
    if (g.live === 'admin') return () => onGoAdmin(t.goto);
    return () => onToast(`Opening “${t.title}” — built in a later pass.`);
  };

  return (
    <div className="tf-page">
      <div className="page-header">
        <div className="ph-left">
          <div className="ph-eyebrow"><span className="t-label">Home</span><span className="t-body-sm" style={{ color: 'var(--ink-3)' }}>· {TENANT.cycle}</span></div>
          <div className="ph-title"><h1>Good morning, {ME.name.split(' ')[0]}.</h1></div>
          <p className="ph-sub">You have <strong>{total} things</strong> that need you across the roles you hold this cycle.</p>
        </div>
      </div>

      {/* Role/context filter switcher — filters the unified hub, does not hard-switch. */}
      <div className="hub-filterbar">
        <div className="segmented" role="tablist" aria-label="Filter tasks by role">
          <button role="tab" className={filter === 'all' ? 'active' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            All <span className="seg-count">{total}</span>
          </button>
          {groups.map((g) => (
            <button key={g.role} role="tab" className={filter === g.role ? 'active' : ''} aria-pressed={filter === g.role} onClick={() => setFilter(g.role)}>
              {TENANT.labels[g.role]} <span className="seg-count">{g.tasks.length}</span>
            </button>
          ))}
        </div>
        <span className="hub-filter-hint">One home for every role you hold.</span>
      </div>

      {visible.map((g) => (
        <section key={g.role} className="hub-group" aria-label={TENANT.labels[g.role]}>
          <div className="hub-group-head">
            <div className="hub-group-titles">
              <h2 className="hub-group-title">As {TENANT.labels[g.role]}<span className="tok">{`{${TENANT.tokens[g.role]}}`}</span></h2>
              <p className="hub-group-blurb">{g.blurb}</p>
            </div>
            <span className="hub-group-count">{g.tasks.length} {g.tasks.length === 1 ? 'task' : 'tasks'}</span>
          </div>
          <div className="hub-grid">
            {g.tasks.map((t) => <TaskCard key={t.id} task={t} onAct={actFor(g, t)} />)}
          </div>
        </section>
      ))}

      {visible.length === 0 && (
        <div className="card pad">
          <div className="state-block">
            <span className="state-glyph"><IcoCheckCircle s={26} /></span>
            <h3>Nothing here right now</h3>
            <p>When something needs you in this role, it'll show up here.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Section placeholder pages ----------
// Feature screens are out of scope this pass; these demonstrate the page-header,
// table/list, and empty-state patterns in real context.

function ApprovalsPage({ onToast }) {
  return (
    <div className="tf-page">
      <div className="page-header">
        <div className="ph-left">
          <div className="ph-eyebrow"><span className="t-label">Queue</span></div>
          <div className="ph-title"><h1>Approvals</h1><span className="badge in-review"><span className="dot" />5 waiting</span></div>
          <p className="ph-sub">Reviews routed to you as <RoleLabel role="approver" />. Open one to read the draft, edit, and lock.</p>
        </div>
        <div className="ph-actions">
          <button className="btn btn-secondary" onClick={() => onToast('Filters — built in the Approver pass.')}><IcoInbox s={18} /> Filter</button>
          <button className="btn btn-primary" onClick={() => onToast('Clearing the queue — built in the Approver pass.')}>Review next</button>
        </div>
      </div>
      <div className="card">
        <div className="tf-table-wrap">
          <table className="tf-table">
            <thead><tr><th>Person</th><th>Department</th><th>Status</th><th>Updated</th><th></th></tr></thead>
            <tbody>
              {ROSTER.map((p) => (
                <tr key={p.email}>
                  <td><div className="row-person"><Avatar name={p.name} cls="sm" /><span className="cell-strong">{p.name}</span></div></td>
                  <td className="cell-muted">{p.dept}</td>
                  <td><StatusBadge status={p.status} sm /></td>
                  <td className="cell-muted">2 days ago</td>
                  <td style={{ textAlign: 'right' }}><button className="btn btn-ghost sm" onClick={() => onToast('Opening review — built in the Approver pass.')}>Open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Mobile: same data as stacked rows */}
        <div className="list-rows tf-list-mobile">
          {ROSTER.map((p) => (
            <div className="list-row" key={p.email}>
              <Avatar name={p.name} cls="sm" />
              <div className="lr-main"><div className="lr-title">{p.name}</div><div className="lr-meta">{p.dept} · updated 2 days ago</div></div>
              <StatusBadge status={p.status} sm />
            </div>
          ))}
        </div>
      </div>
      <p className="tf-scope-note"><IcoInfo s={15} /> The full approver workspace is designed in a later pass. This page shows the shared queue / table pattern.</p>
    </div>
  );
}

function GenericSection({ id, title, roleAnnotation, onToast }) {
  return (
    <div className="tf-page">
      <div className="page-header">
        <div className="ph-left">
          <div className="ph-title"><h1>{title}</h1></div>
          <p className="ph-sub">{roleAnnotation}</p>
        </div>
      </div>
      <div className="card pad">
        <div className="state-block">
          <span className="state-glyph"><IcoSpark s={26} /></span>
          <h3>Designed in a later pass</h3>
          <p>This space is reserved for the {title.toLowerCase()} experience. The shell, navigation, and shared components it will use are all defined in this foundation.</p>
          <button className="btn btn-outline" onClick={() => onToast('This screen arrives in a later pass.')}>Preview the pattern</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { HomeHub, ApprovalsPage, GenericSection });
