"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useBalance } from "wagmi";
import { parseEther } from "viem";
import BriefcaseGrid from "./BriefcaseGrid";
import ValueBoard from "./ValueBoard";
import BankerOffer from "./BankerOffer";
import GameStatus from "./GameStatus";
import DealResult from "./DealResult";
import {
  useGameState,
  useGameWrite,
  useNextGameId,
  useUsdToWei,
  useEthUsdPrice,
} from "../../hooks/useGameContract";
import { useCommitReveal } from "../../hooks/useCommitReveal";
import {
  GamePhase,
  isCaseOpened,
  CASE_VALUES_CENTS,
  centsToUsd,
} from "../../types/game";
import { MAX_CASE_CENTS, ENTRY_FEE_CENTS, SLIPPAGE_BPS } from "../../lib/constants";

export default function GameBoard() {
  const { address, isConnected } = useAccount();
  const { data: balance } = useBalance({ address });
  const ethUsdPrice = useEthUsdPrice();

  const [gameId, setGameId] = useState<bigint | undefined>(undefined);
  const [role, setRole] = useState<"banker" | "player" | null>(null);
  const [selectingCase, setSelectingCase] = useState(false);
  const [openedValues, setOpenedValues] = useState<Map<number, number>>(new Map());
  const [eliminatedValues, setEliminatedValues] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const { gameState, refetch } = useGameState(gameId);
  const { nextGameId } = useNextGameId();
  const {
    createGame,
    joinGame,
    revealCase,
    openCase,
    acceptDeal,
    rejectDeal,
    finalDecision,
    isPending,
  } = useGameWrite();
  const { caseIndex: committedCase, salt, generateCommit, clearCommit } = useCommitReveal();

  const maxCaseWei = useUsdToWei(MAX_CASE_CENTS);
  const entryFeeWei = useUsdToWei(ENTRY_FEE_CENTS);
  const offerWei = useUsdToWei(gameState?.bankerOffer ?? 0n);
  const payoutWei = useUsdToWei(gameState?.finalPayout ?? 0n);

  function withSlippage(amount: bigint | undefined): bigint {
    if (!amount) return 0n;
    return (amount * (10000n + SLIPPAGE_BPS)) / 10000n;
  }

  // Track opened case values from events by polling
  useEffect(() => {
    if (!gameState || gameState.phase < GamePhase.OpeningCases) return;

    const newOpened = new Map(openedValues);
    const newEliminated = new Set(eliminatedValues);

    // We track opened cases via the bitmap and fetch values for each
    // In a production app we'd use events, but polling works for demo
    for (let i = 0; i < 12; i++) {
      if (isCaseOpened(gameState.openedBitmap, i) && !newOpened.has(i)) {
        // We'll read the value from the contract in a separate effect
      }
    }
  }, [gameState?.openedBitmap]);

  const handleCreateGame = async () => {
    try {
      setError(null);
      const value = withSlippage(maxCaseWei);
      const hash = await createGame(value);
      const id = nextGameId !== undefined ? nextGameId : 0n;
      setGameId(id);
      setRole("banker");
      refetch();
    } catch (e: any) {
      setError(e.message?.slice(0, 100) || "Transaction failed");
    }
  };

  const handleJoinGame = async (targetGameId: bigint) => {
    setSelectingCase(true);
    setGameId(targetGameId);
    setRole("player");
  };

  const handleSelectCase = async (index: number) => {
    if (!selectingCase || gameId === undefined) return;
    try {
      setError(null);
      const { commitHash } = generateCommit(index);
      const value = withSlippage(entryFeeWei);
      await joinGame(gameId, commitHash, value);
      setSelectingCase(false);
      refetch();
    } catch (e: any) {
      setError(e.message?.slice(0, 100) || "Transaction failed");
    }
  };

  const handleReveal = async () => {
    if (gameId === undefined || committedCase === null || salt === null) return;
    try {
      setError(null);
      await revealCase(gameId, committedCase, salt);
      clearCommit();
      refetch();
    } catch (e: any) {
      setError(e.message?.slice(0, 100) || "Transaction failed");
    }
  };

  const handleOpenCase = async (index: number) => {
    if (gameId === undefined) return;
    try {
      setError(null);
      const hash = await openCase(gameId, index);
      // Wait briefly then refetch to get the new bitmap
      setTimeout(() => refetch(), 1000);
    } catch (e: any) {
      setError(e.message?.slice(0, 100) || "Transaction failed");
    }
  };

  const handleAcceptDeal = async () => {
    if (gameId === undefined) return;
    try {
      setError(null);
      await acceptDeal(gameId);
      refetch();
    } catch (e: any) {
      setError(e.message?.slice(0, 100) || "Transaction failed");
    }
  };

  const handleRejectDeal = async () => {
    if (gameId === undefined) return;
    try {
      setError(null);
      await rejectDeal(gameId);
      refetch();
    } catch (e: any) {
      setError(e.message?.slice(0, 100) || "Transaction failed");
    }
  };

  const handleFinalDecision = async (swap: boolean) => {
    if (gameId === undefined) return;
    try {
      setError(null);
      await finalDecision(gameId, swap);
      refetch();
    } catch (e: any) {
      setError(e.message?.slice(0, 100) || "Transaction failed");
    }
  };

  const handlePlayAgain = () => {
    setGameId(undefined);
    setRole(null);
    setSelectingCase(false);
    setOpenedValues(new Map());
    setEliminatedValues(new Set());
    setError(null);
    clearCommit();
  };

  // ──────────── Render ────────────

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <h1 className="text-4xl font-bold text-amber-400 mb-4">Deal or No Deal</h1>
        <p className="text-gray-400 mb-8">Connect your wallet to play</p>
      </div>
    );
  }

  // No active game — show lobby
  if (gameId === undefined) {
    return (
      <div className="max-w-lg mx-auto text-center py-10 space-y-6">
        <h1 className="text-4xl font-bold text-amber-400">Deal or No Deal</h1>
        <p className="text-gray-400">
          {balance && `Balance: ${(Number(balance.value) / 1e18).toFixed(4)} ETH`}
        </p>

        <div className="space-y-4">
          <button
            className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-4 px-8 rounded-lg text-lg transition-colors disabled:opacity-50"
            onClick={handleCreateGame}
            disabled={isPending}
            data-testid="create-game-button"
          >
            {isPending ? "Creating..." : "Create Game (Banker)"}
          </button>

          <div className="text-gray-500 text-sm">— or —</div>

          <div className="space-y-2">
            <p className="text-gray-400">Join an existing game:</p>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Game ID"
                className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white"
                data-testid="game-id-input"
                onChange={(e) => {
                  // Store for join button
                  (e.target as any)._gameId = e.target.value;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const val = (e.target as HTMLInputElement).value;
                    if (val) handleJoinGame(BigInt(val));
                  }
                }}
              />
              <button
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                onClick={() => {
                  const input = document.querySelector('[data-testid="game-id-input"]') as HTMLInputElement;
                  if (input?.value) handleJoinGame(BigInt(input.value));
                }}
                data-testid="join-game-button"
              >
                Join
              </button>
            </div>
          </div>
        </div>

        {error && (
          <p className="text-red-400 text-sm" data-testid="error-message">
            {error}
          </p>
        )}
      </div>
    );
  }

  // Selecting initial case
  if (selectingCase) {
    return (
      <div className="max-w-lg mx-auto text-center py-10 space-y-6">
        <h1 className="text-2xl font-bold text-amber-400">Choose Your Case</h1>
        <p className="text-gray-400">Select a briefcase to keep as yours</p>
        <BriefcaseGrid
          openedBitmap={0n}
          playerCaseIndex={-1}
          caseValues={new Map()}
          onCaseClick={handleSelectCase}
          disabled={isPending}
          selectMode
        />
        {isPending && <p className="text-amber-400 animate-pulse">Committing selection...</p>}
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>
    );
  }

  // Loading game state
  if (!gameState) {
    return (
      <div className="text-center py-20">
        <div className="animate-spin h-8 w-8 border-2 border-amber-400 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-gray-400">Loading game...</p>
      </div>
    );
  }

  // Build eliminated values set from bitmap
  const currentEliminatedValues = new Set<number>();
  const currentOpenedValues = new Map<number, number>();

  // Active game
  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-amber-400">Deal or No Deal</h1>
        <p className="text-gray-500 text-sm">Game #{gameId?.toString()}</p>
      </div>

      {/* Game Status */}
      <GameStatus
        phase={gameState.phase}
        currentRound={gameState.currentRound}
        casesOpenedThisRound={gameState.casesOpenedThisRound}
        ethUsdPrice={ethUsdPrice}
      />

      {/* Waiting for VRF */}
      {gameState.phase === GamePhase.WaitingForVRF && (
        <div className="text-center py-10">
          <div className="animate-spin h-12 w-12 border-4 border-amber-400 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-400">Shuffling case values with Chainlink VRF...</p>
        </div>
      )}

      {/* Waiting for player (banker view) */}
      {gameState.phase === GamePhase.WaitingForPlayer && role === "banker" && (
        <div className="text-center py-10">
          <p className="text-gray-400 text-lg mb-2">Waiting for a contestant to join...</p>
          <p className="text-gray-500">
            Share Game ID: <span className="text-amber-400 font-mono">{gameId?.toString()}</span>
          </p>
        </div>
      )}

      {/* Reveal Phase */}
      {gameState.phase === GamePhase.RevealCase && role === "player" && (
        <div className="text-center py-10 space-y-4">
          <p className="text-gray-400 text-lg">Cases have been shuffled!</p>
          <button
            className="bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 px-8 rounded-lg text-lg transition-colors disabled:opacity-50"
            onClick={handleReveal}
            disabled={isPending}
            data-testid="reveal-button"
          >
            {isPending ? "Revealing..." : "Reveal Your Selection"}
          </button>
        </div>
      )}

      {/* Main Game Board: Opening Cases / Banker Offer / Final Swap */}
      {(gameState.phase === GamePhase.OpeningCases ||
        gameState.phase === GamePhase.BankerOffer ||
        gameState.phase === GamePhase.FinalSwap) && (
        <div className="flex gap-8 justify-center">
          {/* Value Board */}
          <ValueBoard eliminatedValues={currentEliminatedValues} />

          {/* Briefcase Grid + Actions */}
          <div className="space-y-4">
            <BriefcaseGrid
              openedBitmap={gameState.openedBitmap}
              playerCaseIndex={gameState.playerCaseIndex}
              caseValues={currentOpenedValues}
              onCaseClick={handleOpenCase}
              disabled={
                isPending ||
                gameState.phase !== GamePhase.OpeningCases ||
                role !== "player"
              }
            />

            {/* Final Swap UI */}
            {gameState.phase === GamePhase.FinalSwap && role === "player" && (
              <div className="text-center space-y-3 pt-4">
                <p className="text-amber-400 font-semibold">
                  Two cases remain. Keep your case or swap?
                </p>
                <div className="flex gap-4 justify-center">
                  <button
                    className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-6 rounded-lg transition-colors disabled:opacity-50"
                    onClick={() => handleFinalDecision(false)}
                    disabled={isPending}
                    data-testid="keep-button"
                  >
                    Keep Case
                  </button>
                  <button
                    className="bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 px-6 rounded-lg transition-colors disabled:opacity-50"
                    onClick={() => handleFinalDecision(true)}
                    disabled={isPending}
                    data-testid="swap-button"
                  >
                    Swap Case
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Banker Offer Modal */}
      {gameState.phase === GamePhase.BankerOffer && role === "player" && (
        <BankerOffer
          offerCents={gameState.bankerOffer}
          offerWei={offerWei}
          onAccept={handleAcceptDeal}
          onReject={handleRejectDeal}
          isPending={isPending}
        />
      )}

      {/* Game Over */}
      {gameState.phase === GamePhase.GameOver && (
        <DealResult
          payoutCents={gameState.finalPayout}
          payoutWei={payoutWei}
          onPlayAgain={handlePlayAgain}
        />
      )}

      {/* Error display */}
      {error && (
        <p className="text-red-400 text-sm text-center" data-testid="error-message">
          {error}
        </p>
      )}

      {/* Pending transaction indicator */}
      {isPending && (
        <p className="text-amber-400 text-sm text-center animate-pulse">
          Transaction pending...
        </p>
      )}
    </div>
  );
}
