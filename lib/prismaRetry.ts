const TRANSIENT_DB_ERROR =
  /fetch failed|Connect Timeout|504 Gateway|UND_ERR_CONNECT_TIMEOUT/i;

export function isTransientDbError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (TRANSIENT_DB_ERROR.test(err.message)) return true;
  const cause = (err as Error & { cause?: unknown }).cause;
  if (cause instanceof Error && TRANSIENT_DB_ERROR.test(cause.message)) {
    return true;
  }
  return false;
}

export async function withTransientDbRetry<T>(
  operation: () => Promise<T>,
  options?: { attempts?: number; delayMs?: number },
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
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }

  throw lastError;
}
