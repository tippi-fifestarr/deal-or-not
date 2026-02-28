"use client";

import { useState, useCallback } from "react";
import { useAccount, useConnect, useBalance } from "wagmi";
import {
  useGameState,
  useGameWrite,
  useNextGameId,
  useRemainingPool,
  useBankerOfferCalc,
  useCentsToWei,
} from "@/hooks/useGameContract";
import { useCommitReveal } from "@/hooks/useCommitReveal";
import { Phase, CASE_VALUES_CENTS } from "@/types/game";
import GameStatus from "./GameStatus";
import BriefcaseRow from "./BriefcaseRow";
import ValueBoard from "./ValueBoard";
import CommitReveal from "./CommitReveal";
import BankerOffer from "./BankerOffer";
import FinalDecision from "./FinalDecision";
import GameOver from "./GameOver";
import { centsToUsd } from "@/lib/utils";

const EMPTY_OPENED = [false, false, false, false, false] as const;
const EMPTY_VALUES = [0n, 0n, 0n, 0n, 0n] as const;

export default function GameBoard() {
  const { address, isConnected } = useAccount();
  const { connectors, connect } = useConnect();
  const { data: balance } = useBalance({ address });

  const [gameId, setGameId] = useState<bigint | undefined>(undefined);
  const [joinInput, setJoinInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { gameState, isLoading, refetch } = useGameState(gameId);
  const { nextGameId } = useNextGameId();
  const { remainingValues } = useRemainingPool(gameId);
  const {
    createGame, pickCase, commitCase, revealCase, setBankerOffer,
    acceptDeal, rejectDeal, commitFinalDecision, revealFinalDecision, isPending,
  } = useGameWrite();
  const {
    commitCase: genCommitCase, commitFinal: genCommitFinal,
    getSalt, getStoredCaseIndex, getStoredSwap, clearCommit,
  } = useCommitReveal();

  // Calculate banker offer when in AwaitingOffer phase
  const isAwaitingOffer = gameState?.phase === Phase.AwaitingOffer;
  const calculatedOffer = useBankerOfferCalc(gameId, isAwaitingOffer ?? false);
  const offerWei = useCentsToWei(gameId, gameState?.bankerOffer);
  const payoutWei = useCentsToWei(gameId, gameState?.finalPayout);

  // Build eliminated values set from case values
  const eliminatedValues = new Set<number>();
  if (gameState) {
    for (let i = 0; i < 5; i++) {
      if (gameState.opened[i] && gameState.caseValues[i] > 0n) {
        eliminatedValues.add(Number(gameState.caseValues[i]));
      }
    }
  }

  const withError = async (fn: () => Promise<void>) => {
    try {
      setError(null);
      await fn();
      setTimeout(() => refetch(), 1500);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Transaction failed";
      setError(msg.slice(0, 150));
    }
  };

  // ── Handlers ──

  const handleCreateGame = () =>
    withError(async () => {
      const currentNextId = nextGameId ?? 0n;
      await createGame();
      setGameId(currentNextId);
    });

  const handleJoinGame = () => {
    if (!joinInput) return;
    setGameId(BigInt(joinInput));
  };

  const handlePickCase = (index: number) =>
    withError(async () => {
      if (gameId === undefined) return;
      await pickCase(gameId, index);
    });

  const handleCommitCase = (caseIndex: number) =>
    withError(async () => {
      if (gameId === undefined || !gameState) return;
      const { commitHash } = genCommitCase(gameId, gameState.currentRound, caseIndex);
      await commitCase(gameId, commitHash);
    });

  const handleRevealCase = () =>
    withError(async () => {
      if (gameId === undefined || !gameState) return;
      const round = gameState.currentRound;
      const salt = getSalt(gameId, round);
      const caseIndex = getStoredCaseIndex(gameId, round);
      if (salt === null || caseIndex === null) {
        setError("Could not find stored commit. Did you clear localStorage?");
        return;
      }
      await revealCase(gameId, caseIndex, salt);
      clearCommit(gameId, round);
    });

  const handleRingBanker = () =>
    withError(async () => {
      if (gameId === undefined || calculatedOffer === undefined) return;
      await setBankerOffer(gameId, calculatedOffer);
    });

  const handleAcceptDeal = () =>
    withError(async () => {
      if (gameId === undefined) return;
      await acceptDeal(gameId);
    });

  const handleRejectDeal = () =>
    withError(async () => {
      if (gameId === undefined) return;
      await rejectDeal(gameId);
    });

  const handleCommitFinal = (swap: boolean) =>
    withError(async () => {
      if (gameId === undefined) return;
      const { commitHash } = genCommitFinal(gameId, swap);
      await commitFinalDecision(gameId, commitHash);
    });

  const handleRevealFinal = () =>
    withError(async () => {
      if (gameId === undefined) return;
      const salt = getSalt(gameId, "final");
      const swap = getStoredSwap(gameId);
      if (salt === null || swap === null) {
        setError("Could not find stored final commit. Did you clear localStorage?");
        return;
      }
      await revealFinalDecision(gameId, swap, salt);
      clearCommit(gameId, "final");
    });

  const handlePlayAgain = () => {
    setGameId(undefined);
    setError(null);
  };

  // ── Render ──

  if (!isConnected) {
    return (
      <div className="text-center py-20 space-y-6">
        <h1 className="text-5xl font-bold text-amber-400 tracking-tight">
          Deal or NOT
        </h1>
        <p className="text-gray-400">Quantum cases on Base Sepolia</p>
        <div className="space-y-2">
          {connectors.map((connector) => (
            <button
              key={connector.uid}
              onClick={() => connect({ connector })}
              className="block mx-auto bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 px-8 rounded-xl transition-colors"
            >
              Connect {connector.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Lobby — no active game
  if (gameId === undefined) {
    return (
      <div className="max-w-lg mx-auto text-center py-10 space-y-8">
        <div>
          <h1 className="text-5xl font-bold text-amber-400 tracking-tight">
            Deal or NOT
          </h1>
          <p className="text-gray-500 mt-2">
            {balance && `${(Number(balance.value) / 1e18).toFixed(4)} ETH`}
          </p>
        </div>

        <button
          className="w-full bg-gradient-to-r from-amber-500 to-amber-700 hover:from-amber-400 hover:to-amber-600 text-white font-bold py-4 px-8 rounded-xl text-lg transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50"
          onClick={handleCreateGame}
          disabled={isPending}
        >
          {isPending ? "Creating Game..." : "New Game"}
        </button>

        <div className="text-gray-600 text-sm">or join existing</div>

        <div className="flex gap-2">
          <input
            type="number"
            placeholder="Game ID"
            value={joinInput}
            onChange={(e) => setJoinInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoinGame()}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-amber-500 focus:outline-none"
          />
          <button
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-6 rounded-xl transition-colors"
            onClick={handleJoinGame}
          >
            Join
          </button>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        {/* Salt warning */}
        <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-xl p-3 text-yellow-400/70 text-xs">
          Do not clear your browser data during an active game — your commit
          salts are stored in localStorage and are needed to reveal your choices.
        </div>
      </div>
    );
  }

  // Loading
  if (!gameState) {
    return (
      <div className="text-center py-20">
        <div className="animate-spin h-10 w-10 border-4 border-amber-400 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-gray-400">Loading game state...</p>
      </div>
    );
  }

  // ── Active Game ──
  const phase = gameState.phase;

  return (
    <div className="max-w-3xl mx-auto py-6 space-y-8">
      <GameStatus
        phase={phase}
        currentRound={gameState.currentRound}
        gameId={gameId}
      />

      {/* Phase: WaitingForVRF */}
      {phase === Phase.WaitingForVRF && (
        <div className="text-center py-12">
          <div className="animate-spin h-12 w-12 border-4 border-purple-400 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-purple-300 text-lg">Quantum seed incoming...</p>
          <p className="text-gray-500 text-sm mt-1">
            Chainlink VRF is generating your game&apos;s randomness
          </p>
        </div>
      )}

      {/* Phase: Created — pick your case */}
      {phase === Phase.Created && (
        <div className="text-center space-y-6">
          <p className="text-blue-300 text-lg">
            Choose a briefcase to keep as yours
          </p>
          <BriefcaseRow
            opened={EMPTY_OPENED}
            playerCase={-1}
            caseValues={EMPTY_VALUES}
            onCaseClick={handlePickCase}
            disabled={isPending}
            selectMode
          />
          {isPending && (
            <p className="text-amber-400 animate-pulse">Picking case...</p>
          )}
        </div>
      )}

      {/* Phase: Round / WaitingForReveal — commit-reveal case opening */}
      {(phase === Phase.Round || phase === Phase.WaitingForReveal) && (
        <div className="flex gap-8 justify-center items-start">
          <ValueBoard eliminatedValues={eliminatedValues} />
          <div className="flex-1">
            <CommitReveal
              gameState={gameState}
              gameId={gameId}
              onCommit={handleCommitCase}
              onReveal={handleRevealCase}
              isPending={isPending}
            />
          </div>
        </div>
      )}

      {/* Phase: AwaitingOffer — ring the banker */}
      {phase === Phase.AwaitingOffer && (
        <div className="flex gap-8 justify-center items-start">
          <ValueBoard eliminatedValues={eliminatedValues} />
          <div className="flex-1 text-center space-y-4">
            <BriefcaseRow
              opened={gameState.opened}
              playerCase={gameState.playerCase}
              caseValues={gameState.caseValues}
              disabled
            />
            <div className="space-y-3 pt-4">
              {calculatedOffer !== undefined && (
                <p className="text-gray-400">
                  Calculated offer:{" "}
                  <span className="text-amber-300 font-bold">
                    {centsToUsd(calculatedOffer)}
                  </span>
                </p>
              )}
              <button
                className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 text-white font-bold py-4 px-10 rounded-xl text-lg transition-all shadow-lg shadow-orange-500/20 disabled:opacity-50"
                onClick={handleRingBanker}
                disabled={isPending || calculatedOffer === undefined}
              >
                {isPending ? "Calling..." : "Ring the Banker"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase: BankerOffer — DEAL or NO DEAL */}
      {phase === Phase.BankerOffer && (
        <>
          <div className="flex gap-8 justify-center items-start">
            <ValueBoard eliminatedValues={eliminatedValues} />
            <div className="flex-1">
              <BriefcaseRow
                opened={gameState.opened}
                playerCase={gameState.playerCase}
                caseValues={gameState.caseValues}
                disabled
              />
            </div>
          </div>
          <BankerOffer
            offerCents={gameState.bankerOffer}
            offerWei={offerWei}
            remainingValues={remainingValues ?? []}
            onAccept={handleAcceptDeal}
            onReject={handleRejectDeal}
            isPending={isPending}
          />
        </>
      )}

      {/* Phase: CommitFinal / WaitingForFinalReveal */}
      {(phase === Phase.CommitFinal || phase === Phase.WaitingForFinalReveal) && (
        <div className="flex gap-8 justify-center items-start">
          <ValueBoard eliminatedValues={eliminatedValues} />
          <div className="flex-1">
            <FinalDecision
              gameState={gameState}
              gameId={gameId}
              onCommitFinal={handleCommitFinal}
              onRevealFinal={handleRevealFinal}
              isPending={isPending}
            />
          </div>
        </div>
      )}

      {/* Phase: GameOver */}
      {phase === Phase.GameOver && (
        <GameOver
          gameState={gameState}
          payoutWei={payoutWei}
          onPlayAgain={handlePlayAgain}
        />
      )}

      {/* Error display */}
      {error && (
        <p className="text-red-400 text-sm text-center bg-red-900/20 border border-red-700/30 rounded-xl p-3">
          {error}
        </p>
      )}

      {/* Pending indicator */}
      {isPending && (
        <p className="text-amber-400 text-sm text-center animate-pulse">
          Transaction pending...
        </p>
      )}
    </div>
  );
}
