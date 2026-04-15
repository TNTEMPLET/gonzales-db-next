// components/RainoutPopup.tsx
"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  rainedOutVenues: string[];
  allParksRainedOut: boolean;
  /** Dev-only: forces the popup open with fake data, overrides real props */
  _preview?: boolean;
};

const PREVIEW_VENUES = ["Diamond Park #1", "Gonzales Main Field"];

export default function RainoutPopup({
  rainedOutVenues: realVenues,
  allParksRainedOut: realAllOut,
  _preview = false,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [userDismissed, setUserDismissed] = useState(false);

  const rainedOutVenues = _preview ? PREVIEW_VENUES : realVenues;
  const allParksRainedOut = _preview ? false : realAllOut;

  // Auto-open whenever there are rainouts and not dismissed
  useEffect(() => {
    if (rainedOutVenues.length > 0 && !userDismissed && dialogRef.current) {
      dialogRef.current.showModal();
    }
  }, [rainedOutVenues, userDismissed]);

  const handleClose = () => {
    dialogRef.current?.close();
    setUserDismissed(true);
  };

  if (rainedOutVenues.length === 0 || userDismissed) return null;

  return (
    <>
      <style>{`
        dialog.rainout-popup {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          margin: 0;
          width: min(90vw, 560px);
          max-height: 90vh;
          overflow-y: auto;
          box-sizing: border-box;
        }
        dialog.rainout-popup::backdrop {
          background: rgba(0, 0, 0, 0.65);
        }
      `}</style>
      <dialog
        ref={dialogRef}
        onClose={handleClose}
        onClick={(e) => {
          if (e.target === dialogRef.current) handleClose();
        }}
        className="rainout-popup rounded-2xl border-0 p-0 shadow-2xl"
      >
        <div className="bg-zinc-900 text-white rounded-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-red-700 px-8 py-5 flex items-center gap-3">
            <span className="text-3xl">⛈️</span>
            <h2 className="text-xl font-bold tracking-wide">
              Rainout Alert – Gonzales Diamond Baseball
            </h2>
          </div>

          {/* Body */}
          <div className="px-8 py-6">
            {allParksRainedOut ? (
              <p className="text-2xl font-extrabold text-red-400 text-center uppercase tracking-widest">
                ALL PARKS ARE RAINED OUT!
              </p>
            ) : (
              <>
                <p className="text-zinc-300 mb-4 font-medium">
                  The following park
                  {rainedOutVenues.length > 1 ? "s are" : " is"} rained out:
                </p>
                <ul className="space-y-2">
                  {rainedOutVenues.map((venue) => (
                    <li
                      key={venue}
                      className="flex items-center gap-2 text-lg font-semibold text-red-400"
                    >
                      <span>🌧️</span>
                      <span>{venue} – Rained Out</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <p className="text-zinc-500 text-sm italic text-center mt-6">
              Check the league Facebook page or contact your coach for more
              details. Stay dry!
            </p>
          </div>

          {/* Footer */}
          <div className="px-8 pb-6 flex justify-center">
            <button
              onClick={handleClose}
              className="px-8 py-3 bg-red-700 hover:bg-red-600 text-white font-semibold rounded-xl transition-colors"
            >
              Got it – Dismiss
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
