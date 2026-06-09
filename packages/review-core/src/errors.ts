/**
 * Typed domain errors. Every guard FAILS CLOSED by throwing one of these; they
 * map to HTTP 4xx/409 at the API boundary. The default posture is reject.
 */
export type TransformaErrorCode =
  | "ERR_TENANT_MISMATCH"
  | "ERR_STALE_TRANSITION"
  | "ERR_ILLEGAL_TRANSITION"
  | "ERR_SOD_INELIGIBLE"
  | "ERR_SOD_NOT_VERIFIED"
  | "ERR_REVIEW_LOCKED"
  | "ERR_NOT_REVEALED"
  | "ERR_RATING_REQUIRED"
  | "ERR_RESPONSE_REQUIRED"
  | "ERR_REVEAL_INCOMPLETE"
  | "ERR_LOCK_PATH"
  | "ERR_TOKEN_INVALID"
  | "ERR_GATE_REJECTED"
  | "ERR_REVIEW_NOT_FOUND"
  | "ERR_FORBIDDEN";

export class TransformaError extends Error {
  readonly code: TransformaErrorCode;
  readonly httpStatus: number;
  constructor(code: TransformaErrorCode, message?: string, httpStatus = 409) {
    super(message ? `${code}: ${message}` : code);
    this.name = "TransformaError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function fail(code: TransformaErrorCode, message?: string, httpStatus?: number): never {
  throw new TransformaError(code, message, httpStatus);
}
