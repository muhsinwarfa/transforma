"use client";
import { useState, useTransition } from "react";
import { useToast } from "@/components/Toast";
import { Avatar } from "@/components/atoms";
import { IcoDownload, IcoSpinner } from "@/components/atoms/icons";
import { memberSetupLink, type RosterMemberRow } from "@/app/(app)/admin/actions";

// B7 — persistent roster list with per-member invite actions. "Copy link" surfaces a
// fresh set-password link (the reliable, channel-agnostic path); "Resend invite" also
// fires the branded email. Each call issues a fresh link (the implicit regenerate).
export function RosterMembers({ members, roleLabels }: { members: RosterMemberRow[]; roleLabels: Record<string, string> }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  if (members.length === 0) return null;

  const run = (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    start(async () => {
      try {
        await fn();
      } finally {
        setBusy(null);
      }
    });
  };
  const copyLink = (m: RosterMemberRow) =>
    run(`${m.id}:copy`, async () => {
      try {
        const { link } = await memberSetupLink(m.id, false);
        if (link && navigator.clipboard) {
          await navigator.clipboard.writeText(link);
          toast(`Set-up link for ${m.name} copied — valid 24 hours.`);
        } else {
          toast("Couldn't generate a link — try again.", { kind: "warn" });
        }
      } catch (e) {
        toast(e instanceof Error ? e.message : "Couldn't copy the link.", { kind: "warn" });
      }
    });
  const resend = (m: RosterMemberRow) =>
    run(`${m.id}:send`, async () => {
      try {
        const { emailed } = await memberSetupLink(m.id, true);
        toast(
          emailed ? `Invite re-sent to ${m.email}.` : "Email didn't send — copy the link to share it directly.",
          emailed ? undefined : { kind: "warn" },
        );
      } catch (e) {
        toast(e instanceof Error ? e.message : "Couldn't resend the invite.", { kind: "warn" });
      }
    });

  return (
    <div style={{ marginTop: 26 }}>
      <div className="peer-sec-head" style={{ marginBottom: 10 }}>
        <span className="t-label">People on this roster</span>
        <span className="peer-sec-count">{members.length}</span>
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="tf-table-wrap">
          <table className="tf-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Roles</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div className="row-person">
                      <Avatar name={m.name} cls="sm" />
                      <span className="cell-strong">{m.name}</span>
                    </div>
                  </td>
                  <td className="cell-muted">{m.email}</td>
                  <td>
                    {m.roles.map((r) => (
                      <span key={r} className="role-chip sm" style={{ marginRight: 4 }}>
                        {roleLabels[r] || r}
                      </span>
                    ))}
                  </td>
                  <td>
                    <span className={`badge sm ${m.status === "active" ? "in-review" : "draft"}`}>
                      <span className="dot" />
                      {m.status === "active" ? "Active" : "Invited"}
                    </span>
                  </td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {m.status !== "active" ? (
                      <>
                        <button className="btn btn-ghost sm" disabled={busy !== null} onClick={() => copyLink(m)}>
                          {busy === `${m.id}:copy` ? <IcoSpinner s={13} /> : <IcoDownload s={13} />} Copy link
                        </button>
                        <button
                          className="btn btn-secondary sm"
                          disabled={busy !== null}
                          onClick={() => resend(m)}
                          style={{ marginLeft: 6 }}
                        >
                          {busy === `${m.id}:send` ? <IcoSpinner s={13} /> : null} Resend invite
                        </button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="t-body-sm" style={{ color: "var(--ink-3)", padding: "10px 16px", margin: 0, borderTop: "1px solid var(--hairline)" }}>
          Invited people receive a set-up email (best-effort) plus a link valid 24 hours. Copy a link to share it
          directly through your own channel, or resend the email — each action issues a fresh link.
        </p>
      </div>
    </div>
  );
}
