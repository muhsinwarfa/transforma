// Transforma — root app. Wires auth state machine + shell + sections.
const { useState: useStateApp, useEffect: useEffectApp } = React;

const AUTH_STATES = [
  { id: 'login', label: 'Login' },
  { id: 'forgot', label: 'Forgot password' },
  { id: 'forgot-sent', label: 'Reset link sent' },
  { id: 'reset', label: 'Reset password' },
  { id: 'activate-valid', label: 'Activation · valid' },
  { id: 'activate-expired', label: 'Activation · expired' },
  { id: 'activate-used', label: 'Activation · used' },
  { id: 'set-password', label: 'Set password' },
];

function AuthStateLauncher({ current, onPick }) {
  const [open, setOpen] = useStateApp(false);
  return (
    <div className="auth-launcher">
      <button className="auth-launcher-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <IcoSpark s={15} /> Auth states <IcoChevDown s={14} />
      </button>
      {open && (
        <div className="auth-launcher-menu" role="menu">
          <span className="auth-launcher-label">Jump to any auth state</span>
          {AUTH_STATES.map((s) => (
            <button key={s.id} role="menuitem" className={current === s.id ? 'active' : ''} onClick={() => { onPick(s.id); setOpen(false); }}>{s.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// Deep-link: #auth/<phase>, #app/<section>, #app/review/<view>, optionally append /tokens.
function parseHash() {
  const h = (location.hash || '').replace(/^#/, '');
  const parts = h.split('/').filter(Boolean);
  const tokens = parts.includes('tokens');
  if (parts[0] === 'app') return { phase: 'app', section: parts[1] || 'home', view: parts[2] || null, view2: parts[3] || null, tokens };
  if (parts[0] === 'auth' && parts[1]) return { phase: parts[1], section: 'home', view: null, view2: null, tokens };
  return null;
}

const SUBJECT_STATES = [
  { id: 'nominate', label: 'Nominate peers · start' },
  { id: 'nominate-pending', label: 'Nominations · pending approval' },
  { id: 'nominate-changes', label: 'Nominations · changes requested' },
  { id: 'nominate-approved', label: 'Nominations · approved' },
  { id: 'self-progress', label: 'Self-review · in progress' },
  { id: 'self-submitted', label: 'Self-review · submitted' },
  { id: 'status', label: 'My review · in review' },
  { id: 'ready', label: 'Ready to read · acknowledge / flag' },
  { id: 'ack-form', label: 'Acknowledge · add response' },
  { id: 'flag-form', label: 'Flag / disagree · response' },
  { id: 'locked-ack', label: 'Locked · acknowledged' },
  { id: 'locked-flagged', label: 'Locked · flagged + response' },
];

function SubjectStateLauncher({ current, onPick }) {
  const [open, setOpen] = useStateApp(false);
  return (
    <div className="subj-launcher">
      <button className="subj-launcher-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <IcoReview s={15} /> Subject states <IcoChevDown s={14} />
      </button>
      {open && (
        <div className="subj-launcher-menu" role="menu">
          <span className="subj-launcher-label">Walk the subject journey</span>
          {SUBJECT_STATES.map((s) => (
            <button key={s.id} role="menuitem" className={current === s.id ? 'active' : ''} onClick={() => { onPick(s.id); setOpen(false); }}>{s.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

const PEER_STATES = [
  { id: 'list', label: 'Requests list (all pending)' },
  { id: 'form', label: 'Feedback form' },
  { id: 'submitted', label: 'Submitted · confirmation' },
  { id: 'decline', label: 'Decline · not right reviewer' },
  { id: 'closed', label: 'Closed · window passed' },
];

function PeerStateLauncher({ current, onPick }) {
  const [open, setOpen] = useStateApp(false);
  return (
    <div className="subj-launcher">
      <button className="subj-launcher-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <IcoPeer s={15} /> Peer states <IcoChevDown s={14} />
      </button>
      {open && (
        <div className="subj-launcher-menu" role="menu">
          <span className="subj-launcher-label">Walk the peer journey</span>
          {PEER_STATES.map((s) => (
            <button key={s.id} role="menuitem" className={current === s.id ? 'active' : ''} onClick={() => { onPick(s.id); setOpen(false); }}>{s.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

const APPROVER_STATES = [
  { id: 'queue', label: 'Review queue (incl. flagged)' },
  { id: 'workspace', label: 'Review workspace · edit + rate' },
  { id: 'nominations', label: 'Peer nominations · to approve' },
  { id: 'nomination', label: 'Peer nominations · one report' },
  { id: 'locked', label: 'Finalized / read-only' },
];

function ApproverStateLauncher({ current, onPick }) {
  const [open, setOpen] = useStateApp(false);
  return (
    <div className="subj-launcher">
      <button className="subj-launcher-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <IcoApprovals s={15} /> Approver states <IcoChevDown s={14} />
      </button>
      {open && (
        <div className="subj-launcher-menu" role="menu">
          <span className="subj-launcher-label">Walk the approver journey</span>
          {APPROVER_STATES.map((s) => (
            <button key={s.id} role="menuitem" className={current === s.id ? 'active' : ''} onClick={() => { onPick(s.id); setOpen(false); }}>{s.label}</button>
          ))}
          <div className="sl-div" />
          <span className="subj-launcher-label">In the workspace, edit the narrative freely and set the rating yourself — the draft never suggests one.</span>
        </div>
      )}
    </div>
  );
}

// Admin spans three nav sections; the launcher jumps to any admin screen at once.
const ADMIN_STATES = [
  { section: 'cycles', cycleTab: 'setup', label: 'Cycle setup' },
  { section: 'roster', rosterState: 'idle', label: 'Roster upload · start' },
  { section: 'roster', rosterState: 'success', label: 'Roster upload · success' },
  { section: 'roster', rosterState: 'error', label: 'Roster upload · errors' },
  { section: 'cycles', cycleTab: 'monitor', label: 'Cycle monitoring' },
  { section: 'settings', settingsTab: 'labels', label: 'Role labels' },
  { section: 'settings', settingsTab: 'defaults', label: 'Cycle defaults' },
  { section: 'settings', settingsTab: 'actions', label: 'Mid-cycle actions' },
];

function AdminStateLauncher({ onPick, activeKey }) {
  const [open, setOpen] = useStateApp(false);
  return (
    <div className="subj-launcher">
      <button className="subj-launcher-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <IcoSettings s={15} /> Admin states <IcoChevDown s={14} />
      </button>
      {open && (
        <div className="subj-launcher-menu" role="menu">
          <span className="subj-launcher-label">Walk the People Ops journey</span>
          {ADMIN_STATES.map((s, i) => (
            <button key={i} role="menuitem" className={activeKey === s.label ? 'active' : ''} onClick={() => { onPick(s); setOpen(false); }}>{s.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function App() {
  const init = parseHash();
  const [phase, setPhase] = useStateApp(init ? init.phase : 'login');
  const [section, setSection] = useStateApp(init ? init.section : 'home');
  const [subjectView, setSubjectView] = useStateApp(init && init.view ? init.view : 'nominate');
  const [subjectAck, setSubjectAck] = useStateApp(null);
  const [peerView, setPeerView] = useStateApp(init && init.section === 'peer' && init.view ? init.view : 'list');
  const [peerActive, setPeerActive] = useStateApp(typeof PEER_REQUESTS !== 'undefined' ? PEER_REQUESTS[0].id : null);
  const [approverView, setApproverView] = useStateApp(init && init.section === 'approvals' && init.view ? init.view : 'queue');
  const [approverActive, setApproverActive] = useStateApp(typeof APPROVER_QUEUE !== 'undefined' ? APPROVER_QUEUE[0].id : null);
  const [approverRating, setApproverRating] = useStateApp('');
  const [nomActive, setNomActive] = useStateApp(typeof NOMINATION_QUEUE !== 'undefined' ? NOMINATION_QUEUE[0].id : null);
  const [cycleTab, setCycleTab] = useStateApp(init && init.section === 'cycles' && init.view ? init.view : 'monitor');
  const [rosterState, setRosterState] = useStateApp(init && init.section === 'roster' && init.view ? init.view : 'idle');
  const [settingsTab, setSettingsTab] = useStateApp(init && init.section === 'settings' && init.view ? init.view : 'labels');
  const [adminKey, setAdminKey] = useStateApp(null);
  const [drawer, setDrawer] = useStateApp(false);
  const [tokensOn, setTokensOn] = useStateApp(init ? init.tokens : false);
  const push = useToast();
  const roles = ME.roles;

  useEffectApp(() => {
    document.body.classList.toggle('show-tokens', tokensOn);
  }, [tokensOn]);

  const isApp = phase === 'app';

  // ----- Auth phases -----
  if (!isApp) {
    let screen = null;
    if (phase === 'login') screen = <LoginScreen onSignIn={() => { setPhase('app'); setTimeout(() => push(`Signed in to ${TENANT.name}.`), 200); }} onForgot={() => setPhase('forgot')} />;
    else if (phase === 'forgot') screen = <ForgotScreen onSent={() => setPhase('forgot-sent')} onBack={() => setPhase('login')} />;
    else if (phase === 'forgot-sent') screen = <ForgotSent onReset={() => setPhase('reset')} onBack={() => setPhase('login')} />;
    else if (phase === 'reset') screen = <SetPasswordScreen mode="reset" onDone={() => { setPhase('login'); setTimeout(() => push('Password reset — you can sign in now.'), 200); }} />;
    else if (phase === 'set-password') screen = <SetPasswordScreen mode="set" onDone={() => { setPhase('login'); setTimeout(() => push('Password saved.'), 200); }} />;
    else if (phase === 'activate-valid') screen = <ActivationValid onActivate={() => { setPhase('app'); setTimeout(() => push(`Welcome to ${TENANT.name}, ${ME.name.split(' ')[0]}.`), 200); }} />;
    else if (phase === 'activate-expired') screen = <ActivationState variant="expired" onRequestNew={() => { setPhase('forgot-sent'); }} onSignIn={() => setPhase('login')} />;
    else if (phase === 'activate-used') screen = <ActivationState variant="used" onSignIn={() => setPhase('login')} />;
    return (
      <>
        {screen}
        <AuthStateLauncher current={phase} onPick={setPhase} />
      </>
    );
  }

  // ----- App phases -----
  const goReview = (view) => { if (view) setSubjectView(view); setSection('review'); };
  const goPeer = (id) => { if (id) { setPeerActive(id); setPeerView('form'); } else { setPeerView('list'); } setSection('peer'); };
  const goApprovals = (id, view) => {
    if (view === 'nomination') { setNomActive(id); setApproverView('nomination'); }
    else if (id) {
      setApproverActive(id);
      const q = APPROVER_QUEUE.find((x) => x.id === id);
      if (q && q.queueState === 'locked') { setApproverView('locked'); }
      else setApproverView('workspace');
    } else setApproverView('queue');
    setSection('approvals');
  };
  const goAdmin = (s) => {
    // s = { section, cycleTab?, rosterState?, settingsTab?, approverView?, label }
    if (s.cycleTab) setCycleTab(s.cycleTab);
    if (s.rosterState) setRosterState(s.rosterState);
    if (s.settingsTab) setSettingsTab(s.settingsTab);
    if (s.label) setAdminKey(s.label);
    if (s.approverView) { setApproverView(s.approverView); setSection('approvals'); return; }
    setSection(s.section);
  };
  let page = null;
  if (section === 'home') page = <HomeHub roles={roles} onToast={push} subjectView={subjectView} onGoReview={goReview} peerView={peerView} onGoPeer={goPeer} onGoApprovals={goApprovals} onGoAdmin={goAdmin} />;
  else if (section === 'approvals') page = <ApproverTrack view={approverView} setView={setApproverView} activeId={approverActive} setActiveId={setApproverActive} rating={approverRating} setRating={setApproverRating} nomActive={nomActive} setNomActive={setNomActive} onToast={push} />;
  else if (section === 'review') page = <MyReview view={subjectView} setView={setSubjectView} ack={subjectAck} setAck={setSubjectAck} onHome={() => setSection('home')} onToast={push} />;
  else if (section === 'peer') page = <PeerTrack view={peerView} setView={setPeerView} activeId={peerActive} setActiveId={setPeerActive} onToast={push} />;
  else if (section === 'cycles') page = <AdminCycle tab={cycleTab} setTab={setCycleTab} onToast={push} />;
  else if (section === 'roster') page = <AdminRoster state={rosterState} setState={setRosterState} onToast={push} />;
  else if (section === 'settings') page = <AdminSettings tab={settingsTab} setTab={setSettingsTab} onToast={push} />;
  else page = <GenericSection id={section} title={NAV.find((n) => n.id === section)?.label || 'Section'} roleAnnotation="People Ops administration." onToast={push} />;

  return (
    <div className="tf-app">
      <Sidebar active={section} onNav={setSection} roles={roles} />
      <div className="tf-main">
        <AppHeader roles={roles} onSignOut={() => setPhase('login')} tokensOn={tokensOn} onToggleTokens={() => setTokensOn((t) => !t)} onOpenDrawer={() => setDrawer(true)} />
        <main className="tf-content" key={section + '/' + (section === 'review' ? subjectView : section === 'peer' ? peerView + peerActive : section === 'approvals' ? approverView + approverActive + nomActive : section === 'cycles' ? cycleTab : section === 'roster' ? rosterState : section === 'settings' ? settingsTab : '')}>
          <div className="tf-content-inner">{page}</div>
        </main>
      </div>
      <BottomNav active={section} onNav={setSection} roles={roles} onMore={() => setDrawer(true)} />
      <MobileDrawer open={drawer} onClose={() => setDrawer(false)} active={section} onNav={setSection} roles={roles}
        onSignOut={() => setPhase('login')} tokensOn={tokensOn} onToggleTokens={() => setTokensOn((t) => !t)} />
      {section === 'review' && <SubjectStateLauncher current={subjectView} onPick={setSubjectView} />}
      {section === 'peer' && <PeerStateLauncher current={peerView} onPick={setPeerView} />}
      {section === 'approvals' && <ApproverStateLauncher current={approverView} onPick={setApproverView} />}
      {['cycles', 'roster', 'settings'].includes(section) && <AdminStateLauncher activeKey={adminKey} onPick={goAdmin} />}
    </div>
  );
}

function Root() {
  return <ToastProvider><App /></ToastProvider>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
