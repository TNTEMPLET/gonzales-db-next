"use client";

export type GcScoreboardInitOptions = {
  target: string;
  widgetId: string;
  maxVerticalGamesVisible?: number;
  maxHorizontalGamesVisible?: number;
  layout?: "vertical" | "horizontal";
  refreshDisabled?: boolean;
  options?: Record<string, string>;
};

type GcScoreboardSdk = {
  init: (options: GcScoreboardInitOptions) => void;
  clear: () => void;
};

declare global {
  interface Window {
    GC?: {
      scoreboard?: GcScoreboardSdk;
    };
  }
}

const SDK_SRC = "https://widgets.gc.com/static/js/sdk.v1.js";

let sdkPromise: Promise<GcScoreboardSdk> | null = null;

export function loadGcScoreboardSdk(): Promise<GcScoreboardSdk> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("GameChanger SDK can only load in the browser."));
  }

  if (window.GC?.scoreboard) {
    return Promise.resolve(window.GC.scoreboard);
  }

  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_SRC}"]`);
      const script = existing ?? document.createElement("script");
      if (!existing) {
        script.src = SDK_SRC;
        script.async = true;
        document.body.appendChild(script);
      }

      const finish = () => {
        if (window.GC?.scoreboard) {
          resolve(window.GC.scoreboard);
        } else {
          reject(new Error("GameChanger scoreboard SDK did not initialize."));
        }
      };

      script.addEventListener("load", finish, { once: true });
      script.addEventListener("error", () => reject(new Error("Failed to load GameChanger SDK.")), {
        once: true,
      });

      if (existing && window.GC?.scoreboard) {
        finish();
      }
    });
  }

  return sdkPromise;
}

export function clearGcScoreboardWidget(): void {
  window.GC?.scoreboard?.clear();
}
