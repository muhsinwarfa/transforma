"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { Avatar } from "@/components/atoms";
import { IcoAlert, IcoCheck, IcoDownload, IcoSpinner } from "@/components/atoms/icons";
import { IcoUpload } from "@/components/admin/icons";
import { RosterMembers } from "@/components/admin/RosterMembers";
import { importRoster, validateRoster, type ImportResult, type RosterMemberRow, type RosterRow } from "@/app/(app)/admin/actions";

// A3 · two-phase roster import. The dropzone runs a READ-ONLY validate pass
// (validateRoster → preview); nothing is written until the admin clicks
// "Confirm & add to cycle", which runs the committing importRoster (insert + audit).
type State = "idle" | "validating" | "preview" | "confirmed" | "error";

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function RosterImport({
  cycleName,
  roleLabels,
  members,
}: {
  cycleName: string;
  roleLabels: Record<string, string>;
  members: RosterMemberRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>("idle");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [csv, setCsv] = useState("");
  const [pending, start] = useTransition();

  // CSV template — clearly-fake sample rows that DEMONSTRATE the model: manager_email
  // IS the org chart, there is no role column. Two ICs report to Maya; Maya reports to
  // a director; the director is top-level (blank manager_email) so isn't reviewed.
  const template =
    "name,email,manager_email,department\n" +
    `Sam Rivera,sam.rivera@example.com,maya.chen@example.com,Clinical Operations\n` +
    `Jordan Lee,jordan.lee@example.com,maya.chen@example.com,Clinical Operations\n` +
    `Maya Chen,maya.chen@example.com,avery.diaz@example.com,Clinical Operations\n` +
    `Avery Diaz,avery.diaz@example.com,,Clinical Operations\n`;

  // Phase 1 — read-only validation. Writes nothing; renders the preview or errors.
  const validate = (csvText: string) => {
    setCsv(csvText);
    setResult(null);
    setState("validating");
    start(async () => {
      const r = await validateRoster(csvText);
      setResult(r);
      setState(r.ok ? "preview" : "error");
    });
  };

  // Phase 2 — the commit. The existing importRoster performs the insert + audit.
  const commit = () => {
    start(async () => {
      try {
        const r = await importRoster(csv);
        setResult(r);
        if (r.ok) {
          setState("confirmed");
          toast(`${r.imported} people imported to ${cycleName}.`);
          router.refresh();
        } else {
          setState("error");
        }
      } catch (e) {
        toast(e instanceof Error ? e.message : "Couldn't add the roster to the cycle.", { kind: "warn" });
      }
    });
  };

  const onFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => validate(String(reader.result ?? ""));
    reader.readAsText(file);
  };

  const reset = () => {
    setState("idle");
    setResult(null);
    setCsv("");
  };

  const copyLink = (link: string) => {
    void navigator.clipboard?.writeText(link).then(
      () => toast("Set-up link copied — paste it wherever you reach this person."),
      () => toast("Couldn't copy automatically — select the link and copy it.", { kind: "warn" }),
    );
  };

  const errorReport = (errors: ImportResult["errors"]) =>
    "row,column,value,message\n" + errors.map((e) => `${e.row},${e.col},"${e.value}","${e.msg}"`).join("\n") + "\n";

  const showUploadAnother = state === "preview" || state === "confirmed";

  return (
    <div className="tf-page">
      <div className="page-header">
        <div className="ph-left">
          <div className="ph-eyebrow">
            <span className="t-label">{roleLabels.admin}</span>
          </div>
          <div className="ph-title">
            <h1>Roster</h1>
          </div>
          <p className="ph-sub">
            Upload the participants for {cycleName} as a CSV. We&apos;ll validate every row before anything is imported.
          </p>
        </div>
        {showUploadAnother ? (
          <div className="ph-actions">
            <button className="btn btn-secondary" onClick={reset}>
              Upload another
            </button>
          </div>
        ) : null}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: "none" }}
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />

      {state === "idle" ? (
        <>
          <button className="dropzone" onClick={() => fileRef.current?.click()} style={{ width: "100%", cursor: "pointer" }}>
            <span className="dz-ico">
              <IcoUpload s={26} />
            </span>
            <h3>Drop your roster CSV here</h3>
            <p>
              Or click to browse. Columns: name, email, manager_email, department. We build the org chart from
              manager_email — everyone with a manager is reviewed, and anyone listed as a manager_email also approves.
              People with no manager_email take part but aren&apos;t reviewed this cycle. (A role or title column, if
              present, is ignored.)
            </p>
            <span className="dz-formats">roster.csv · max 5 MB</span>
          </button>
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <button
              className="btn btn-ghost sm"
              onClick={() => {
                download("roster-template.csv", template);
                toast("Template downloaded.");
              }}
            >
              <IcoDownload s={15} /> Download CSV template
            </button>
          </div>
        </>
      ) : null}

      {state === "validating" ? (
        <div className="validating">
          <IcoSpinner s={24} />
          <div className="v-body">
            <div className="v-title">Validating roster.csv…</div>
            <div className="v-bar">
              <div className="v-fill" />
            </div>
          </div>
        </div>
      ) : null}

      {(state === "preview" || state === "confirmed") && result?.ok ? (
        <>
          <div className="import-summary ok">
            <span className="is-mark">
              <IcoCheck s={24} sw={2.4} />
            </span>
            <div>
              {state === "confirmed" ? (
                <>
                  <div className="is-title">
                    {result.imported} people imported to {cycleName}
                  </div>
                  <div className="is-sub">roster.csv · added to the cycle</div>
                </>
              ) : (
                <>
                  <div className="is-title">{result.rows.length} people ready to add</div>
                  <div className="is-sub">
                    roster.csv · {result.rows.filter((r) => r.reviewed).length} of {result.rows.length} reviewed this
                    cycle · review and confirm below
                  </div>
                </>
              )}
            </div>
          </div>
          {result.info?.map((note, i) => (
            <div className="notice info" key={i} style={{ marginTop: 12 }}>
              <span className="n-ico">
                <IcoCheck s={18} />
              </span>
              <span>{note}</span>
            </div>
          ))}
          <div className="card" style={{ padding: 0, overflow: "hidden", marginTop: 12 }}>
            <div className="tf-table-wrap">
              <table className="tf-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>In this cycle</th>
                    <th>Manager email</th>
                    <th>Department</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r: RosterRow) => (
                    <tr key={r.email}>
                      <td>
                        <div className="row-person">
                          <Avatar name={r.name} cls="sm" />
                          <span className="cell-strong">{r.name}</span>
                        </div>
                      </td>
                      <td className="cell-muted">{r.email}</td>
                      <td>
                        {r.roles.length > 0 ? (
                          r.roles.map((role) => (
                            <span key={role} className="role-chip sm" style={{ marginRight: 4 }}>
                              {roleLabels[role] || role}
                            </span>
                          ))
                        ) : (
                          <span className="cell-muted">Participant</span>
                        )}
                        {!r.reviewed ? (
                          <span className="cell-muted" style={{ display: "block", fontSize: 12 }}>
                            not reviewed this cycle
                          </span>
                        ) : null}
                      </td>
                      <td className="cell-muted">{r.manager || "—"}</td>
                      <td className="cell-muted">{r.department}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {state === "preview" ? (
            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              <button className="btn btn-primary" onClick={commit} disabled={pending}>
                {pending ? (
                  <>
                    <IcoSpinner s={16} /> Adding…
                  </>
                ) : (
                  "Confirm & add to cycle"
                )}
              </button>
            </div>
          ) : (
            <>
              {result.invites && result.invites.length > 0 ? (
                <div className="card pad" style={{ marginTop: 16 }}>
                  <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>Send everyone their set-up link</h3>
                  <p className="t-body-sm" style={{ color: "var(--ink-3)", margin: "0 0 12px" }}>
                    Each person was emailed a link to set their password (best-effort). To be sure they get in, copy
                    their link below and share it through your own channel. Links are valid for 24 hours — you can
                    resend later from the roster.
                  </p>
                  <div style={{ display: "grid", gap: 8 }}>
                    {result.invites.map((inv) => (
                      <div
                        key={inv.email}
                        style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between", flexWrap: "wrap", borderTop: "1px solid var(--hairline)", paddingTop: 8 }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div className="cell-strong">{inv.name}</div>
                          <div className="cell-muted" style={{ fontSize: 13 }}>
                            {inv.email} · {inv.emailed ? "emailed ✓" : "email not sent — share the link"}
                          </div>
                        </div>
                        {inv.link ? (
                          <button className="btn btn-secondary sm" onClick={() => copyLink(inv.link as string)}>
                            <IcoDownload s={14} /> Copy set-up link
                          </button>
                        ) : (
                          <span className="cell-muted" style={{ fontSize: 13 }}>
                            {inv.error ?? "Link unavailable — use Resend on the roster"}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="notice info" style={{ marginTop: 16 }}>
                <span className="n-ico">
                  <IcoCheck s={18} />
                </span>
                <span>Added to {cycleName}. Upload another file or head back to the cycle.</span>
              </div>
            </>
          )}
        </>
      ) : null}

      {state === "error" && result && !result.ok ? (
        <>
          <div className="import-summary err">
            <span className="is-mark">
              <IcoAlert s={22} sw={2} />
            </span>
            <div>
              <div className="is-title">
                {result.errors.length} {result.errors.length === 1 ? "row needs" : "rows need"} fixing before import
              </div>
              <div className="is-sub">Nothing was imported yet — fix these rows and re-upload.</div>
            </div>
          </div>
          <div className="err-report">
            <div className="er-head">
              <IcoAlert s={16} sw={1.9} /> <span className="er-count">{result.errors.length} errors</span> — fix these rows
              in your file and re-upload
            </div>
            {result.errors.map((e, i) => (
              <div className="err-row" key={i}>
                <span className="er-rownum">Row {e.row}</span>
                <span className="er-col">{e.col}</span>
                <span className="er-detail">
                  <div className="er-msg">{e.msg}</div>
                  <div className="er-value">{e.value}</div>
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={reset}>
              <IcoUpload s={16} /> Re-upload corrected file
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                download("roster-errors.csv", errorReport(result.errors));
                toast("Error report downloaded.");
              }}
            >
              <IcoDownload s={16} /> Download error report
            </button>
          </div>
        </>
      ) : null}

      <RosterMembers members={members} roleLabels={roleLabels} />
    </div>
  );
}
