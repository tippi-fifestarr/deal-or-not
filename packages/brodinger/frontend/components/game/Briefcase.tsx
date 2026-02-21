"use client";

import { centsToUsd } from "../../types/game";

interface BriefcaseProps {
  index: number;
  isOpened: boolean;
  isPlayerCase: boolean;
  value?: number; // USD cents, only shown when opened
  onClick?: () => void;
  disabled?: boolean;
}

export default function Briefcase({
  index,
  isOpened,
  isPlayerCase,
  value,
  onClick,
  disabled,
}: BriefcaseProps) {
  const baseClasses =
    "w-20 h-20 rounded-lg flex flex-col items-center justify-center text-sm font-bold transition-all duration-300 cursor-pointer select-none";

  if (isOpened) {
    return (
      <div
        className={`${baseClasses} bg-gray-700 text-gray-400 border-2 border-gray-600 opacity-60`}
        data-testid={`case-${index}`}
        data-opened="true"
      >
        <span className="text-xs">{index + 1}</span>
        {value !== undefined && (
          <span className="text-xs text-amber-400">{centsToUsd(value)}</span>
        )}
      </div>
    );
  }

  if (isPlayerCase) {
    return (
      <div
        className={`${baseClasses} bg-amber-600 text-white border-2 border-amber-400 shadow-lg shadow-amber-500/30`}
        data-testid={`case-${index}`}
        data-player-case="true"
      >
        <span className="text-lg">{index + 1}</span>
        <span className="text-[10px] uppercase tracking-wider">Yours</span>
      </div>
    );
  }

  return (
    <button
      className={`${baseClasses} ${
        disabled
          ? "bg-gray-600 text-gray-400 border-2 border-gray-500 cursor-not-allowed"
          : "bg-blue-700 text-white border-2 border-blue-400 hover:bg-blue-600 hover:scale-105 active:scale-95"
      }`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      data-testid={`case-${index}`}
    >
      <span className="text-lg">{index + 1}</span>
    </button>
  );
}
