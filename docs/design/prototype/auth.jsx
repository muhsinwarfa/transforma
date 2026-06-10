// Transforma — Auth surface. Composed from Hogaan field/button atoms.
// States: login · activation (valid / expired / used) · set-password · reset-password.
const { useState: useStateA } = React;

// Split-panel auth shell: brand panel (desktop) + form column.
function AuthShell({ children, footer }) {
  return (
    <div className="auth-stage">
      <div className="auth-brand" aria-hidden="true">
        <div className="auth-brand-top">
          <TenantLogo initial={TENANT.initial} name={TENANT.name} />
        </div>
        <div className="auth-brand-mid">
          <span className="auth-quote-mark">&ldquo;</span>
          <p className="auth-brand-line">A calm, fair place to give and receive a review.</p>
          <p className="auth-brand-sub">{TENANT.cycle}</p>
        </div>
        <div className="auth-brand-foot">
          <span className="badge in-review" style={{ background: 'rgba(255,255,255,0.14)', color: '#eaf4ff', borderColor: 'rgba(255,255,255,0.22)' }}><span className="dot" />Draft</span>
          <span className="badge in-review" style={{ background: 'rgba(255,255,255,0.14)', color: '#eaf4ff', borderColor: 'rgba(255,255,255,0.22)' }}><span className="dot" />In review</span>
          <span className="badge in-review" style={{ background: 'rgba(255,255,255,0.14)', color: '#eaf4ff', borderColor: 'rgba(255,255,255,0.22)' }}><span className="dot" />Locked</span>
        </div>
      </div>
      <div className="auth-col">
        <div className="auth-card-wrap">
          <div className="auth-mobile-logo"><TenantLogo initial={TENANT.initial} name={TENANT.name} /></div>
          {children}
          {footer && <div className="auth-foot">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

function PasswordInput({ id, label, value, onChange, placeholder, autoFocus, hint, error, onEnter }) {
  const [show, setShow] = useStateA(false);
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <div className="input-affix">
        <input
          id={id} type={show ? 'text' : 'password'} className={`input ${value ? 'is-filled' : ''} ${error ? 'is-error' : ''}`}
          value={value} placeholder={placeholder} autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) onEnter(); }}
          aria-invalid={!!error}
        />
        <button type="button" className="affix-btn" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow((s) => !s)}>
          <IcoEye off={!show} s={18} />
        </button>
      </div>
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-msg"><IcoAlert s={14} sw={1.9} />{error}</span>}
    </div>
  );
}

function strengthOf(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/[0-9]/.test(pw) || /[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(3, s);
}

// ---------- LOGIN ----------
function LoginScreen({ onSignIn, onForgot }) {
  const [email, setEmail] = useStateA('amina.yusuf@workmail.com');
  const [pw, setPw] = useStateA('');
  const [busy, setBusy] = useStateA(false);
  const submit = () => { setBusy(true); setTimeout(onSignIn, 850); };
  return (
    <AuthShell>
      <h1 className="auth-h">Welcome back.</h1>
      <p className="auth-sub">Sign in to your review space.</p>
      <div className="auth-form">
        <div className="field">
          <label className="field-label" htmlFor="lg-email">Email</label>
          <input id="lg-email" type="email" className={`input ${email ? 'is-filled' : ''}`} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        </div>
        <PasswordInput id="lg-pw" label="Password" value={pw} onChange={setPw} placeholder="Enter your password" onEnter={submit} />
        <div className="auth-inline-row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="auth-link" onClick={onForgot}>Forgot your password?</button>
        </div>
        <button type="button" className="btn btn-primary block lg" onClick={submit} disabled={busy}>
          {busy ? <><IcoSpinner s={18} /> Signing in…</> : 'Sign in'}
        </button>

        {/* Inactive SSO placeholder slot — designed so SSO drops in without rework. */}
        <div className="sso-slot" aria-hidden="true">
          <div className="sso-divider"><span>or</span></div>
          <button type="button" className="btn btn-secondary block" disabled title="Single sign-on — available soon">
            <span className="sso-mark">SSO</span> Continue with single sign-on
          </button>
          <span className="sso-note">Single sign-on can be enabled by your administrator.</span>
        </div>
      </div>
    </AuthShell>
  );
}

// ---------- ACTIVATION (3 states) ----------
function ActivationValid({ onActivate }) {
  return (
    <AuthShell footer={<span>This invite is for <strong>amina.yusuf@workmail.com</strong></span>}>
      <span className="auth-eyebrow">You're invited</span>
      <h1 className="auth-h">Set up your account.</h1>
      <p className="auth-sub">You've been invited to take part in {TENANT.cycle}. Choose a password to activate your account.</p>
      <SetPasswordForm cta="Activate account" onDone={onActivate} />
    </AuthShell>
  );
}

function ActivationState({ variant, onRequestNew, onSignIn }) {
  const v = variant === 'expired'
    ? { ico: <IcoClock s={26} />, title: 'This link has expired', body: 'Activation links are single-use and valid for 7 days. Your administrator can send you a fresh one.', glyph: 'warn' }
    : { ico: <IcoCheckCircle s={26} />, title: 'This link has already been used', body: 'Your account is already active. Sign in with the password you set when you activated it.', glyph: 'ok' };
  return (
    <AuthShell footer={<span>Need help? <a href="#" onClick={(e) => e.preventDefault()}>Contact your administrator</a></span>}>
      <div className={`auth-status-mark ${v.glyph}`}>{v.ico}</div>
      <h1 className="auth-h">{v.title}</h1>
      <p className="auth-sub">{v.body}</p>
      <div className="auth-form">
        {variant === 'expired'
          ? <button type="button" className="btn btn-primary block lg" onClick={onSignIn}>Back to sign in</button>
          : <button type="button" className="btn btn-primary block lg" onClick={onSignIn}>Go to sign in</button>}
      </div>
    </AuthShell>
  );
}

// ---------- SET / RESET PASSWORD ----------
function SetPasswordForm({ cta, onDone }) {
  const [pw, setPw] = useStateA('');
  const [confirm, setConfirm] = useStateA('');
  const [touched, setTouched] = useStateA(false);
  const [busy, setBusy] = useStateA(false);
  const s = strengthOf(pw);
  const lvlTxt = ['Too short', 'Weak', 'Getting there', 'Strong'][s];
  const mismatch = touched && confirm.length > 0 && confirm !== pw;
  const valid = pw.length >= 8 && pw === confirm;
  const submit = () => { setTouched(true); if (!valid) return; setBusy(true); setTimeout(onDone, 850); };
  return (
    <div className="auth-form">
      <PasswordInput id="sp-pw" label="New password" value={pw} onChange={setPw} placeholder="At least 8 characters" autoFocus hint="Use 8+ characters with a mix of letters and numbers." />
      {pw.length > 0 && (
        <div className="pw-meter" aria-hidden="true">
          <div className="pw-bars">
            {[1, 2, 3].map((i) => <span key={i} className={`pw-bar ${s >= i ? `on lvl-${s}` : ''}`} />)}
          </div>
          <span className={`pw-meter-label lvl-${s}`}>{lvlTxt}</span>
        </div>
      )}
      <PasswordInput id="sp-confirm" label="Confirm password" value={confirm} onChange={setConfirm} placeholder="Re-enter your password" error={mismatch ? 'Passwords don\u2019t match yet.' : ''} onEnter={submit} />
      <button type="button" className="btn btn-primary block lg" onClick={submit} disabled={busy}>
        {busy ? <><IcoSpinner s={18} /> Saving…</> : cta}
      </button>
    </div>
  );
}

function SetPasswordScreen({ mode, onDone }) {
  // mode: 'reset' (from forgot) or 'set' (generic set password)
  const isReset = mode === 'reset';
  return (
    <AuthShell footer={<span>Remembered it? <a href="#" onClick={(e) => { e.preventDefault(); onDone(); }}>Back to sign in</a></span>}>
      <span className="auth-eyebrow">{isReset ? 'Reset password' : 'Set password'}</span>
      <h1 className="auth-h">{isReset ? 'Choose a new password.' : 'Create your password.'}</h1>
      <p className="auth-sub">{isReset ? 'Pick something you haven\u2019t used here before. You\u2019ll use it to sign in next time.' : 'This password secures your account on Transforma.'}</p>
      <SetPasswordForm cta={isReset ? 'Reset password' : 'Save password'} onDone={onDone} />
    </AuthShell>
  );
}

// ---------- FORGOT PASSWORD (request) ----------
function ForgotScreen({ onSent, onBack }) {
  const [email, setEmail] = useStateA('');
  const [busy, setBusy] = useStateA(false);
  const submit = () => { setBusy(true); setTimeout(onSent, 850); };
  return (
    <AuthShell footer={<button type="button" className="auth-link" onClick={onBack}>Back to sign in</button>}>
      <span className="auth-eyebrow">Forgot password</span>
      <h1 className="auth-h">Reset your password.</h1>
      <p className="auth-sub">Enter the email you use for Transforma and we'll send a reset link.</p>
      <div className="auth-form">
        <div className="field">
          <label className="field-label" htmlFor="fg-email">Email</label>
          <input id="fg-email" type="email" className={`input ${email ? 'is-filled' : ''}`} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoFocus onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </div>
        <button type="button" className="btn btn-primary block lg" onClick={submit} disabled={busy}>
          {busy ? <><IcoSpinner s={18} /> Sending…</> : 'Send reset link'}
        </button>
      </div>
    </AuthShell>
  );
}

function ForgotSent({ onReset, onBack }) {
  return (
    <AuthShell footer={<button type="button" className="auth-link" onClick={onBack}>Back to sign in</button>}>
      <div className="auth-status-mark ok"><IcoMail s={26} /></div>
      <h1 className="auth-h">Check your inbox.</h1>
      <p className="auth-sub">If an account exists for that email, a reset link is on its way. The link expires in 1 hour.</p>
    </AuthShell>
  );
}

Object.assign(window, { AuthShell, LoginScreen, ActivationValid, ActivationState, SetPasswordScreen, ForgotScreen, ForgotSent });
