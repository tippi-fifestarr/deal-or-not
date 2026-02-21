"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { NextPage } from "next";
import { formatEther } from "viem";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

const DEAL_VIDEOS = [
  "https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&mute=1&controls=0&loop=1&playlist=dQw4w9WgXcQ",
  // Add your AI-generated "Deal or NOT!" videos here
];

type GameMode = "zk" | "brodinger";

// ─── Mode Selection Modal ────────────────────────────────────────────────────

const ModeModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const [selected, setSelected] = useState<GameMode | null>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-base-100 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto border border-base-300">
        {/* Header */}
        <div className="sticky top-0 bg-base-100/95 backdrop-blur-sm border-b border-base-300 px-6 py-4 flex items-center justify-between z-10 rounded-t-2xl">
          <div>
            <h2 className="text-2xl font-black">Choose Your Mode</h2>
            <p className="text-sm opacity-60">Same game, different cryptography</p>
          </div>
          <button className="btn btn-ghost btn-sm btn-circle text-lg" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Mode Cards */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* ZK Mode */}
          <div
            className={`card cursor-pointer transition-all duration-200 border-2 ${
              selected === "zk"
                ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                : "border-base-300 bg-base-200 hover:border-primary/50"
            }`}
            onClick={() => setSelected(selected === "zk" ? null : "zk")}
          >
            <div className="card-body p-5">
              <div className="flex items-center gap-3">
                <span className="text-4xl">🔐</span>
                <div>
                  <h3 className="font-bold text-lg">ZK Mode</h3>
                  <div className="flex gap-1 flex-wrap">
                    <div className="badge badge-primary badge-sm">Groth16 Proofs</div>
                    <div className="badge badge-success badge-sm">▶ Playable</div>
                  </div>
                </div>
              </div>
              <p className="text-sm opacity-80 mt-3">
                Host pre-assigns all 26 case values and commits a <strong>Merkle root</strong> onchain. ZK proofs verify
                every case reveal — no trust required.
              </p>
              <div className="text-xs opacity-50 italic mt-2">
                &quot;I committed to this beforehand — and I can prove it.&quot;
              </div>
            </div>
          </div>

          {/* Brodinger's Case */}
          <div
            className={`card cursor-pointer transition-all duration-200 border-2 ${
              selected === "brodinger"
                ? "border-secondary bg-secondary/10 ring-2 ring-secondary/30"
                : "border-base-300 bg-base-200 hover:border-secondary/50"
            }`}
            onClick={() => setSelected(selected === "brodinger" ? null : "brodinger")}
          >
            <div className="card-body p-5">
              <div className="flex items-center gap-3">
                <span className="text-4xl">🐱</span>
                <div>
                  <h3 className="font-bold text-lg">Br&ouml;dinger&apos;s Case</h3>
                  <div className="flex gap-1 flex-wrap">
                    <div className="badge badge-secondary badge-sm">Quantum Collapse</div>
                    <div className="badge badge-success badge-sm">Playable</div>
                  </div>
                </div>
              </div>
              <p className="text-sm opacity-80 mt-3">
                Values <strong>don&apos;t exist</strong> until a case is opened. Chainlink VRF + blockhash entropy means
                no one can know what&apos;s inside — not even the contract.
              </p>
              <div className="text-xs opacity-50 italic mt-2">
                &quot;No one could have known — not even the blockchain.&quot;
              </div>
            </div>
          </div>
        </div>

        {/* Expanded Detail Panel */}
        {selected && (
          <div className="px-6 pb-6">
            <div
              className={`rounded-xl p-5 border ${
                selected === "zk" ? "bg-primary/5 border-primary/20" : "bg-secondary/5 border-secondary/20"
              }`}
            >
              {selected === "zk" ? <ZKModeDetail /> : <BrodingerModeDetail />}
            </div>
          </div>
        )}

        {/* Action */}
        <div className="sticky bottom-0 bg-base-100/95 backdrop-blur-sm border-t border-base-300 px-6 py-4 flex justify-between items-center rounded-b-2xl">
          {selected === "zk" ? (
            <>
              <p className="text-xs opacity-50">ZK Mode is live on Base Sepolia — play now!</p>
              <Link href="/game">
                <button className="btn btn-lg btn-primary">🎮 Play ZK Mode</button>
              </Link>
            </>
          ) : selected === "brodinger" ? (
            <>
              <p className="text-xs opacity-50">
                Br&ouml;dinger&apos;s Case is live on Base Sepolia — Chainlink VRF + commit-reveal
              </p>
              <Link href="/cashcase">
                <button className="btn btn-lg btn-secondary">🐱 Play Br&ouml;dinger&apos;s Case</button>
              </Link>
            </>
          ) : (
            <p className="text-xs opacity-50 w-full text-center">Select a mode to see how it works</p>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── ZK Mode Detail ──────────────────────────────────────────────────────────

const ZKModeDetail = () => (
  <div>
    <h4 className="font-bold text-lg mb-3">🔐 How ZK Mode Works</h4>

    <div className="space-y-3 text-sm">
      <div className="flex gap-3">
        <div className="badge badge-primary badge-sm font-mono mt-0.5 shrink-0">1</div>
        <div>
          <p className="font-semibold">Host Creates the Game</p>
          <p className="opacity-70">
            The host assigns values to all 26 briefcases, salts each one, and builds a Merkle tree. Each leaf ={" "}
            <code className="bg-base-300 px-1 rounded text-xs">Poseidon(caseIndex, value, salt)</code>. The Merkle root
            is committed onchain — locking in all values.
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="badge badge-primary badge-sm font-mono mt-0.5 shrink-0">2</div>
        <div>
          <p className="font-semibold">Fair Lottery Entry</p>
          <p className="opacity-70">
            Players enter via commit-reveal lottery. You commit a hash of your secret, then reveal it. Combined entropy
            from all reveals selects the contestant — no one can manipulate the draw.
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="badge badge-primary badge-sm font-mono mt-0.5 shrink-0">3</div>
        <div>
          <p className="font-semibold">Open Cases with ZK Proofs</p>
          <p className="opacity-70">
            To open a case, the host generates a <strong>Groth16 ZK proof</strong> proving the value was in the original
            Merkle tree. The smart contract verifies the proof onchain — the host can&apos;t lie about what&apos;s
            inside.
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="badge badge-primary badge-sm font-mono mt-0.5 shrink-0">4</div>
        <div>
          <p className="font-semibold">Banker&apos;s Offer (Onchain Algorithm)</p>
          <p className="opacity-70">
            After each round, the <strong>BankerAlgorithm</strong> calculates an offer based on expected value, random
            variance (±5-12%), and context-aware psychology (are you on a streak?). Deal… or NOT?
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="badge badge-primary badge-sm font-mono mt-0.5 shrink-0">5</div>
        <div>
          <p className="font-semibold">Collect Your Winnings + NFT</p>
          <p className="opacity-70">
            Accept the deal or go all the way. Each opened case mints a <strong>BriefcaseNFT</strong> with onchain SVG.
            Hold the top case through all 10 rounds → win the progressive jackpot!
          </p>
        </div>
      </div>
    </div>

    <div className="mt-4 flex flex-wrap gap-2 text-xs">
      <span className="badge badge-outline">Poseidon Hash</span>
      <span className="badge badge-outline">Merkle Tree (depth 5)</span>
      <span className="badge badge-outline">Circom 2.1 Circuit</span>
      <span className="badge badge-outline">Groth16 Onchain Verification</span>
      <span className="badge badge-outline">EIP-1167 Clones</span>
      <span className="badge badge-outline">BriefcaseNFT (ERC-721)</span>
    </div>
  </div>
);

// ─── Brodinger's Case Detail ───────────────────────────────────────────────

const BrodingerModeDetail = () => (
  <div>
    <h4 className="font-bold text-lg mb-3">🐱 How Br&ouml;dinger&apos;s Case Works</h4>

    <div className="space-y-3 text-sm">
      <div className="flex gap-3">
        <div className="badge badge-secondary badge-sm font-mono mt-0.5 shrink-0">1</div>
        <div>
          <p className="font-semibold">Banker Creates the Game</p>
          <p className="opacity-70">
            A real human banker deposits ETH into the prize pool and selects a game tier (Micro: $0.01–$5, Standard:
            $0.01–$10, High: $0.10–$50). Values are denominated in
            <strong> real USD</strong> via Chainlink Price Feed.
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="badge badge-secondary badge-sm font-mono mt-0.5 shrink-0">2</div>
        <div>
          <p className="font-semibold">VRF Seed — The Quantum Source</p>
          <p className="opacity-70">
            Chainlink VRF v2.5 delivers a provably random seed to the contract. This seed is the foundation — but case
            values <em>still don&apos;t exist yet</em>. They&apos;re in superposition.
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="badge badge-secondary badge-sm font-mono mt-0.5 shrink-0">3</div>
        <div>
          <p className="font-semibold">Commit-Reveal Per Round</p>
          <p className="opacity-70">
            The player commits which cases to open (hash of indices + salt). After waiting one block, the{" "}
            <strong>blockhash</strong> from the commit block becomes the entropy source. No MEV bots can precompute the
            result.
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="badge badge-secondary badge-sm font-mono mt-0.5 shrink-0">4</div>
        <div>
          <p className="font-semibold">Quantum Collapse</p>
          <p className="opacity-70">
            On reveal, each case &quot;collapses&quot; into a value:
            <code className="bg-base-300 px-1 rounded text-xs ml-1">
              hash(vrfSeed, caseIndex, totalOpened, blockhash) % remainingPool
            </code>
            . Values are picked from the remaining pool — truly random, truly fair.
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="badge badge-secondary badge-sm font-mono mt-0.5 shrink-0">5</div>
        <div>
          <p className="font-semibold">Human Banker Makes an Offer</p>
          <p className="opacity-70">
            Unlike ZK Mode&apos;s algorithm, the banker is a <strong>real person</strong> with skin in the game. They
            deposited the prize pool and get back whatever the player doesn&apos;t win. The onchain calculator helps,
            but the banker decides. Deal… or NOT?
          </p>
        </div>
      </div>
    </div>

    <div className="mt-4 flex flex-wrap gap-2 text-xs">
      <span className="badge badge-outline">Chainlink VRF v2.5</span>
      <span className="badge badge-outline">Chainlink Price Feed</span>
      <span className="badge badge-outline">Commit-Reveal</span>
      <span className="badge badge-outline">Blockhash Entropy</span>
      <span className="badge badge-outline">USD-Denominated</span>
      <span className="badge badge-outline">Human Banker</span>
    </div>
  </div>
);

// ─── Main Page ───────────────────────────────────────────────────────────────

const Home: NextPage = () => {
  const [showVideo, setShowVideo] = useState(false);
  const [showModeModal, setShowModeModal] = useState(false);

  const closeModeModal = useCallback(() => setShowModeModal(false), []);

  const { data: jackpotPool } = useScaffoldReadContract({
    contractName: "DealOrNoDealFactory",
    functionName: "jackpotPool",
  });

  const pool = jackpotPool ?? 0n;

  return (
    <div className="flex items-center flex-col grow">
      {/* Hero Section */}
      <div className="w-full bg-gradient-to-b from-base-300 to-base-100 pt-16 pb-12 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="text-7xl mb-4">💼</div>
          <h1 className="text-5xl md:text-6xl font-black mb-3 tracking-tight">Deal or NOT!</h1>
          <p className="text-2xl md:text-3xl font-semibold opacity-90 mb-1">Cash Case</p>
          <p className="text-lg opacity-60 mb-8">
            Two modes. Two cryptographic approaches. One fully onchain game show.
          </p>

          {/* Jackpot Banner */}
          <div
            className="inline-block rounded-2xl px-8 py-4 mb-8 shadow-lg"
            style={{
              background: "linear-gradient(135deg, #b8860b 0%, #ffd700 50%, #b8860b 100%)",
            }}
          >
            <div className="text-sm font-bold text-black/70 uppercase tracking-widest">Progressive Jackpot</div>
            <div className="text-3xl font-mono font-black text-black">
              {pool > 0n ? `${parseFloat(formatEther(pool)).toFixed(4)} ETH` : "Building..."}
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="flex justify-center gap-4 flex-wrap">
            <button className="btn btn-primary btn-lg shadow-lg" onClick={() => setShowModeModal(true)}>
              🎮 Play Now
            </button>
            <Link href="/browse">
              <button className="btn btn-outline btn-lg">📋 Browse Games</button>
            </Link>
          </div>
        </div>
      </div>

      {/* Mode Preview Cards (non-clunky — just teasers that open the modal) */}
      <div className="w-full max-w-5xl px-4 -mt-6 z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            className="card bg-base-200 shadow-lg cursor-pointer hover:shadow-xl hover:scale-[1.01] transition-all border border-base-300 hover:border-primary/50"
            onClick={() => setShowModeModal(true)}
          >
            <div className="card-body p-5 flex-row items-center gap-4">
              <span className="text-4xl">🔐</span>
              <div className="flex-1">
                <h3 className="font-bold">ZK Mode</h3>
                <p className="text-sm opacity-60">Groth16 proofs verify every case reveal</p>
              </div>
              <span className="text-xl opacity-40">→</span>
            </div>
          </div>

          <div
            className="card bg-base-200 shadow-lg cursor-pointer hover:shadow-xl hover:scale-[1.01] transition-all border border-base-300 hover:border-secondary/50"
            onClick={() => setShowModeModal(true)}
          >
            <div className="card-body p-5 flex-row items-center gap-4">
              <span className="text-4xl">🐱</span>
              <div className="flex-1">
                <h3 className="font-bold">Br&ouml;dinger&apos;s Case</h3>
                <p className="text-sm opacity-60">Quantum collapse — values don&apos;t exist until opened</p>
              </div>
              <span className="text-xl opacity-40">→</span>
            </div>
          </div>
        </div>
      </div>

      {/* Deal or NOT Video Section */}
      <div className="w-full max-w-4xl px-4 mt-12 mb-8">
        <div className="text-center mb-4">
          <h2 className="text-2xl font-bold">🎬 Deal or NOT!</h2>
          <p className="text-sm opacity-60">AI-generated moments of pure drama</p>
        </div>

        <div className="card bg-base-200 shadow-xl overflow-hidden">
          {showVideo ? (
            <div className="aspect-video">
              <iframe
                src={DEAL_VIDEOS[Math.floor(Math.random() * DEAL_VIDEOS.length)]}
                className="w-full h-full"
                allow="autoplay; encrypted-media"
                allowFullScreen
                title="Deal or NOT!"
              />
            </div>
          ) : (
            <div
              className="aspect-video bg-gradient-to-br from-base-300 to-base-200 flex flex-col items-center justify-center cursor-pointer group"
              onClick={() => setShowVideo(true)}
            >
              <div className="text-6xl mb-4 group-hover:scale-110 transition-transform">▶️</div>
              <p className="text-lg font-bold">Watch a Random &quot;Deal or NOT!&quot; Clip</p>
              <p className="text-sm opacity-50">Sponsored by AI</p>
            </div>
          )}
          {showVideo && (
            <div className="p-3 flex justify-between items-center">
              <span className="text-sm opacity-60">🤖 AI-generated content</span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setShowVideo(false);
                  setTimeout(() => setShowVideo(true), 100);
                }}
              >
                🎲 Random Video
              </button>
            </div>
          )}
        </div>
      </div>

      {/* How to Play — General Steps */}
      <div className="w-full max-w-4xl px-4 mb-8">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold">How to Play</h2>
          <p className="text-sm opacity-60">The classic game show, fully onchain</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StepCard
            step={1}
            emoji="🎰"
            title="Enter the Lottery"
            description="Join a game by committing a secret hash. Commit-reveal ensures a fair, unmanipulable draw."
          />
          <StepCard
            step={2}
            emoji="🏆"
            title="Winner Selected"
            description="All players reveal their secrets. Combined entropy selects the contestant — no one controls the outcome."
          />
          <StepCard
            step={3}
            emoji="💼"
            title="Pick Your Case"
            description="Choose one of 26 briefcases to keep. Each hides a prize from pennies to the jackpot."
          />
          <StepCard
            step={4}
            emoji="📂"
            title="Open Cases Each Round"
            description="Open 6 → 5 → 4 → 3 → 2 → 1 → 1 → 1 → 1 → 1 cases per round, eliminating values as you go."
          />
          <StepCard
            step={5}
            emoji="🏦"
            title="Banker's Offer"
            description="After each round, the banker makes an offer based on expected value. It goes up as the game progresses."
          />
          <StepCard
            step={6}
            emoji="⚡"
            title="DEAL… or NOT?"
            description="Accept the offer and walk away, or reject it and keep playing. Risk everything for the big case!"
          />
        </div>
      </div>

      {/* How Each Mode Differs */}
      <div className="w-full max-w-4xl px-4 mb-12">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold">Two Cryptographic Approaches</h2>
          <p className="text-sm opacity-60">Same game flow, different trust models</p>
        </div>

        <div className="overflow-x-auto">
          <table className="table table-zebra w-full text-sm">
            <thead>
              <tr>
                <th></th>
                <th>🔐 ZK Mode</th>
                <th>🐱 Br&ouml;dinger&apos;s Case</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-semibold">Case Values</td>
                <td>Pre-assigned at game creation</td>
                <td>Don&apos;t exist until opened</td>
              </tr>
              <tr>
                <td className="font-semibold">Fairness Proof</td>
                <td>Groth16 ZK proof per case</td>
                <td>VRF seed + blockhash entropy</td>
              </tr>
              <tr>
                <td className="font-semibold">Trust Model</td>
                <td>&quot;I committed to this beforehand&quot;</td>
                <td>&quot;No one could have known&quot;</td>
              </tr>
              <tr>
                <td className="font-semibold">Banker</td>
                <td>Onchain algorithm (EV + variance + psychology)</td>
                <td>Real human with deposited stake</td>
              </tr>
              <tr>
                <td className="font-semibold">Value Unit</td>
                <td>ETH (wei)</td>
                <td>USD cents (via Chainlink Price Feed)</td>
              </tr>
              <tr>
                <td className="font-semibold">Contract Framework</td>
                <td>Foundry + Circom</td>
                <td>Hardhat + Chainlink VRF v2.5</td>
              </tr>
              <tr>
                <td className="font-semibold">Extras</td>
                <td>BriefcaseNFT, Progressive Jackpot</td>
                <td>Game Tiers, AI Agent Support</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="text-center mt-4">
          <button className="btn btn-outline btn-sm" onClick={() => setShowModeModal(true)}>
            Learn More About Each Mode →
          </button>
        </div>
      </div>

      {/* Tech Stack */}
      <div className="w-full bg-base-200 py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-6">Built With</h2>
          <div className="flex flex-wrap justify-center gap-3">
            {[
              "Solidity",
              "Foundry",
              "Hardhat",
              "Circom / Groth16",
              "Chainlink VRF",
              "Chainlink Price Feed",
              "Next.js",
              "Scaffold-ETH 2",
              "wagmi / viem",
              "Base Sepolia",
              "EIP-1167 Clones",
              "Poseidon Hash",
            ].map(tech => (
              <div key={tech} className="badge badge-lg badge-outline px-4 py-3">
                {tech}
              </div>
            ))}
          </div>
          <p className="text-center text-sm opacity-50 mt-4">ETHDenver 2026 — Built by ryan &amp; tippi fifestarr</p>
        </div>
      </div>

      {/* Mode Selection Modal */}
      <ModeModal open={showModeModal} onClose={closeModeModal} />
    </div>
  );
};

const StepCard = ({
  step,
  emoji,
  title,
  description,
}: {
  step: number;
  emoji: string;
  title: string;
  description: string;
}) => (
  <div className="card bg-base-200 shadow-lg hover:shadow-xl transition-shadow">
    <div className="card-body p-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="badge badge-primary badge-sm font-mono">{step}</div>
        <span className="text-2xl">{emoji}</span>
      </div>
      <h3 className="font-bold text-sm">{title}</h3>
      <p className="text-xs opacity-70">{description}</p>
    </div>
  </div>
);

export default Home;
