"use client";

import Briefcase from "./Briefcase";
import { isCaseOpened } from "../../types/game";

interface BriefcaseGridProps {
  openedBitmap: bigint;
  playerCaseIndex: number;
  caseValues: Map<number, number>; // index -> USD cents value (only for opened cases)
  onCaseClick: (index: number) => void;
  disabled: boolean;
  selectMode?: boolean; // When selecting initial case
}

export default function BriefcaseGrid({
  openedBitmap,
  playerCaseIndex,
  caseValues,
  onCaseClick,
  disabled,
  selectMode,
}: BriefcaseGridProps) {
  const cases = Array.from({ length: 12 }, (_, i) => i);

  return (
    <div className="grid grid-cols-4 gap-3" data-testid="briefcase-grid">
      {cases.map((i) => (
        <Briefcase
          key={i}
          index={i}
          isOpened={isCaseOpened(openedBitmap, i)}
          isPlayerCase={!selectMode && i === playerCaseIndex}
          value={caseValues.get(i)}
          onClick={() => onCaseClick(i)}
          disabled={disabled && !(selectMode)}
        />
      ))}
    </div>
  );
}
