"use client";
import { useState, useTransition } from "react";
import { Button, RoleLabel } from "@/components/atoms";
import { IcoCheckCircle, IcoClock, IcoFlag, IcoLock, IcoSpinner } from "@/components/atoms/icons";
import { useToast } from "@/components/Toast";
import { daysLeft, formatLongDate } from "@/lib/subject/format";
import { acknowledgeReview, respondToReview } from "@/app/(app)/review/actions";

type Mode = "choose" | "ack" | "flag";

export function AckPanel({
  reviewId,
  ackWindowEndsAt,
  approverLabel,
}: {
  reviewId: string;
  ackWindowEndsAt: string | null;
  approverLabel: string;
}) {
  const [mode, setMode] = useState<Mode>("choose");
  const [response, setResponse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();

  const deadline = formatLongDate(ackWindowEndsAt);
  const left = daysLeft(ackWindowEndsAt);

  const submit = () => {
    setError(null);
    const isFlag = mode === "flag";
    start(async () => {
      try {
        if (isFlag) await respondToReview(reviewId, response);
        else await acknowledgeReview(reviewId, response);
        toast(
          isFlag ? "Response recorded — your review is locked." : "Acknowledged — your review is locked.",
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  };

  if (mode === "choose") {
    return (
      <div className="ack-panel">
        <div className="ack-head">
          <h3>
            Let your <RoleLabel label={approverLabel} token="approver_label" /> know you&apos;ve seen it
          </h3>
          <p>
            Acknowledging confirms you&apos;ve read your review — <strong>it doesn&apos;t mean you agree with it.</strong>{" "}
            You can add a written response either way; it&apos;s stored alongside your review and never changes it.
          </p>
        </div>
        <div className="ack-actions">
          <Button variant="primary" lg onClick={() => setMode("ack")}>
            <IcoCheckCircle s={18} /> Acknowledge
          </Button>
          <Button variant="outline" lg onClick={() => setMode("flag")}>
            <IcoFlag s={17} /> Flag an error or disagree
          </Button>
        </div>
        <p className="ack-deadline">
          <IcoClock s={14} sw={1.9} />{" "}
          {deadline ? (
            <>
              If you don&apos;t respond by {deadline}
              {left !== null ? ` (${left} ${left === 1 ? "day" : "days"})` : ""}, your review locks automatically.
            </>
          ) : (
            <>If you don&apos;t respond before the window closes, your review locks automatically.</>
          )}
        </p>
      </div>
    );
  }

  const isFlag = mode === "flag";
  return (
    <div className="ack-panel">
      <div className="rv-reassure" style={{ marginBottom: 18 }}>
        <span className="ico">
          <IcoLock s={18} />
        </span>
        <p>
          Once you {isFlag ? "submit this" : "acknowledge"}, your review locks and becomes read-only. Your response is
          kept on record alongside it, permanently.
        </p>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="ack-response">
          {isFlag ? "Your response" : "Add a response"}{" "}
          {isFlag ? (
            <span className="req">*</span>
          ) : (
            <span className="field-hint" style={{ fontWeight: 400 }}>
              (optional)
            </span>
          )}
        </label>
        {isFlag ? (
          <span className="field-hint">What&apos;s inaccurate, or where do you disagree? Be specific.</span>
        ) : null}
        <textarea
          id="ack-response"
          className={`textarea ${response.trim() ? "is-filled" : ""}`}
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder={isFlag ? "Share what you'd like on record…" : "Anything you'd like noted alongside your review…"}
          style={{ minHeight: 130 }}
        />
      </div>
      {error ? <p className="field-msg" style={{ color: "var(--error)" }}>{error}</p> : null}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
        <Button variant="primary" lg onClick={submit} disabled={pending || (isFlag && !response.trim())}>
          {pending ? (
            <>
              <IcoSpinner s={18} /> Saving…
            </>
          ) : isFlag ? (
            "Submit & lock"
          ) : (
            "Acknowledge & lock"
          )}
        </Button>
        <Button variant="ghost" lg onClick={() => setMode("choose")} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
