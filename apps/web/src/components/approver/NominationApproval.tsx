"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Avatar } from "@/components/atoms";
import { IcoAlert, IcoCheck, IcoChevLeft, IcoEdit, IcoSpinner } from "@/components/atoms/icons";
import { useToast } from "@/components/Toast";
import { approveNominations, requestNominationChanges } from "@/app/(app)/nominations/actions";
import type { NominationDetail } from "@/lib/approver/nominations";
import type { RoleLabels } from "@/lib/labels/roleLabel";

export function NominationApproval({ data, labels }: { data: NominationDetail; labels: RoleLabels }) {
  const router = useRouter();
  const toast = useToast();
  const firstName = data.subjectName.split(" ")[0] || "them";
  const [mode, setMode] = useState<"idle" | "changes">("idle");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const belowFloor = data.nominees.length < data.minPeers;

  const approve = () => {
    setError(null);
    start(async () => {
      try {
        await approveNominations(data.cycleId, data.employeeId);
        toast("Nominations approved.");
        router.push("/nominations");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't approve these nominations.");
      }
    });
  };

  const sendBack = () => {
    setError(null);
    start(async () => {
      try {
        await requestNominationChanges(data.cycleId, data.employeeId, note);
        toast("Sent back with your note.");
        router.push("/nominations");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't send this back.");
      }
    });
  };

  return (
    <div className="tf-page subj-col">
      <button className="form-back" onClick={() => router.push("/nominations")}>
        <IcoChevLeft s={16} /> All nominations
      </button>

      <div className="aw-context">
        <Avatar name={data.subjectName} cls="lg" />
        <div className="awc-body">
          <div className="awc-top">
            <h1 className="awc-name">{data.subjectName}</h1>
            <span className="role-chip sm">{labels.subject}</span>
          </div>
          <div className="awc-meta">
            {data.department ? `${data.department} · ` : ""}nominated {data.nominees.length}{" "}
            {data.nominees.length === 1 ? "peer" : "peers"}
          </div>
        </div>
      </div>

      <div className="card pad" style={{ marginBottom: 16 }}>
        <h2 className="t-h3" style={{ marginBottom: 4 }}>
          Nominated reviewers
        </h2>
        <p className="t-body-sm" style={{ marginBottom: 16 }}>
          Minimum {data.minPeers} · maximum {data.maxPeers} for this cycle.
        </p>
        <div className="nom-review-list">
          {data.nominees.map((p) => (
            <div className="nom-review-row" key={p.accountId}>
              <Avatar name={p.name} cls="sm" />
              <div className="nrr-main">
                <span className="nrr-name">{p.name}</span>
                {p.department ? <span className="nrr-rel">{p.department}</span> : null}
              </div>
            </div>
          ))}
        </div>
        {belowFloor ? (
          <div className="notice warn" style={{ marginTop: 14 }}>
            <span className="n-ico">
              <IcoAlert s={18} sw={1.9} />
            </span>
            <span>
              This is below the confidentiality floor of {data.minPeers} peers. You can still approve — if too few
              submit, the review draws on the self-review only.
            </span>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="field-msg" style={{ color: "var(--error)", marginBottom: 12 }}>
          {error}
        </p>
      ) : null}

      {mode === "changes" ? (
        <div className="card pad">
          <div className="field">
            <label className="field-label" htmlFor="nom-note">
              What should they change?
            </label>
            <span className="field-hint">This note goes back to {firstName} so they can adjust and resubmit.</span>
            <textarea
              id="nom-note"
              className={`textarea ${note.trim() ? "is-filled" : ""}`}
              value={note}
              placeholder="e.g. A couple of these names don't look right for this cycle — could you swap them?"
              onChange={(e) => setNote(e.target.value)}
              style={{ minHeight: 100 }}
            />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <button className="btn btn-primary" disabled={!note.trim() || pending} onClick={sendBack}>
              {pending ? <IcoSpinner s={17} /> : null} Send back with note
            </button>
            <button className="btn btn-ghost" onClick={() => setMode("idle")} disabled={pending}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={approve} disabled={pending}>
            {pending ? <IcoSpinner s={17} /> : <IcoCheck s={17} sw={2.2} />} Approve nominations
          </button>
          <button className="btn btn-secondary" onClick={() => setMode("changes")} disabled={pending}>
            <IcoEdit s={16} /> Request changes
          </button>
        </div>
      )}
    </div>
  );
}
