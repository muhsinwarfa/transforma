// Transforma — ADMINISTRATOR (People Ops) track. Desktop-first console.
// Sections: Cycle (Overview / Setup tabs) · Roster (CSV import) ·
// Settings (role labels · cycle defaults · mid-cycle actions).
const { useState: useStateAd, useEffect: useEffectAd, useRef: useRefAd } = React;

// ============================================================
// CYCLE — tabs: Overview (monitor) / Setup
// ============================================================
function AdminCycle({ tab, setTab, onToast }) {
  return (
    <div className="tf-page">
      <div className="page-header">
        <div className="ph-left">
          <div className="ph-eyebrow"><span className="t-label">People Ops<span className="tok">{`{admin_label}`}</span></span></div>
          <div className="ph-title"><h1>Cycle</h1><StatusBadge status="in-review" sm /></div>
          <p className="ph-sub">Set up and oversee the review cycle. This is cycle-level oversight — not reading individual reviews.</p>
        </div>
        <div className="ph-actions">
          <button className="btn btn-secondary" onClick={() => setTab('setup')}><IcoSettings s={17} /> Configure</button>
        </div>
      </div>

      <div className="admin-tabs" role="tablist">
        <button role="tab" className={`admin-tab ${tab === 'monitor' ? 'active' : ''}`} aria-selected={tab === 'monitor'} onClick={() => setTab('monitor')}><IcoReports s={17} /> Overview</button>
        <button role="tab" className={`admin-tab ${tab === 'setup' ? 'active' : ''}`} aria-selected={tab === 'setup'} onClick={() => setTab('setup')}><IcoSettings s={17} /> Setup</button>
      </div>

      {tab === 'setup' ? <CycleSetup onToast={onToast} /> : <CycleMonitor onToast={onToast} />}
    </div>
  );
}

// ---- Monitoring dashboard (aggregate) ----
function CycleMonitor({ onToast }) {
  const m = CYCLE_MONITOR;
  const total = Object.values(m.status).reduce((a, b) => a + b, 0);
  const seg = (k) => `${(m.status[k] / total) * 100}%`;
  return (
    <>
      <div className="mon-head">
        <div className="mh-body">
          <h2 className="mh-title">{m.name}</h2>
          <div className="mh-meta">{m.window} · {m.participants} participants</div>
        </div>
        <span className="deadline calm"><IcoClock s={14} sw={1.9} /> {m.daysLeft} days left</span>
      </div>

      <div className="stat-grid">
        <div className="stat-tile"><div className="st-top"><StatusBadge status="draft" sm /></div><div className="st-num">{m.status.draft}</div><div className="st-label">Not yet submitted</div></div>
        <div className="stat-tile"><div className="st-top"><StatusBadge status="in-review" sm /></div><div className="st-num">{m.status['in-review']}</div><div className="st-label">Moving through review</div></div>
        <div className="stat-tile"><div className="st-top"><StatusBadge status="awaiting-ack" sm /></div><div className="st-num">{m.status['awaiting-ack']}</div><div className="st-label">With the person to read</div></div>
        <div className="stat-tile"><div className="st-top"><StatusBadge status="locked" sm /></div><div className="st-num">{m.status.locked}</div><div className="st-label">Finalized &amp; locked</div></div>
        <div className="stat-tile flag"><div className="st-top"><StatusBadge status="flagged" sm /></div><div className="st-num">{m.status.flagged}</div><div className="st-label">Need rework</div></div>
      </div>

      <div className="dist-card">
        <h3>Status across the cycle</h3>
        <div className="dist-bar">
          <div className="dist-seg draft" style={{ width: seg('draft') }} />
          <div className="dist-seg in-review" style={{ width: seg('in-review') }} />
          <div className="dist-seg awaiting-ack" style={{ width: seg('awaiting-ack') }} />
          <div className="dist-seg locked" style={{ width: seg('locked') }} />
          <div className="dist-seg flagged" style={{ width: seg('flagged') }} />
        </div>
        <div className="dist-legend">
          <span className="dist-leg"><span className="lg-dot" style={{ background: 'rgba(0,0,77,0.22)' }} /><span className="lg-num">{m.status.draft}</span> <span className="lg-name">Draft</span></span>
          <span className="dist-leg"><span className="lg-dot" style={{ background: 'var(--blue)' }} /><span className="lg-num">{m.status['in-review']}</span> <span className="lg-name">In review</span></span>
          <span className="dist-leg"><span className="lg-dot" style={{ background: 'var(--cyan)' }} /><span className="lg-num">{m.status['awaiting-ack']}</span> <span className="lg-name">Awaiting acknowledgement</span></span>
          <span className="dist-leg"><span className="lg-dot" style={{ background: 'var(--ink-3)' }} /><span className="lg-num">{m.status.locked}</span> <span className="lg-name">Locked</span></span>
          <span className="dist-leg"><span className="lg-dot" style={{ background: 'var(--warn-text)' }} /><span className="lg-num">{m.status.flagged}</span> <span className="lg-name">Flagged</span></span>
        </div>
      </div>

      <div className="dist-card">
        <h3>Progress</h3>
        <div className="ms-list">
          {m.milestones.map((ms, i) => (
            <div className="ms-row" key={i}>
              <div className="ms-top"><span className="ms-label">{ms.label}</span><span className="ms-frac">{ms.done} / {ms.total}</span></div>
              <div className="ms-track"><div className="ms-fill" style={{ width: `${(ms.done / ms.total) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      </div>

      <div className="agg-note"><IcoShield s={15} /><span>This dashboard shows cycle-level counts only. To act on a single flagged review, open the <RoleLabel role="approver" /> queue — individual review content isn't shown here.</span></div>
    </>
  );
}

// ---- Cycle setup form ----
function CycleSetup({ onToast }) {
  const [name, setName] = useStateAd('H2 2026 Review');
  const [busy, setBusy] = useStateAd(false);
  return (
    <>
      <div className="card pad" style={{ marginBottom: 18 }}>
        <h2 className="t-h3" style={{ marginBottom: 4 }}>Configure cycle</h2>
        <p className="t-body-sm" style={{ marginBottom: 20 }}>Set the basics, then upload your roster on the Roster tab.</p>
        <div className="setup-grid">
          <div className="field full">
            <label className="field-label" htmlFor="cs-name">Cycle name</label>
            <input id="cs-name" className="input is-filled" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="cs-open">Opens</label>
            <input id="cs-open" className="input is-filled" type="text" defaultValue="Jul 1, 2026" />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="cs-close">Closes</label>
            <input id="cs-close" className="input is-filled" type="text" defaultValue="Jul 31, 2026" />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="cs-peers">Peer feedback per person</label>
            <div className="select-wrap"><select id="cs-peers" className="select is-filled" defaultValue="3–5"><option>2–3</option><option>3–5</option><option>Open</option></select><span className="chev"><IcoChevDown s={18} /></span></div>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="cs-ack">Acknowledgement window</label>
            <div className="select-wrap"><select id="cs-ack" className="select is-filled" defaultValue="7 days"><option>3 days</option><option>7 days</option><option>14 days</option></select><span className="chev"><IcoChevDown s={18} /></span></div>
          </div>
          <label className="ack-row full" style={{ marginTop: 4 }}>
            <input type="checkbox" defaultChecked />
            <span>This cycle overrides the company defaults above. Turn off to follow the company-wide settings.</span>
          </label>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={() => { setBusy(true); setTimeout(() => { setBusy(false); onToast('Cycle settings saved.'); }, 700); }} disabled={busy}>{busy ? <><IcoSpinner s={17} /> Saving…</> : 'Save cycle'}</button>
        <button className="btn btn-ghost" onClick={() => onToast('Discarded changes.')}>Cancel</button>
      </div>
    </>
  );
}

// ============================================================
// ROSTER — CSV import (idle → validating → success / error)
// ============================================================
function AdminRoster({ state, setState, onToast }) {
  // state: 'idle' | 'validating' | 'success' | 'error'
  const startUpload = (outcome) => {
    setState('validating');
    setTimeout(() => setState(outcome), 1400);
  };
  return (
    <div className="tf-page">
      <div className="page-header">
        <div className="ph-left">
          <div className="ph-eyebrow"><span className="t-label">People Ops</span></div>
          <div className="ph-title"><h1>Roster</h1></div>
          <p className="ph-sub">Upload the participants for {TENANT.cycle} as a CSV. We'll validate every row before anything is imported.</p>
        </div>
        {state === 'success' && <div className="ph-actions"><button className="btn btn-secondary" onClick={() => setState('idle')}>Upload another</button></div>}
      </div>

      {state === 'idle' && (
        <>
          <button className="dropzone" onClick={() => startUpload('success')} style={{ width: '100%', cursor: 'pointer' }}>
            <span className="dz-ico"><IcoUpload s={26} /></span>
            <h3>Drop your roster CSV here</h3>
            <p>Or click to browse. Columns: name, email, role, manager, department.</p>
            <span className="dz-formats">roster.csv · max 5 MB</span>
          </button>
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <button className="btn btn-outline sm" onClick={() => startUpload('success')}><IcoCsv s={15} /> Simulate a clean file</button>
            <button className="btn btn-outline sm" onClick={() => startUpload('error')}><IcoAlert s={15} sw={1.9} /> Simulate a file with errors</button>
            <button className="btn btn-ghost sm" onClick={() => onToast('Template downloaded.')}><IcoDownload s={15} /> Download CSV template</button>
          </div>
        </>
      )}

      {state === 'validating' && (
        <div className="validating">
          <IcoSpinner s={24} />
          <div className="v-body">
            <div className="v-title">Validating roster.csv…</div>
            <div className="v-bar"><div className="v-fill" /></div>
          </div>
        </div>
      )}

      {state === 'success' && (
        <>
          <div className="import-summary ok">
            <span className="is-mark"><IcoCheck s={24} sw={2.4} /></span>
            <div>
              <div className="is-title">{ROSTER_IMPORT.validRows} participants imported</div>
              <div className="is-sub">roster.csv · all rows valid · ready for {TENANT.cycle}</div>
            </div>
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="tf-table-wrap">
              <table className="tf-table">
                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Manager</th><th>Department</th></tr></thead>
                <tbody>
                  {ROSTER_VALID.map((r) => (
                    <tr key={r.email}>
                      <td><div className="row-person"><Avatar name={r.name} cls="sm" /><span className="cell-strong">{r.name}</span></div></td>
                      <td className="cell-muted">{r.email}</td>
                      <td><span className="role-chip sm">{TENANT.labels[r.role] || r.role}</span></td>
                      <td className="cell-muted">{r.manager}</td>
                      <td className="cell-muted">{r.dept}</td>
                    </tr>
                  ))}
                  <tr><td colSpan="5" className="cell-muted" style={{ textAlign: 'center', fontStyle: 'italic' }}>…and {ROSTER_IMPORT.validRows - ROSTER_VALID.length} more</td></tr>
                </tbody>
              </table>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => onToast(`${ROSTER_IMPORT.validRows} participants added to the cycle.`)}>Confirm &amp; add to cycle</button>
          </div>
        </>
      )}

      {state === 'error' && (
        <>
          <div className="import-summary err">
            <span className="is-mark"><IcoAlert s={22} sw={2} /></span>
            <div>
              <div className="is-title">{ROSTER_IMPORT.errorRows} rows need fixing before import</div>
              <div className="is-sub">{ROSTER_IMPORT.validRows} of {ROSTER_IMPORT.totalRows} rows are valid · nothing was imported yet</div>
            </div>
          </div>
          <div className="err-report">
            <div className="er-head"><IcoAlert s={16} sw={1.9} /> <span className="er-count">{ROSTER_ERRORS.length} errors</span> — fix these rows in your file and re-upload</div>
            {ROSTER_ERRORS.map((e, i) => (
              <div className="err-row" key={i}>
                <span className="er-rownum">Row {e.row}</span>
                <span className="er-col">{e.col}</span>
                <span className="er-detail"><div className="er-msg">{e.msg}</div><div className="er-value">{e.value}</div></span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => setState('idle')}><IcoUpload s={16} /> Re-upload corrected file</button>
            <button className="btn btn-secondary" onClick={() => onToast(`${ROSTER_IMPORT.validRows} valid rows imported; ${ROSTER_IMPORT.errorRows} skipped.`)}>Import {ROSTER_IMPORT.validRows} valid rows only</button>
            <button className="btn btn-ghost" onClick={() => onToast('Error report downloaded.')}><IcoDownload s={16} /> Download error report</button>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// SETTINGS — role labels · cycle defaults · mid-cycle actions
// ============================================================
function AdminSettings({ tab, setTab, onToast }) {
  return (
    <div className="tf-page">
      <div className="page-header">
        <div className="ph-left">
          <div className="ph-eyebrow"><span className="t-label">People Ops</span></div>
          <div className="ph-title"><h1>Settings &amp; cycle management</h1></div>
          <p className="ph-sub">Company-wide defaults, the words people see, and the edge-case actions you reach for mid-cycle.</p>
        </div>
      </div>

      <div className="admin-tabs" role="tablist">
        <button role="tab" className={`admin-tab ${tab === 'labels' ? 'active' : ''}`} aria-selected={tab === 'labels'} onClick={() => setTab('labels')}><IcoUsers s={17} /> Role labels</button>
        <button role="tab" className={`admin-tab ${tab === 'defaults' ? 'active' : ''}`} aria-selected={tab === 'defaults'} onClick={() => setTab('defaults')}><IcoSettings s={17} /> Defaults</button>
        <button role="tab" className={`admin-tab ${tab === 'actions' ? 'active' : ''}`} aria-selected={tab === 'actions'} onClick={() => setTab('actions')}><IcoSwitch s={17} /> Mid-cycle actions</button>
      </div>

      {tab === 'defaults' ? <CycleDefaults onToast={onToast} />
        : tab === 'actions' ? <MidCycleActions onToast={onToast} />
          : <RoleLabels onToast={onToast} />}
    </div>
  );
}

// ---- Role-label configuration ----
function RoleLabels({ onToast }) {
  const [labels, setLabels] = useStateAd(Object.fromEntries(ROLE_CONFIG.map((r) => [r.role, r.label])));
  const [dirty, setDirty] = useStateAd(false);
  const set = (role, val) => { setLabels((l) => ({ ...l, [role]: val })); setDirty(true); };
  return (
    <div className="subj-col" style={{ margin: 0 }}>
      <p className="t-body-sm" style={{ marginBottom: 16 }}>Every role word people see in Transforma is yours to set. The system always reasons about the structural role — these labels just change what's shown.</p>
      <div className="card pad">
        <div className="label-config">
          {ROLE_CONFIG.map((r) => (
            <div className="label-row" key={r.role}>
              <div className="lr-struct">
                <span className="lr-role">{r.role === 'subject' ? 'Subject' : r.role === 'peer' ? 'Peer' : r.role === 'approver' ? 'Approver' : 'Administrator'}<span className="tok">{`{${r.token}}`}</span></span>
                <div className="lr-desc">{r.desc}</div>
                <span className="lr-struct-token">structural role · fixed</span>
              </div>
              <div>
                <label className="field-label sr-only" htmlFor={`lbl-${r.role}`}>Label for {r.role}</label>
                <input id={`lbl-${r.role}`} className={`input ${labels[r.role] ? 'is-filled' : ''}`} value={labels[r.role]} onChange={(e) => set(r.role, e.target.value)} />
                <div className="label-preview">Shows in the UI as “<b>{labels[r.role] || '—'}</b>”.</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-primary" disabled={!dirty} onClick={() => { setDirty(false); onToast('Role labels updated across the workspace.'); }}>Save labels</button>
        {dirty && <span className="t-body-sm" style={{ color: 'var(--ink-3)' }}>Unsaved changes</span>}
      </div>
      <div className="agg-note" style={{ marginTop: 18 }}>
        <IcoInfo s={15} />
        <span>Changing a label updates it everywhere instantly — navigation, task cards, and review screens all read from these settings.</span>
      </div>
    </div>
  );
}

// ---- Company-wide defaults (a specific cycle can override) ----
function CycleDefaults({ onToast }) {
  const [dirty, setDirty] = useStateAd(false);
  return (
    <div className="subj-col" style={{ margin: 0 }}>
      <p className="t-body-sm" style={{ marginBottom: 16 }}>These apply to every cycle by default. Any individual cycle can override them in its own Setup.</p>
      <div className="card pad">
        <div className="label-config">
          {CYCLE_DEFAULTS.map((d) => (
            <div className="label-row" key={d.id}>
              <div className="lr-struct">
                <span className="lr-role">{d.label}</span>
                <div className="lr-desc">{d.desc}</div>
              </div>
              <div>
                <div className="def-input">
                  <input className="input is-filled" defaultValue={d.value} onChange={() => setDirty(true)} />
                  <span className="def-unit">{d.unit}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-primary" disabled={!dirty} onClick={() => { setDirty(false); onToast('Company defaults saved.'); }}>Save defaults</button>
        {dirty && <span className="t-body-sm" style={{ color: 'var(--ink-3)' }}>Unsaved changes</span>}
      </div>
    </div>
  );
}

// ---- Mid-cycle actions (edge cases) ----
function MidCycleActions({ onToast }) {
  return (
    <div className="subj-col" style={{ margin: 0 }}>
      <p className="t-body-sm" style={{ marginBottom: 16 }}>Targeted changes to a single person or review, without disrupting the rest of the cycle.</p>
      <div className="action-list">
        <MidCycleCard ico={<IcoSwitch s={20} />} title="Reassign a review’s approver"
          desc="Move one person’s review to a different manager — for a manager change, leave, or a conflict of interest."
          fields={[{ label: 'Review for', ph: 'Search a participant…' }, { label: 'New manager', ph: 'Search a manager…' }]}
          cta="Reassign" onApply={() => onToast('Review reassigned to a new manager.')} />
        <MidCycleCard ico={<IcoClock s={20} />} title="Extend one person’s deadline"
          desc="Give a single participant more time without moving the whole cycle."
          fields={[{ label: 'Participant', ph: 'Search a participant…' }, { label: 'New deadline', ph: 'e.g. Jun 25, 2026' }]}
          cta="Extend deadline" onApply={() => onToast('Deadline extended for this participant.')} />
        <MidCycleCard ico={<IcoClose s={20} />} title="Withdraw a departed person" danger
          desc="Remove someone who has left from the cycle. Their pending tasks and any requests naming them are closed."
          fields={[{ label: 'Participant', ph: 'Search a participant…' }]}
          cta="Withdraw from cycle" onApply={() => onToast('Participant withdrawn from the cycle.')} />
      </div>
    </div>
  );
}

function MidCycleCard({ ico, title, desc, fields, cta, danger, onApply }) {
  const [open, setOpen] = useStateAd(false);
  return (
    <div className="action-card">
      <div className="ac-head">
        <span className={`ac-ico ${danger ? 'danger' : ''}`}>{ico}</span>
        <div className="ac-body">
          <h3 className="ac-title">{title}</h3>
          <p className="ac-desc">{desc}</p>
        </div>
        {!open && <button className="btn btn-secondary sm" onClick={() => setOpen(true)}>Start</button>}
      </div>
      {open && (
        <div className="ac-form">
          <div className="ac-fields">
            {fields.map((f, i) => (
              <div className="field" key={i}>
                <label className="field-label">{f.label}</label>
                <input className="input" placeholder={f.ph} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className={`btn ${danger ? 'btn-destructive solid' : 'btn-primary'}`} onClick={() => { setOpen(false); onApply(); }}>{cta}</button>
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { AdminCycle, CycleMonitor, CycleSetup, AdminRoster, AdminSettings, RoleLabels, CycleDefaults, MidCycleActions });
