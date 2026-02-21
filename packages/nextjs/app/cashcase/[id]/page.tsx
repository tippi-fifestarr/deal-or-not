"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { encodeAbiParameters, keccak256, parseAbiParameters } from "viem";
import { useAccount } from "wagmi";
import {
  CASES_PER_ROUND,
  CashCasePhase,
  NUM_CASES,
  PHASE_LABELS,
  TIER_LABELS,
  TIER_VALUES,
  WAIT_VIDEOS,
} from "~~/contracts/CashCaseAbi";
import { useCashCaseRead, useCashCaseWrite } from "~~/hooks/useCashCaseContract";

// ─── Commit Hash Helpers ────────────────────────────────────────────────────

function computeRoundCommitHash(caseIndices: number[], salt: bigint): bigint {
  const encoded = encodeAbiParameters(parseAbiParameters("uint8[], uint256"), [caseIndices, salt]);
  return BigInt(keccak256(encoded));
}

function computeFinalCommitHash(swap: boolean, salt: bigint): bigint {
  const encoded = encodeAbiParameters(parseAbiParameters("bool, uint256"), [swap, salt]);
  return BigInt(keccak256(encoded));
}

function randomSalt(): bigint {
  return BigInt(Math.floor(Math.random() * 2 ** 48));
}

// ─── Video Interstitial ─────────────────────────────────────────────────────

function VideoWait({ message }: { message: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [clip] = useState(() => WAIT_VIDEOS[Math.floor(Math.random() * WAIT_VIDEOS.length)]);

  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <div className="relative rounded-xl overflow-hidden shadow-2xl max-w-md w-full">
        <video ref={videoRef} src={clip} autoPlay loop muted playsInline className="w-full" />
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
          <p className="text-white text-center font-bold animate-pulse">{message}</p>
        </div>
      </div>
      <span className="loading loading-dots loading-lg text-secondary"></span>
    </div>
  );
}

// ─── Briefcase Grid (12 cases) ──────────────────────────────────────────────

function BriefcaseGrid({
  openedBitmap,
  playerCaseIndex,
  selectedCases,
  onToggle,
  gameId,
  interactive,
}: {
  openedBitmap: bigint;
  playerCaseIndex: number;
  selectedCases: Set<number>;
  onToggle: (idx: number) => void;
  gameId: bigint;
  interactive: boolean;
}) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {Array.from({ length: NUM_CASES }, (_, i) => {
        const isOpened = (openedBitmap & (1n << BigInt(i))) !== 0n;
        const isPlayerCase = i === playerCaseIndex;
        const isSelected = selectedCases.has(i);
        const canClick = interactive && !isOpened && !isPlayerCase;

        return (
          <button
            key={i}
            className={`btn btn-lg h-20 text-lg font-bold transition-all ${
              isPlayerCase
                ? "btn-accent border-2 border-accent"
                : isOpened
                  ? "btn-ghost opacity-30 line-through"
                  : isSelected
                    ? "btn-warning ring-2 ring-warning animate-pulse"
                    : canClick
                      ? "btn-outline hover:btn-secondary"
                      : "btn-outline opacity-60"
            }`}
            onClick={() => canClick && onToggle(i)}
            disabled={!canClick}
          >
            {isPlayerCase ? "🐱" : isOpened ? <CaseValue gameId={gameId} caseIndex={i} /> : `#${i}`}
          </button>
        );
      })}
    </div>
  );
}

function CaseValue({ gameId, caseIndex }: { gameId: bigint; caseIndex: number }) {
  const { data } = useCashCaseRead({
    functionName: "getCaseValue",
    args: [gameId, caseIndex],
    watch: false,
  });
  if (!data) return "?";
  const cents = Number(data as unknown as bigint);
  return `$${(cents / 100).toFixed(2)}`;
}

// ─── Remaining Values Board ─────────────────────────────────────────────────

function RemainingValues({ gameId, tier }: { gameId: bigint; tier: number }) {
  const { data } = useCashCaseRead({
    functionName: "getRemainingValues",
    args: [gameId],
  });

  const allValues = TIER_VALUES[tier] || TIER_VALUES[1];
  const remaining = data ? (data as unknown as bigint[]).map(v => Number(v)) : allValues;
  const remainingSet = new Set(remaining);

  return (
    <div className="card bg-base-200 border border-base-300">
      <div className="card-body p-4">
        <h3 className="font-bold text-sm">Remaining Values</h3>
        <div className="grid grid-cols-2 gap-1 mt-2">
          {allValues.map((v, i) => (
            <div
              key={i}
              className={`text-xs px-2 py-1 rounded ${
                remainingSet.has(v) ? "bg-success/20 font-bold" : "bg-base-300 opacity-30 line-through"
              }`}
            >
              ${(v / 100).toFixed(2)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Game Page ─────────────────────────────────────────────────────────

export default function CashCaseGame() {
  const params = useParams();
  const gameId = BigInt(params.id as string);
  const { address } = useAccount();
  const { writeAsync, isPending } = useCashCaseWrite();

  // ── Read game state ──
  const { data: gameState } = useCashCaseRead({
    functionName: "getGameState",
    args: [gameId],
  });

  useCashCaseRead({
    functionName: "getCommitState",
    args: [gameId],
  });

  // ── Parse state ──
  const [banker, player, phase, tier, playerCaseIndex, currentRound, bankerOffer, , openedBitmap] =
    (gameState as unknown as [string, string, number, number, number, number, bigint, number, bigint, number]) || [
      "0x0",
      "0x0",
      0,
      1,
      0,
      0,
      0n,
      0,
      0n,
      0,
    ];

  const phaseNum = Number(phase);
  const tierNum = Number(tier);
  const roundNum = Number(currentRound);
  const isPlayer = address?.toLowerCase() === (player as string)?.toLowerCase();

  // ── Local state ──
  const [selectedCases, setSelectedCases] = useState<Set<number>>(new Set());
  const [wantSwap, setWantSwap] = useState(false);
  const [autoRevealing, setAutoRevealing] = useState(false);

  // How many cases needed this round
  const casesNeeded = phaseNum === CashCasePhase.CommitRound ? CASES_PER_ROUND[roundNum] || 1 : 0;

  const toggleCase = useCallback(
    (idx: number) => {
      setSelectedCases(prev => {
        const next = new Set(prev);
        if (next.has(idx)) {
          next.delete(idx);
        } else if (next.size < casesNeeded) {
          next.add(idx);
        }
        return next;
      });
    },
    [casesNeeded],
  );

  // ── Saved initial case info ──
  const savedSalt = typeof window !== "undefined" ? localStorage.getItem(`cashcase-${gameId}-salt`) : null;
  const savedCase = typeof window !== "undefined" ? localStorage.getItem(`cashcase-${gameId}-case`) : null;

  // ── Auto-reveal after commit (wait for next block) ──
  useEffect(() => {
    if (
      (phaseNum === CashCasePhase.WaitingForReveal || phaseNum === CashCasePhase.WaitingForFinalReveal) &&
      isPlayer &&
      !autoRevealing
    ) {
      setAutoRevealing(true);
      const timer = setTimeout(async () => {
        try {
          if (phaseNum === CashCasePhase.WaitingForReveal) {
            // Retrieve the round's selected cases from local storage
            const storedCases = localStorage.getItem(`cashcase-${gameId}-round-${roundNum}-cases`);
            const storedSalt = localStorage.getItem(`cashcase-${gameId}-round-${roundNum}-salt`);
            if (storedCases && storedSalt) {
              const indices = JSON.parse(storedCases) as number[];
              await writeAsync({
                functionName: "revealRound",
                args: [gameId, indices, BigInt(storedSalt)],
              });
            }
          } else if (phaseNum === CashCasePhase.WaitingForFinalReveal) {
            const storedSwap = localStorage.getItem(`cashcase-${gameId}-final-swap`);
            const storedSalt = localStorage.getItem(`cashcase-${gameId}-final-salt`);
            if (storedSwap !== null && storedSalt) {
              await writeAsync({
                functionName: "revealFinalDecision",
                args: [gameId, storedSwap === "true", BigInt(storedSalt)],
              });
            }
          }
        } catch (e: any) {
          console.error("Auto-reveal failed:", e.message);
        } finally {
          setAutoRevealing(false);
        }
      }, 8000); // Wait ~8s for next block on Base Sepolia
      return () => clearTimeout(timer);
    }
  }, [phaseNum, isPlayer, autoRevealing, gameId, roundNum, writeAsync]);

  // ── Action Handlers ──

  const handleRevealCase = async () => {
    if (!savedCase || !savedSalt) return;
    try {
      await writeAsync({
        functionName: "revealCase",
        args: [gameId, Number(savedCase), BigInt(savedSalt)],
      });
    } catch (e: any) {
      console.error("Reveal case failed:", e.message);
    }
  };

  const handleCommitRound = async () => {
    if (selectedCases.size !== casesNeeded) return;
    const indices = Array.from(selectedCases).sort();
    const salt = randomSalt();

    // Save for auto-reveal
    localStorage.setItem(`cashcase-${gameId}-round-${roundNum}-cases`, JSON.stringify(indices));
    localStorage.setItem(`cashcase-${gameId}-round-${roundNum}-salt`, salt.toString());

    const commitHash = computeRoundCommitHash(indices, salt);
    try {
      await writeAsync({
        functionName: "commitRound",
        args: [gameId, commitHash],
      });
      setSelectedCases(new Set());
    } catch (e: any) {
      console.error("Commit round failed:", e.message);
    }
  };

  const handleAcceptDeal = async () => {
    try {
      await writeAsync({ functionName: "acceptDeal", args: [gameId] });
    } catch (e: any) {
      console.error("Accept deal failed:", e.message);
    }
  };

  const handleRejectDeal = async () => {
    try {
      await writeAsync({ functionName: "rejectDeal", args: [gameId] });
    } catch (e: any) {
      console.error("Reject deal failed:", e.message);
    }
  };

  const handleCommitFinal = async () => {
    const salt = randomSalt();
    localStorage.setItem(`cashcase-${gameId}-final-swap`, wantSwap.toString());
    localStorage.setItem(`cashcase-${gameId}-final-salt`, salt.toString());

    const commitHash = computeFinalCommitHash(wantSwap, salt);
    try {
      await writeAsync({
        functionName: "commitFinalDecision",
        args: [gameId, commitHash],
      });
    } catch (e: any) {
      console.error("Commit final failed:", e.message);
    }
  };

  // ── Render ──

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-black">🐱 Game #{gameId.toString()}</h1>
          <div className="flex gap-2 mt-1">
            <span className="badge badge-secondary">{TIER_LABELS[tierNum]}</span>
            <span className="badge badge-outline">Round {roundNum + 1}/5</span>
            <span className="badge badge-info">{PHASE_LABELS[phaseNum]}</span>
          </div>
        </div>
        <div className="text-right text-sm opacity-60">
          <p>
            Banker: {(banker as string)?.slice(0, 6)}...{(banker as string)?.slice(-4)}
          </p>
          <p>
            Player:{" "}
            {player === "0x0000000000000000000000000000000000000000"
              ? "—"
              : `${(player as string)?.slice(0, 6)}...${(player as string)?.slice(-4)}`}
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Left: Remaining Values */}
        <div>
          <RemainingValues gameId={gameId} tier={tierNum} />
        </div>

        {/* Center: Briefcases + Actions */}
        <div className="md:col-span-2 space-y-6">
          {/* Briefcase Grid */}
          <BriefcaseGrid
            openedBitmap={(openedBitmap as bigint) || 0n}
            playerCaseIndex={Number(playerCaseIndex)}
            selectedCases={selectedCases}
            onToggle={toggleCase}
            gameId={gameId}
            interactive={phaseNum === CashCasePhase.CommitRound && isPlayer}
          />

          {/* Phase-specific UI */}
          {phaseNum === CashCasePhase.WaitingForPlayer && (
            <div className="alert alert-info">
              <span>Waiting for a player to join this game...</span>
            </div>
          )}

          {phaseNum === CashCasePhase.WaitingForVRF && (
            <div className="alert alert-warning">
              <span className="loading loading-spinner loading-sm"></span>
              <span>Waiting for Chainlink VRF to deliver the seed...</span>
            </div>
          )}

          {phaseNum === CashCasePhase.RevealCase && isPlayer && (
            <div className="card bg-primary/10 border border-primary/30">
              <div className="card-body">
                <h3 className="font-bold">Reveal Your Case</h3>
                <p className="text-sm opacity-70">
                  Confirm which case you picked (#{savedCase}). This proves you committed before VRF.
                </p>
                <button className="btn btn-primary mt-2" onClick={handleRevealCase} disabled={isPending || !savedSalt}>
                  {isPending ? "Revealing..." : "Reveal Case"}
                </button>
              </div>
            </div>
          )}

          {phaseNum === CashCasePhase.CommitRound && isPlayer && (
            <div className="card bg-secondary/10 border border-secondary/30">
              <div className="card-body">
                <h3 className="font-bold">
                  Select {casesNeeded} case{casesNeeded > 1 ? "s" : ""} to open
                </h3>
                <p className="text-sm opacity-70">
                  Click the briefcases above, then commit. Values collapse on reveal.
                </p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-sm">
                    Selected: {selectedCases.size}/{casesNeeded}
                  </span>
                  <button
                    className="btn btn-secondary"
                    onClick={handleCommitRound}
                    disabled={isPending || selectedCases.size !== casesNeeded}
                  >
                    {isPending ? "Committing..." : "Commit & Open"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {phaseNum === CashCasePhase.WaitingForReveal && (
            <VideoWait message="Brödinger's Collapse — values materializing..." />
          )}

          {phaseNum === CashCasePhase.BankerOffer && (
            <div className="card bg-warning/10 border border-warning/30">
              <div className="card-body text-center">
                <h3 className="text-2xl font-black">Banker&apos;s Offer</h3>
                <p className="text-5xl font-black text-warning my-4">${(Number(bankerOffer) / 100).toFixed(2)}</p>
                {isPlayer && (
                  <div className="flex gap-4 justify-center">
                    <button
                      className="btn btn-success btn-lg text-xl px-8"
                      onClick={handleAcceptDeal}
                      disabled={isPending}
                    >
                      DEAL
                    </button>
                    <button
                      className="btn btn-error btn-lg text-xl px-8"
                      onClick={handleRejectDeal}
                      disabled={isPending}
                    >
                      NO DEAL
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {phaseNum === CashCasePhase.CommitFinal && isPlayer && (
            <div className="card bg-accent/10 border border-accent/30">
              <div className="card-body text-center">
                <h3 className="text-2xl font-black">Final Decision</h3>
                <p className="opacity-70">Keep your case or swap with the last remaining case?</p>
                <div className="flex gap-4 justify-center mt-4">
                  <button
                    className={`btn btn-lg ${!wantSwap ? "btn-primary" : "btn-outline"}`}
                    onClick={() => setWantSwap(false)}
                  >
                    Keep My Case
                  </button>
                  <button
                    className={`btn btn-lg ${wantSwap ? "btn-secondary" : "btn-outline"}`}
                    onClick={() => setWantSwap(true)}
                  >
                    Swap Cases
                  </button>
                </div>
                <button className="btn btn-accent btn-lg mt-4" onClick={handleCommitFinal} disabled={isPending}>
                  {isPending ? "Committing..." : "Lock In Decision"}
                </button>
              </div>
            </div>
          )}

          {phaseNum === CashCasePhase.WaitingForFinalReveal && <VideoWait message="Revealing your fate..." />}

          {phaseNum === CashCasePhase.GameOver && <GameOverPanel gameId={gameId} />}
        </div>
      </div>
    </div>
  );
}

// ─── Game Over Panel ────────────────────────────────────────────────────────

function GameOverPanel({ gameId }: { gameId: bigint }) {
  const { data } = useCashCaseRead({
    functionName: "getBettingOutcome",
    args: [gameId],
    watch: false,
  });

  if (!data) return <div className="alert">Game Over — loading results...</div>;

  const [dealTaken, swapped, playerCaseValue, finalPayout] = data as unknown as [boolean, boolean, bigint, bigint];

  return (
    <div className="card bg-gradient-to-br from-success/20 to-primary/20 border border-success/30">
      <div className="card-body text-center">
        <h3 className="text-3xl font-black">Game Over!</h3>
        <div className="stats stats-vertical lg:stats-horizontal shadow mt-4">
          <div className="stat">
            <div className="stat-title">Result</div>
            <div className="stat-value text-lg">{dealTaken ? "Deal Taken" : swapped ? "Swapped" : "Kept Case"}</div>
          </div>
          <div className="stat">
            <div className="stat-title">Your Case Value</div>
            <div className="stat-value text-success">${(Number(playerCaseValue) / 100).toFixed(2)}</div>
          </div>
          <div className="stat">
            <div className="stat-title">Final Payout</div>
            <div className="stat-value text-primary">${(Number(finalPayout) / 100).toFixed(2)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
