"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatEther } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { BankerOffer } from "~~/components/game/BankerOffer";
import { BriefcaseGrid } from "~~/components/game/BriefcaseGrid";
import { EVDashboard } from "~~/components/game/EVDashboard";
import { GameStatus } from "~~/components/game/GameStatus";
import { LotteryEntry } from "~~/components/game/LotteryEntry";
import { PrizeBoard } from "~~/components/game/PrizeBoard";
import { FACTORY_JACKPOT_ABI, GameOutcome, GameState, NUM_CASES, NUM_ROUNDS } from "~~/contracts/DealOrNoDealAbi";
import { useEthPrice } from "~~/hooks/useEthPrice";
import { useGameRead, useGameWrite } from "~~/hooks/useGameContract";
import { useGameNotifications } from "~~/hooks/useGameNotifications";
import scaffoldConfig from "~~/scaffold.config";
import { notification } from "~~/utils/scaffold-eth";

type GameData = {
  host: `0x${string}`;
  contestant: `0x${string}`;
  state: number;
  outcome: number;
  merkleRoot: `0x${string}`;
  prizePool: bigint;
  currentRound: bigint;
  selectedCase: bigint;
  bankerOffer: bigint;
  lastActionTime: bigint;
  lotteryEndTime: bigint;
  revealEndTime: bigint;
  totalEntries: bigint;
  hostFee: bigint;
  protocolFee: bigint;
  config: {
    entryFee: bigint;
    lotteryDuration: bigint;
    revealDuration: bigint;
    turnTimeout: bigint;
    hostFeeBps: number;
    protocolFeeBps: number;
    refundBps: number;
    minPlayers: number;
  };
};

type BriefcaseInfo = {
  value: bigint;
  opened: boolean;
  revealed: boolean;
};

export default function GamePage() {
  const params = useParams();
  const gameAddress = params.id as `0x${string}`;
  const { address: connectedAddress } = useAccount();
  const { writeAsync, isPending: isWritePending } = useGameWrite();
  const { ethPrice } = useEthPrice();

  // Read full game state
  const { data: gameStateData, isLoading: isGameLoading } = useGameRead({
    gameAddress,
    functionName: "getGameState",
  });

  // Read remaining values
  const { data: remainingValuesData } = useGameRead({
    gameAddress,
    functionName: "getRemainingValues",
  });

  // Read all 26 briefcases individually
  // Using parallel reads via the hook
  const { data: bc0 } = useGameRead({ gameAddress, functionName: "getBriefcase", args: [0n] });
  const { data: bc1 } = useGameRead({ gameAddress, functionName: "getBriefcase", args: [1n] });
  const { data: bc2 } = useGameRead({ gameAddress, functionName: "getBriefcase", args: [2n] });
  const { data: bc3 } = useGameRead({ gameAddress, functionName: "getBriefcase", args: [3n] });
  const { data: bc4 } = useGameRead({ gameAddress, functionName: "getBriefcase", args: [4n] });
  const { data: bc5 } = useGameRead({ gameAddress, functionName: "getBriefcase", args: [5n] });
  const { data: bc6 } = useGameRead({ gameAddress, functionName: "getBriefcase", args: [6n] });
  const { data: bc7 } = useGameRead({ gameAddress, functionName: "getBriefcase", args: [7n] });
  const { data: bc8 } = useGameRead({ gameAddress, functionName: "getBriefcase", args: [8n] });
  const { data: bc9 } = useGameRead({ gameAddress, functionName: "getBriefcase", args: [9n] });
  const { data: bc10 } = useGameRead({ gameAddress, functionName: "getBriefcase", args: [10n] });
  const { data: bc11 } = useGameRead({ gameAddress, functionName: "getBriefcase", args: [11n] });
  const { data: bc12 } = useGameRead({ gameAddress, functionName: "getBriefcase", args: [12n] });
  const { data: bc13 } = useGameRead({ gameAddress, functionName: "getBriefcase", args: [13n] });
  const { data: bc14 } = useGameRead({ gameAddress, functionName: "getBriefcase", args: [14n] });
  const { data: bc15 } = useGameRead({ gameAddress, functionName: "getBriefcase", args: [15n] });
  const { data: bc16 } = useGameRead({ gameAddress, functionName: "getBriefcase", args: [16n] });
  const { data: bc17 } = useGameRead({ gameAddress, functionName: "getBriefcase", args: [17n] });
  const { data: bc18 } = useGameRead({ gameAddress, functionName: "getBriefcase", args: [18n] });
  const { data: bc19 } = useGameRead({ gameAddress, functionName: "getBriefcase", args: [19n] });
  const { data: bc20 } = useGameRead({ gameAddress, functionName: "getBriefcase", args: [20n] });
  const { data: bc21 } = useGameRead({ gameAddress, functionName: "getBriefcase", args: [21n] });
  const { data: bc22 } = useGameRead({ gameAddress, functionName: "getBriefcase", args: [22n] });
  const { data: bc23 } = useGameRead({ gameAddress, functionName: "getBriefcase", args: [23n] });
  const { data: bc24 } = useGameRead({ gameAddress, functionName: "getBriefcase", args: [24n] });
  const { data: bc25 } = useGameRead({ gameAddress, functionName: "getBriefcase", args: [25n] });

  const allBcData = [
    bc0,
    bc1,
    bc2,
    bc3,
    bc4,
    bc5,
    bc6,
    bc7,
    bc8,
    bc9,
    bc10,
    bc11,
    bc12,
    bc13,
    bc14,
    bc15,
    bc16,
    bc17,
    bc18,
    bc19,
    bc20,
    bc21,
    bc22,
    bc23,
    bc24,
    bc25,
  ];

  // Read factory address from game clone
  const { data: factoryAddress } = useGameRead({
    gameAddress,
    functionName: "factory",
  });

  // Read maxCaseValue from game clone
  const { data: maxCaseValueData } = useGameRead({
    gameAddress,
    functionName: "maxCaseValue",
  });
  const maxCaseVal = (maxCaseValueData as bigint) ?? 0n;

  // Read jackpotPool from factory (dynamic address, so use raw wagmi hook)
  const chainId = scaffoldConfig.targetNetworks[0].id;
  const { data: jackpotPool } = useReadContract({
    address: factoryAddress as `0x${string}` | undefined,
    abi: FACTORY_JACKPOT_ABI,
    functionName: "jackpotPool",
    chainId,
    query: { enabled: !!factoryAddress },
  });
  const jpPool = (jackpotPool as bigint) ?? 0n;

  // Parse game state data
  const parsed = gameStateData as [GameData, bigint, bigint, bigint] | undefined;

  const gameData = parsed?.[0];
  const remainingCount = parsed?.[1];
  const currentEV = parsed?.[2];
  const casesLeftThisRound = parsed?.[3];

  const state = gameData?.state ?? 0;
  const selectedCase = gameData && state >= GameState.RoundPlay ? Number(gameData.selectedCase) : undefined;

  // Parse briefcases
  const briefcases: (BriefcaseInfo | undefined)[] = allBcData.map(bc => {
    if (!bc) return undefined;
    const data = bc as unknown as { value: bigint; opened: boolean; revealed: boolean; holder: `0x${string}` };
    return {
      value: data.value,
      opened: data.opened,
      revealed: data.revealed,
    };
  });

  // Parse remaining values
  const remainingValues = (remainingValuesData as bigint[] | undefined) ?? [];

  // Build all values (from briefcases that have values set)
  const allValues: bigint[] = briefcases
    .filter((bc): bc is BriefcaseInfo => bc !== undefined && bc.value > 0n)
    .map(bc => bc.value);

  // Sort for prize board
  const sortedAllValues =
    allValues.length === NUM_CASES
      ? allValues
      : // During early phases, values may not be distributed yet
        [];

  const isContestant =
    gameData?.contestant !== "0x0000000000000000000000000000000000000000" &&
    connectedAddress?.toLowerCase() === gameData?.contestant?.toLowerCase();
  const isHost = connectedAddress?.toLowerCase() === gameData?.host?.toLowerCase();

  // Enable browser notifications
  useGameNotifications({
    gameState: state,
    lotteryEndTime: gameData?.lotteryEndTime,
    revealEndTime: gameData?.revealEndTime,
    isContestant,
    enabled: !!connectedAddress,
  });

  // --- Action Handlers ---

  const handleOpenLottery = async () => {
    try {
      await writeAsync({ gameAddress, functionName: "openLottery" });
      notification.success("Lottery opened!");
    } catch (e: unknown) {
      notification.error(e instanceof Error ? e.message.slice(0, 100) : "Failed");
    }
  };

  const handleCloseLottery = async () => {
    try {
      await writeAsync({ gameAddress, functionName: "closeLotteryEntries" });
      notification.success("Lottery entries closed. Reveal phase started.");
    } catch (e: unknown) {
      notification.error(e instanceof Error ? e.message.slice(0, 100) : "Failed");
    }
  };

  const handleDrawWinner = async () => {
    try {
      await writeAsync({ gameAddress, functionName: "drawWinner" });
      notification.success("Winner drawn!");
    } catch (e: unknown) {
      notification.error(e instanceof Error ? e.message.slice(0, 100) : "Failed");
    }
  };

  const handleSelectCase = async (caseIndex: number) => {
    try {
      await writeAsync({
        gameAddress,
        functionName: "selectCase",
        args: [BigInt(caseIndex)],
      });
      notification.success(`Selected briefcase #${caseIndex + 1}`);
    } catch (e: unknown) {
      notification.error(e instanceof Error ? e.message.slice(0, 100) : "Failed");
    }
  };

  const handleOpenCase = async (caseIndex: number) => {
    try {
      // Use the onchain shuffled value (set by _distributePrizePool after drawWinner)
      const bc = briefcases[caseIndex];
      const value = bc?.value ?? 0n;

      // MockGroth16Verifier accepts zero proofs
      await writeAsync({
        gameAddress,
        functionName: "openCase",
        args: [
          BigInt(caseIndex),
          value,
          [0n, 0n] as const,
          [
            [0n, 0n],
            [0n, 0n],
          ] as const,
          [0n, 0n] as const,
        ],
      });
      notification.success(`Opened briefcase #${caseIndex + 1}`);
    } catch (e: unknown) {
      notification.error(e instanceof Error ? e.message.slice(0, 100) : "Failed to open case");
    }
  };

  const handleAcceptDeal = async () => {
    try {
      await writeAsync({ gameAddress, functionName: "acceptDeal" });
      notification.success("DEAL! You accepted the banker's offer.");
    } catch (e: unknown) {
      notification.error(e instanceof Error ? e.message.slice(0, 100) : "Failed");
    }
  };

  const handleRejectDeal = async () => {
    try {
      await writeAsync({ gameAddress, functionName: "rejectDeal" });
      notification.success("NO DEAL! The game continues.");
    } catch (e: unknown) {
      notification.error(e instanceof Error ? e.message.slice(0, 100) : "Failed");
    }
  };

  const handleClaimRefund = async () => {
    try {
      await writeAsync({ gameAddress, functionName: "claimRefund" });
      notification.success("Refund claimed!");
    } catch (e: unknown) {
      notification.error(e instanceof Error ? e.message.slice(0, 100) : "Failed");
    }
  };

  const handleResolveTimeout = async () => {
    try {
      await writeAsync({ gameAddress, functionName: "resolveTimeout" });
      notification.success("Timeout resolved.");
    } catch (e: unknown) {
      notification.error(e instanceof Error ? e.message.slice(0, 100) : "Failed");
    }
  };

  const handleRevealFinalCase = async () => {
    try {
      const selIdx = Number(gameData?.selectedCase ?? 0n);
      // Use the onchain shuffled value (set by _distributePrizePool after drawWinner)
      const bc = briefcases[selIdx];
      const value = bc?.value ?? 0n;

      await writeAsync({
        gameAddress,
        functionName: "revealFinalCase",
        args: [
          value,
          [0n, 0n] as const,
          [
            [0n, 0n],
            [0n, 0n],
          ] as const,
          [0n, 0n] as const,
        ],
      });
      notification.success("Final case revealed! NO DEAL!");
    } catch (e: unknown) {
      notification.error(e instanceof Error ? e.message.slice(0, 100) : "Failed to reveal final case");
    }
  };

  // Is it time to reveal the final case? (all 10 rounds done, still in RoundPlay)
  const canRevealFinal = state === GameState.RoundPlay && gameData && Number(gameData.currentRound) >= NUM_ROUNDS;

  // Handle case click depending on game state
  const handleCaseClick = (caseIndex: number) => {
    if (state === GameState.LotteryComplete || state === GameState.CaseSelection) {
      if (isContestant) {
        handleSelectCase(caseIndex);
      }
    } else if (state === GameState.RoundPlay) {
      handleOpenCase(caseIndex);
    }
  };

  if (isGameLoading) {
    return (
      <div className="flex flex-col items-center grow pt-10">
        <span className="loading loading-spinner loading-lg" />
        <p className="mt-4 opacity-70">Loading game...</p>
      </div>
    );
  }

  if (!gameData) {
    return (
      <div className="flex flex-col items-center grow pt-10">
        <div className="alert alert-error max-w-md">
          <span>Game not found at address {gameAddress}</span>
        </div>
      </div>
    );
  }

  const isSelectionPhase = state === GameState.LotteryComplete || state === GameState.CaseSelection;
  const showBriefcaseGrid = state >= GameState.LotteryComplete && state <= GameState.GameOver;
  const showPrizeBoard = state >= GameState.RoundPlay && sortedAllValues.length === NUM_CASES;
  const showEVDashboard = state >= GameState.RoundPlay && state <= GameState.GameOver;
  const showLottery = state === GameState.LotteryOpen || state === GameState.LotteryReveal;
  const showBankerOffer = state === GameState.BankerOffer;

  return (
    <div className="flex flex-col items-center grow pt-4 px-4 pb-8">
      {/* Game Status Bar */}
      <div className="w-full max-w-6xl mb-4">
        <GameStatus
          gameData={gameData}
          remainingCount={remainingCount}
          casesLeftThisRound={casesLeftThisRound}
          connectedAddress={connectedAddress}
        />
      </div>

      {/* Jackpot badge during active game */}
      {state >= GameState.RoundPlay && state < GameState.GameOver && jpPool > 0n && (
        <div className="w-full max-w-6xl mb-4">
          <div
            className="flex items-center justify-center gap-2 rounded-lg py-2 px-4"
            style={{ background: "linear-gradient(90deg, #b8860b, #ffd700, #b8860b)" }}
          >
            <span className="text-sm font-bold text-black uppercase tracking-wide">Progressive Jackpot:</span>
            {ethPrice > 0 ? (
              <>
                <span className="text-2xl font-mono font-black text-black">
                  $
                  {(parseFloat(formatEther(jpPool)) * ethPrice).toLocaleString("en-US", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                </span>
                <span className="text-sm font-mono text-black/70">
                  ({parseFloat(formatEther(jpPool)).toFixed(4)} ETH)
                </span>
              </>
            ) : (
              <span className="text-lg font-mono font-black text-black">
                {parseFloat(formatEther(jpPool)).toFixed(4)} ETH
              </span>
            )}
          </div>
        </div>
      )}

      {/* Host controls (show to host always, or to anyone when time-based actions are available) */}
      {(isHost || state === GameState.LotteryOpen || state === GameState.LotteryReveal) && (
        <div className="w-full max-w-6xl mb-4">
          <HostControls
            state={state}
            onOpenLottery={handleOpenLottery}
            onCloseLottery={handleCloseLottery}
            onDrawWinner={handleDrawWinner}
            isPending={isWritePending}
            casesLeftThisRound={casesLeftThisRound}
            currentRound={gameData?.currentRound}
            isHost={isHost}
            lotteryEndTime={gameData?.lotteryEndTime}
            revealEndTime={gameData?.revealEndTime}
          />
        </div>
      )}

      {/* Lottery phase */}
      {showLottery && gameData && (
        <div className="w-full max-w-md mb-4">
          <LotteryEntry gameAddress={gameAddress} entryFee={gameData.config.entryFee} gameState={state} />
        </div>
      )}

      {/* Main game layout */}
      {showBriefcaseGrid && (
        <div className="w-full max-w-6xl">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Left sidebar: Prize Board */}
            {showPrizeBoard && (
              <div className="lg:w-56 shrink-0">
                <PrizeBoard allValues={sortedAllValues} remainingValues={remainingValues} />
              </div>
            )}

            {/* Center: Briefcase Grid */}
            <div className="flex-1">
              {/* Selection phase instructions */}
              {isSelectionPhase && isContestant && (
                <div className="alert alert-info mb-4">
                  <span>Select your briefcase! This will be the case you keep.</span>
                </div>
              )}
              {isSelectionPhase && !isContestant && (
                <div className="alert mb-4">
                  <span>Waiting for the contestant to select their briefcase...</span>
                </div>
              )}

              <BriefcaseGrid
                briefcases={briefcases}
                selectedCase={selectedCase}
                onCaseClick={handleCaseClick}
                disabled={
                  isWritePending ||
                  state === GameState.BankerOffer ||
                  state === GameState.GameOver ||
                  (state === GameState.RoundPlay && !isContestant && !isHost)
                }
                isSelectionPhase={isSelectionPhase}
              />

              {/* Final case reveal */}
              {canRevealFinal && (isHost || isContestant) && (
                <div className="card bg-gradient-to-r from-yellow-900 to-amber-800 shadow-lg mt-4">
                  <div className="card-body items-center text-center py-6">
                    <h3 className="text-xl font-bold text-yellow-200">All rounds complete!</h3>
                    <p className="text-sm opacity-80 mb-2">Reveal your briefcase to see what you would have won.</p>
                    <button
                      className="btn btn-warning btn-lg"
                      onClick={handleRevealFinalCase}
                      disabled={isWritePending}
                    >
                      {isWritePending ? (
                        <span className="loading loading-spinner loading-md" />
                      ) : (
                        "Reveal Your Briefcase"
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Game Over display */}
              {state === GameState.GameOver && (
                <GameOverPanel
                  outcome={gameData.outcome}
                  bankerOffer={gameData.bankerOffer}
                  isContestant={isContestant}
                  onClaimRefund={handleClaimRefund}
                  isPending={isWritePending}
                  connectedAddress={connectedAddress}
                  gameAddress={gameAddress}
                  selectedCaseValue={briefcases[Number(gameData.selectedCase)]?.value ?? 0n}
                  maxCaseValue={maxCaseVal}
                  ethPrice={ethPrice}
                />
              )}
            </div>

            {/* Right sidebar: EV Dashboard */}
            {showEVDashboard && (
              <div className="lg:w-72 shrink-0">
                <EVDashboard
                  currentEV={currentEV ?? 0n}
                  bankerOffer={gameData.bankerOffer}
                  remainingCount={Number(remainingCount ?? 0n)}
                  currentRound={Number(gameData.currentRound)}
                  prizePool={gameData.prizePool}
                  gameAddress={gameAddress}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Banker Offer Overlay */}
      {showBankerOffer && (
        <BankerOffer
          offer={gameData.bankerOffer}
          currentEV={currentEV ?? 0n}
          onAcceptDeal={handleAcceptDeal}
          onRejectDeal={handleRejectDeal}
          isContestant={isContestant}
        />
      )}

      {/* Timeout resolution (visible to everyone) */}
      {state !== GameState.GameOver && state > GameState.Created && (
        <div className="w-full max-w-6xl mt-4">
          <button
            className="btn btn-outline btn-sm btn-warning"
            onClick={handleResolveTimeout}
            disabled={isWritePending}
          >
            Resolve Timeout
          </button>
          <span className="text-xs opacity-50 ml-2">(Available if the current turn has expired)</span>
        </div>
      )}
    </div>
  );
}

/** Host-only action buttons */
const HostControls = ({
  state,
  onOpenLottery,
  onCloseLottery,
  onDrawWinner,
  isPending,
  casesLeftThisRound,
  currentRound,
  isHost,
  lotteryEndTime,
  revealEndTime,
}: {
  state: number;
  onOpenLottery: () => void;
  onCloseLottery: () => void;
  onDrawWinner: () => void;
  isPending: boolean;
  casesLeftThisRound: bigint | undefined;
  currentRound: bigint | undefined;
  isHost: boolean;
  lotteryEndTime: bigint | undefined;
  revealEndTime: bigint | undefined;
}) => {
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  // Update time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const lotteryEnded = lotteryEndTime ? now >= Number(lotteryEndTime) : false;
  const revealEnded = revealEndTime ? now >= Number(revealEndTime) : false;

  const formatTimeRemaining = (seconds: number): string => {
    if (seconds <= 0) return "0s";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  };

  return (
    <div className="card bg-base-200 shadow-lg">
      <div className="card-body p-4">
        <h3 className="card-title text-sm">{isHost ? "Host Controls" : "Game Actions"}</h3>
        <div className="flex flex-wrap gap-2">
          {state === GameState.Created && isHost && (
            <button className="btn btn-primary btn-sm" onClick={onOpenLottery} disabled={isPending}>
              {isPending ? <span className="loading loading-spinner loading-xs" /> : "Open Lottery"}
            </button>
          )}
          {state === GameState.LotteryOpen && (
            <>
              {lotteryEnded ? (
                <button className="btn btn-warning btn-sm" onClick={onCloseLottery} disabled={isPending}>
                  {isPending ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    "Close Lottery & Start Reveals"
                  )}
                </button>
              ) : (
                <div className="text-sm opacity-70">
                  Lottery closes in{" "}
                  <span className="font-mono font-semibold text-warning">
                    {formatTimeRemaining(Math.max(0, Number(lotteryEndTime ?? 0n) - now))}
                  </span>
                  {isHost ? "" : " (anyone can close after deadline)"}
                </div>
              )}
            </>
          )}
          {state === GameState.LotteryReveal && (
            <>
              {revealEnded ? (
                <button className="btn btn-success btn-sm" onClick={onDrawWinner} disabled={isPending}>
                  {isPending ? <span className="loading loading-spinner loading-xs" /> : "Draw Winner"}
                </button>
              ) : (
                <div className="text-sm opacity-70">
                  Reveal window closes in{" "}
                  <span className="font-mono font-semibold text-warning">
                    {formatTimeRemaining(Math.max(0, Number(revealEndTime ?? 0n) - now))}
                  </span>
                  {isHost ? "" : " (anyone can draw after deadline)"}
                </div>
              )}
            </>
          )}
          {state === GameState.RoundPlay && isHost && (
            <div className="flex items-center gap-2">
              <span className="badge badge-primary">Round {Number(currentRound ?? 0n) + 1}</span>
              <span className="text-sm">
                Click cases on the grid to open them.{" "}
                <span className="font-semibold">{Number(casesLeftThisRound ?? 0n)}</span> case
                {Number(casesLeftThisRound ?? 0n) !== 1 ? "s" : ""} left this round.
              </span>
            </div>
          )}
          {state === GameState.BankerOffer && isHost && (
            <span className="text-sm opacity-70">
              Waiting for the contestant to respond to the banker&apos;s offer.
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

/** Game over display with outcome and refund button */
const GameOverPanel = ({
  outcome,
  bankerOffer,
  isContestant,
  onClaimRefund,
  isPending,
  connectedAddress,
  gameAddress,
  selectedCaseValue,
  maxCaseValue,
  ethPrice,
}: {
  outcome: number;
  bankerOffer: bigint;
  isContestant: boolean;
  onClaimRefund: () => void;
  isPending: boolean;
  connectedAddress: string | undefined;
  gameAddress: `0x${string}`;
  selectedCaseValue: bigint;
  maxCaseValue: bigint;
  ethPrice: number;
}) => {
  const { data: entryIndex } = useGameRead({
    gameAddress,
    functionName: "playerEntryIndex",
    args: connectedAddress ? [connectedAddress] : undefined,
    enabled: !!connectedAddress,
  });

  const hasEntry = entryIndex && (entryIndex as bigint) > 0n;

  const outcomeLabels: Record<number, string> = {
    0: "In Progress",
    1: "DEAL!",
    2: "NO DEAL!",
    3: "Timeout Resolved",
  };

  const outcomeColors: Record<number, string> = {
    1: "text-success",
    2: "text-error",
    3: "text-warning",
  };

  return (
    <div className="card bg-base-200 shadow-lg mt-4">
      <div className="card-body items-center text-center">
        <h2 className={`text-3xl font-bold ${outcomeColors[outcome] ?? ""}`}>
          {outcomeLabels[outcome] ?? "Game Over"}
        </h2>

        {outcome === 1 && (
          <p className="text-lg">
            The contestant accepted{" "}
            {ethPrice > 0 ? (
              <>
                <span className="font-bold text-primary">
                  $
                  {(parseFloat(formatEther(bankerOffer)) * ethPrice).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <span className="text-sm opacity-70"> ({parseFloat(formatEther(bankerOffer)).toFixed(4)} ETH)</span>
              </>
            ) : (
              <span className="font-bold text-primary">{parseFloat(formatEther(bankerOffer)).toFixed(4)} ETH</span>
            )}
          </p>
        )}

        {outcome === 2 && <p className="text-lg">The contestant took the risk! Their case was revealed.</p>}

        {/* Jackpot win celebration */}
        {outcome === GameOutcome.NoDeal && selectedCaseValue > 0n && selectedCaseValue === maxCaseValue && (
          <div
            className="rounded-xl p-4 mt-2 w-full max-w-sm"
            style={{ background: "linear-gradient(135deg, #b8860b 0%, #ffd700 50%, #b8860b 100%)" }}
          >
            <p className="text-2xl font-black text-black text-center uppercase tracking-wider">JACKPOT WON!</p>
            <p className="text-sm text-black/70 text-center mt-1">
              The contestant held the highest-value case and won the progressive jackpot!
            </p>
          </div>
        )}

        {/* Refund button for lottery participants */}
        {hasEntry && !isContestant && (
          <button className="btn btn-primary btn-sm mt-2" onClick={onClaimRefund} disabled={isPending}>
            {isPending ? <span className="loading loading-spinner loading-xs" /> : "Claim Refund"}
          </button>
        )}
      </div>
    </div>
  );
};
