"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useConnect, useBalance, usePublicClient, useSwitchChain } from "wagmi";
import { GlassCard, GlassButton } from "@/components/glass";
import { useNextGameId, useEntryFee } from "@/hooks/useGameContract";
import { useWriteContract } from "wagmi";
import { DEAL_OR_NOT_ABI } from "@/lib/abi";
import { CONTRACT_ADDRESS, CHAIN_ID } from "@/lib/config";
import { isSpokeChain } from "@/lib/chains";
import CrossChainJoin from "@/components/game/CrossChainJoin";
import { useMyGames } from "@/hooks/useMyGames";
import { PHASE_NAMES } from "@/types/game";
import { useChainContext } from "@/contexts/ChainContext";
import { useAptosEntryFee, useAptosGameWrite, useAptosNextGameId, octasToApt } from "@/hooks/aptos/useAptosGame";
import { APTOS_PHASE_NAMES } from "@/lib/aptos/config";

export default function PlayLobby() {
  const router = useRouter();
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect } = useConnect();
  const { switchChain } = useSwitchChain();
  const { data: balance } = useBalance({ address });
  const publicClient = usePublicClient();
  const { nextGameId } = useNextGameId();
  const { baseWei, withSlippage: entryFeeWei } = useEntryFee();
  const { writeContractAsync } = useWriteContract();
  const isWrongChain = isConnected && chainId !== CHAIN_ID;
  const { games: myGames } = useMyGames();

  // Aptos
  const { isAptos, isConnected: chainConnected } = useChainContext();
  const aptosFee = useAptosEntryFee();
  const { nextGameId: aptosNextGameId } = useAptosNextGameId();
  const { createGame: aptosCreateGame, isPending: aptosTxPending } = useAptosGameWrite();

  const [joinInput, setJoinInput] = useState("");
  const [txPending, setTxPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entryFeeEth = baseWei ? (Number(baseWei) / 1e18).toFixed(6) : "...";

  const handleCreateGame = async () => {
    setError(null);
    setTxPending(true);
    try {
      const currentNextId = nextGameId ?? 0n;
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: DEAL_OR_NOT_ABI,
        functionName: "createGame",
        value: entryFeeWei,
      });
      // Navigate immediately — the game page will poll for VRF
      router.push(`/play/${currentNextId.toString()}`);
      // Wait for receipt in background
      if (publicClient) {
        publicClient.waitForTransactionReceipt({ hash }).catch(() => {});
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("User rejected") || msg.includes("user rejected")) {
        setError("Transaction rejected");
      } else {
        setError(msg.slice(0, 150) || "Transaction failed");
      }
      setTxPending(false);
    }
  };

  const handleJoinGame = () => {
    if (joinInput) router.push(`/play/${joinInput}`);
  };

  const handleAptosCreateGame = async () => {
    setError(null);
    setTxPending(true);
    try {
      // Read next game ID before creation so we know where to navigate
      const gameIdToNavigate = aptosNextGameId ?? 0;
      await aptosCreateGame();
      router.push(`/play/${gameIdToNavigate}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("rejected")) {
        setError("Transaction rejected");
      } else {
        setError(msg.slice(0, 150) || "Transaction failed");
      }
    } finally {
      setTxPending(false);
    }
  };

  // Aptos connected — show Aptos play UI
  if (isAptos) {
    const entryFeeApt = aptosFee ? octasToApt(aptosFee.baseOctas) : "...";
    return (
      <main className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="max-w-lg w-full text-center space-y-8">
          <div>
            <p className="text-[#00d2be]/40 text-xs uppercase tracking-[0.3em] mb-3 mt-8 font-bold">
              Aptos Testnet
            </p>
            <h1 className="text-5xl md:text-6xl font-black uppercase tracking-tight mb-3">
              <span className="gold-text">Play</span>
            </h1>
          </div>

          <GlassCard className="p-8 space-y-6 gold-glow">
            <div className="space-y-2">
              <p className="text-white/60 text-sm uppercase tracking-wider font-bold">Entry Fee</p>
              <div className="flex items-baseline justify-center gap-2">
                <span className="text-4xl font-black text-yellow-400">$0.25</span>
                <span className="text-white/30 text-sm">({entryFeeApt} APT)</span>
              </div>
              <p className="text-white/20 text-xs">
                Converted via Chainlink Price Feed on Aptos
              </p>
            </div>

            <button
              onClick={handleAptosCreateGame}
              disabled={txPending || aptosTxPending || !aptosFee}
              className="gold-pulse w-full py-5 text-xl font-black uppercase tracking-wider rounded-xl
                         bg-gradient-to-b from-yellow-400 via-yellow-500 to-yellow-700
                         text-yellow-950 hover:from-yellow-300 hover:to-yellow-600
                         transition-all duration-300 hover:scale-105 active:scale-95
                         shadow-[0_0_30px_rgba(255,215,0,0.3)]
                         disabled:opacity-50 disabled:hover:scale-100"
            >
              {txPending || aptosTxPending ? "Creating Game..." : "New Game on Aptos"}
            </button>

            {error && (
              <p className="text-red-400 text-sm bg-red-900/20 border border-red-700/30 rounded-xl p-3">
                {error}
              </p>
            )}
          </GlassCard>

          <p className="text-white/20 text-xs italic">
            &ldquo;5 cases. 4 rounds. 1 AI Banker with 0 feelings.&rdquo;
          </p>
        </div>
      </main>
    );
  }

  if (!isConnected) {
    return (
      <main className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-8">
          <div>
            <p className="text-yellow-500/40 text-xs uppercase tracking-[0.3em] mb-3 font-bold">
              Step Right Up
            </p>
            <h1 className="text-5xl md:text-6xl font-black uppercase tracking-tight mb-3">
              <span className="gold-text">Play</span>
            </h1>
            <p className="text-white/40 text-sm">
              Connect your wallet to enter the stage.
            </p>
          </div>

          <GlassCard className="p-8 space-y-6 gold-glow">
            <p className="text-white/30 text-sm italic">
              The Banker is watching. He has no feelings and infinite patience.
            </p>
            <button
              onClick={() => connect({ connector: connectors[0] })}
              className="gold-pulse w-full py-4 text-lg font-black uppercase tracking-wider rounded-xl
                         bg-gradient-to-b from-yellow-400 via-yellow-500 to-yellow-700
                         text-yellow-950 hover:from-yellow-300 hover:to-yellow-600
                         transition-all duration-300 hover:scale-105 active:scale-95
                         shadow-[0_0_30px_rgba(255,215,0,0.3)]"
            >
              Connect Wallet
            </button>
          </GlassCard>

          <div className="text-white/30 text-sm">or join a game in progress</div>
          <div className="flex gap-2 max-w-xs mx-auto">
            <input
              type="number"
              placeholder="Game ID"
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleJoinGame()}
              className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:border-white/40 focus:outline-none backdrop-blur-md"
            />
            <GlassButton variant="strong" onClick={handleJoinGame}>
              Join
            </GlassButton>
          </div>
        </div>
      </main>
    );
  }

  // Cross-chain: connected on Sepolia
  if (isWrongChain && chainId && isSpokeChain(chainId)) {
    const bridgeGameId = nextGameId !== undefined ? Number(nextGameId) : undefined;
    return (
      <main className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="max-w-lg w-full text-center space-y-8">
          <div>
            <p className="text-yellow-500/40 text-xs uppercase tracking-[0.3em] mb-3 mt-8 font-bold">
              You&apos;re on ETH Sepolia
            </p>
            <h1 className="text-5xl md:text-6xl font-black uppercase tracking-tight mb-3">
              <span className="gold-text">Play</span>
            </h1>
          </div>

          {/* Primary action: switch to Base Sepolia (where gameplay happens) */}
          {myGames.length > 0 ? (
            <GlassCard className="p-6 space-y-4 gold-glow">
              <p className="text-white/60 text-xs uppercase tracking-wider font-bold">Your Active Games</p>
              {myGames.map((g) => (
                <button
                  key={g.gameId}
                  onClick={() => switchChain({ chainId: CHAIN_ID })}
                  className="w-full flex items-center justify-between p-4 rounded-lg bg-yellow-500/5 border border-yellow-500/20
                             hover:border-yellow-500/40 hover:bg-yellow-500/10 transition-all group"
                >
                  <span className="text-yellow-400 font-bold text-lg group-hover:text-yellow-300">Game #{g.gameId}</span>
                  <span className="text-white/50 text-sm">{PHASE_NAMES[g.phase]}</span>
                </button>
              ))}
              <button
                onClick={() => switchChain({ chainId: CHAIN_ID })}
                className="gold-pulse w-full py-4 text-lg font-black uppercase tracking-wider rounded-xl
                           bg-gradient-to-b from-yellow-400 via-yellow-500 to-yellow-700
                           text-yellow-950 hover:from-yellow-300 hover:to-yellow-600
                           transition-all duration-300 hover:scale-105 active:scale-95
                           shadow-[0_0_30px_rgba(255,215,0,0.3)]"
              >
                Switch to Base Sepolia & Play
              </button>
            </GlassCard>
          ) : (
            <GlassCard className="p-6 space-y-4 gold-glow">
              <p className="text-white/60 text-sm">
                Games run on Base Sepolia. Switch chains to play.
              </p>
              <button
                onClick={() => switchChain({ chainId: CHAIN_ID })}
                className="gold-pulse w-full py-4 text-lg font-black uppercase tracking-wider rounded-xl
                           bg-gradient-to-b from-yellow-400 via-yellow-500 to-yellow-700
                           text-yellow-950 hover:from-yellow-300 hover:to-yellow-600
                           transition-all duration-300 hover:scale-105 active:scale-95
                           shadow-[0_0_30px_rgba(255,215,0,0.3)]"
              >
                Switch to Base Sepolia
              </button>
            </GlassCard>
          )}

          {/* Secondary: CCIP bridge (advanced) */}
          <details className="text-left">
            <summary className="text-white/40 text-xs uppercase tracking-wider cursor-pointer hover:text-white/60 transition-colors text-center">
              Advanced: Create game via CCIP Bridge
            </summary>
            <div className="mt-4">
              <p className="text-white/30 text-xs text-center mb-3">
                Pay entry fee on Sepolia — CCIP relays to Base Sepolia (~2 min). You&apos;ll still need to switch chains to play.
              </p>
              <CrossChainJoin
                gameId={bridgeGameId}
                onSuccess={(gid) => {
                  switchChain({ chainId: CHAIN_ID });
                  router.push(`/play/${gid}`);
                }}
              />
            </div>
          </details>
        </div>
      </main>
    );
  }

  // Wrong chain (not Sepolia spoke)
  if (isWrongChain) {
    return (
      <main className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-6">
          <GlassCard className="p-8 space-y-6 border-red-500/30">
            <p className="text-red-400 text-xs uppercase tracking-widest font-bold">Wrong Chain</p>
            <p className="text-white/80 text-lg font-bold">
              The game show is on Base Sepolia.
            </p>
            <GlassButton
              variant="prominent"
              size="lg"
              className="w-full"
              onClick={() => switchChain({ chainId: CHAIN_ID })}
            >
              Switch to Base Sepolia
            </GlassButton>
          </GlassCard>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="max-w-lg w-full text-center space-y-8">
        <div>
          <p className="text-yellow-500/40 text-xs uppercase tracking-[0.3em] mb-3 mt-8 font-bold">
            The Stage Is Yours
          </p>
          <h1 className="text-5xl md:text-6xl font-black uppercase tracking-tight mb-3">
            <span className="gold-text">Play</span>
          </h1>
          <GlassCard className="p-3 inline-block">
            <p className="text-white/50 text-sm">
              {address && <span className="text-xs font-mono">{address.slice(0, 6)}...{address.slice(-4)}</span>}
              {balance && <span className="text-yellow-500/60"> &middot; {(Number(balance.value) / 1e18).toFixed(4)} ETH</span>}
            </p>
          </GlassCard>
        </div>

        {myGames.length > 0 && (
          <GlassCard className="p-6 space-y-3 gold-glow">
            <p className="text-white/60 text-xs uppercase tracking-wider font-bold">Your Active Games</p>
            {myGames.map((g) => (
              <button
                key={g.gameId}
                onClick={() => router.push(`/play/${g.gameId}`)}
                className="w-full flex items-center justify-between p-3 rounded-lg bg-white/5 border border-yellow-500/20
                           hover:border-yellow-500/40 hover:bg-yellow-500/5 transition-all group"
              >
                <span className="text-yellow-400 font-bold group-hover:text-yellow-300">Game #{g.gameId}</span>
                <span className="text-white/50 text-xs">{PHASE_NAMES[g.phase]} &middot; Round {g.currentRound + 1}</span>
              </button>
            ))}
          </GlassCard>
        )}

        <GlassCard className="p-8 space-y-6 gold-glow">
          {/* Entry fee display */}
          <div className="space-y-2">
            <p className="text-white/60 text-sm uppercase tracking-wider font-bold">Entry Fee</p>
            <div className="flex items-baseline justify-center gap-2">
              <span className="text-4xl font-black text-yellow-400">$0.25</span>
              <span className="text-white/30 text-sm">({entryFeeEth} ETH)</span>
            </div>
            <p className="text-white/20 text-xs">
              Converted via Chainlink Price Feed at game start
            </p>
          </div>

          <button
            onClick={handleCreateGame}
            disabled={txPending || !entryFeeWei}
            className="gold-pulse w-full py-5 text-xl font-black uppercase tracking-wider rounded-xl
                       bg-gradient-to-b from-yellow-400 via-yellow-500 to-yellow-700
                       text-yellow-950 hover:from-yellow-300 hover:to-yellow-600
                       transition-all duration-300 hover:scale-105 active:scale-95
                       shadow-[0_0_30px_rgba(255,215,0,0.3)]
                       disabled:opacity-50 disabled:hover:scale-100"
          >
            {txPending ? "Creating Game..." : "New Game"}
          </button>

          {error && (
            <p className="text-red-400 text-sm bg-red-900/20 border border-red-700/30 rounded-xl p-3">
              {error}
            </p>
          )}
        </GlassCard>

        <div className="text-white/30 text-sm">or join a game in progress</div>

        <div className="flex gap-3 max-w-sm mx-auto">
          <input
            type="number"
            placeholder="Game ID"
            value={joinInput}
            onChange={(e) => setJoinInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoinGame()}
            className="flex-1 bg-white/10 border border-white/20 rounded-xl px-5 py-4 text-white text-lg text-center font-bold
                       focus:border-yellow-500/50 focus:outline-none focus:ring-2 focus:ring-yellow-500/20
                       backdrop-blur-md placeholder:text-white/20"
          />
          <GlassButton variant="prominent" tint="blue" onClick={handleJoinGame}>
            Join
          </GlassButton>
        </div>

        <p className="text-white/20 text-xs italic">
          &ldquo;5 cases. 4 rounds. 1 AI Banker with 0 feelings.&rdquo;
        </p>
      </div>
    </main>
  );
}
