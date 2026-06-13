"use client";
import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { Avatar } from "@/components/atoms";
import { IcoClock, IcoClose, IcoInfo, IcoRoster, IcoSettings, IcoShield, IcoSpinner } from "@/components/atoms/icons";
import { IcoSwitch } from "@/components/admin/icons";
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

type Tab = "labels" | "defaults" | "access" | "actions";
type StructuralRole = "subject" | "peer" | "approver" | "admin";

// The four FIXED structural roles (the system always reasons about these) + the
// underlying token surfaced by the annotation layer + a description. These are
// structural identifiers, NOT tenant labels — the label is the editable value.
const ROLE_META: { role: StructuralRole; name: string; token: string; desc: string }[] = [
  { role: "subject", name: "Subject", token: "subject_label", desc: "The person being reviewed." },
  { role: "peer", name: "Peer", token: "peer_label", desc: "Someone giving feedback on a subject." },
  { role: "approver", name: "Approver", token: "approver_label", desc: "Reviews, edits, decides, and locks a review." },
  { role: "admin", name: "Administrator", token: "admin_label", desc: "Sets up cycles, uploads the roster, monitors cycle health." },
];

const CYCLE_DEFAULT_META: { key: keyof CycleDefaults; label: string; unit: string; desc: string; min: number }[] = [
  { key: "feedbackDeadlineDays", label: "Feedback deadline", unit: "after the cycle opens", desc: "How long self-review and peer feedback stay open.", min: 1 },
  { key: "peerAnonymityThreshold", label: "Minimum peers", unit: "per person", desc: "Fewest peer responses before a review can be finalized.", min: 3 },
  { key: "maxPeerNominations", label: "Max peer nominations", unit: "per person", desc: "Most peers a person may nominate.", min: 1 },
  { key: "ackWindowDays", label: "Acknowledgement window", unit: "after a review is shared", desc: "How long someone has to acknowledge before a review locks automatically.", min: 1 },
];

export function SettingsPanel({
  labels,
  defaults,
  participants,
  reviewAccess,
  adminLabel,
  initialTab,
}: {
  labels: RoleLabels;
  defaults: CycleDefaults;
  participants: Participant[];
  reviewAccess: ReviewContentAccess;
  adminLabel: string;
  initialTab: Tab;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState<Tab>(initialTab);
  const go = (t: Tab) => {
    setTab(t);
    router.replace(`${pathname}?tab=${t}`, { scroll: false });
  };
  return (
    <div className="tf-page">
      <div className="page-header">
        <div className="ph-left">
          <div className="ph-eyebrow">
            <span className="t-label">{adminLabel}</span>
          </div>
          <div className="ph-title">
            <h1>Settings &amp; cycle management</h1>
          </div>
          <p className="ph-sub">Company-wide defaults, the words people see, and the edge-case actions you reach for mid-cycle.</p>
        </div>
      </div>

      <div className="admin-tabs" role="tablist">
        <button role="tab" className={`admin-tab ${tab === "labels" ? "active" : ""}`} aria-selected={tab === "labels"} onClick={() => go("labels")}>
          <IcoRoster s={17} /> Role labels
        </button>
        <button role="tab" className={`admin-tab ${tab === "defaults" ? "active" : ""}`} aria-selected={tab === "defaults"} onClick={() => go("defaults")}>
          <IcoSettings s={17} /> Defaults
        </button>
        <button role="tab" className={`admin-tab ${tab === "access" ? "active" : ""}`} aria-selected={tab === "access"} onClick={() => go("access")}>
          <IcoShield s={17} /> Review access
        </button>
        <button role="tab" className={`admin-tab ${tab === "actions" ? "active" : ""}`} aria-selected={tab === "actions"} onClick={() => go("actions")}>
          <IcoSwitch s={17} /> Mid-cycle actions
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
  const toast = useToast();
  const router = useRouter();
  const [labels, setLabels] = useState<RoleLabels>(seed);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const set = (role: StructuralRole, v: string) => {
    setLabels((l) => ({ ...l, [role]: v }));
    setDirty(true);
  };
  const save = () => {
    start(async () => {
      try {
        await saveRoleLabels(labels);
        setDirty(false);
        toast("Role labels updated across the workspace.");
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Couldn't save labels.", { kind: "warn" });
      }
    });
  };
  return (
    <div className="subj-col" style={{ margin: 0 }}>
      <p className="t-body-sm" style={{ marginBottom: 16 }}>
        Every role word people see in Transforma is yours to set. The system always reasons about the structural role —
        these labels just change what&apos;s shown.
      </p>
      <div className="card pad">
        <div className="label-config">
          {ROLE_META.map((r) => (
            <div className="label-row" key={r.role}>
              <div className="lr-struct">
                <span className="lr-role">
                  {r.name}
                  <span className="tok">{`{${r.token}}`}</span>
                </span>
                <div className="lr-desc">{r.desc}</div>
                <span className="lr-struct-token">structural role · fixed</span>
              </div>
              <div>
                <label className="field-label sr-only" htmlFor={`lbl-${r.role}`}>
                  Label for {r.role}
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
        {dirty ? <span className="t-body-sm" style={{ color: "var(--ink-3)" }}>Unsaved changes</span> : null}
      </div>
      <div className="agg-note" style={{ marginTop: 18 }}>
        <IcoInfo s={15} />
        <span>
          Changing a label updates it everywhere instantly — navigation, task cards, and review screens all read from
          these settings.
        </span>
      </div>
    </div>
  );
}

function DefaultsForm({ seed }: { seed: CycleDefaults }) {
  const toast = useToast();
  const [d, setD] = useState<CycleDefaults>(seed);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const set = (k: keyof CycleDefaults, v: number) => {
    setD((s) => ({ ...s, [k]: v }));
    setDirty(true);
  };
  const save = () => {
    start(async () => {
      try {
        await saveCycleDefaults(d);
        setDirty(false);
        toast("Company defaults saved.");
      } catch (e) {
        toast(e instanceof Error ? e.message : "Couldn't save defaults.", { kind: "warn" });
      }
    });
  };
  return (
    <div className="subj-col" style={{ margin: 0 }}>
      <p className="t-body-sm" style={{ marginBottom: 16 }}>
        These apply to every cycle by default. Any individual cycle can override them in its own Setup.
      </p>
      <div className="card pad">
        <div className="label-config">
          {CYCLE_DEFAULT_META.map((f) => (
            <div className="label-row" key={f.key}>
              <div className="lr-struct">
                <span className="lr-role">{f.label}</span>
                <div className="lr-desc">{f.desc}</div>
              </div>
              <div>
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
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn btn-primary" disabled={!dirty || pending} onClick={save}>
          {pending ? <IcoSpinner s={17} /> : null} Save defaults
        </button>
        {dirty ? <span className="t-body-sm" style={{ color: "var(--ink-3)" }}>Unsaved changes</span> : null}
      </div>
    </div>
  );
}

// A2 · Review access — company switch + per-admin grants. Over the EXISTING
// audited actions (saveAdminContentAccess / grant / revoke). Pixel-match only.
function ReviewAccessForm({ seed }: { seed: ReviewContentAccess }) {
  const router = useRouter();
  const toast = useToast();
  const [enabled, setEnabled] = useState(seed.enabled);
  const [admins, setAdmins] = useState(seed.admins);
  const [, start] = useTransition();

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    start(async () => {
      try {
        await saveAdminContentAccess(next);
        toast(next ? "Individual review access turned on." : "Individual review access turned off.");
        router.refresh();
      } catch (e) {
        setEnabled(!next);
        toast(e instanceof Error ? e.message : "Couldn't update the setting.", { kind: "warn" });
      }
    });
  };
  const toggleGrant = (accountId: string, name: string, grant: boolean) => {
    start(async () => {
      try {
        if (grant) await grantReviewContentAdmin(accountId);
        else await revokeReviewContentAdmin(accountId);
        setAdmins((a) => a.map((x) => (x.accountId === accountId ? { ...x, granted: grant } : x)));
        toast(grant ? `Review access granted to ${name}.` : `Review access revoked for ${name}.`);
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Couldn't update access.", { kind: "warn" });
      }
    });
  };

  return (
    <div className="subj-col" style={{ margin: 0 }}>
      <div className="card pad" style={{ marginBottom: 16 }}>
        <label className="tf-menu-toggle" style={{ padding: 0 }}>
          <span>
            <span className="tf-mt-title">Allow individual review access</span>
            <span className="tf-mt-sub">
              When off, no administrator can read individual review content, regardless of grants. Cycle-level counts
              stay available.
            </span>
          </span>
          <input type="checkbox" checked={enabled} onChange={toggle} />
          <span className="tf-switch" aria-hidden="true" />
        </label>
      </div>

      <div className="card pad" style={{ opacity: enabled ? 1 : 0.55 }}>
        <h2 className="t-h3" style={{ marginBottom: 4 }}>
          Who can read reviews
        </h2>
        <p className="t-body-sm" style={{ marginBottom: 14, maxWidth: "64ch" }}>
          Review access is a separate capability from the administrator role — holding admin alone grants nothing. Every
          read is recorded in the audit log.
        </p>
        <div className="nom-review-list">
          {admins.map((a) => (
            <div className="nom-review-row" key={a.accountId} style={{ gap: 12 }}>
              <Avatar name={a.name} cls="sm" />
              <div className="nrr-main" style={{ flex: 1 }}>
                <span className="nrr-name">{a.name}</span>
                <span className="nrr-rel">{a.email}</span>
              </div>
              {a.granted ? (
                <button className="btn btn-destructive sm" disabled={!enabled} onClick={() => toggleGrant(a.accountId, a.name, false)}>
                  Revoke
                </button>
              ) : (
                <button className="btn btn-outline sm" disabled={!enabled} onClick={() => toggleGrant(a.accountId, a.name, true)}>
                  Grant
                </button>
              )}
            </div>
          ))}
          {admins.length === 0 ? (
            <div className="state-block">
              <span className="state-glyph">
                <IcoRoster s={26} />
              </span>
              <h3>No administrators yet</h3>
              <p>When other administrators join this workspace, you can grant them review access here.</p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="agg-note" style={{ marginTop: 16 }}>
        <IcoShield s={15} />
        <span>
          Peer feedback is never readable here or anywhere — this capability covers the finished review, the self-review,
          and the employee&apos;s response only.
        </span>
      </div>
    </div>
  );
}

function MidCycleActions({ participants }: { participants: Participant[] }) {
  const active = participants.filter((p) => !p.withdrawn);
  return (
    <div className="subj-col" style={{ margin: 0 }}>
      <p className="t-body-sm" style={{ marginBottom: 16 }}>
        Targeted changes to a single person or review, without disrupting the rest of the cycle.
      </p>
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
  const toast = useToast();
  const [subject, setSubject] = useState("");
  const [approver, setApprover] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <ActionShell
      icon={<IcoSwitch s={20} />}
      title="Reassign a review's approver"
      desc="Move one person's review to a different manager — for a manager change, leave, or a conflict of interest."
    >
      {(close) => (
        <>
          <div className="ac-fields">
            <Picker label="Review for" value={subject} onChange={setSubject} participants={participants} />
            <Picker label="New manager" value={approver} onChange={setApprover} participants={participants} />
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
                    setSubject("");
                    setApprover("");
                    close();
                    toast("Review reassigned to a new manager.");
                    router.refresh();
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : "Couldn't reassign — the new manager may fail segregation of duties.");
                  }
                });
              }}
            >
              {pending ? <IcoSpinner s={17} /> : null} Reassign
            </button>
            <button className="btn btn-ghost" onClick={close} disabled={pending}>
              Cancel
            </button>
          </div>
        </>
      )}
    </ActionShell>
  );
}

function ExtendCard({ participants }: { participants: Participant[] }) {
  const router = useRouter();
  const toast = useToast();
  const [subject, setSubject] = useState("");
  const [date, setDate] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <ActionShell
      icon={<IcoClock s={20} />}
      title="Extend one person's deadline"
      desc="Give a single participant more time without moving the whole cycle."
    >
      {(close) => (
        <>
          <div className="ac-fields">
            <Picker label="Participant" value={subject} onChange={setSubject} participants={participants} />
            <div className="field">
              <label className="field-label">New deadline</label>
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
                    setSubject("");
                    setDate("");
                    close();
                    toast("Deadline extended for this participant.");
                    router.refresh();
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : "Couldn't extend the deadline.");
                  }
                });
              }}
            >
              {pending ? <IcoSpinner s={17} /> : null} Extend deadline
            </button>
            <button className="btn btn-ghost" onClick={close} disabled={pending}>
              Cancel
            </button>
          </div>
        </>
      )}
    </ActionShell>
  );
}

function WithdrawCard({ participants }: { participants: Participant[] }) {
  const router = useRouter();
  const toast = useToast();
  const [subject, setSubject] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <ActionShell
      icon={<IcoClose s={20} />}
      title="Withdraw a departed person"
      desc="Remove someone who has left from the cycle. Their pending tasks and any requests naming them are closed."
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
              className="btn btn-destructive solid"
              disabled={!subject || pending}
              onClick={() => {
                setErr(null);
                start(async () => {
                  try {
                    await withdrawSubject(subject);
                    setSubject("");
                    close();
                    toast("Participant withdrawn from the cycle.");
                    router.refresh();
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : "Couldn't withdraw this participant.");
                  }
                });
              }}
            >
              {pending ? <IcoSpinner s={17} /> : null} Withdraw from cycle
            </button>
            <button className="btn btn-ghost" onClick={close} disabled={pending}>
              Cancel
            </button>
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
  // The field owns the typed TEXT (`query`); the selected `accountId` (`value`) is an
  // OUTPUT, resolved on an exact name match. Previously the input's value was derived
  // from `value`, so any partial keystroke that didn't yet match a full name resolved to
  // "" and wiped the field every character — the input appeared un-typeable. The form
  // unmounts on close (ActionShell), so this local state re-initialises per open.
  const nameOf = (id: string) => participants.find((p) => p.accountId === id)?.name ?? "";
  const [query, setQuery] = useState(() => nameOf(value));
  const listId = `picker-${label.replace(/\s+/g, "-")}`;
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      <input
        className="input"
        list={listId}
        value={query}
        onChange={(e) => {
          const text = e.target.value;
          setQuery(text);
          const match = participants.find((p) => p.name === text);
          onChange(match ? match.accountId : "");
        }}
        placeholder={label.toLowerCase().includes("manager") ? "Search a manager…" : "Search a participant…"}
      />
      <datalist id={listId}>
        {participants.map((p) => (
          <option key={p.accountId} value={p.name}>
            {p.department ?? ""}
          </option>
        ))}
      </datalist>
    </div>
  );
}
