"use client";

import { formatEther } from "viem";

type BriefcaseInfo = {
  value: bigint;
  opened: boolean;
  revealed: boolean;
};

type BriefcaseGridProps = {
  briefcases: (BriefcaseInfo | undefined)[];
  selectedCase: number | undefined;
  onCaseClick: (index: number) => void;
  disabled: boolean;
  /** When true, user is selecting their briefcase (not opening) */
  isSelectionPhase: boolean;
};

export const BriefcaseGrid = ({
  briefcases,
  selectedCase,
  onCaseClick,
  disabled,
  isSelectionPhase,
}: BriefcaseGridProps) => {
  // Arrange 26 cases in rows: 5, 5, 6, 5, 5
  const rows = [
    Array.from({ length: 5 }, (_, i) => i), // 0-4
    Array.from({ length: 5 }, (_, i) => i + 5), // 5-9
    Array.from({ length: 6 }, (_, i) => i + 10), // 10-15
    Array.from({ length: 5 }, (_, i) => i + 16), // 16-20
    Array.from({ length: 5 }, (_, i) => i + 21), // 21-25
  ];

  return (
    <div className="flex flex-col items-center gap-3">
      {rows.map((row, rowIdx) => (
        <div key={rowIdx} className="flex justify-center gap-2 md:gap-3">
          {row.map(caseIdx => {
            const bc = briefcases[caseIdx];
            const isOpened = bc?.opened ?? false;
            const isRevealed = bc?.revealed ?? false;
            const isSelected = selectedCase === caseIdx;
            const value = bc?.value ?? 0n;

            const canClick = !disabled && !isOpened && (isSelectionPhase || (!isSelectionPhase && !isSelected));

            return (
              <button
                key={caseIdx}
                onClick={() => canClick && onCaseClick(caseIdx)}
                disabled={!canClick}
                className={`
                  relative flex flex-col items-center justify-center
                  w-14 h-16 md:w-18 md:h-20 lg:w-20 lg:h-24
                  rounded-lg border-2 font-bold
                  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary
                  ${
                    isOpened
                      ? "bg-base-300 border-base-300 opacity-40 cursor-default"
                      : isSelected
                        ? "bg-warning/20 border-warning shadow-[0_0_12px_rgba(250,204,21,0.4)] cursor-default"
                        : canClick
                          ? "bg-gradient-to-b from-yellow-600 to-yellow-800 border-yellow-500 hover:border-yellow-300 hover:shadow-lg cursor-pointer"
                          : "bg-gradient-to-b from-yellow-600 to-yellow-800 border-yellow-700 opacity-60 cursor-not-allowed"
                  }
                `}
              >
                {/* Case number */}
                <span
                  className={`text-lg md:text-xl lg:text-2xl ${
                    isOpened ? "text-base-content/30" : isSelected ? "text-warning" : "text-white"
                  }`}
                >
                  {caseIdx + 1}
                </span>

                {/* Revealed value */}
                {isRevealed && isOpened && (
                  <span className="text-[10px] md:text-xs text-base-content/50 truncate max-w-full px-1">
                    {parseFloat(formatEther(value)).toFixed(3)}
                  </span>
                )}

                {/* Selected indicator */}
                {isSelected && !isOpened && (
                  <span className="text-[9px] md:text-[10px] text-warning font-normal">YOURS</span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
};
