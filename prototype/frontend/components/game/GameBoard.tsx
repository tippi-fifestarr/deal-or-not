"use client";

import { useState, useEffect } from "react";
import { useAccount, useConnect, useDisconnect, useBalance, usePublicClient, useSwitchChain } from "wagmi";
import {
  useGameState,
  useNextGameId,
  useRemainingPool,
  useBankerOfferCalc,
  useCentsToWei,
  useJackpot,
  useJackpotClaimed,
  useGameSponsor,
} from "@/hooks/useGameContract";
import { useWriteContract } from "wagmi";
import { DEAL_OR_NOT_ABI } from "@/lib/abi";
import { SPONSOR_JACKPOT_ABI } from "@/lib/sponsorAbi";
import { CONTRACT_ADDRESS, SPONSOR_JACKPOT_ADDRESS, CHAIN_ID } from "@/lib/config";
import { Phase } from "@/types/game";
import GameStatus from "./GameStatus";
import BriefcaseRow from "./BriefcaseRow";
import ValueBoard from "./ValueBoard";
import CommitReveal from "./CommitReveal";
import BankerOffer from "./BankerOffer";
import FinalDecision from "./FinalDecision";
import GameOver from "./GameOver";
import VideoWait from "./VideoWait";
import JackpotDisplay from "./JackpotDisplay";
import { centsToUsd } from "@/lib/utils";

const EMPTY_OPENED = [false, false, false, false, false] as const;
const EMPTY_VALUES = [0n, 0n, 0n, 0n, 0n] as const;

const contractConfig = {
  address: CONTRACT_ADDRESS,
  abi: DEAL_OR_NOT_ABI,
} as const;

export default function GameBoard() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { data: balance } = useBalance({ address });
  const publicClient = usePublicClient();
  const isWrongChain = isConnected && chainId !== CHAIN_ID;

  const [gameId, setGameId] = useState<bigint | undefined>(undefined);
  const [joinInput, setJoinInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [txPending, setTxPending] = useState(false);
  const [spectatorMode, setSpectatorMode] = useState(false);

  const { gameState, refetch } = useGameState(gameId);
  const { nextGameId } = useNextGameId();
  const { remainingValues } = useRemainingPool(gameId);
  const { writeContractAsync } = useWriteContract();

  // Jackpot + sponsor state
  const { jackpotCents } = useJackpot(gameId);
  const jackpotClaimed = useJackpotClaimed(gameId);
  const sponsorInfo = useGameSponsor(gameId);

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

  /** Write + wait for receipt + refetch game state */
  const sendTx = async (
    functionName: string,
    args?: readonly unknown[],
  ) => {
    setError(null);
    setTxPending(true);
    try {
      const hash = await writeContractAsync({
        ...contractConfig,
        functionName,
        args,
      } as Parameters<typeof writeContractAsync>[0]);
      // Wait for receipt
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }
      await refetch();
      return hash;
    } catch (e: unknown) {
      setError(parseContractError(e));
      throw e;
    } finally {
      setTxPending(false);
    }
  };

  function parseContractError(e: unknown): string {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("User rejected") || msg.includes("user rejected")) return "Transaction rejected";
    if (msg.includes("NotPlayer")) return "Not your game — your wallet is not the player";
    if (msg.includes("NotHost")) return "Not your game — your wallet is not the host";
    if (msg.includes("NotAllowedBanker")) return "Not an allowed banker for this game";
    if (msg.includes("WrongPhase")) return "Wrong phase — the game is not in the expected state";
    if (msg.includes("CannotOpenOwnCase")) return "You cannot open your own case";
    if (msg.includes("CaseAlreadyOpened")) return "That case is already opened";
    if (msg.includes("InvalidCase")) return "Invalid case index";
    if (msg.includes("NotCREForwarder")) return "Not authorized — only the CRE enclave can call this";
    if (msg.includes("InvalidValue")) return "Invalid value — not in the remaining pool";
    // Fallback: trim to something readable
    const short = msg.replace(/^.*reason:\s*/i, "").replace(/\n.*/s, "");
    return short.slice(0, 150) || "Transaction failed";
  }

  // ── Handlers ──

  const handleCreateGame = async () => {
    try {
      const currentNextId = nextGameId ?? 0n;
      setError(null);
      setTxPending(true);
      const hash = await writeContractAsync({
        ...contractConfig,
        functionName: "createGame",
      });
      setGameId(currentNextId);
      if (publicClient) {
        publicClient.waitForTransactionReceipt({ hash }).finally(() => {
          setTxPending(false);
        });
      } else {
        setTxPending(false);
      }
    } catch (e: unknown) {
      setError(parseContractError(e));
      setTxPending(false);
    }
  };

  const handleJoinGame = () => {
    if (!joinInput) return;
    setGameId(BigInt(joinInput));
  };

  const handlePickCase = async (index: number) => {
    if (gameId === undefined) return;
    try {
      await sendTx("pickCase", [gameId, index]);
    } catch {}
  };

  const handleOpenCase = async (caseIndex: number) => {
    if (gameId === undefined) return;
    try {
      await sendTx("openCase", [gameId, caseIndex]);
    } catch {}
  };

  const handleRingBanker = async () => {
    if (gameId === undefined || calculatedOffer === undefined) return;
    try {
      await sendTx("setBankerOffer", [gameId, calculatedOffer]);
    } catch {}
  };

  const handleAcceptDeal = async () => {
    if (gameId === undefined) return;
    try { await sendTx("acceptDeal", [gameId]); } catch {}
  };

  const handleRejectDeal = async () => {
    if (gameId === undefined) return;
    try { await sendTx("rejectDeal", [gameId]); } catch {}
  };

  const handleKeepCase = async () => {
    if (gameId === undefined) return;
    try { await sendTx("keepCase", [gameId]); } catch {}
  };

  const handleSwapCase = async () => {
    if (gameId === undefined) return;
    try { await sendTx("swapCase", [gameId]); } catch {}
  };

  const handlePlayAgain = () => {
    setGameId(undefined);
    setError(null);
    setSpectatorMode(false);
  };

  const handleClaimJackpot = async () => {
    if (gameId === undefined) return;
    setError(null);
    setTxPending(true);
    try {
      const hash = await writeContractAsync({
        address: SPONSOR_JACKPOT_ADDRESS,
        abi: SPONSOR_JACKPOT_ABI,
        functionName: "claimJackpot",
        args: [gameId],
      });
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }
      await refetch();
    } catch (e: unknown) {
      setError(parseContractError(e));
    } finally {
      setTxPending(false);
    }
  };

  // ── Render ──

  if (!mounted) {
    return (
      <div className="text-center py-20">
        <div className="animate-spin h-10 w-10 border-4 border-amber-400 border-t-transparent rounded-full mx-auto" />
      </div>
    );
  }

  if (!isConnected && !spectatorMode) {
    return (
      <div className="text-center py-20 space-y-6">
        <h1 className="text-5xl font-bold text-amber-400 tracking-tight">
          Deal or NOT
        </h1>
        <p className="text-gray-400">Quantum cases on Base Sepolia</p>
        <button
          onClick={() => connect({ connector: connectors[0] })}
          className="mx-auto bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 px-8 rounded-xl transition-colors"
        >
          Connect Wallet
        </button>

        <div className="text-gray-600 text-sm pt-4">or watch a game</div>
        <div className="flex gap-2 max-w-xs mx-auto">
          <input
            type="number"
            placeholder="Game ID"
            value={joinInput}
            onChange={(e) => setJoinInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && joinInput) {
                setGameId(BigInt(joinInput));
                setSpectatorMode(true);
              }
            }}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-amber-500 focus:outline-none"
          />
          <button
            className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-xl transition-colors"
            onClick={() => {
              if (joinInput) {
                setGameId(BigInt(joinInput));
                setSpectatorMode(true);
              }
            }}
          >
            Watch
          </button>
        </div>
      </div>
    );
  }

  if (isWrongChain && !spectatorMode) {
    return (
      <div className="text-center py-20 space-y-6">
        <h1 className="text-5xl font-bold text-amber-400 tracking-tight">
          Deal or NOT
        </h1>
        <p className="text-red-400">Wrong network — please switch to Base Sepolia</p>
        <button
          onClick={() => switchChain({ chainId: CHAIN_ID })}
          className="mx-auto bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 px-8 rounded-xl transition-colors"
        >
          Switch to Base Sepolia
        </button>
        <button
          onClick={() => disconnect()}
          className="text-gray-600 text-xs hover:text-gray-400 transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  // Lobby — no active game (only for connected users)
  if (gameId === undefined && !spectatorMode) {
    return (
      <div className="max-w-lg mx-auto text-center py-10 space-y-8">
        <div>
          <h1 className="text-5xl font-bold text-amber-400 tracking-tight">
            Deal or NOT
          </h1>
          <p className="text-gray-500 mt-2">
            {address && <span className="text-xs">{address.slice(0, 6)}...{address.slice(-4)}</span>}
            {balance && <span> &middot; {(Number(balance.value) / 1e18).toFixed(4)} ETH</span>}
          </p>
        </div>

        <button
          className="w-full bg-gradient-to-r from-amber-500 to-amber-700 hover:from-amber-400 hover:to-amber-600 text-white font-bold py-4 px-8 rounded-xl text-lg transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50"
          onClick={handleCreateGame}
          disabled={txPending}
        >
          {txPending ? "Creating Game..." : "New Game"}
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

        <button
          onClick={() => disconnect()}
          className="text-gray-600 text-xs hover:text-gray-400 transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  // Loading game state
  if (!gameState) {
    return (
      <div className="text-center py-20">
        <div className="animate-spin h-10 w-10 border-4 border-amber-400 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-gray-400">Loading game state...</p>
      </div>
    );
  }

  // Shouldn't happen, but satisfies TS narrowing
  if (gameId === undefined) return null;

  // ── Active Game ──
  const phase = gameState.phase;
  const isPlayer = !spectatorMode && address?.toLowerCase() === gameState.player.toLowerCase();

  return (
    <div className="max-w-3xl mx-auto py-6 space-y-8">
      {spectatorMode && (
        <div className="flex items-center justify-between bg-blue-900/20 border border-blue-700/30 rounded-xl px-4 py-2">
          <span className="text-blue-400 text-sm">Spectator Mode — watching game #{gameId?.toString()}</span>
          <button
            onClick={handlePlayAgain}
            className="text-gray-400 hover:text-white text-xs transition-colors"
          >
            Exit
          </button>
        </div>
      )}

      <GameStatus
        phase={phase}
        currentRound={gameState.currentRound}
        gameId={gameId}
        player={gameState.player}
        isPlayer={isPlayer}
      />

      {/* Jackpot display — shown during active gameplay */}
      {jackpotCents !== undefined && jackpotCents > 0n && phase !== Phase.GameOver && (
        <JackpotDisplay
          jackpotCents={jackpotCents}
          sponsorName={sponsorInfo?.name}
          sponsorLogo={sponsorInfo?.logoUrl}
        />
      )}

      {/* Phase: WaitingForVRF — video plays while VRF seed arrives */}
      {phase === Phase.WaitingForVRF && (
        <VideoWait
          message="Quantum seed incoming..."
          submessage="Chainlink VRF is generating your game's randomness"
        />
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
            disabled={txPending}
            selectMode
          />
          {txPending && (
            <p className="text-amber-400 animate-pulse">Picking case...</p>
          )}
        </div>
      )}

      {/* Phase: Round / WaitingForCRE — open case (1 TX, CRE handles the rest) */}
      {(phase === Phase.Round || phase === Phase.WaitingForCRE) && (
        <div className="flex gap-8 justify-center items-start">
          <ValueBoard eliminatedValues={eliminatedValues} />
          <div className="flex-1">
            <CommitReveal
              gameState={gameState}
              gameId={gameId}
              onOpenCase={handleOpenCase}
              isPending={txPending}
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
                disabled={txPending || calculatedOffer === undefined}
              >
                {txPending ? "Calling..." : "Ring the Banker"}
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
            isPending={txPending}
            jackpotCents={jackpotCents}
          />
        </>
      )}

      {/* Phase: FinalRound / WaitingForFinalCRE */}
      {(phase === Phase.FinalRound || phase === Phase.WaitingForFinalCRE) && (
        <div className="flex gap-8 justify-center items-start">
          <ValueBoard eliminatedValues={eliminatedValues} />
          <div className="flex-1">
            <FinalDecision
              gameState={gameState}
              gameId={gameId}
              onKeepCase={handleKeepCase}
              onSwapCase={handleSwapCase}
              isPending={txPending}
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
          jackpotCents={jackpotCents}
          jackpotClaimed={jackpotClaimed}
          onClaimJackpot={handleClaimJackpot}
          claimPending={txPending}
          sponsorName={sponsorInfo?.name}
        />
      )}

      {/* Error display */}
      {error && (
        <p className="text-red-400 text-sm text-center bg-red-900/20 border border-red-700/30 rounded-xl p-3">
          {error}
        </p>
      )}

      {/* Pending indicator */}
      {txPending && (
        <p className="text-amber-400 text-sm text-center animate-pulse">
          Transaction pending...
        </p>
      )}
    </div>
  );
}
