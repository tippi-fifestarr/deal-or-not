"use client";

import { CASE_VALUES_CENTS, CASE_VALUES_USD, centsToUsd } from "../../types/game";

interface ValueBoardProps {
  eliminatedValues: Set<number>; // USD cents values that have been revealed
}

export default function ValueBoard({ eliminatedValues }: ValueBoardProps) {
  const half = Math.ceil(CASE_VALUES_CENTS.length / 2);
  const leftColumn = CASE_VALUES_CENTS.slice(0, half);
  const rightColumn = CASE_VALUES_CENTS.slice(half);

  const renderValue = (cents: number) => {
    const eliminated = eliminatedValues.has(cents);
    return (
      <div
        key={cents}
        className={`px-3 py-1.5 rounded text-sm font-mono text-right ${
          eliminated
            ? "bg-gray-700 text-gray-500 line-through opacity-50"
            : cents >= 200
            ? "bg-amber-900/50 text-amber-300 border border-amber-700"
            : "bg-blue-900/50 text-blue-300 border border-blue-700"
        }`}
        data-testid={`value-${cents}`}
        data-eliminated={eliminated ? "true" : "false"}
      >
        {centsToUsd(cents)}
      </div>
    );
  };

  return (
    <div className="flex gap-2" data-testid="value-board">
      <div className="flex flex-col gap-1">{leftColumn.map(renderValue)}</div>
      <div className="flex flex-col gap-1">{rightColumn.map(renderValue)}</div>
    </div>
  );
}
