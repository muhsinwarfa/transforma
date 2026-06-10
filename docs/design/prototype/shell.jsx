// Transforma — App shell. Role-aware nav that adapts to roles held.
// Desktop: persistent left sidebar (264px).
// Tablet (700–1023): sidebar collapses to a 76px icon rail.
// Mobile (<700): nav moves to a bottom bar; overflow opens a drawer.
const { useState: useStateS, useEffect: useEffectS, useRef: useRefS } = React;

function navForRoles(roles) {
  return NAV.filter((n) => !n.roles || n.roles.some((r) => roles.includes(r)));
}
function IconFor({ name, active }) {
  const map = { IcoHome, IcoReview, IcoPeer, IcoApprovals, IcoCycles, IcoRoster, IcoReports, IcoSettings };
  const C = map[name] || IcoHome;
  return <C s={22} active={active} />;
}

// ---------- SIDEBAR (desktop + tablet rail) ----------
function Sidebar({ active, onNav, roles }) {
  const items = navForRoles(roles);
  return (
    <nav className="tf-sidebar" aria-label="Primary">
      <div className="tf-sidebar-logo">
        <TenantLogo initial={TENANT.initial} name={TENANT.name} />
      </div>
      <ul className="tf-nav">
        {items.map((n) => (
          <li key={n.id}>
            <button
              className={`tf-nav-item ${active === n.id ? 'active' : ''}`}
              onClick={() => onNav(n.id)}
              aria-current={active === n.id ? 'page' : undefined}
              data-tip={n.label}
            >
              <span className="tf-nav-ico"><IconFor name={n.icon} active={active === n.id} /></span>
              <span className="tf-nav-label">{n.label}</span>
              {n.count ? <span className="tf-nav-count">{n.count}</span> : null}
            </button>
          </li>
        ))}
      </ul>
      <div className="tf-sidebar-foot">
        <div className="tf-roles-note">
          <span className="t-label">Your roles</span>
          <div className="tf-role-chips">
            {roles.map((r) => <span key={r} className="role-chip">{TENANT.labels[r]}<span className="tok">{`{${TENANT.tokens[r]}}`}</span></span>)}
          </div>
        </div>
      </div>
    </nav>
  );
}

// ---------- MOBILE BOTTOM BAR ----------
function BottomNav({ active, onNav, roles, onMore }) {
  const items = navForRoles(roles).slice(0, 4); // first 4 roles' primary items
  return (
    <nav className="tf-bottomnav" aria-label="Primary">
      {items.map((n) => (
        <button key={n.id} className={`tf-bn-item ${active === n.id ? 'active' : ''}`} onClick={() => onNav(n.id)} aria-current={active === n.id ? 'page' : undefined}>
          <span className="tf-bn-ico">
            <IconFor name={n.icon} active={active === n.id} />
            {n.count ? <span className="tf-bn-dot" /> : null}
          </span>
          <span className="tf-bn-label">{n.label}</span>
        </button>
      ))}
      <button className="tf-bn-item" onClick={onMore} aria-label="More">
        <span className="tf-bn-ico"><IcoMenu s={22} /></span>
        <span className="tf-bn-label">More</span>
      </button>
    </nav>
  );
}

// ---------- USER MENU ----------
function UserMenu({ roles, onSignOut, tokensOn, onToggleTokens }) {
  const [open, setOpen] = useStateS(false);
  const ref = useRefS(null);
  useEffectS(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div className="tf-usermenu" ref={ref}>
      <button className="tf-user-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
        <Avatar name={ME.name} initial={ME.initial} />
        <span className="tf-user-name">{ME.name.split(' ')[0]}</span>
        <IcoChevDown s={16} />
      </button>
      {open && (
        <div className="tf-menu" role="menu">
          <div className="tf-menu-ws">
            <span className="tf-menu-ws-mark" aria-hidden="true">T</span>
            <div style={{ minWidth: 0 }}>
              <div className="tf-menu-ws-name">Transforma</div>
              <div className="tf-menu-ws-sub">{TENANT.cycle}</div>
            </div>
          </div>
          <div className="tf-menu-div" />
          <div className="tf-menu-head">
            <Avatar name={ME.name} initial={ME.initial} cls="lg" />
            <div style={{ minWidth: 0 }}>
              <div className="tf-menu-name">{ME.name}</div>
              <div className="tf-menu-email">{ME.email}</div>
            </div>
          </div>
          <div className="tf-menu-roles">
            <span className="t-label">Roles in this cycle</span>
            <div className="tf-role-chips">
              {roles.map((r) => <span key={r} className="role-chip sm">{TENANT.labels[r]}</span>)}
            </div>
          </div>
          <div className="tf-menu-div" />
          <label className="tf-menu-toggle">
            <span><span className="tf-mt-title">Show role tokens</span><span className="tf-mt-sub">Reveal the configurable label behind each role</span></span>
            <input type="checkbox" checked={tokensOn} onChange={onToggleTokens} />
            <span className="tf-switch" aria-hidden="true" />
          </label>
          <div className="tf-menu-div" />
          <button className="tf-menu-item danger" role="menuitem" onClick={onSignOut}><IcoLogout s={18} /> Sign out</button>
        </div>
      )}
    </div>
  );
}

// ---------- HEADER ----------
function AppHeader({ roles, onSignOut, tokensOn, onToggleTokens, onOpenDrawer }) {
  return (
    <header className="tf-header">
      <div className="tf-header-left">
        <button className="iconbtn tf-hamburger" aria-label="Open menu" onClick={onOpenDrawer}><IcoMenu s={22} /></button>
        <div className="tf-header-logo"><TenantLogo initial={TENANT.initial} name={TENANT.name} /></div>
        <div className="tf-context" title="Current cycle">
          <span className="tf-context-eyebrow">Cycle</span>
          <span className="tf-context-name">{TENANT.cycle}</span>
        </div>
      </div>
      <div className="tf-header-right">
        <UserMenu roles={roles} onSignOut={onSignOut} tokensOn={tokensOn} onToggleTokens={onToggleTokens} />
      </div>
    </header>
  );
}

// ---------- MOBILE DRAWER (overflow / secondary) ----------
function MobileDrawer({ open, onClose, active, onNav, roles, onSignOut, tokensOn, onToggleTokens }) {
  const items = navForRoles(roles);
  return (
    <div className={`tf-drawer-scrim ${open ? 'open' : ''}`} onClick={onClose}>
      <aside className={`tf-drawer ${open ? 'open' : ''}`} onClick={(e) => e.stopPropagation()} aria-hidden={!open}>
        <div className="tf-drawer-head">
          <TenantLogo initial={TENANT.initial} name={TENANT.name} />
          <button className="iconbtn" aria-label="Close menu" onClick={onClose}><IcoClose s={22} /></button>
        </div>
        <div className="tf-drawer-user">
          <Avatar name={ME.name} initial={ME.initial} cls="lg" />
          <div style={{ minWidth: 0 }}>
            <div className="tf-menu-name">{ME.name}</div>
            <div className="tf-menu-email">{ME.email}</div>
          </div>
        </div>
        <ul className="tf-drawer-nav">
          {items.map((n) => (
            <li key={n.id}>
              <button className={`tf-nav-item ${active === n.id ? 'active' : ''}`} onClick={() => { onNav(n.id); onClose(); }}>
                <span className="tf-nav-ico"><IconFor name={n.icon} active={active === n.id} /></span>
                <span className="tf-nav-label">{n.label}</span>
                {n.count ? <span className="tf-nav-count">{n.count}</span> : null}
              </button>
            </li>
          ))}
        </ul>
        <div className="tf-menu-div" />
        <label className="tf-menu-toggle">
          <span><span className="tf-mt-title">Show role tokens</span><span className="tf-mt-sub">Reveal the configurable label behind each role</span></span>
          <input type="checkbox" checked={tokensOn} onChange={onToggleTokens} />
          <span className="tf-switch" aria-hidden="true" />
        </label>
        <button className="tf-menu-item danger" onClick={onSignOut}><IcoLogout s={18} /> Sign out</button>
      </aside>
    </div>
  );
}

Object.assign(window, { Sidebar, BottomNav, AppHeader, MobileDrawer, UserMenu, navForRoles });
