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
