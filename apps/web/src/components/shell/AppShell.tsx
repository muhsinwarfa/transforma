"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { StructuralRole } from "@transforma/db";
import type { RoleLabels } from "@/lib/labels/roleLabel";
import {
  IcoApprovals,
  IcoBell,
  IcoCycles,
  IcoDoc,
  IcoHome,
  IcoLogout,
  IcoPeer,
  IcoReview,
  IcoRoster,
  IcoSearch,
  IcoSettings,
  type IconProps,
} from "@/components/atoms/icons";

interface NavItem {
  id: string;
  label: string;
  href: string;
  Icon: (p: IconProps) => ReactNode;
  roles: StructuralRole[] | null; // null = always shown
}

// Section labels (NOT tenant role words). Nav adapts to roles held.
const NAV: NavItem[] = [
  { id: "home", label: "Home", href: "/home", Icon: IcoHome, roles: null },
  { id: "review", label: "My review", href: "/review", Icon: IcoReview, roles: ["subject"] },
  { id: "peer", label: "Peer feedback", href: "/peer", Icon: IcoPeer, roles: ["peer"] },
  { id: "approvals", label: "Approvals", href: "/approvals", Icon: IcoApprovals, roles: ["approver"] },
  { id: "nominations", label: "Nominations", href: "/nominations", Icon: IcoPeer, roles: ["approver"] },
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

export function AppShell({
  roles,
  labels,
  children,
}: {
  roles: StructuralRole[];
  labels: RoleLabels;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const items = navForRoles(roles);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="tf-app">
      <nav className="tf-sidebar" aria-label="Primary">
        <div className="tf-sidebar-logo">
          <TenantLogo />
        </div>
        <ul className="tf-nav">
          {items.map((n) => (
            <li key={n.id}>
              <Link
                href={n.href}
                className={`tf-nav-item ${isActive(n.href) ? "active" : ""}`}
                aria-current={isActive(n.href) ? "page" : undefined}
              >
                <span className="tf-nav-ico">
                  <n.Icon s={22} active={isActive(n.href)} />
                </span>
                <span className="tf-nav-label">{n.label}</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="tf-sidebar-foot">
          <div className="tf-roles-note">
            <span className="t-label">Your roles</span>
            <div className="tf-role-chips">
              {roles.map((r) => (
                <span key={r} className="role-chip sm">
                  {labels[r]}
                </span>
              ))}
            </div>
          </div>
        </div>
      </nav>

      <div className="tf-main">
        <header className="tf-header">
          <div className="tf-header-left">
            <div className="tf-context" title="Current cycle">
              <span className="tf-context-eyebrow">Cycle</span>
              <span className="tf-context-name">H1 2026 Review</span>
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
            {/* Sign-out is wired with the auth flow in PROC-01. */}
            <button className="iconbtn" aria-label="Sign out" type="button" title="Sign out">
              <IcoLogout s={20} />
            </button>
          </div>
        </header>
        <main className="tf-content">
          <div className="tf-content-inner">{children}</div>
        </main>
      </div>
    </div>
  );
}
