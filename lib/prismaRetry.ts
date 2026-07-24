const TRANSIENT_DB_ERROR =
  /fetch failed|Connect Timeout|504 Gateway|UND_ERR_CONNECT_TIMEOUT|WebSocket is not connected|websocket.*closed|Connection.*closed|ECONNRESET|ETIMEDOUT/i;

export function isTransientDbError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (TRANSIENT_DB_ERROR.test(err.message)) return true;
  const cause = (err as Error & { cause?: unknown }).cause;
  if (cause instanceof Error && TRANSIENT_DB_ERROR.test(cause.message)) {
    return true;
  }
  return false;
}

/**
 * Best-effort wake-up for Prisma Postgres (adapter-ppg) after long external I/O.
 *
 * IMPORTANT: Do NOT call $disconnect() on the shared serverless Prisma client —
 * that drops the process-wide socket and causes "WebSocket is not connected"
 * (or hung requests) on the next query. Prefer a cheap probe query instead;
 * withTransientDbRetry will re-run the real write if the probe fails.
 */
export async function reconnectPrisma(
  client: {
    $disconnect?: () => Promise<void>;
    $connect?: () => Promise<void>;
    $queryRawUnsafe?: (query: string) => Promise<unknown>;
  },
): Promise<void> {
  try {
    if (typeof client.$queryRawUnsafe === "function") {
      await client.$queryRawUnsafe("SELECT 1");
      return;
    }
  } catch {
    /* fall through to $connect */
  }
  try {
    await client.$connect?.();
  } catch {
    /* next query will attempt reconnect */
  }
}

export async function withTransientDbRetry<T>(
  operation: () => Promise<T>,
  options?: {
    attempts?: number;
    delayMs?: number;
    /** Called before retry attempts 2+ (e.g. reconnect Prisma). */
    onRetry?: (attempt: number, err: unknown) => void | Promise<void>;
  },
): Promise<T> {
  const attempts = options?.attempts ?? 3;
  const delayMs = options?.delayMs ?? 1500;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (err: unknown) {
      lastError = err;
      if (!isTransientDbError(err) || attempt === attempts) {
        throw err;
      }
      if (options?.onRetry) {
        await options.onRetry(attempt, err);
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }

  throw lastError;
}
