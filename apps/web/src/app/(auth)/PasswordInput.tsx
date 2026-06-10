"use client";
import { useState } from "react";
import { IcoAlert } from "@/components/atoms/icons";
import { IcoEye } from "./auth-icons";

// Password field with a show/hide affix toggle. Ported from
// docs/design/prototype/auth.jsx → PasswordInput.
export function PasswordInput({
  id,
  name,
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
  hint,
  error,
  onEnter,
}: {
  id: string;
  name?: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  hint?: string;
  error?: string;
  onEnter?: () => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="input-affix">
        <input
          id={id}
          name={name}
          type={show ? "text" : "password"}
          className={`input ${value ? "is-filled" : ""} ${error ? "is-error" : ""}`.replace(/\s+/g, " ").trim()}
          value={value}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && onEnter) onEnter();
          }}
          aria-invalid={!!error}
        />
        <button
          type="button"
          className="affix-btn"
          aria-label={show ? "Hide password" : "Show password"}
          onClick={() => setShow((s) => !s)}
        >
          <IcoEye off={!show} s={18} />
        </button>
      </div>
      {hint && !error ? <span className="field-hint">{hint}</span> : null}
      {error ? (
        <span className="field-msg">
          <IcoAlert s={14} sw={1.9} />
          {error}
        </span>
      ) : null}
    </div>
  );
}
