"use client";

import { useCallback, useEffect, useState } from "react";
import { encodePacked, formatEther, keccak256, toHex } from "viem";
import { useAccount } from "wagmi";
import { GameState } from "~~/contracts/DealOrNoDealAbi";
import { useGameRead, useGameWrite } from "~~/hooks/useGameContract";

type LotteryEntryProps = {
  gameAddress: `0x${string}`;
  entryFee: bigint;
  gameState: number;
  lotteryEndTime?: bigint;
  revealEndTime?: bigint;
};

const STORAGE_PREFIX = "dond-secret-";

function getStoredSecret(gameAddress: string, player: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(`${STORAGE_PREFIX}${gameAddress}-${player}`);
}

function storeSecret(gameAddress: string, player: string, secret: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${STORAGE_PREFIX}${gameAddress}-${player}`, secret);
}

// Stepper steps for the lottery flow
const LOTTERY_STEPS = [
  { label: "Enter", icon: "🎟️", description: "Pay entry fee & commit" },
  { label: "Wait", icon: "⏳", description: "Lottery window closes" },
  { label: "Reveal", icon: "🔓", description: "Reveal your secret" },
  { label: "Draw", icon: "🎲", description: "Winner is drawn" },
];

export const LotteryEntry = ({
  gameAddress,
  entryFee,
  gameState,
  lotteryEndTime,
  revealEndTime,
}: LotteryEntryProps) => {
  const { address: connectedAddress } = useAccount();
  const { writeAsync, isPending } = useGameWrite();
  const [secret, setSecret] = useState<string>("");
  const [hasEntered, setHasEntered] = useState(false);
  const [hasRevealed, setHasRevealed] = useState(false);
  const [error, setError] = useState<string>("");
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  // Update clock for countdowns
  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  // Check if user already entered
  const { data: entryIndex } = useGameRead({
    gameAddress,
    functionName: "playerEntryIndex",
    args: connectedAddress ? [connectedAddress] : undefined,
    enabled: !!connectedAddress,
  });

  // If entryIndex > 0, user has entered
  useEffect(() => {
    if (entryIndex && (entryIndex as bigint) > 0n) {
      setHasEntered(true);
    }
  }, [entryIndex]);

  // Load stored secret on mount
  useEffect(() => {
    if (connectedAddress) {
      const stored = getStoredSecret(gameAddress, connectedAddress);
      if (stored) {
        setSecret(stored);
      }
    }
  }, [gameAddress, connectedAddress]);

  // Check if already revealed
  const entryIdx = entryIndex ? Number(entryIndex as bigint) : 0;
  const { data: entryData } = useGameRead({
    gameAddress,
    functionName: "lotteryEntries",
    args: entryIdx > 0 ? [BigInt(entryIdx - 1)] : undefined,
    enabled: entryIdx > 0,
  });

  useEffect(() => {
    if (entryData) {
      const data = entryData as unknown as [string, string, string, boolean, boolean];
      if (data[3]) {
        // revealed === true
        setHasRevealed(true);
      }
    }
  }, [entryData]);

  const generateSecret = useCallback(() => {
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const newSecret = toHex(randomBytes);
    setSecret(newSecret);
    if (connectedAddress) {
      storeSecret(gameAddress, connectedAddress, newSecret);
    }
    return newSecret;
  }, [connectedAddress, gameAddress]);

  const handleEnterLottery = async () => {
    if (!connectedAddress) {
      setError("Please connect your wallet");
      return;
    }
    setError("");

    try {
      // Generate secret if not present
      let currentSecret = secret;
      if (!currentSecret) {
        currentSecret = generateSecret();
      }

      // commitHash = keccak256(abi.encodePacked(secret, msg.sender))
      const commitHash = keccak256(
        encodePacked(["bytes32", "address"], [currentSecret as `0x${string}`, connectedAddress]),
      );

      await writeAsync({
        gameAddress,
        functionName: "enterLottery",
        args: [commitHash],
        value: entryFee,
      });

      // Store secret in localStorage after successful entry
      storeSecret(gameAddress, connectedAddress, currentSecret);
      setHasEntered(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Transaction failed";
      setError(msg);
    }
  };

  const handleRevealSecret = async () => {
    if (!connectedAddress || !secret) {
      setError("No secret found. Did you enter the lottery from this browser?");
      return;
    }
    setError("");

    try {
      await writeAsync({
        gameAddress,
        functionName: "revealSecret",
        args: [secret as `0x${string}`],
      });
      setHasRevealed(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Transaction failed";
      setError(msg);
    }
  };

  const feeEth = parseFloat(formatEther(entryFee));
  const isLotteryOpen = gameState === GameState.LotteryOpen;
  const isRevealPhase = gameState === GameState.LotteryReveal;

  // Determine current step
  let currentStep = 0;
  if (hasEntered && !isRevealPhase) currentStep = 1;
  if (isRevealPhase && hasEntered && !hasRevealed) currentStep = 2;
  if (isRevealPhase && hasRevealed) currentStep = 3;
  if (gameState > GameState.LotteryReveal) currentStep = 3;

  // Countdown helpers
  const lotteryRemaining = lotteryEndTime ? Math.max(0, Number(lotteryEndTime) - now) : 0;
  const revealRemaining = revealEndTime ? Math.max(0, Number(revealEndTime) - now) : 0;

  const formatCountdown = (seconds: number) => {
    if (seconds <= 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="card bg-base-200 shadow-lg">
      <div className="card-body p-4">
        <h3 className="card-title text-sm">🎟️ Lottery Entry</h3>

        {/* Step progress bar */}
        <ul className="steps steps-horizontal w-full text-xs mb-3">
          {LOTTERY_STEPS.map((step, i) => (
            <li
              key={step.label}
              className={`step ${i <= currentStep ? "step-primary" : ""}`}
              data-content={i < currentStep ? "✓" : step.icon}
            >
              {step.label}
            </li>
          ))}
        </ul>

        {/* Countdown timers */}
        {isLotteryOpen && lotteryEndTime && (
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="text-xs opacity-60">Entries close in</span>
            <span className={`font-mono font-bold text-lg ${lotteryRemaining < 30 ? "text-error animate-pulse" : "text-warning"}`}>
              {formatCountdown(lotteryRemaining)}
            </span>
          </div>
        )}
        {isRevealPhase && revealEndTime && (
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="text-xs opacity-60">Reveal deadline in</span>
            <span className={`font-mono font-bold text-lg ${revealRemaining < 30 ? "text-error animate-pulse" : "text-warning"}`}>
              {formatCountdown(revealRemaining)}
            </span>
          </div>
        )}

        {/* Entry fee */}
        <div className="text-center text-sm mb-2">
          <span className="opacity-70">Entry Fee: </span>
          <span className="font-mono font-bold">{feeEth.toFixed(4)} ETH</span>
        </div>

        {/* STEP 1: Enter Lottery */}
        {isLotteryOpen && !hasEntered && (
          <div className="bg-base-300 rounded-lg p-3">
            <p className="text-xs opacity-70 mb-2">
              🔐 A secret is auto-generated and saved in your browser. You&apos;ll reveal it in the next phase.
            </p>
            <button
              className="btn btn-primary w-full"
              onClick={handleEnterLottery}
              disabled={isPending || !connectedAddress}
            >
              {isPending ? (
                <span className="loading loading-spinner loading-sm" />
              ) : (
                <>🎟️ Enter Lottery ({feeEth.toFixed(4)} ETH)</>
              )}
            </button>
          </div>
        )}

        {/* STEP 2: Waiting for lottery to close */}
        {isLotteryOpen && hasEntered && (
          <div className="bg-base-300 rounded-lg p-3 text-center">
            <div className="text-2xl mb-1">⏳</div>
            <p className="text-sm font-semibold">You&apos;re in!</p>
            <p className="text-xs opacity-60">
              Waiting for the lottery window to close. Other players can still enter.
              {lotteryRemaining > 0 && ` ${formatCountdown(lotteryRemaining)} remaining.`}
            </p>
          </div>
        )}

        {/* STEP 3: Reveal Secret */}
        {isRevealPhase && hasEntered && !hasRevealed && (
          <div className="bg-warning/10 border border-warning rounded-lg p-3">
            <p className="text-xs mb-2 font-semibold text-warning">
              ⚠️ You MUST reveal now or you&apos;ll be excluded from the drawing!
            </p>
            {secret ? (
              <button className="btn btn-warning w-full" onClick={handleRevealSecret} disabled={isPending}>
                {isPending ? <span className="loading loading-spinner loading-sm" /> : "🔓 Reveal My Secret"}
              </button>
            ) : (
              <div className="alert alert-error text-sm">
                <span>❌ Secret not found in this browser. You must reveal from the same device you entered from.</span>
              </div>
            )}
          </div>
        )}

        {/* STEP 4: Revealed, waiting for draw */}
        {isRevealPhase && hasRevealed && (
          <div className="bg-success/10 border border-success rounded-lg p-3 text-center">
            <div className="text-2xl mb-1">✅</div>
            <p className="text-sm font-semibold text-success">Secret revealed!</p>
            <p className="text-xs opacity-60">
              Waiting for the reveal window to close and the winner to be drawn.
              {revealRemaining > 0 && ` ${formatCountdown(revealRemaining)} remaining.`}
            </p>
          </div>
        )}

        {/* Post-lottery status */}
        {gameState > GameState.LotteryReveal && hasEntered && (
          <div className="text-center text-sm">
            {hasRevealed ? (
              <span className="badge badge-success gap-1">✓ Entry complete</span>
            ) : (
              <span className="badge badge-error gap-1">✗ Not revealed (excluded)</span>
            )}
          </div>
        )}

        {/* Not entered state */}
        {!hasEntered && !isLotteryOpen && !isRevealPhase && gameState <= GameState.LotteryReveal && (
          <div className="text-center text-sm opacity-50">
            Lottery not open yet
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="alert alert-error mt-2 text-xs">
            <span>{error.slice(0, 200)}</span>
          </div>
        )}
      </div>
    </div>
  );
};
