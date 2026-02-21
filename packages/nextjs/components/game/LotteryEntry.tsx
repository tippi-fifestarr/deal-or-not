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

export const LotteryEntry = ({ gameAddress, entryFee, gameState }: LotteryEntryProps) => {
  const { address: connectedAddress } = useAccount();
  const { writeAsync, isPending } = useGameWrite();
  const [secret, setSecret] = useState<string>("");
  const [hasEntered, setHasEntered] = useState(false);
  const [hasRevealed, setHasRevealed] = useState(false);
  const [error, setError] = useState<string>("");

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

  return (
    <div className="card bg-base-200 shadow-lg">
      <div className="card-body p-4">
        <h3 className="card-title text-sm">Lottery Entry</h3>

        {/* Status indicator */}
        <div className="flex items-center gap-2">
          {hasEntered && hasRevealed && (
            <div className="badge badge-success gap-1">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                className="w-4 h-4 stroke-current"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              Entered & Revealed
            </div>
          )}
          {hasEntered && !hasRevealed && <div className="badge badge-warning gap-1">Entered - Reveal Pending</div>}
          {!hasEntered && <div className="badge badge-neutral">Not entered</div>}
        </div>

        {/* Entry fee display */}
        <div className="text-sm">
          <span className="opacity-70">Entry Fee: </span>
          <span className="font-mono font-bold">{feeEth.toFixed(4)} ETH</span>
        </div>

        {/* Enter button */}
        {isLotteryOpen && !hasEntered && (
          <div className="mt-2">
            <p className="text-xs opacity-70 mb-2">
              A secret will be auto-generated and stored in your browser. You must reveal it during the reveal phase
              from the same browser.
            </p>
            <button
              className="btn btn-primary w-full"
              onClick={handleEnterLottery}
              disabled={isPending || !connectedAddress}
            >
              {isPending ? (
                <span className="loading loading-spinner loading-sm" />
              ) : (
                `Enter Lottery (${feeEth.toFixed(4)} ETH)`
              )}
            </button>
          </div>
        )}

        {/* Reveal button */}
        {isRevealPhase && hasEntered && !hasRevealed && (
          <div className="mt-2">
            <p className="text-xs opacity-70 mb-2">
              Reveal your secret to be eligible for the drawing. Unrevealed entries are excluded.
            </p>
            {secret ? (
              <button className="btn btn-warning w-full" onClick={handleRevealSecret} disabled={isPending}>
                {isPending ? <span className="loading loading-spinner loading-sm" /> : "Reveal Secret"}
              </button>
            ) : (
              <div className="alert alert-error">
                <span>Secret not found in this browser. You cannot reveal from a different device.</span>
              </div>
            )}
          </div>
        )}

        {/* Already entered during lottery */}
        {isLotteryOpen && hasEntered && (
          <div className="alert alert-info mt-2">
            <span>You have entered! Wait for the reveal phase.</span>
          </div>
        )}

        {/* Lottery closed, waiting for results */}
        {gameState > GameState.LotteryReveal && hasEntered && (
          <div className="text-xs opacity-70 mt-1">
            Lottery is complete. {hasRevealed ? "Your entry was revealed." : "Your entry was not revealed (excluded)."}
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="alert alert-error mt-2 text-sm">
            <span>{error.slice(0, 200)}</span>
          </div>
        )}
      </div>
    </div>
  );
};
