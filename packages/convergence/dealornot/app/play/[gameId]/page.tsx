"use client";

import { use, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAccount, usePublicClient, useWriteContract, useSwitchChain } from "wagmi";
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
import { BANKER_CALL_VIDEOS, DEAL_VIDEOS, NO_DEAL_VIDEOS, getRandomVideo } from "@/lib/videos";
import VideoPlayer from "@/components/game/VideoPlayer";
import CrossChainJoin from "@/components/game/CrossChainJoin";
import { CHAIN_ID } from "@/lib/config";
import { isSpokeChain } from "@/lib/chains";
import { useChainContext } from "@/contexts/ChainContext";
import { useWallet as useAptosWallet } from "@aptos-labs/wallet-adapter-react";
import { useAptosGameState, useAptosGameWrite, octasToApt } from "@/hooks/aptos/useAptosGame";
import { APTOS_PHASES, APTOS_PHASE_NAMES } from "@/lib/aptos/config";

const contractConfig = {
  address: CONTRACT_ADDRESS,
  abi: DEAL_OR_NOT_ABI,
} as const;

export default function PlayGame({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId: idStr } = use(params);
  const router = useRouter();
  const gameId = BigInt(idStr);

  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { switchChain } = useSwitchChain();
  const onSpokeChain = chainId !== undefined && isSpokeChain(chainId);

  // Aptos
  const { isAptos } = useChainContext();
  const { account: aptosAccount } = useAptosWallet();
  const aptosGameId = isAptos ? Number(idStr) : undefined;
  const { gameState: aptosGameState, refetch: aptosRefetch } = useAptosGameState(aptosGameId);
  const aptosWrite = useAptosGameWrite();

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
  const [activeVideo, setActiveVideo] = useState<string | null>(null);
  const prevPhaseRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const phase = gameState?.phase;
    if (phase === Phase.BankerOffer) {
      setShowBankerOfferModal(true);
      setBankerOfferDismissed(false);
      // Play banker call video on transition into this phase
      if (prevPhaseRef.current !== undefined && prevPhaseRef.current !== Phase.BankerOffer) {
        setActiveVideo(getRandomVideo(BANKER_CALL_VIDEOS));
      }
    } else {
      if (activeVideo && !activeVideo.includes("deal")) setActiveVideo(null);
    }
    prevPhaseRef.current = phase;
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
    setActiveVideo(getRandomVideo(DEAL_VIDEOS));
    sendTx("acceptDeal", [gameId]);
  };
  const handleRejectDeal = () => {
    setShowBankerOfferModal(false);
    setActiveVideo(getRandomVideo(NO_DEAL_VIDEOS));
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

  // ── Cross-chain: on Sepolia spoke ──
  if (onSpokeChain) {
    return (
      <main className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="max-w-lg w-full text-center space-y-8">
          <div>
            <p className="text-yellow-500/40 text-xs uppercase tracking-[0.3em] mb-3 mt-8 font-bold">
              Cross-Chain Play
            </p>
            <h1 className="text-4xl font-black uppercase tracking-tight mb-3">
              <span className="gold-text">Game #{idStr}</span>
            </h1>
            <p className="text-white/40 text-sm">
              Join this game from ETH Sepolia via Chainlink CCIP.
            </p>
          </div>

          <CrossChainJoin
            gameId={Number(idStr)}
            onSuccess={() => {
              switchChain({ chainId: CHAIN_ID });
            }}
          />

          <div className="text-center space-y-4">
            <div className="text-white/30 text-sm">or switch to Base Sepolia to play directly</div>
            <GlassButton
              variant="regular"
              size="md"
              onClick={() => switchChain({ chainId: CHAIN_ID })}
            >
              Switch to Base Sepolia
            </GlassButton>
          </div>
        </div>
      </main>
    );
  }

  // ── Aptos Game ──
  if (isAptos && aptosGameState) {
    const ag = aptosGameState;
    const aptosPhase = ag.phase;
    const phaseName = APTOS_PHASE_NAMES[aptosPhase] ?? `Phase ${aptosPhase}`;
    const isAptosPlayer = aptosAccount?.address?.toString().toLowerCase() === ag.player.toLowerCase();

    const aptosEliminatedValues = new Set<number>();
    for (let i = 0; i < 5; i++) {
      if (ag.opened[i] && ag.caseValues[i] > 0) {
        aptosEliminatedValues.add(ag.caseValues[i]);
      }
    }

    const handleAptosTx = async (fn: () => Promise<string | undefined>) => {
      setError(null);
      setTxPending(true);
      try {
        await fn();
        await aptosRefetch();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg.includes("rejected") ? "Transaction rejected" : msg.slice(0, 150));
      } finally {
        setTxPending(false);
      }
    };

    return (
      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex gap-6">
          <div className="flex-1 space-y-6">
            {/* Player bar */}
            <GlassCard className="flex items-center justify-between px-4 py-3" tint="yellow">
              <div className="flex items-center gap-3">
                <span className="inline-block w-2 h-2 rounded-full bg-[#00d2be] animate-pulse" />
                <span className="text-[#00d2be] text-sm font-bold uppercase tracking-wider">
                  Aptos Game #{idStr}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <GlassButton size="sm" variant="regular" onClick={() => router.push("/play")}>
                  Lobby
                </GlassButton>
              </div>
            </GlassCard>

            <GlassGameStatus
              phase={phaseName}
              round={ag.currentRound}
              maxRounds={4}
              gameId={gameId}
            />

            {/* Phase: Created — pick your case */}
            {aptosPhase === APTOS_PHASES.Created && (
              <div className="text-center space-y-6">
                <GlassCard className="p-6">
                  <p className="text-white/90 text-xl font-semibold">
                    Choose a briefcase to keep as yours
                  </p>
                </GlassCard>
                <GlassBriefcaseGrid columns={5}>
                  {[0, 1, 2, 3, 4].map((caseIndex) => (
                    <GlassBriefcase
                      key={caseIndex}
                      caseNumber={caseIndex}
                      opened={false}
                      playerCase={false}
                      disabled={txPending || aptosWrite.isPending}
                      onClick={() => handleAptosTx(() => aptosWrite.pickCase(Number(idStr), caseIndex))}
                    />
                  ))}
                </GlassBriefcaseGrid>
              </div>
            )}

            {/* Phase: Round — open cases */}
            {aptosPhase === APTOS_PHASES.Round && (
              <div className="flex gap-8 justify-center items-start">
                <ValueBoard eliminatedValues={aptosEliminatedValues} />
                <div className="flex-1 text-center space-y-4">
                  <GlassCard className="p-4">
                    <p className="text-white/60 text-sm mb-3">Choose a case to open</p>
                  </GlassCard>
                  <GlassBriefcaseGrid columns={5}>
                    {[0, 1, 2, 3, 4].map((caseIndex) => (
                      <GlassBriefcase
                        key={caseIndex}
                        caseNumber={caseIndex}
                        opened={ag.opened[caseIndex]}
                        playerCase={ag.playerCase === caseIndex}
                        value={ag.opened[caseIndex] ? ag.caseValues[caseIndex] : undefined}
                        disabled={ag.opened[caseIndex] || ag.playerCase === caseIndex || txPending}
                        onClick={!ag.opened[caseIndex] && ag.playerCase !== caseIndex
                          ? () => handleAptosTx(() => aptosWrite.openCase(Number(idStr), caseIndex))
                          : undefined}
                      />
                    ))}
                  </GlassBriefcaseGrid>
                </div>
              </div>
            )}

            {/* Phase: WaitingForReveal */}
            {aptosPhase === APTOS_PHASES.WaitingForReveal && (
              <VideoWait
                message="Revealing case value..."
                submessage="Aptos randomness is generating the reveal"
              />
            )}

            {/* Phase: BankerOffer */}
            {aptosPhase === APTOS_PHASES.BankerOffer && (
              <div className="text-center space-y-6">
                <ValueBoard eliminatedValues={aptosEliminatedValues} />
                <GlassBankerOffer
                  offer={ag.bankerOffer}
                  expectedValue={ag.bankerOffer}
                  round={ag.currentRound}
                  onDeal={() => handleAptosTx(() => aptosWrite.acceptDeal(Number(idStr)))}
                  onNoDeal={() => handleAptosTx(() => aptosWrite.rejectDeal(Number(idStr)))}
                  isOpen={true}
                  seed={gameId}
                />
              </div>
            )}

            {/* Phase: AwaitingOffer */}
            {aptosPhase === APTOS_PHASES.AwaitingOffer && (
              <div className="text-center space-y-4">
                <ValueBoard eliminatedValues={aptosEliminatedValues} />
                <div className="animate-pulse text-amber-300 font-medium">
                  Computing banker offer...
                </div>
              </div>
            )}

            {/* Phase: FinalRound */}
            {aptosPhase === APTOS_PHASES.FinalRound && (
              <div className="flex gap-8 justify-center items-start">
                <ValueBoard eliminatedValues={aptosEliminatedValues} />
                <div className="flex-1 text-center space-y-6">
                  <GlassCard className="p-6">
                    <p className="text-white/90 text-xl font-semibold mb-4">
                      Keep your case or swap?
                    </p>
                    <div className="flex gap-4 justify-center">
                      <GlassButton
                        variant="prominent"
                        tint="yellow"
                        onClick={() => handleAptosTx(() => aptosWrite.keepCase(Number(idStr)))}
                        disabled={txPending}
                      >
                        Keep Case #{ag.playerCase}
                      </GlassButton>
                      <GlassButton
                        variant="prominent"
                        tint="blue"
                        onClick={() => handleAptosTx(() => aptosWrite.swapCase(Number(idStr)))}
                        disabled={txPending}
                      >
                        Swap Case
                      </GlassButton>
                    </div>
                  </GlassCard>
                </div>
              </div>
            )}

            {/* Phase: GameOver */}
            {aptosPhase === APTOS_PHASES.GameOver && (
              <div className="text-center space-y-6">
                <GlassCard className="p-8 gold-glow">
                  <h2 className="text-3xl font-black text-yellow-400 mb-4">GAME OVER</h2>
                  <p className="text-white/80 text-lg">
                    Final Payout: <span className="text-yellow-400 font-bold">{centsToUsd(BigInt(ag.finalPayout))}</span>
                    <span className="text-white/30 text-sm ml-2">
                      ({ag.aptPerDollar > 0 ? octasToApt(Math.round(ag.finalPayout * ag.aptPerDollar / 100)) : "..."} APT)
                    </span>
                  </p>
                  <GlassButton
                    variant="prominent"
                    className="mt-6"
                    onClick={() => router.push("/play")}
                  >
                    Play Again
                  </GlassButton>
                </GlassCard>
              </div>
            )}

            {error && (
              <GlassCard className="p-3 bg-red-500/10 border-red-500/30">
                <p className="text-red-400 text-sm">{error}</p>
              </GlassCard>
            )}
            {(txPending || aptosWrite.isPending) && (
              <p className="text-amber-400 text-sm text-center animate-pulse">
                Transaction pending...
              </p>
            )}
          </div>

          {/* Sidebar */}
          <div className="hidden lg:flex flex-col gap-4 w-64 shrink-0">
            <GlassCard className="p-4 text-center">
              <p className="text-white/30 text-[10px] uppercase tracking-widest mb-1">Chain</p>
              <p className="text-2xl font-black text-[#00d2be]">Aptos</p>
            </GlassCard>
            <GlassCard className="p-4">
              <p className="text-white/40 text-xs uppercase tracking-wider mb-2 font-bold">Game Info</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/30">Player</span>
                  <span className="text-white/60 font-mono text-xs">
                    {ag.player.slice(0, 6)}...{ag.player.slice(-4)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/30">Cases Open</span>
                  <span className="text-white/60">{ag.totalCollapsed} / 5</span>
                </div>
                {ag.bankerOffer > 0 && (
                  <div className="flex justify-between">
                    <span className="text-white/30">Last Offer</span>
                    <span className="text-yellow-400 font-bold">{centsToUsd(BigInt(ag.bankerOffer))}</span>
                  </div>
                )}
              </div>
            </GlassCard>
          </div>
        </div>
      </main>
    );
  }

  if (isAptos && !aptosGameState) {
    return (
      <main className="min-h-[80vh] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin h-10 w-10 border-4 border-[#00d2be]/40 border-t-transparent rounded-full mx-auto" />
          <p className="text-white/60">Loading Aptos game #{idStr}...</p>
        </div>
      </main>
    );
  }

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

          {/* Video overlay for banker call / deal / no-deal */}
          {activeVideo && (
            <VideoPlayer
              videoUrl={activeVideo}
              onEnded={() => setActiveVideo(null)}
              showSkipButton={true}
            />
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
