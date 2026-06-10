import type { ReactNode } from "react";

// Split-panel auth shell: brand quote panel (desktop) + form column.
// Ported from docs/design/prototype/auth.jsx → AuthShell. Pre-session, so the
// brand lockup uses the product mark; the workspace line shows the cycle, never
// a tenant company name (brand rule: Transforma is the product, tenant is context).
function TenantLogo() {
  return (
    <div className="tenant-logo" data-small="false">
      <span className="mark" aria-hidden="true">T</span>
      <span className="brand-stack">
        <span className="ten-name">
          Transforma<span className="brand-dot" aria-hidden="true" />
        </span>
        <span className="ten-product">H1 2026 Review</span>
      </span>
    </div>
  );
}

export function AuthShell({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="auth-stage">
      <div className="auth-brand" aria-hidden="true">
        <div className="auth-brand-top">
          <TenantLogo />
        </div>
        <div className="auth-brand-mid">
          <span className="auth-quote-mark">&ldquo;</span>
          <p className="auth-brand-line">A calm, fair place to give and receive a review.</p>
          <p className="auth-brand-sub">H1 2026 Review</p>
        </div>
        <div className="auth-brand-foot">
          <span
            className="badge in-review"
            style={{ background: "rgba(255,255,255,0.14)", color: "#eaf4ff", borderColor: "rgba(255,255,255,0.22)" }}
          >
            <span className="dot" />
            Draft
          </span>
          <span
            className="badge in-review"
            style={{ background: "rgba(255,255,255,0.14)", color: "#eaf4ff", borderColor: "rgba(255,255,255,0.22)" }}
          >
            <span className="dot" />
            In review
          </span>
          <span
            className="badge in-review"
            style={{ background: "rgba(255,255,255,0.14)", color: "#eaf4ff", borderColor: "rgba(255,255,255,0.22)" }}
          >
            <span className="dot" />
            Locked
          </span>
        </div>
      </div>
      <div className="auth-col">
        <div className="auth-card-wrap">
          <div className="auth-mobile-logo">
            <TenantLogo />
          </div>
          {children}
          {footer ? <div className="auth-foot">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}
