// Transforma shared primitives — composed from Hogaan atoms.
const { useState, useEffect, useRef, createContext, useContext } = React;

// --- StatusBadge: the review lifecycle (Draft / In review / Locked / Flagged) ---
function StatusBadge({ status, sm }) {
  const s = STATUS[status] || STATUS.draft;
  return (
    <span className={`badge ${s.cls} ${sm ? 'sm' : ''}`}>
      {status === 'locked'
        ? <IcoLock s={sm ? 11 : 12} sw={1.8} />
        : status === 'flagged'
          ? <IcoFlag s={sm ? 11 : 12} sw={1.8} />
          : <span className="dot" />}
      {s.label}
    </span>
  );
}

// --- RoleLabel: renders the TENANT label, with an optional token annotation ---
// Never hardcode role words — always go through this.
function RoleLabel({ role, plural }) {
  const label = TENANT.labels[role] || role;
  const token = TENANT.tokens[role];
  return (
    <span className="role-label">
      {label}{plural && !label.endsWith('s') ? 's' : ''}
      <span className="tok" title="Tenant-configured role token">{`{${token}}`}</span>
    </span>
  );
}

function Avatar({ name, initial, cls = '' }) {
  const init = initial || (name ? name.split(' ').map((w) => w[0]).slice(0, 2).join('') : '?');
  return <span className={`avatar ${cls}`} aria-hidden="true">{init}</span>;
}

// --- Toast host (context) ---
const ToastCtx = createContext(() => {});
function useToast() { return useContext(ToastCtx); }

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = (msg, opts = {}) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg, kind: opts.kind || 'ok' }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts.duration || 3800);
  };
  const dismiss = (id) => setToasts((t) => t.filter((x) => x.id !== id));
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span className="t-ico">{t.kind === 'warn' ? <IcoAlert s={18} /> : <IcoCheckCircle s={18} />}</span>
            <span>{t.msg}</span>
            <button className="t-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}><IcoClose s={14} sw={2} /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

Object.assign(window, { StatusBadge, RoleLabel, Avatar, ToastProvider, useToast });
