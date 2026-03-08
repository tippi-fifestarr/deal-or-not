"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import {
  useGameState,
  useRemainingPool,
  useBankerOfferCalc,
  useCentsToWei,
  useJackpot,
  useJackpotClaimed,
  useGameSponsor,
} from "@/hooks/useGameContract";
import { useBankerMessage } from "@/hooks/useBankerMessage";
import { DEAL_OR_NOT_ABI } from "@/lib/abi";
import { SPONSOR_JACKPOT_ABI } from "@/lib/sponsorAbi";
import { CONTRACT_ADDRESS, SPONSOR_JACKPOT_ADDRESS } from "@/lib/config";
import { Phase } from "@/types/game";
import BriefcaseRow from "@/components/game/BriefcaseRow";
import CommitReveal from "@/components/game/CommitReveal";
import ValueBoard from "@/components/game/ValueBoard";
import FinalDecision from "@/components/game/FinalDecision";
import GameOver from "@/components/game/GameOver";
import VideoWait from "@/components/game/VideoWait";
import JackpotDisplay from "@/components/game/JackpotDisplay";
import EventLog from "@/components/game/EventLog";
import {
  GlassBriefcase,
  GlassBriefcaseGrid,
  GlassBankerOffer,
  GlassGameStatus,
  GlassButton,
  GlassCard,
} from "@/components/glass";
import { centsToUsd } from "@/lib/utils";
import RotatingAd from "@/components/RotatingAd";

const contractConfig = {
  address: CONTRACT_ADDRESS,
  abi: DEAL_OR_NOT_ABI,
} as const;

export default function PlayGame({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId: idStr } = use(params);
  const router = useRouter();
  const gameId = BigInt(idStr);

  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const { gameState, refetch } = useGameState(gameId);
  const { remainingValues } = useRemainingPool(gameId);
  const bankerMessage = useBankerMessage(gameId);
  const { jackpotCents } = useJackpot(gameId);
  const jackpotClaimed = useJackpotClaimed(gameId);
  const sponsorInfo = useGameSponsor(gameId);
  const payoutWei = useCentsToWei(gameId, gameState?.finalPayout);

  const isAwaitingOffer = gameState?.phase === Phase.AwaitingOffer;
  const calculatedOffer = useBankerOfferCalc(gameId, isAwaitingOffer ?? false);

  const [txPending, setTxPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBankerOfferModal, setShowBankerOfferModal] = useState(false);
  const [bankerOfferDismissed, setBankerOfferDismissed] = useState(false);

  useEffect(() => {
    if (gameState?.phase === Phase.BankerOffer) {
      setShowBankerOfferModal(true);
      setBankerOfferDismissed(false);
    }
  }, [gameState?.phase]);

  const eliminatedValues = new Set<number>();
  if (gameState) {
    for (let i = 0; i < 5; i++) {
      if (gameState.opened[i] && gameState.caseValues[i] > 0n) {
        eliminatedValues.add(Number(gameState.caseValues[i]));
      }
    }
  }

  const isPlayer = address?.toLowerCase() === gameState?.player.toLowerCase();

  // ── TX helper ──
  const sendTx = async (functionName: string, args?: readonly unknown[]) => {
    setError(null);
    setTxPending(true);
    try {
      const hash = await writeContractAsync({
        ...contractConfig,
        functionName,
        args,
      } as Parameters<typeof writeContractAsync>[0]);
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }
      await refetch();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("User rejected") || msg.includes("user rejected")) {
        setError("Transaction rejected");
      } else {
        const short = msg.replace(/^.*reason:\s*/i, "").replace(/\n.*/s, "");
        setError(short.slice(0, 150) || "Transaction failed");
      }
    } finally {
      setTxPending(false);
    }
  };

  // ── Handlers ──
  const handlePickCase = (index: number) => sendTx("pickCase", [gameId, index]);
  const handleOpenCase = (caseIndex: number) => sendTx("openCase", [gameId, caseIndex]);
  const handleRingBanker = () => {
    if (calculatedOffer !== undefined) sendTx("setBankerOffer", [gameId, calculatedOffer]);
  };
  const handleAcceptDeal = () => {
    setShowBankerOfferModal(false);
    sendTx("acceptDeal", [gameId]);
  };
  const handleRejectDeal = () => {
    setShowBankerOfferModal(false);
    sendTx("rejectDeal", [gameId]);
  };
  const handleKeepCase = () => sendTx("keepCase", [gameId]);
  const handleSwapCase = () => sendTx("swapCase", [gameId]);
  const handleClaimJackpot = async () => {
    setError(null);
    setTxPending(true);
    try {
      const hash = await writeContractAsync({
        address: SPONSOR_JACKPOT_ADDRESS,
        abi: SPONSOR_JACKPOT_ABI,
        functionName: "claimJackpot",
        args: [gameId],
      });
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
      await refetch();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes("User rejected") ? "Transaction rejected" : msg.slice(0, 150));
    } finally {
      setTxPending(false);
    }
  };

  // ── Loading ──
  if (!gameState) {
    return (
      <main className="min-h-[80vh] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin h-10 w-10 border-4 border-white/40 border-t-transparent rounded-full mx-auto" />
          <p className="text-white/60">Loading game #{idStr}...</p>
          <p className="text-white/20 text-xs italic">Consulting the blockchain oracle.</p>
        </div>
      </main>
    );
  }

  const phase = gameState.phase;

  return (
    <main className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex gap-6">
        {/* Main game area */}
        <div className="flex-1 space-y-6">
          {/* Player bar */}
          <GlassCard className="flex items-center justify-between px-4 py-3" tint={isPlayer ? "yellow" : "blue"}>
            <div className="flex items-center gap-3">
              <span className={`inline-block w-2 h-2 rounded-full ${isPlayer ? "bg-yellow-400" : "bg-blue-400"} animate-pulse`} />
              <span className={`${isPlayer ? "text-yellow-300" : "text-blue-300"} text-sm font-bold uppercase tracking-wider`}>
                {isPlayer ? "Playing" : "Spectating"} — Game #{idStr}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <GlassButton size="sm" variant="regular" onClick={() => router.push("/play")}>
                Lobby
              </GlassButton>
              <Link href="/">
                <GlassButton size="sm" variant="regular">
                  Home
                </GlassButton>
              </Link>
            </div>
          </GlassCard>

          <GlassGameStatus
            phase={phase.toString()}
            round={gameState.currentRound}
            maxRounds={4}
            gameId={gameId}
            playerAddress={isPlayer ? gameState.player : undefined}
            onClick={phase === Phase.BankerOffer && bankerOfferDismissed ? () => setBankerOfferDismissed(false) : undefined}
          />

          {jackpotCents !== undefined && jackpotCents > 0n && phase !== Phase.GameOver && (
            <JackpotDisplay
              jackpotCents={jackpotCents}
              sponsorName={sponsorInfo?.name}
              sponsorLogo={sponsorInfo?.logoUrl}
            />
          )}

          {/* Phase: WaitingForVRF */}
          {phase === Phase.WaitingForVRF && (
            <VideoWait
              message="Quantum seed incoming..."
              submessage="Chainlink VRF is generating your game's randomness"
            />
          )}

          {/* Phase: Created — pick your case */}
          {phase === Phase.Created && (
            <div className="text-center space-y-6">
              <GlassCard className="p-6">
                <p className="text-white/90 text-xl font-semibold">
                  {isPlayer ? "Choose a briefcase to keep as yours" : "Waiting for player to pick a case..."}
                </p>
              </GlassCard>
              <GlassBriefcaseGrid columns={5}>
                {[0, 1, 2, 3, 4].map((caseIndex) => (
                  <GlassBriefcase
                    key={caseIndex}
                    caseNumber={caseIndex}
                    opened={false}
                    playerCase={false}
                    disabled={!isPlayer || txPending}
                    onClick={isPlayer ? () => handlePickCase(caseIndex) : undefined}
                  />
                ))}
              </GlassBriefcaseGrid>
              {txPending && <p className="text-amber-400 animate-pulse">Picking case...</p>}
            </div>
          )}

          {/* Phase: Round / WaitingForCRE */}
          {(phase === Phase.Round || phase === Phase.WaitingForCRE) && (
            <div className="flex gap-8 justify-center items-start">
              <ValueBoard eliminatedValues={eliminatedValues} />
              <div className="flex-1">
                <CommitReveal
                  gameState={gameState}
                  gameId={gameId}
                  onOpenCase={isPlayer ? handleOpenCase : async () => {}}
                  isPending={txPending}
                />
              </div>
            </div>
          )}

          {/* Phase: AwaitingOffer */}
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
                  <div className="animate-pulse text-amber-300 font-medium">
                    Waiting for CRE AI Banker response...
                  </div>
                  <p className="text-white/30 text-sm italic">
                    Gemini 2.5 Flash is crafting a psychologically devastating offer inside a CRE enclave.
                  </p>
                  {isPlayer && calculatedOffer !== undefined && (
                    <>
                      <div className="border-t border-white/10 pt-3 mt-3">
                        <p className="text-white/30 text-xs uppercase tracking-wider mb-2">
                          Manual fallback
                        </p>
                        <p className="text-white/40 text-sm">
                          On-chain offer: <span className="text-amber-300 font-bold">{centsToUsd(calculatedOffer)}</span>
                        </p>
                      </div>
                      <GlassButton
                        variant="regular"
                        onClick={handleRingBanker}
                        disabled={txPending}
                      >
                        {txPending ? "Calling..." : "Skip AI — Use On-Chain Offer"}
                      </GlassButton>
                    </>
                  )}
                </div>
                <div className="pt-4">
                  <RotatingAd variant="break" seed={gameId} />
                </div>
              </div>
            </div>
          )}

          {/* Phase: BankerOffer */}
          {phase === Phase.BankerOffer && (
            <>
              <div className="flex gap-8 justify-center items-start">
                <ValueBoard eliminatedValues={eliminatedValues} />
                <div className="flex-1">
                  <GlassBriefcaseGrid columns={5}>
                    {[0, 1, 2, 3, 4].map((caseIndex) => (
                      <GlassBriefcase
                        key={caseIndex}
                        caseNumber={caseIndex}
                        opened={gameState.opened[caseIndex]}
                        playerCase={gameState.playerCase === caseIndex}
                        value={gameState.opened[caseIndex] ? Number(gameState.caseValues[caseIndex]) : undefined}
                        disabled
                      />
                    ))}
                  </GlassBriefcaseGrid>
                </div>
              </div>
              <GlassBankerOffer
                offer={Number(gameState.bankerOffer)}
                expectedValue={remainingValues
                  ? remainingValues.reduce((sum, val) => sum + Number(val), 0) / remainingValues.length
                  : Number(gameState.bankerOffer)}
                round={gameState.currentRound}
                quip={bankerMessage ?? undefined}
                onDeal={isPlayer ? handleAcceptDeal : async () => {}}
                onNoDeal={isPlayer ? handleRejectDeal : async () => {}}
                isOpen={showBankerOfferModal && !bankerOfferDismissed}
                seed={gameId}
                spectatorMode={!isPlayer}
                onDismiss={() => setBankerOfferDismissed(true)}
              />

              {bankerOfferDismissed && showBankerOfferModal && (
                <button
                  onClick={() => setBankerOfferDismissed(false)}
                  className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-2 rounded-full bg-black/70 backdrop-blur-xl border border-yellow-500/30 text-yellow-400 text-sm font-bold hover:bg-black/80 hover:border-yellow-500/50 transition-all shadow-[0_0_20px_rgba(255,215,0,0.15)]"
                >
                  <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                  Show Banker Offer
                </button>
              )}
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
                  onKeepCase={isPlayer ? handleKeepCase : async () => {}}
                  onSwapCase={isPlayer ? handleSwapCase : async () => {}}
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
              onPlayAgain={() => router.push("/play")}
              jackpotCents={jackpotCents}
              jackpotClaimed={jackpotClaimed}
              onClaimJackpot={isPlayer ? handleClaimJackpot : async () => {}}
              claimPending={txPending}
              sponsorName={sponsorInfo?.name}
            />
          )}

          <EventLog gameId={gameId} />

          {/* Error display */}
          {error && (
            <GlassCard className="p-3 bg-red-500/10 border-red-500/30">
              <p className="text-red-400 text-sm">{error}</p>
            </GlassCard>
          )}

          {txPending && (
            <p className="text-amber-400 text-sm text-center animate-pulse">
              Transaction pending...
            </p>
          )}
        </div>

        {/* Sidebar */}
        <div className="hidden lg:flex flex-col gap-4 w-64 shrink-0">
          <GlassCard className="p-4 text-center">
            <p className="text-white/30 text-[10px] uppercase tracking-widest mb-1">Status</p>
            <p className={`text-2xl font-black ${isPlayer ? "text-yellow-400" : "text-blue-400"}`}>
              {isPlayer ? "Player" : "Viewer"}
            </p>
          </GlassCard>

          <GlassCard className="p-4">
            <p className="text-white/40 text-xs uppercase tracking-wider mb-2 font-bold">Game Info</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-white/30">Host</span>
                <span className="text-white/60 font-mono text-xs">
                  {gameState.host.slice(0, 6)}...{gameState.host.slice(-4)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/30">Player</span>
                <span className="text-white/60 font-mono text-xs">
                  {gameState.player.slice(0, 6)}...{gameState.player.slice(-4)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/30">Cases Open</span>
                <span className="text-white/60">{gameState.totalCollapsed} / 5</span>
              </div>
              {gameState.bankerOffer > 0n && (
                <div className="flex justify-between">
                  <span className="text-white/30">Last Offer</span>
                  <span className="text-yellow-400 font-bold">{centsToUsd(gameState.bankerOffer)}</span>
                </div>
              )}
            </div>
          </GlassCard>

          <RotatingAd variant="sidebar" seed={gameId} />

          <GlassCard className="p-4">
            <p className="text-white/40 text-xs uppercase tracking-wider mb-2 font-bold">
              Quick Actions
            </p>
            <div className="space-y-2">
              <GlassButton
                variant="regular"
                size="sm"
                className="w-full"
                onClick={() => router.push(`/watch/${idStr}`)}
              >
                Switch to Watch
              </GlassButton>
              <GlassButton
                variant="regular"
                size="sm"
                className="w-full"
                onClick={() => router.push("/play")}
              >
                New Game
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      </div>
    </main>
  );
}
