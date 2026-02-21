"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { encodePacked, keccak256 } from "viem";
import { useAccount } from "wagmi";
import {
  CashCasePhase,
  GameTier,
  MAX_CASE_BY_TIER,
  NUM_CASES,
  PHASE_LABELS,
  TIER_LABELS,
} from "~~/contracts/CashCaseAbi";
import { useCashCaseRead, useCashCaseWrite } from "~~/hooks/useCashCaseContract";

// ─── Helpers ────────────────────────────────────────────────────────────────

function computeInitialCommitHash(caseIndex: number, salt: bigint): bigint {
  const hash = keccak256(encodePacked(["uint8", "uint256"], [caseIndex, salt]));
  return BigInt(hash);
}

// ─── Game Card ──────────────────────────────────────────────────────────────

function GameCard({ gameId }: { gameId: bigint }) {
  const { data: state } = useCashCaseRead({
    functionName: "getGameState",
    args: [gameId],
  });

  if (!state) return null;

  const [banker, , phase, tier] = state as unknown as [
    string,
    string,
    number,
    number,
    number,
    number,
    bigint,
    number,
    bigint,
    number,
  ];

  const phaseNum = Number(phase);
  const tierNum = Number(tier);

  return (
    <Link href={`/cashcase/${gameId.toString()}`}>
      <div className="card bg-base-200 hover:bg-base-300 transition-all cursor-pointer border border-base-300">
        <div className="card-body p-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold">Game #{gameId.toString()}</h3>
            <div className="badge badge-secondary badge-sm">{TIER_LABELS[tierNum] || "Unknown"}</div>
          </div>
          <div className="flex justify-between items-center mt-1">
            <span className="text-sm opacity-70">{PHASE_LABELS[phaseNum] || "Unknown"}</span>
            <span
              className={`badge badge-sm ${phaseNum === CashCasePhase.WaitingForPlayer ? "badge-success" : phaseNum === CashCasePhase.GameOver ? "badge-ghost" : "badge-warning"}`}
            >
              {phaseNum === CashCasePhase.WaitingForPlayer
                ? "Join Now"
                : phaseNum === CashCasePhase.GameOver
                  ? "Ended"
                  : "In Progress"}
            </span>
          </div>
          {banker !== "0x0000000000000000000000000000000000000000" && (
            <p className="text-xs opacity-50 truncate">Banker: {banker}</p>
          )}
        </div>
      </div>
    </Link>
  );
}

// ─── Create Game Panel ──────────────────────────────────────────────────────

function CreateGamePanel() {
  const { address } = useAccount();
  const { writeAsync, isPending } = useCashCaseWrite();
  const [tier, setTier] = useState<GameTier>(GameTier.STANDARD);

  const { data: ethUsdPrice } = useCashCaseRead({
    functionName: "getEthUsdPrice",
  });

  const usdToWei = useCallback(
    (usdCents: bigint) => {
      if (!ethUsdPrice) return 0n;
      return (usdCents * 10n ** 24n) / BigInt(ethUsdPrice as bigint);
    },
    [ethUsdPrice],
  );

  const maxCents = BigInt(MAX_CASE_BY_TIER[tier]);
  const deposit = (usdToWei(maxCents) * 10500n) / 10000n; // 5% slippage

  const handleCreate = async () => {
    try {
      await writeAsync({
        functionName: "createGame",
        args: [tier],
        value: deposit,
      });
    } catch (e: any) {
      console.error("Create game failed:", e.message);
    }
  };

  return (
    <div className="card bg-base-200 border border-secondary/30">
      <div className="card-body">
        <h2 className="card-title">🐱 Create a Brödinger&apos;s Case Game</h2>
        <p className="text-sm opacity-70">You&apos;ll be the banker. Deposit ETH covering the max case value.</p>

        <div className="form-control mt-3">
          <label className="label">
            <span className="label-text">Game Tier</span>
          </label>
          <select
            className="select select-bordered"
            value={tier}
            onChange={e => setTier(Number(e.target.value) as GameTier)}
          >
            {Object.entries(TIER_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>

        {ethUsdPrice && (
          <div className="text-sm mt-2 opacity-60">
            Deposit: ~{(Number(deposit) / 1e18).toFixed(6)} ETH (max case: ${(Number(maxCents) / 100).toFixed(2)})
          </div>
        )}

        <button className="btn btn-secondary btn-lg mt-4" onClick={handleCreate} disabled={isPending || !address}>
          {isPending ? "Creating..." : "Create Game as Banker"}
        </button>
      </div>
    </div>
  );
}

// ─── Join Game Panel ────────────────────────────────────────────────────────

function JoinGamePanel({ gameId }: { gameId: string }) {
  const { address } = useAccount();
  const { writeAsync, isPending } = useCashCaseWrite();
  const [selectedCase, setSelectedCase] = useState(0);
  const [salt] = useState(() => BigInt(Math.floor(Math.random() * 2 ** 48)));

  const { data: ethUsdPrice } = useCashCaseRead({ functionName: "getEthUsdPrice" });

  const entryFeeWei = useCallback(() => {
    if (!ethUsdPrice) return 0n;
    const feeCents = 100n; // $1 entry
    const wei = (feeCents * 10n ** 24n) / BigInt(ethUsdPrice as bigint);
    return (wei * 10500n) / 10000n; // 5% slippage
  }, [ethUsdPrice]);

  const handleJoin = async () => {
    try {
      const commitHash = computeInitialCommitHash(selectedCase, salt);
      await writeAsync({
        functionName: "joinGame",
        args: [BigInt(gameId), commitHash],
        value: entryFeeWei(),
      });
      // Save salt to localStorage so player can reveal later
      localStorage.setItem(`cashcase-${gameId}-salt`, salt.toString());
      localStorage.setItem(`cashcase-${gameId}-case`, selectedCase.toString());
    } catch (e: any) {
      console.error("Join failed:", e.message);
    }
  };

  return (
    <div className="card bg-base-200 border border-primary/30">
      <div className="card-body">
        <h2 className="card-title">Join Game #{gameId}</h2>
        <p className="text-sm opacity-70">Pick your case (0-11) and join as the player.</p>

        <div className="grid grid-cols-4 gap-2 mt-3">
          {Array.from({ length: NUM_CASES }, (_, i) => (
            <button
              key={i}
              className={`btn btn-sm ${selectedCase === i ? "btn-primary" : "btn-outline"}`}
              onClick={() => setSelectedCase(i)}
            >
              #{i}
            </button>
          ))}
        </div>

        <div className="text-xs opacity-50 mt-2">
          Salt: {salt.toString().slice(0, 12)}... (saved locally for reveal)
        </div>

        <button className="btn btn-primary btn-lg mt-3" onClick={handleJoin} disabled={isPending || !address}>
          {isPending ? "Joining..." : `Join (≈${(Number(entryFeeWei()) / 1e18).toFixed(6)} ETH)`}
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function CashCaseLobby() {
  const { data: nextGameId } = useCashCaseRead({
    functionName: "nextGameId",
  });

  const [joinGameId, setJoinGameId] = useState("");
  const totalGames = nextGameId ? Number(nextGameId as bigint) : 0;

  // Show last 10 games
  const gameIds = Array.from({ length: Math.min(totalGames, 10) }, (_, i) => BigInt(totalGames - 1 - i));

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-black">🐱 Brödinger&apos;s Case</h1>
        <p className="text-lg opacity-70 mt-2">Values don&apos;t exist until observed. Commit-reveal per round.</p>
        <p className="text-sm opacity-50">CashCase on Base Sepolia &middot; Chainlink VRF v2.5</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Left: Create */}
        <CreateGamePanel />

        {/* Right: Join */}
        <div className="space-y-4">
          <div className="card bg-base-200 border border-base-300">
            <div className="card-body">
              <h2 className="card-title">Join a Game</h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Game ID"
                  className="input input-bordered flex-1"
                  value={joinGameId}
                  onChange={e => setJoinGameId(e.target.value)}
                />
              </div>
              {joinGameId && <JoinGamePanel gameId={joinGameId} />}
            </div>
          </div>
        </div>
      </div>

      {/* Game List */}
      <div className="mt-10">
        <h2 className="text-2xl font-bold mb-4">Recent Games ({totalGames} total)</h2>
        {gameIds.length === 0 ? (
          <p className="opacity-50">No games yet. Create one!</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {gameIds.map(id => (
              <GameCard key={id.toString()} gameId={id} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
