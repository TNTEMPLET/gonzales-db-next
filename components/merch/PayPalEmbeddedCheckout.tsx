"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type PayPalConfig = {
  configured: boolean;
  clientId: string | null;
  mode: "live" | "sandbox";
  currency: string;
};

type CaptureResult = {
  ok: boolean;
  draft?: {
    code: string;
    status: string;
    playerName: string;
    amountCents: number;
    productName: string;
  };
  shirtOrderId?: string;
  captureId?: string;
  error?: string;
};

declare global {
  interface Window {
    paypal?: {
      Buttons: (config: Record<string, unknown>) => {
        render: (el: HTMLElement) => Promise<void>;
        close?: () => Promise<void>;
      };
    };
  }
}

const SDK_SCRIPT_ID = "paypal-sdk-merch";

function loadPayPalSdk(clientId: string, currency: string): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.paypal) return Promise.resolve();

  const existing = document.getElementById(SDK_SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      if (window.paypal) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("PayPal SDK failed to load")));
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = SDK_SCRIPT_ID;
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency)}&intent=capture&components=buttons`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("PayPal SDK failed to load"));
    document.body.appendChild(script);
  });
}

/**
 * Embedded PayPal Buttons for a saved merch draft.
 * createOrder / onApprove hit our APIs — parents never paste notes.
 */
export default function PayPalEmbeddedCheckout({
  draftId,
  disabled = false,
  onPaid,
  onError,
}: {
  draftId: string;
  disabled?: boolean;
  onPaid?: (result: CaptureResult) => void;
  onError?: (message: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [config, setConfig] = useState<PayPalConfig | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/merch/paypal/config");
        const data = (await res.json()) as PayPalConfig;
        if (cancelled) return;
        setConfig(data);
        if (!data.configured || !data.clientId) {
          setError("Embedded PayPal is not configured yet (API credentials).");
          setLoading(false);
          return;
        }
        await loadPayPalSdk(data.clientId, data.currency || "USD");
        if (cancelled) return;
        setReady(true);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load PayPal");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const createOrder = useCallback(async () => {
    const res = await fetch("/api/merch/paypal/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draftId }),
    });
    const data = (await res.json()) as { id?: string; error?: string };
    if (!res.ok || !data.id) {
      throw new Error(data.error ?? "Could not start PayPal checkout");
    }
    return data.id;
  }, [draftId]);

  const onApprove = useCallback(
    async (data: { orderID: string }) => {
      setPaying(true);
      setError(null);
      try {
        const res = await fetch("/api/merch/paypal/capture-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderID: data.orderID }),
        });
        const result = (await res.json()) as CaptureResult & { error?: string };
        if (!res.ok || !result.ok) {
          const msg = result.error ?? "Payment capture failed";
          setError(msg);
          onError?.(msg);
          return;
        }
        onPaid?.(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Payment failed";
        setError(msg);
        onError?.(msg);
      } finally {
        setPaying(false);
      }
    },
    [onError, onPaid],
  );

  useEffect(() => {
    if (!ready || !window.paypal || !containerRef.current || disabled) return;

    const el = containerRef.current;
    el.innerHTML = "";

    type ButtonsHandle = {
      render: (target: HTMLElement) => Promise<void>;
      close?: () => Promise<void>;
    };
    let buttons: ButtonsHandle | null = null;
    try {
      buttons = window.paypal.Buttons({
        style: {
          layout: "vertical",
          color: "gold",
          shape: "rect",
          label: "paypal",
          height: 45,
        },
        disabled,
        createOrder: async () => createOrder(),
        onApprove: async (data: { orderID: string }) => onApprove(data),
        onError: (err: Error) => {
          const msg = err?.message || "PayPal error";
          setError(msg);
          onError?.(msg);
        },
        onCancel: () => {
          setPaying(false);
        },
      }) as ButtonsHandle;
      void buttons.render(el).catch((e: Error) => {
        setError(e?.message || "Could not render PayPal buttons");
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "PayPal buttons failed");
    }

    return () => {
      el.innerHTML = "";
      void buttons?.close?.();
    };
  }, [ready, draftId, disabled, createOrder, onApprove, onError]);

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-6 text-center text-sm text-zinc-500">
        Loading PayPal…
      </div>
    );
  }

  if (error && !ready) {
    return (
      <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 px-4 py-3 text-sm text-amber-100">
        <p className="font-medium">Embedded checkout unavailable</p>
        <p className="mt-1 text-xs text-amber-100/80">{error}</p>
        <p className="mt-2 text-xs text-zinc-500">
          Set <code className="text-zinc-400">PAYPAL_CLIENT_ID</code>,{" "}
          <code className="text-zinc-400">PAYPAL_CLIENT_SECRET</code>, and{" "}
          <code className="text-zinc-400">PAYPAL_MODE</code> (and optional{" "}
          <code className="text-zinc-400">NEXT_PUBLIC_PAYPAL_CLIENT_ID</code>) on this deployment.
          Existing NCP links are unchanged.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {config?.mode === "sandbox" ? (
        <p className="text-center text-[11px] font-medium uppercase tracking-wide text-amber-400/90">
          PayPal sandbox mode
        </p>
      ) : null}
      <div
        ref={containerRef}
        className={disabled || paying ? "pointer-events-none opacity-60" : ""}
        aria-busy={paying}
      />
      {paying ? (
        <p className="text-center text-xs text-zinc-400">Completing payment…</p>
      ) : null}
      {error && ready ? (
        <p className="rounded-lg border border-red-800/40 bg-red-950/30 px-3 py-2 text-xs text-red-200">
          {error}
        </p>
      ) : null}
    </div>
  );
}
