export enum GamePhase {
  WaitingForPlayer = 0,
  WaitingForVRF = 1,
  RevealCase = 2,
  OpeningCases = 3,
  BankerOffer = 4,
  FinalSwap = 5,
  GameOver = 6,
}

export interface GameState {
  banker: string;
  player: string;
  phase: GamePhase;
  playerCaseIndex: number;
  currentRound: number;
  casesOpenedThisRound: number;
  openedBitmap: bigint;
  bankerOffer: bigint;
  finalPayout: bigint;
}

export interface OpenedCase {
  index: number;
  value: number;
}

export const CASE_VALUES_USD = [
  0.01, 0.05, 0.10, 0.25, 0.50, 1.00, 2.00, 3.00, 4.00, 5.00, 7.50, 10.00,
];

export const CASE_VALUES_CENTS = [1, 5, 10, 25, 50, 100, 200, 300, 400, 500, 750, 1000];

export const CASES_PER_ROUND = [4, 3, 2, 1, 1];

export function centsToUsd(cents: number | bigint): string {
  const n = Number(cents) / 100;
  if (n < 1) return `$${n.toFixed(2)}`;
  if (n >= 1000) return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
  return `$${n.toFixed(2)}`;
}

export function isCaseOpened(bitmap: bigint, index: number): boolean {
  return (bitmap & (1n << BigInt(index))) !== 0n;
}

export function casesRemainingInRound(round: number, opened: number): number {
  return CASES_PER_ROUND[round] - opened;
}
