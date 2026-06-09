"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { IcoAlert, IcoCheckCircle, IcoClose } from "./atoms/icons";

type ToastKind = "ok" | "warn";
interface Toast {
  id: string;
  msg: string;
  kind: ToastKind;
}
type Push = (msg: string, opts?: { kind?: ToastKind; duration?: number }) => void;

const ToastCtx = createContext<Push>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback<Push>((msg, opts = {}) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg, kind: opts.kind ?? "ok" }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts.duration ?? 3800);
  }, []);
  const dismiss = (id: string) => setToasts((t) => t.filter((x) => x.id !== id));
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span className="t-ico">{t.kind === "warn" ? <IcoAlert s={18} /> : <IcoCheckCircle s={18} />}</span>
            <span>{t.msg}</span>
            <button className="t-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              <IcoClose s={14} sw={2} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
