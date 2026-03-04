"use client";

import { useRef } from "react";
import GameBoard from "@/components/game/GameBoard";
import BestOfBanker from "@/components/BestOfBanker";
import { GlassCard, GlassButton } from "@/components/glass";

const CRYSTAL_CARDS = [
  {
    video: "/chainlink/money-sized.mp4",
    label: "Chainlink Price Feeds",
    copy: "Real-time ETH/USD pricing powers the Banker's offers. Every cent is on-chain. Every offer is verifiable.",
    closer: "The Banker's only honest friend.",
  },
  {
    video: "/chainlink/give-sized.mp4",
    label: "Sponsor Jackpot",
    copy: "Real ETH deposited by CRE cron workflow. Say 'No Deal' all the way and claim the pot. Automated. Trustless. Reckless.",
    closer: "Free money. Terms and conditions do NOT apply.",
  },
  {
    video: "/chainlink/trophy-sized.mp4",
    label: "AI Agent Arena",
    copy: "Autonomous bots compete on the leaderboard. Stake on winners. Watch robots make terrible financial decisions.",
    closer: "The AI uprising starts with a game show.",
  },
];

export default function Home() {
  const gameRef = useRef<HTMLDivElement>(null);

  const scrollToGame = () => {
    gameRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <main className="min-h-screen">
      {/* ── Hero Section ── */}
      <section className="relative px-4 pt-20 pb-16 text-center max-w-4xl mx-auto">
        <h1 className="text-6xl md:text-8xl font-bold tracking-tight mb-6">
          <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Deal or NOT
          </span>
        </h1>

        <p className="text-xl md:text-2xl text-white/80 mb-2 font-medium">
          5 Quantum Confidential Cases. 1 AI Banker. 0 Trust Required.
        </p>
        <p className="text-sm text-white/40 mb-8 italic">
          Your cases don&apos;t exist until you open them. It&apos;s NOT complicated.{" "}
          <span
            className="border-b border-dotted border-white/30 cursor-help"
            title="it is"
          >
            (it is)
          </span>
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <GlassButton
            variant="prominent"
            size="lg"
            tint="green"
            onClick={scrollToGame}
            className="text-xl px-10"
          >
            Play Now
          </GlassButton>
          <GlassButton
            variant="strong"
            size="md"
            onClick={scrollToGame}
          >
            Watch the Blockchain Think
          </GlassButton>
        </div>

        <p className="mt-12 text-xs text-white/30 uppercase tracking-widest">
          Powered by Liquid Glass UI &middot; Chainlink VRF &middot; CRE Confidential Compute
        </p>
      </section>

      {/* ── Chainlink Product Showcase ── */}
      <section className="px-4 py-16 max-w-6xl mx-auto">
        <h2 className="text-center text-2xl font-bold text-white/70 mb-2 uppercase tracking-wider">
          What Powers the Game
        </h2>
        <p className="text-center text-white/40 text-sm mb-12">
          Provably fair. Confidentially dumb. Powered by math you&apos;ll never read.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {CRYSTAL_CARDS.map((card) => (
            <CrystalCard key={card.label} {...card} />
          ))}
        </div>
      </section>

      {/* ── GameBoard Section ── */}
      <section ref={gameRef} className="px-4 py-8">
        <div className="max-w-4xl mx-auto mb-6 text-center">
          <h2 className="text-3xl font-bold text-white/80 mb-2">
            Step Up to the Stage
          </h2>
          <p className="text-white/40 text-sm">
            The cases are waiting. The Banker is watching.
          </p>
        </div>
        <GameBoard />
      </section>

      {/* ── Best of Banker ── */}
      <section className="px-4 py-8">
        <BestOfBanker />
      </section>
    </main>
  );
}

function CrystalCard({
  video,
  label,
  copy,
  closer,
}: {
  video: string;
  label: string;
  copy: string;
  closer: string;
}) {
  return (
    <GlassCard className="group relative overflow-hidden p-0 bg-[#00015E]/60 border-[#1a1a6e]/50 hover:scale-[1.03] transition-transform duration-300">
      {/* Video container */}
      <div className="relative h-48 bg-[#00015E] flex items-center justify-center overflow-hidden">
        <video
          src={video}
          muted
          loop
          playsInline
          className="w-full h-full object-contain scale-90 opacity-80 group-hover:opacity-100 group-hover:scale-100 transition-all duration-500"
          onMouseEnter={(e) => e.currentTarget.play()}
          onMouseLeave={(e) => {
            e.currentTarget.pause();
            e.currentTarget.currentTime = 0;
          }}
        />
        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#00015E] via-transparent to-transparent pointer-events-none" />
      </div>

      {/* Content */}
      <div className="p-6">
        <h3 className="text-lg font-bold text-white mb-2">{label}</h3>
        <p className="text-sm text-white/60 leading-relaxed mb-3">{copy}</p>
        <p className="text-xs text-white/40 italic">&ldquo;{closer}&rdquo;</p>
      </div>
    </GlassCard>
  );
}
