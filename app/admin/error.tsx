"use client";

import AppErrorFallback from "@/components/errors/AppErrorFallback";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AppErrorFallback
      error={error}
      reset={reset}
      heading="The admin page hit an unexpected error"
      detail="Your last action did not finish. Try again, or go back and refresh."
    />
  );
}
