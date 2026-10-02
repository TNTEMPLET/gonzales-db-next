"use client";

export default function AppErrorFallback({
  error,
  reset,
  heading = "Something went wrong",
  detail = "This page hit an unexpected error. You can try again.",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  heading?: string;
  detail?: string;
}) {
  return (
    <div className="mx-auto flex min-h-[40vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="text-2xl font-bold text-white">{heading}</h1>
      <p className="mt-3 text-sm text-zinc-300">{detail}</p>
      {error.digest ? (
        <p className="mt-3 font-mono text-xs text-zinc-400">Reference: {error.digest}</p>
      ) : null}
      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600"
      >
        Try again
      </button>
    </div>
  );
}
