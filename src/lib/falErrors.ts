/**
 * Map a simulation failure to a message a clinician can act on.
 *
 * `formatFalError` output is aimed at logs — it can be long and carries raw field
 * paths — so the operator-facing copy is derived from the HTTP status instead, with
 * the detailed form left to the console.
 */
export function describeSimulationFailure(err: unknown): string {
  const status = extractStatus(err);
  const detail = formatFalError(err).toLowerCase();

  if (status === 413 || detail.includes("payload_too_large") || detail.includes("too large")) {
    return "That photo is too large to process. Please upload a smaller image.";
  }

  if (status === 403 && detail.includes("balance")) {
    return "The AI service account is out of credits. Top up the fal.ai balance to continue.";
  }

  if (status === 401 || status === 403) {
    return "The AI service rejected this request — check the fal.ai credentials.";
  }

  if (status === 422) {
    return "The AI service rejected the image or mask. Please re-upload the photo and try again.";
  }

  if (status === 429) {
    return "The AI service is rate limiting requests. Please wait a moment and try again.";
  }

  if (typeof status === "number" && status >= 500) {
    return "The AI service is temporarily unavailable. Please try again in a moment.";
  }

  return "Simulation failed — please try again. Check console for details.";
}

function extractStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const anyErr = err as {
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown };
  };
  const candidate = anyErr.status ?? anyErr.statusCode ?? anyErr.response?.status;
  if (typeof candidate === "number") return candidate;
  if (typeof candidate === "string" && candidate.trim()) {
    const parsed = Number(candidate);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/**
 * Extract a human-readable message from fal ApiError / ValidationError / unknown.
 * Fal often returns empty `message` with details only in `body.detail`.
 */
export function formatFalError(err: unknown): string {
  if (err == null) {
    return "Unknown simulation error (empty failure payload).";
  }

  if (typeof err === "string" && err.trim()) {
    return err;
  }

  if (err instanceof Error) {
    const anyErr = err as Error & {
      status?: number;
      body?: unknown;
      fieldErrors?: Array<{ loc?: unknown[]; msg?: string }>;
      requestId?: string;
    };

    const parts: string[] = [];

    if (anyErr.message?.trim()) {
      parts.push(anyErr.message.trim());
    }

    if (typeof anyErr.status === "number") {
      parts.push(`HTTP ${anyErr.status}`);
    }

    const fieldErrors = anyErr.fieldErrors;
    if (Array.isArray(fieldErrors) && fieldErrors.length > 0) {
      parts.push(
        fieldErrors
          .map((item) => {
            const loc = Array.isArray(item.loc) ? item.loc.join(".") : "field";
            return `${loc}: ${item.msg || "invalid"}`;
          })
          .join("; "),
      );
    }

    const body = anyErr.body;
    if (typeof body === "string" && body.trim()) {
      parts.push(body.trim());
    } else if (body && typeof body === "object") {
      const detail = (body as { detail?: unknown; message?: unknown }).detail;
      const message = (body as { message?: unknown }).message;

      if (typeof message === "string" && message.trim()) {
        parts.push(message.trim());
      }

      if (typeof detail === "string" && detail.trim()) {
        parts.push(detail.trim());
      } else if (Array.isArray(detail)) {
        parts.push(
          detail
            .map((item) => {
              if (typeof item === "string") return item;
              if (item && typeof item === "object") {
                const row = item as { loc?: unknown[]; msg?: string; type?: string };
                const loc = Array.isArray(row.loc) ? row.loc.join(".") : "field";
                return `${loc}: ${row.msg || row.type || "invalid"}`;
              }
              return JSON.stringify(item);
            })
            .join("; "),
        );
      } else if (parts.length === 0) {
        try {
          parts.push(JSON.stringify(body));
        } catch {
          // ignore
        }
      }
    }

    if (anyErr.requestId) {
      parts.push(`request_id=${anyErr.requestId}`);
    }

    if (parts.length > 0) {
      // Deduplicate while preserving order
      return [...new Set(parts)].join(" — ");
    }

    return err.name || "Simulation failed with an empty error message.";
  }

  if (typeof err === "object") {
    try {
      return JSON.stringify(err);
    } catch {
      return "Simulation failed with an unreadable error object.";
    }
  }

  return String(err);
}
