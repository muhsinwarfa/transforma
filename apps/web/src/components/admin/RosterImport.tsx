"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { Avatar } from "@/components/atoms";
import { IcoAlert, IcoCheck, IcoDownload, IcoSpinner } from "@/components/atoms/icons";
import { IcoCsv, IcoUpload } from "@/components/admin/icons";
import { importRoster, type ImportResult, type RosterRow } from "@/app/(app)/admin/actions";

type State = "idle" | "validating" | "success" | "error";

// A clean sample the dropzone can "simulate" — every row valid.
const SAMPLE_CLEAN = `name,email,role,manager,department
Hodan Abdi,h.abdi@workmail.com,subject,amina.yusuf,Clinical Ops
Maryan Noor,m.noor@workmail.com,subject,l.farah,Nursing
Yusuf Ali,y.ali@workmail.com,subject,amina.yusuf,Clinical Ops`;

// A sample with row-level problems — exercises the all-or-nothing reject path.
const SAMPLE_ERRORS = `name,email,role,manager,department
Deqa Osman,d.osman[at]workmail.com,subject,amina.yusuf,Clinical Ops
Liban Farah,l.farah@workmail.com,reviewer,amina.yusuf,Nursing`;

const TEMPLATE = "name,email,role,manager,department\n";

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
}: {
  cycleName: string;
  roleLabels: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>("idle");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [, start] = useTransition();

  const run = (csv: string) => {
    setState("validating");
    setResult(null);
    start(async () => {
      const r = await importRoster(csv);
      setResult(r);
      setState(r.ok ? "success" : "error");
      if (r.ok) router.refresh();
    });
  };

  const onFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => run(String(reader.result ?? ""));
    reader.readAsText(file);
  };

  const errorReport = (errors: ImportResult["errors"]) =>
    "row,column,value,message\n" + errors.map((e) => `${e.row},${e.col},"${e.value}","${e.msg}"`).join("\n") + "\n";

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
        {state === "success" ? (
          <div className="ph-actions">
            <button className="btn btn-secondary" onClick={() => setState("idle")}>
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
            <p>Or click to browse. Columns: name, email, role, manager, department.</p>
            <span className="dz-formats">roster.csv · max 5 MB</span>
          </button>
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <button className="btn btn-outline sm" onClick={() => run(SAMPLE_CLEAN)}>
              <IcoCsv s={15} /> Simulate a clean file
            </button>
            <button className="btn btn-outline sm" onClick={() => run(SAMPLE_ERRORS)}>
              <IcoAlert s={15} sw={1.9} /> Simulate a file with errors
            </button>
            <button className="btn btn-ghost sm" onClick={() => { download("roster-template.csv", TEMPLATE); toast("Template downloaded."); }}>
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

      {state === "success" && result?.ok ? (
        <>
          <div className="import-summary ok">
            <span className="is-mark">
              <IcoCheck s={24} sw={2.4} />
            </span>
            <div>
              <div className="is-title">{result.imported} participants imported</div>
              <div className="is-sub">roster.csv · all rows valid · ready for {cycleName}</div>
            </div>
          </div>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div className="tf-table-wrap">
              <table className="tf-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Manager</th>
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
                        <span className="role-chip sm">{roleLabels[r.role] || r.role}</span>
                      </td>
                      <td className="cell-muted">{r.manager}</td>
                      <td className="cell-muted">{r.department}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <button
              className="btn btn-primary"
              onClick={() => toast(`${result.imported} participants added to the cycle.`)}
            >
              Confirm &amp; add to cycle
            </button>
          </div>
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
            <button className="btn btn-primary" onClick={() => setState("idle")}>
              <IcoUpload s={16} /> Re-upload corrected file
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => { download("roster-errors.csv", errorReport(result.errors)); toast("Error report downloaded."); }}
            >
              <IcoDownload s={16} /> Download error report
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
