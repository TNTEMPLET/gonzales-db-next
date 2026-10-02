"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#09090b",
          color: "#fafafa",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "24px",
        }}
      >
        <div>
          <h1 style={{ fontSize: "24px", margin: "0 0 12px" }}>Something went wrong</h1>
          <p style={{ margin: 0, color: "#d4d4d8", fontSize: "14px" }}>
            This page hit an unexpected error. You can try again.
          </p>
          {error.digest ? (
            <p style={{ margin: "12px 0 0", color: "#a1a1aa", fontFamily: "ui-monospace, monospace", fontSize: "12px" }}>
              Reference: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: "24px",
              background: "#b91c1c",
              color: "#fff",
              border: 0,
              borderRadius: "8px",
              padding: "8px 16px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
