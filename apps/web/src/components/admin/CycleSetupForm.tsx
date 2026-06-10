"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { IcoChevDown, IcoCheckCircle, IcoSpinner } from "@/components/atoms/icons";
import { saveCycleSettings, startCycleFanout } from "@/app/(app)/admin/actions";
import type { CycleSetupData } from "@/lib/admin/data";

// Display a stored ISO date as the prototype's text format ("Jul 1, 2026").
function fmtDate(iso: string | null, fallback: string): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Parse the free-text date back to an ISO string; null when unparseable.
function parseDate(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const PEER_RANGES = ["2–3", "3–5", "Open"];
const ACK_OPTIONS: { label: string; days: number }[] = [
  { label: "3 days", days: 3 },
  { label: "7 days", days: 7 },
  { label: "14 days", days: 14 },
];

/**
 * A2 · Cycle setup — name / window / peer range / ack window / per-cycle override.
 * Persists via the EXISTING cycles_admin_write RLS (migration 0400): the basics
 * become columns and the operational knobs go into cycles.settings jsonb (the
 * per-cycle override of company defaults the contract describes).
 */
export function CycleSetupForm({ seed }: { seed: CycleSetupData | null }) {
  const router = useRouter();
  const toast = useToast();
  // Last-saved values, recomputed from the seed prop each render. Cancel reverts
  // the form to these (after a Save + router.refresh the seed updates, so Cancel
  // always restores to whatever is actually persisted).
  const initial = {
    name: seed?.name ?? "H2 2026 Review",
    opens: fmtDate(seed?.opensAt ?? null, "Jul 1, 2026"),
    closes: fmtDate(seed?.closesAt ?? null, "Jul 31, 2026"),
    peerRange: seed?.peerRange ?? "3–5",
    ackDays: seed?.ackWindowDays ?? 7,
    overrides: seed?.overridesCompanyDefaults ?? true,
  };
  const [name, setName] = useState(initial.name);
  const [opens, setOpens] = useState(initial.opens);
  const [closes, setCloses] = useState(initial.closes);
  const [peerRange, setPeerRange] = useState(initial.peerRange);
  const [ackDays, setAckDays] = useState(initial.ackDays);
  const [overrides, setOverrides] = useState(initial.overrides);

  const [busy, start] = useTransition();
  const [starting, startStart] = useTransition();
  const [started, setStarted] = useState(false);

  const save = () => {
    start(async () => {
      try {
        await saveCycleSettings({
          name,
          opensAt: parseDate(opens),
          closesAt: parseDate(closes),
          peerRange,
          ackWindowDays: ackDays,
          overridesCompanyDefaults: overrides,
        });
        toast("Cycle settings saved.");
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Couldn't save the cycle.", { kind: "warn" });
      }
    });
  };

  // Honest Cancel: actually restore every field to the last-saved values.
  const revert = () => {
    setName(initial.name);
    setOpens(initial.opens);
    setCloses(initial.closes);
    setPeerRange(initial.peerRange);
    setAckDays(initial.ackDays);
    setOverrides(initial.overrides);
    toast("Reverted to your last saved settings.");
  };

  return (
    <>
      <div className="card pad" style={{ marginBottom: 18 }}>
        <h2 className="t-h3" style={{ marginBottom: 4 }}>
          Configure cycle
        </h2>
        <p className="t-body-sm" style={{ marginBottom: 20 }}>
          Set the basics, then upload your roster on the Roster tab.
        </p>
        <div className="setup-grid">
          <div className="field full">
            <label className="field-label" htmlFor="cs-name">
              Cycle name
            </label>
            <input id="cs-name" className="input is-filled" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="cs-open">
              Opens
            </label>
            <input id="cs-open" className="input is-filled" type="text" value={opens} onChange={(e) => setOpens(e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="cs-close">
              Closes
            </label>
            <input id="cs-close" className="input is-filled" type="text" value={closes} onChange={(e) => setCloses(e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="cs-peers">
              Peer feedback per person
            </label>
            <div className="select-wrap">
              <select id="cs-peers" className="select is-filled" value={peerRange} onChange={(e) => setPeerRange(e.target.value)}>
                {PEER_RANGES.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
              <span className="chev">
                <IcoChevDown s={18} />
              </span>
            </div>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="cs-ack">
              Acknowledgement window
            </label>
            <div className="select-wrap">
              <select
                id="cs-ack"
                className="select is-filled"
                value={ackDays}
                onChange={(e) => setAckDays(Number.parseInt(e.target.value, 10))}
              >
                {ACK_OPTIONS.map((o) => (
                  <option key={o.days} value={o.days}>
                    {o.label}
                  </option>
                ))}
              </select>
              <span className="chev">
                <IcoChevDown s={18} />
              </span>
            </div>
          </div>
          <label className="ack-row full" style={{ marginTop: 4 }}>
            <input type="checkbox" checked={overrides} onChange={() => setOverrides((o) => !o)} />
            <span>This cycle overrides the company defaults above. Turn off to follow the company-wide settings.</span>
          </label>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? (
            <>
              <IcoSpinner s={17} /> Saving…
            </>
          ) : (
            "Save cycle"
          )}
        </button>
        <button className="btn btn-ghost" onClick={revert} disabled={busy}>
          Cancel
        </button>
      </div>

      {/* A3 · Start cycle — idempotent roster kickoff */}
      <div className="card pad" style={{ marginTop: 18 }}>
        <h2 className="t-h3" style={{ marginBottom: 6 }}>
          Start the cycle
        </h2>
        <p className="t-body-sm" style={{ marginBottom: 16, maxWidth: "62ch" }}>
          Open {name} for every participant on the roster. This creates each person&apos;s review. It&apos;s safe to run
          more than once — already-created reviews are left untouched.
        </p>
        {started ? (
          <div className="notice info">
            <span className="n-ico">
              <IcoCheckCircle s={18} />
            </span>
            <span>Cycle started — reviews created for the roster.</span>
          </div>
        ) : (
          <button
            className="btn btn-primary"
            disabled={starting}
            onClick={() => {
              startStart(async () => {
                try {
                  await startCycleFanout();
                  setStarted(true);
                  toast("Cycle started — reviews created for the roster.");
                  router.refresh();
                } catch (e) {
                  toast(e instanceof Error ? e.message : "Couldn't start the cycle.", { kind: "warn" });
                }
              });
            }}
          >
            {starting ? (
              <>
                <IcoSpinner s={17} /> Starting…
              </>
            ) : (
              "Start cycle"
            )}
          </button>
        )}
      </div>
    </>
  );
}
