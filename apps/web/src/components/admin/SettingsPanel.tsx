"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IcoClock, IcoClose, IcoEdit, IcoInfo, IcoPeer, IcoSettings, IcoShield, IcoSpinner } from "@/components/atoms/icons";
import {
  extendDeadline,
  grantReviewContentAdmin,
  reassignApprover,
  revokeReviewContentAdmin,
  saveAdminContentAccess,
  saveCycleDefaults,
  saveRoleLabels,
  withdrawSubject,
} from "@/app/(app)/admin/actions";
import type { CycleDefaults, Participant, RoleLabels } from "@/lib/admin/data";
import type { ReviewContentAccess } from "@/lib/admin/content";
import { RoleLabel } from "@/lib/labels/RoleLabelProvider";

type Tab = "labels" | "defaults" | "access" | "actions";
type StructuralRole = "subject" | "peer" | "approver" | "admin";

// The four FIXED structural roles (the system always reasons about these) + a
// description. These are structural identifiers, NOT tenant labels — the label is
// the editable value beside each.
const ROLE_META: { role: StructuralRole; name: string; desc: string }[] = [
  { role: "subject", name: "Subject", desc: "The person being reviewed." },
  { role: "peer", name: "Peer", desc: "Someone giving feedback on a subject." },
  { role: "approver", name: "Approver", desc: "Reviews, edits, decides, and locks a review." },
  { role: "admin", name: "Administrator", desc: "Sets up cycles, the roster, and monitors cycle health." },
];

export function SettingsPanel({
  labels,
  defaults,
  participants,
  reviewAccess,
}: {
  labels: RoleLabels;
  defaults: CycleDefaults;
  participants: Participant[];
  reviewAccess: ReviewContentAccess;
}) {
  const [tab, setTab] = useState<Tab>("labels");
  return (
    <div className="tf-page">
      <div className="page-header">
        <div className="ph-left">
          <div className="ph-eyebrow">
            <span className="t-label">Administrator</span>
          </div>
          <div className="ph-title">
            <h1>Settings &amp; cycle management</h1>
          </div>
          <p className="ph-sub">Company-wide defaults, the words people see, and the edge-case actions you reach for mid-cycle.</p>
        </div>
      </div>

      <div className="admin-tabs" role="tablist">
        <button role="tab" className={`admin-tab ${tab === "labels" ? "active" : ""}`} aria-selected={tab === "labels"} onClick={() => setTab("labels")}>
          <IcoPeer s={17} /> Role labels
        </button>
        <button role="tab" className={`admin-tab ${tab === "defaults" ? "active" : ""}`} aria-selected={tab === "defaults"} onClick={() => setTab("defaults")}>
          <IcoSettings s={17} /> Defaults
        </button>
        <button role="tab" className={`admin-tab ${tab === "access" ? "active" : ""}`} aria-selected={tab === "access"} onClick={() => setTab("access")}>
          <IcoShield s={17} /> Review access
        </button>
        <button role="tab" className={`admin-tab ${tab === "actions" ? "active" : ""}`} aria-selected={tab === "actions"} onClick={() => setTab("actions")}>
          <IcoEdit s={17} /> Mid-cycle actions
        </button>
      </div>

      {tab === "labels" ? <RoleLabelsForm seed={labels} /> : null}
      {tab === "defaults" ? <DefaultsForm seed={defaults} /> : null}
      {tab === "access" ? <ReviewAccessForm seed={reviewAccess} /> : null}
      {tab === "actions" ? <MidCycleActions participants={participants} /> : null}
    </div>
  );
}

function RoleLabelsForm({ seed }: { seed: RoleLabels }) {
  const [labels, setLabels] = useState<RoleLabels>(seed);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (role: StructuralRole, v: string) => {
    setLabels((l) => ({ ...l, [role]: v }));
    setDirty(true);
  };
  const save = () => {
    setMsg(null);
    start(async () => {
      try {
        await saveRoleLabels(labels);
        setDirty(false);
        setMsg("Role labels updated across the workspace.");
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Couldn't save labels.");
      }
    });
  };
  return (
    <div className="subj-col" style={{ margin: 0 }}>
      <p className="t-body-sm" style={{ marginBottom: 16 }}>
        Every role word people see is yours to set. The system always reasons about the structural role — these labels
        just change what&apos;s shown.
      </p>
      <div className="card pad">
        <div className="label-config">
          {ROLE_META.map((r) => (
            <div className="label-row" key={r.role}>
              <div className="lr-struct">
                <span className="lr-role">{r.name}</span>
                <div className="lr-desc">{r.desc}</div>
                <span className="lr-struct-token">structural role · fixed</span>
              </div>
              <div>
                <label className="field-label sr-only" htmlFor={`lbl-${r.role}`}>
                  Label for {r.name}
                </label>
                <input
                  id={`lbl-${r.role}`}
                  className={`input ${labels[r.role] ? "is-filled" : ""}`}
                  value={labels[r.role]}
                  onChange={(e) => set(r.role, e.target.value)}
                />
                <div className="label-preview">
                  Shows in the UI as &ldquo;<b>{labels[r.role] || "—"}</b>&rdquo;.
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn btn-primary" disabled={!dirty || pending} onClick={save}>
          {pending ? <IcoSpinner s={17} /> : null} Save labels
        </button>
        {msg ? <span className="t-body-sm" style={{ color: "var(--ink-3)" }}>{msg}</span> : null}
      </div>
    </div>
  );
}

function DefaultsForm({ seed }: { seed: CycleDefaults }) {
  const [d, setD] = useState<CycleDefaults>(seed);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fields: { key: keyof CycleDefaults; label: string; unit: string; desc: string; min: number }[] = [
    { key: "feedbackDeadlineDays", label: "Feedback deadline", unit: "days after open", desc: "How long self-review and peer feedback stay open.", min: 1 },
    { key: "peerAnonymityThreshold", label: "Anonymity floor", unit: "peers (min 3)", desc: "Fewest peer responses before peer feedback is used. Hard minimum of 3.", min: 3 },
    { key: "maxPeerNominations", label: "Max nominations", unit: "per person", desc: "Most peers a person may nominate.", min: 1 },
    { key: "ackWindowDays", label: "Acknowledgement window", unit: "days", desc: "How long someone has to acknowledge before a review locks automatically.", min: 1 },
  ];
  const set = (k: keyof CycleDefaults, v: number) => {
    setD((s) => ({ ...s, [k]: v }));
    setDirty(true);
  };
  const save = () => {
    setMsg(null);
    start(async () => {
      try {
        await saveCycleDefaults(d);
        setDirty(false);
        setMsg("Company defaults saved.");
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Couldn't save defaults.");
      }
    });
  };
  return (
    <div className="subj-col" style={{ margin: 0 }}>
      <p className="t-body-sm" style={{ marginBottom: 16 }}>These apply to every cycle by default. Any individual cycle can override them in its own setup.</p>
      <div className="card pad">
        <div className="label-config">
          {fields.map((f) => (
            <div className="label-row" key={f.key}>
              <div className="lr-struct">
                <span className="lr-role">{f.label}</span>
                <div className="lr-desc">{f.desc}</div>
              </div>
              <div className="def-input">
                <input
                  className="input is-filled"
                  type="number"
                  min={f.min}
                  value={d[f.key]}
                  onChange={(e) => set(f.key, Number.parseInt(e.target.value, 10) || f.min)}
                />
                <span className="def-unit">{f.unit}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn btn-primary" disabled={!dirty || pending} onClick={save}>
          {pending ? <IcoSpinner s={17} /> : null} Save defaults
        </button>
        {msg ? <span className="t-body-sm" style={{ color: "var(--ink-3)" }}>{msg}</span> : null}
      </div>
    </div>
  );
}

function ReviewAccessForm({ seed }: { seed: ReviewContentAccess }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(seed.enabled);
  const [admins, setAdmins] = useState(seed.admins);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    setMsg(null);
    start(async () => {
      try {
        await saveAdminContentAccess(next);
        setMsg(next ? "Review content access is on." : "Review content access is off for everyone.");
        router.refresh();
      } catch (e) {
        setEnabled(!next);
        setMsg(e instanceof Error ? e.message : "Couldn't update the setting.");
      }
    });
  };
  const setGrant = (accountId: string, grant: boolean) => {
    setMsg(null);
    start(async () => {
      try {
        if (grant) await grantReviewContentAdmin(accountId);
        else await revokeReviewContentAdmin(accountId);
        setAdmins((a) => a.map((x) => (x.accountId === accountId ? { ...x, granted: grant } : x)));
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Couldn't update access.");
      }
    });
  };

  return (
    <div className="subj-col" style={{ margin: 0 }}>
      <p className="t-body-sm" style={{ marginBottom: 16 }}>
        Choose whether <RoleLabel role="admin" plural /> can open individual reviews for oversight, and exactly who.
        Opening a review is always recorded in the audit log, and peer feedback is never shown. This is read-only — no
        one here can edit, rate, or finalize a review.
      </p>
      <div className="card pad" style={{ marginBottom: 16 }}>
        <div className="label-row">
          <div className="lr-struct">
            <span className="lr-role">Review content access</span>
            <div className="lr-desc">When off, no one can open review content — oversight stays at cycle-level counts only.</div>
          </div>
          <button className={`btn ${enabled ? "btn-primary" : "btn-secondary"}`} disabled={pending} onClick={toggle}>
            {pending ? <IcoSpinner s={17} /> : null} {enabled ? "On" : "Off"}
          </button>
        </div>
      </div>
      <div className="card pad">
        <h3 style={{ marginTop: 0 }}>Who can open reviews</h3>
        {admins.length === 0 ? (
          <p className="t-body-sm" style={{ color: "var(--ink-3)" }}>No administrators to grant yet.</p>
        ) : (
          <ul className="rev-list">
            {admins.map((a) => (
              <li key={a.accountId}>
                <div className="rev-row" style={{ cursor: "default" }}>
                  <span className="rr-name">{a.name}</span>
                  <span className="rr-dept">{a.granted ? "Has access" : "No access"}</span>
                  <span className="rr-status">
                    <button
                      className={`btn ${a.granted ? "btn-ghost" : "btn-secondary"} sm`}
                      disabled={pending}
                      onClick={() => setGrant(a.accountId, !a.granted)}
                    >
                      {a.granted ? "Revoke" : "Grant"}
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {msg ? (
        <p className="t-body-sm" style={{ color: "var(--ink-3)", marginTop: 12 }}>
          {msg}
        </p>
      ) : null}
    </div>
  );
}

function MidCycleActions({ participants }: { participants: Participant[] }) {
  const active = participants.filter((p) => !p.withdrawn);
  return (
    <div className="subj-col" style={{ margin: 0 }}>
      <p className="t-body-sm" style={{ marginBottom: 16 }}>Targeted changes to a single person or review, without disrupting the rest of the cycle. Each is recorded in the audit log.</p>
      <div className="action-list">
        <ReassignCard participants={active} />
        <ExtendCard participants={active} />
        <WithdrawCard participants={active} />
      </div>
    </div>
  );
}

function ActionShell({
  icon,
  title,
  desc,
  danger,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  danger?: boolean;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="action-card">
      <div className="ac-head">
        <span className={`ac-ico ${danger ? "danger" : ""}`.trim()}>{icon}</span>
        <div className="ac-body">
          <h3 className="ac-title">{title}</h3>
          <p className="ac-desc">{desc}</p>
        </div>
        {!open ? (
          <button className="btn btn-secondary sm" onClick={() => setOpen(true)}>
            Start
          </button>
        ) : null}
      </div>
      {open ? <div className="ac-form">{children(() => setOpen(false))}</div> : null}
    </div>
  );
}

function ReassignCard({ participants }: { participants: Participant[] }) {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [approver, setApprover] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <ActionShell icon={<IcoEdit s={20} />} title="Reassign a review's approver" desc="Move one person's review to a different manager — for a manager change, leave, or conflict of interest.">
      {(close) => (
        <>
          <div className="ac-fields">
            <Picker label="Review for" value={subject} onChange={setSubject} participants={participants} />
            <Picker label="New approver" value={approver} onChange={setApprover} participants={participants} />
          </div>
          {err ? <p className="field-msg" style={{ color: "var(--error)" }}>{err}</p> : null}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              className="btn btn-primary"
              disabled={!subject || !approver || pending}
              onClick={() => {
                setErr(null);
                start(async () => {
                  try {
                    await reassignApprover(subject, approver);
                    close();
                    router.refresh();
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : "Couldn't reassign — the new approver may fail segregation of duties.");
                  }
                });
              }}
            >
              {pending ? <IcoSpinner s={17} /> : null} Reassign
            </button>
            <button className="btn btn-ghost" onClick={close} disabled={pending}>Cancel</button>
          </div>
        </>
      )}
    </ActionShell>
  );
}

function ExtendCard({ participants }: { participants: Participant[] }) {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [date, setDate] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <ActionShell icon={<IcoClock s={20} />} title="Extend one person's deadline" desc="Give a single participant more time without moving the whole cycle.">
      {(close) => (
        <>
          <div className="ac-fields">
            <Picker label="Participant" value={subject} onChange={setSubject} participants={participants} />
            <div className="field">
              <label className="field-label">New feedback deadline</label>
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          {err ? <p className="field-msg" style={{ color: "var(--error)" }}>{err}</p> : null}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              className="btn btn-primary"
              disabled={!subject || !date || pending}
              onClick={() => {
                setErr(null);
                start(async () => {
                  try {
                    await extendDeadline(subject, "feedback", new Date(date).toISOString());
                    close();
                    router.refresh();
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : "Couldn't extend the deadline.");
                  }
                });
              }}
            >
              {pending ? <IcoSpinner s={17} /> : null} Extend deadline
            </button>
            <button className="btn btn-ghost" onClick={close} disabled={pending}>Cancel</button>
          </div>
        </>
      )}
    </ActionShell>
  );
}

function WithdrawCard({ participants }: { participants: Participant[] }) {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <ActionShell
      icon={<IcoClose s={20} />}
      title="Withdraw a departed person"
      desc="Remove someone who has left. Their in-flight review is closed and their feedback is archived — no longer surfaced to anyone."
      danger
    >
      {(close) => (
        <>
          <div className="ac-fields">
            <Picker label="Participant" value={subject} onChange={setSubject} participants={participants} />
          </div>
          {err ? <p className="field-msg" style={{ color: "var(--error)" }}>{err}</p> : null}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              className="btn btn-destructive"
              disabled={!subject || pending}
              onClick={() => {
                setErr(null);
                start(async () => {
                  try {
                    await withdrawSubject(subject);
                    close();
                    router.refresh();
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : "Couldn't withdraw this participant.");
                  }
                });
              }}
            >
              {pending ? <IcoSpinner s={17} /> : null} Withdraw from cycle
            </button>
            <button className="btn btn-ghost" onClick={close} disabled={pending}>Cancel</button>
          </div>
        </>
      )}
    </ActionShell>
  );
}

function Picker({
  label,
  value,
  onChange,
  participants,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  participants: Participant[];
}) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      <div className="select-wrap">
        <select className={`select ${value ? "is-filled" : ""}`} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose a participant…</option>
          {participants.map((p) => (
            <option key={p.accountId} value={p.accountId}>
              {p.name}
              {p.department ? ` · ${p.department}` : ""}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
