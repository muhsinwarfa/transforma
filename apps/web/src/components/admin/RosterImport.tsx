"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IcoAlert, IcoCheck, IcoDoc, IcoSpinner } from "@/components/atoms/icons";
import { importRoster, type ImportResult } from "@/app/(app)/admin/actions";

const SAMPLE = `name,email,role,manager,department
Hodan Abdi,h.abdi@workmail.com,subject,amina.yusuf@workmail.com,Nursing
Deqa Osman,d.osman@workmail.com,peer,amina.yusuf@workmail.com,Nursing`;

export function RosterImport() {
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, start] = useTransition();

  const submit = () => {
    setResult(null);
    start(async () => {
      const r = await importRoster(csv);
      setResult(r);
      if (r.ok) router.refresh();
    });
  };

  return (
    <div className="tf-page">
      <div className="page-header">
        <div className="ph-left">
          <div className="ph-eyebrow">
            <span className="t-label">Administrator</span>
          </div>
          <div className="ph-title">
            <h1>Roster</h1>
          </div>
          <p className="ph-sub">
            Paste the participants for this cycle as CSV. Every row is validated before anything is imported — nothing
            lands until the whole file is clean.
          </p>
        </div>
      </div>

      {result?.ok ? (
        <div className="import-summary ok">
          <span className="is-mark">
            <IcoCheck s={24} sw={2.4} />
          </span>
          <div>
            <div className="is-title">{result.imported} participants imported</div>
            <div className="is-sub">All rows valid · added to the cycle.</div>
          </div>
        </div>
      ) : null}

      {result && !result.ok ? (
        <>
          <div className="import-summary err">
            <span className="is-mark">
              <IcoAlert s={22} sw={2} />
            </span>
            <div>
              <div className="is-title">{result.errors.length} {result.errors.length === 1 ? "row needs" : "rows need"} fixing before import</div>
              <div className="is-sub">Nothing was imported — fix these and re-paste.</div>
            </div>
          </div>
          <div className="err-report" style={{ marginBottom: 18 }}>
            <div className="er-head">
              <IcoAlert s={16} sw={1.9} /> <span className="er-count">{result.errors.length} errors</span>
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
        </>
      ) : null}

      <div className="field">
        <label className="field-label" htmlFor="csv">
          Roster CSV
        </label>
        <span className="field-hint">Columns: name, email, role, manager, department. Role is one of subject / peer / approver / admin.</span>
        <textarea
          id="csv"
          className={`textarea ${csv.trim() ? "is-filled" : ""}`}
          value={csv}
          placeholder={SAMPLE}
          onChange={(e) => setCsv(e.target.value)}
          style={{ minHeight: 180, fontFamily: "var(--font-mono)" }}
        />
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <button className="btn btn-primary" disabled={!csv.trim() || pending} onClick={submit}>
          {pending ? (
            <>
              <IcoSpinner s={17} /> Validating…
            </>
          ) : (
            <>
              <IcoDoc s={16} /> Validate &amp; import
            </>
          )}
        </button>
        <button className="btn btn-ghost" onClick={() => setCsv(SAMPLE)} disabled={pending}>
          Use a sample
        </button>
      </div>
    </div>
  );
}
