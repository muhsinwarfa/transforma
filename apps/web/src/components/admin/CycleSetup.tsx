"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IcoInfo, IcoSpinner } from "@/components/atoms/icons";
import { startCycleFanout } from "@/app/(app)/admin/actions";

/**
 * PROC-MAIN: start the cycle. The eager fan-out creates one draft review per
 * subject in the roster — idempotent on (cycle, subject), so re-running is safe
 * and creates no duplicates.
 */
export function CycleSetup({ cycleName }: { cycleName: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="card pad" style={{ marginBottom: 18 }}>
      <h2 className="t-h3" style={{ marginBottom: 4 }}>
        Start the cycle
      </h2>
      <p className="t-body-sm" style={{ marginBottom: 16 }}>
        Open <strong>{cycleName}</strong> for every participant on the roster. This creates each person&apos;s review.
        It&apos;s safe to run more than once — already-created reviews are left untouched.
      </p>
      {err ? <p className="field-msg" style={{ color: "var(--error)", marginBottom: 10 }}>{err}</p> : null}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button
          className="btn btn-primary"
          disabled={pending}
          onClick={() => {
            setErr(null);
            setMsg(null);
            start(async () => {
              try {
                await startCycleFanout();
                setMsg("Cycle started — reviews created for the roster.");
                router.refresh();
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Couldn't start the cycle.");
              }
            });
          }}
        >
          {pending ? <IcoSpinner s={17} /> : null} Start cycle
        </button>
        {msg ? (
          <span className="t-body-sm" style={{ color: "var(--ink-3)", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <IcoInfo s={14} /> {msg}
          </span>
        ) : null}
      </div>
    </div>
  );
}
