"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { StructuralRole } from "@transforma/db";
import type { RoleLabels } from "@/lib/labels/roleLabel";
import { Avatar } from "@/components/atoms";
import { signOut } from "@/app/(auth)/auth-actions";
import {
  IcoApprovals,
  IcoBell,
  IcoChevDown,
  IcoCycles,
  IcoDoc,
  IcoHome,
  IcoLogout,
  IcoPeer,
  IcoReview,
  IcoRoster,
  IcoSearch,
  IcoSettings,
  IcoUser,
  type IconProps,
} from "@/components/atoms/icons";

type CountKey = "peer" | "approvals" | "nominations";
interface NavItem {
  id: string;
  label: string;
  href: string;
  Icon: (p: IconProps) => ReactNode;
  roles: StructuralRole[] | null; // null = always shown
  countKey?: CountKey;
}

// Section labels (NOT tenant role words). Nav adapts to the roles held.
const NAV: NavItem[] = [
  { id: "home", label: "Home", href: "/home", Icon: IcoHome, roles: null },
  { id: "review", label: "My review", href: "/review", Icon: IcoReview, roles: ["subject"] },
  { id: "peer", label: "Peer feedback", href: "/peer", Icon: IcoPeer, roles: ["peer"], countKey: "peer" },
  { id: "approvals", label: "Approvals", href: "/approvals", Icon: IcoApprovals, roles: ["approver"], countKey: "approvals" },
  { id: "nominations", label: "Nominations", href: "/nominations", Icon: IcoPeer, roles: ["approver"], countKey: "nominations" },
  { id: "cycle", label: "Cycle", href: "/admin/cycle", Icon: IcoCycles, roles: ["admin"] },
  { id: "roster", label: "Roster", href: "/admin/roster", Icon: IcoRoster, roles: ["admin"] },
  { id: "reviews", label: "Reviews", href: "/admin/reviews", Icon: IcoDoc, roles: ["admin"] },
  { id: "settings", label: "Settings", href: "/admin/settings", Icon: IcoSettings, roles: ["admin"] },
];

function navForRoles(roles: StructuralRole[]): NavItem[] {
  return NAV.filter((n) => !n.roles || n.roles.some((r) => roles.includes(r)));
}

function TenantLogo() {
  return (
    <div className="tenant-logo" data-small="false">
      <span className="mark" aria-hidden="true">T</span>
      <span className="brand-stack">
        <span className="ten-name">Transforma</span>
        <span className="ten-product">Review workspace</span>
      </span>
    </div>
  );
}

// The underlying configurable token behind each tenant role word (revealed by the
// "Show role tokens" toggle; hidden via the .tok / body.show-tokens CSS otherwise).
const TOKENS: Record<StructuralRole, string> = {
  subject: "subject_label",
  peer: "peer_label",
  approver: "approver_label",
  admin: "admin_label",
};

function RoleChips({ roles, labels, sm }: { roles: StructuralRole[]; labels: RoleLabels; sm?: boolean }) {
  return (
    <div className="tf-role-chips">
      {roles.map((r) => (
        <span key={r} className={`role-chip ${sm ? "sm" : ""}`.trim()}>
          {labels[r]}
          <span className="tok">{`{${TOKENS[r]}}`}</span>
        </span>
      ))}
    </div>
  );
}

function UserMenu({
  user,
  roles,
  labels,
  tenantName,
  cycleName,
}: {
  user: { name: string; email: string };
  roles: StructuralRole[];
  labels: RoleLabels;
  tenantName: string;
  cycleName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [tokensOn, setTokensOn] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  useEffect(() => {
    document.body.classList.toggle("show-tokens", tokensOn);
  }, [tokensOn]);
  const first = user.name.split(" ")[0];
  return (
    <div className="tf-usermenu" ref={ref}>
      <button
        className="tf-user-btn"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        type="button"
      >
        <Avatar name={user.name} />
        <span className="tf-user-name">{first}</span>
        <IcoChevDown s={16} />
      </button>
      {open && (
        <div className="tf-menu" role="menu">
          <div className="tf-menu-ws">
            <span className="tf-menu-ws-mark" aria-hidden="true">T</span>
            <div style={{ minWidth: 0 }}>
              <div className="tf-menu-ws-name">{tenantName}</div>
              {cycleName ? <div className="tf-menu-ws-sub">{cycleName}</div> : null}
            </div>
          </div>
          <div className="tf-menu-div" />
          <div className="tf-menu-head">
            <Avatar name={user.name} cls="lg" />
            <div style={{ minWidth: 0 }}>
              <div className="tf-menu-name">{user.name}</div>
              <div className="tf-menu-email">{user.email}</div>
            </div>
          </div>
          <div className="tf-menu-roles">
            <span className="t-label">Roles in this cycle</span>
            <RoleChips roles={roles} labels={labels} sm />
          </div>
          <div className="tf-menu-div" />
          <label className="tf-menu-toggle">
            <span>
              <span className="tf-mt-title">Show role tokens</span>
              <span className="tf-mt-sub">Reveal the configurable label behind each role</span>
            </span>
            <input type="checkbox" checked={tokensOn} onChange={(e) => setTokensOn(e.target.checked)} />
            <span className="tf-switch" aria-hidden="true" />
          </label>
          <div className="tf-menu-div" />
          <button className="tf-menu-item" role="menuitem" type="button">
            <IcoUser s={18} /> Account settings
          </button>
          <form action={signOut}>
            <button className="tf-menu-item danger" role="menuitem" type="submit">
              <IcoLogout s={18} /> Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export function AppShell({
  roles,
  labels,
  user,
  cycleName,
  tenantName,
  counts,
  children,
}: {
  roles: StructuralRole[];
  labels: RoleLabels;
  user: { name: string; email: string };
  cycleName: string | null;
  tenantName: string;
  counts: { peer?: number; approvals?: number; nominations?: number };
  children: ReactNode;
}) {
  const pathname = usePathname();
  const items = navForRoles(roles);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const countFor = (n: NavItem) => (n.countKey ? counts[n.countKey] : undefined);

  return (
    <div className="tf-app">
      <nav className="tf-sidebar" aria-label="Primary">
        <div className="tf-sidebar-logo">
          <TenantLogo />
        </div>
        <ul className="tf-nav">
          {items.map((n) => {
            const c = countFor(n);
            return (
              <li key={n.id}>
                <Link
                  href={n.href}
                  className={`tf-nav-item ${isActive(n.href) ? "active" : ""}`}
                  aria-current={isActive(n.href) ? "page" : undefined}
                  data-tip={n.label}
                >
                  <span className="tf-nav-ico">
                    <n.Icon s={22} active={isActive(n.href)} />
                  </span>
                  <span className="tf-nav-label">{n.label}</span>
                  {c ? <span className="tf-nav-count">{c}</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="tf-sidebar-foot">
          <div className="tf-roles-note">
            <span className="t-label">Your roles</span>
            <RoleChips roles={roles} labels={labels} sm />
          </div>
        </div>
      </nav>

      <div className="tf-main">
        <header className="tf-header">
          <div className="tf-header-left">
            <div className="tf-context" title="Current cycle">
              <span className="tf-context-eyebrow">Cycle</span>
              <span className="tf-context-name">{cycleName ?? "—"}</span>
            </div>
          </div>
          <div className="tf-header-right">
            <button className="iconbtn" aria-label="Search" type="button">
              <IcoSearch s={20} />
            </button>
            <button className="iconbtn" aria-label="Notifications" type="button">
              <IcoBell s={20} />
            </button>
            <div className="tf-header-div" />
            <UserMenu user={user} roles={roles} labels={labels} tenantName={tenantName} cycleName={cycleName} />
          </div>
        </header>
        <main className="tf-content">
          <div className="tf-content-inner">{children}</div>
        </main>
      </div>
    </div>
  );
}
