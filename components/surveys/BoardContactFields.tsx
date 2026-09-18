"use client";

import {
  BOARD_CONTACT_METHODS,
  BOARD_CONTACT_METHOD_LABELS,
  BOARD_CONTACT_TIMES,
  BOARD_CONTACT_TIME_LABELS,
  type BoardContactMethod,
  type BoardContactTime,
} from "@/lib/surveys/boardContact";

type BoardContactFieldsProps = {
  contactName: string;
  contactPhone: string;
  email: string;
  preferredMethod: BoardContactMethod | "";
  bestTime: BoardContactTime | "";
  onName: (value: string) => void;
  onPhone: (value: string) => void;
  onEmail: (value: string) => void;
  onMethod: (value: BoardContactMethod) => void;
  onTime: (value: BoardContactTime) => void;
};

const fieldClass =
  "w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500";

function ChoiceGrid<T extends string>({
  value,
  options,
  labels,
  onChange,
}: {
  value: T | "";
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((option) => {
        const selected = value === option;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`rounded-xl border p-3 text-left text-xs font-semibold transition-all sm:text-sm ${
              selected
                ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                : "border-slate-700/50 bg-slate-800/60 text-slate-300 hover:bg-slate-800"
            }`}
          >
            {labels[option]}
          </button>
        );
      })}
    </div>
  );
}

export default function BoardContactFields({
  contactName,
  contactPhone,
  email,
  preferredMethod,
  bestTime,
  onName,
  onPhone,
  onEmail,
  onMethod,
  onTime,
}: BoardContactFieldsProps) {
  return (
    <div className="space-y-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
      <p className="text-xs text-slate-400">
        Tell the board who to ask for, how to reach you, and when is a good time.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-slate-400">Full name</label>
          <input
            type="text"
            value={contactName}
            onChange={(e) => onName(e.target.value)}
            placeholder="First and last name"
            required
            autoComplete="name"
            className={fieldClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Phone number</label>
          <input
            type="tel"
            value={contactPhone}
            onChange={(e) => onPhone(e.target.value)}
            placeholder="(225) 555-0100"
            required
            autoComplete="tel"
            className={fieldClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => onEmail(e.target.value)}
            placeholder="parent@example.com"
            required
            autoComplete="email"
            className={fieldClass}
          />
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-medium text-slate-400">Preferred contact method</p>
        <ChoiceGrid
          value={preferredMethod}
          options={BOARD_CONTACT_METHODS}
          labels={BOARD_CONTACT_METHOD_LABELS}
          onChange={onMethod}
        />
      </div>
      <div>
        <p className="mb-2 text-xs font-medium text-slate-400">Best time to contact</p>
        <ChoiceGrid
          value={bestTime}
          options={BOARD_CONTACT_TIMES}
          labels={BOARD_CONTACT_TIME_LABELS}
          onChange={onTime}
        />
      </div>
    </div>
  );
}
