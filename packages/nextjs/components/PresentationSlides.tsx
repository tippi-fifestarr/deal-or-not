"use client";

import { useState, useEffect, useCallback } from "react";

interface Slide {
  title: string;
  subtitle?: string;
  emoji?: string;
  bullets?: string[];
  footer?: string;
  highlight?: string;
}

const SLIDES: Slide[] = [
  {
    emoji: "💼",
    title: "Deal or NOT!",
    subtitle: "Cash Case",
    bullets: [
      "Fully onchain Deal or No Deal",
      "Two cryptographic game modes",
      "AI agents that play autonomously",
      "ETHDenver 2026",
    ],
    footer: "Built by ryan & tippi fifestarr",
  },
  {
    emoji: "🤔",
    title: "The Problem",
    subtitle: "Why build this?",
    bullets: [
      "Traditional game shows require trust in producers",
      "Online games use server-side RNG — players can't verify fairness",
      "No way to prove the briefcase values weren't rigged",
      "What if the game itself was the smart contract?",
    ],
    highlight: "Trustless entertainment, onchain.",
  },
  {
    emoji: "🎮",
    title: "Two Modes, One Game",
    subtitle: "Choose your cryptography",
    bullets: [
      "🔐 ZK Mode — Groth16 proofs verify pre-committed case values",
      "🐱 Brodinger's Case — Values collapse from VRF seed at open time",
      "Both are provably fair, but use fundamentally different approaches",
      "Players pick their mode before entering — great for teaching ZK vs commit-reveal",
    ],
    highlight: "Same game. Different trust models.",
  },
  {
    emoji: "🔐",
    title: "ZK Mode",
    subtitle: "Groth16 Zero-Knowledge Proofs",
    bullets: [
      "Host pre-assigns 26 case values, commits Merkle root onchain",
      "leaf = Poseidon(caseIndex, value, salt) → Merkle tree depth 5",
      "Each case reveal requires a valid Groth16 proof",
      "Verifier contract checks proof onchain — no trust required",
      "Built with Circom + snarkjs + onchain Groth16Verifier",
    ],
    footer: "The host can't cheat. Math guarantees it.",
  },
  {
    emoji: "🐱",
    title: "Brodinger's Case",
    subtitle: "Schrödinger meets Chainlink VRF",
    bullets: [
      "Case values don't exist until opened — quantum collapse!",
      "Single Chainlink VRF v2.5 seed determines all values",
      "value = keccak256(vrfSeed, caseIndex, totalOpened, blockhash)",
      "Opening order changes outcomes — same seed, different game",
      "Commit-reveal per round prevents front-running",
    ],
    footer: "The universe decides when you look.",
  },
  {
    emoji: "🤖",
    title: "AI Agent System",
    subtitle: "Autonomous onchain players",
    bullets: [
      "AgentRegistry.sol — register agents with strategy URIs onchain",
      "4 built-in strategies: Aggressive, Conservative, Value, Random",
      "Optional GPT-4 integration for LLM-driven decisions",
      "Agents play autonomously: join games, open cases, decide deals",
      "Onchain leaderboard tracks profit/loss per agent",
    ],
    highlight: "An AI agent enters the lottery via CLI. Browser + Incognito + Claude = live demo.",
  },
  {
    emoji: "🏦",
    title: "The Onchain Banker",
    subtitle: "Show-accurate algorithm in Solidity",
    bullets: [
      "BankerAlgorithm.sol — pure library, no state",
      "Low-balls early (27% EV), approaches fair value (95% EV) final rounds",
      "Random variance ±5% so offers feel unpredictable",
      "Context adjustments: high-value boards → stingier, low-value → generous",
      "EV analysis + deal quality scoring in real-time on the frontend",
    ],
    footer: "The banker is math. Always watching. Never emotional.",
  },
  {
    emoji: "🧱",
    title: "Tech Stack",
    subtitle: "Architecture & tooling",
    bullets: [
      "Smart Contracts: Solidity 0.8.24, Foundry + Hardhat",
      "ZK: Circom, snarkjs, Groth16 verifier",
      "Randomness: Chainlink VRF v2.5 (subscription model)",
      "Price Oracle: Chainlink ETH/USD Price Feed",
      "Frontend: Next.js 15, React, Tailwind, wagmi, viem",
      "Factory: EIP-1167 minimal proxy clones for gas-efficient game creation",
    ],
    highlight: "Deployed on Base Sepolia. Testable locally with Foundry & Hardhat.",
  },
  {
    emoji: "🎲",
    title: "How to Play",
    subtitle: "The full game loop",
    bullets: [
      "1. Host creates game → factory deploys a clone",
      "2. Players enter commit-reveal lottery (min 2 players)",
      "3. Winner picks their briefcase",
      "4. Open cases round by round → banker makes offers",
      "5. Deal… or NOT? Accept the offer or keep going",
      "6. Final round: keep your case or swap",
      "7. NFT minted with your result (sealed until reveal)",
    ],
    footer: "3 wallets to demo: browser, incognito, and an AI agent on the CLI.",
  },
  {
    emoji: "👨‍👩‍👦‍👦",
    title: "The Team",
    subtitle: "ryan & tippi fifestarr",
    bullets: [
      "Ryan — fitness coach turned Solidity dev. Locked in all day from home and shipped ZK mode, the banker algorithm, and factory contracts.",
      "Tippi — ETHDenver '24 BUIDLathon MetaSteward. Was too busy working to hack last time. This year he's hacking. Built the AI agent system, Schrödinger's Case with Chainlink VRF, and cross-chain CCIP betting.",
      "Built at ETHDenver 2026 in 36 hours.",
      "Pair-programmed with Claude (who also enters the lottery as Player 3).",
    ],
    highlight: "github.com/rdobbeck · github.com/fifestarr",
  },
];

export const PresentationSlides = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  const [currentSlide, setCurrentSlide] = useState(0);

  const next = useCallback(() => {
    setCurrentSlide((s) => Math.min(s + 1, SLIDES.length - 1));
  }, []);

  const prev = useCallback(() => {
    setCurrentSlide((s) => Math.max(s - 1, 0));
  }, []);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        next();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose, next, prev]);

  // Reset to slide 0 when opened
  useEffect(() => {
    if (open) setCurrentSlide(0);
  }, [open]);

  if (!open) return null;

  const slide = SLIDES[currentSlide];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Slide container */}
      <div className="relative z-10 w-full max-w-4xl mx-4 aspect-[16/10] bg-gradient-to-br from-base-300 to-base-100 rounded-2xl shadow-2xl border border-primary/20 flex flex-col overflow-hidden">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 btn btn-sm btn-circle btn-ghost text-lg z-20"
        >
          ✕
        </button>

        {/* Slide number */}
        <div className="absolute top-4 left-4 text-xs opacity-40 font-mono z-20">
          {currentSlide + 1} / {SLIDES.length}
        </div>

        {/* Slide content */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 md:px-16 py-8 text-center">
          {slide.emoji && (
            <div className="text-5xl md:text-6xl mb-4 animate-bounce">
              {slide.emoji}
            </div>
          )}
          <h2 className="text-3xl md:text-5xl font-black mb-2 tracking-tight">
            {slide.title}
          </h2>
          {slide.subtitle && (
            <p className="text-lg md:text-xl opacity-70 mb-6 font-medium">
              {slide.subtitle}
            </p>
          )}
          {slide.bullets && (
            <ul className="text-left space-y-2 max-w-2xl w-full">
              {slide.bullets.map((bullet, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm md:text-base opacity-80"
                >
                  <span className="text-primary mt-0.5 shrink-0">▸</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          )}
          {slide.highlight && (
            <div className="mt-6 px-4 py-2 bg-primary/10 border border-primary/30 rounded-lg text-primary text-sm md:text-base font-medium">
              {slide.highlight}
            </div>
          )}
          {slide.footer && (
            <p className="mt-6 text-xs md:text-sm opacity-40 italic">
              {slide.footer}
            </p>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-base-content/10">
          <button
            onClick={prev}
            disabled={currentSlide === 0}
            className="btn btn-sm btn-ghost gap-1 disabled:opacity-20"
          >
            ← Prev
          </button>

          {/* Dot indicators */}
          <div className="flex gap-1.5">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentSlide(i)}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === currentSlide
                    ? "bg-primary w-6"
                    : "bg-base-content/20 hover:bg-base-content/40"
                }`}
              />
            ))}
          </div>

          <button
            onClick={next}
            disabled={currentSlide === SLIDES.length - 1}
            className="btn btn-sm btn-ghost gap-1 disabled:opacity-20"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
};
