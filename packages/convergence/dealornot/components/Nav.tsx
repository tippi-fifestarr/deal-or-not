"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useChainId } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { cn } from "@/lib/glass";
import { CHAIN_META } from "@/lib/chains";
import { baseSepolia } from "wagmi/chains";
import { useAccount } from "wagmi";
import { useEnsName } from "@/hooks/useEnsName";

const NAV_LINKS = [
  { href: "/play", label: "PLAY" },
  { href: "/agents", label: "AGENTS" },
  { href: "/watch", label: "WATCH" },
  { href: "/markets", label: "MARKETS" },
  { href: "/agents/register", label: "REGISTER" },
];

function SignalBars({ strength = 4 }: { strength?: number }) {
  return (
    <span className="signal-bars">
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="bar"
          style={{ opacity: i <= strength ? 1 : 0.2 }}
        />
      ))}
    </span>
  );
}

function LiveIndicator() {
  return (
    <span className="broadcast-live hidden lg:inline-flex">
      LIVE ON CHAIN
    </span>
  );
}

function ChainBadge({
  chainId,
  chainName,
}: {
  chainId: number;
  chainName: string;
}) {
  const isBase = chainId === baseSepolia.id;
  return (
    <span className={cn("chain-badge", isBase ? "chain-badge-base" : "chain-badge-eth")}>
      <SignalBars strength={4} />
      {chainName}
    </span>
  );
}

function WalletTerminal({
  address,
  displayBalance,
  displayName,
}: {
  address: string;
  displayBalance?: string;
  displayName?: string;
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-black/40 border border-[#39ff14]/20">
      <span className="hex-addr cursor-blink">
        {displayName ?? `${address.slice(0, 6)}...${address.slice(-4)}`}
      </span>
      {displayBalance && (
        <>
          <span className="text-white/20 text-xs">|</span>
          <span
            className="text-[0.7rem] font-bold tracking-wide text-[#00f0ff]"
            style={{ textShadow: "0 0 6px rgba(0,240,255,0.3)" }}
          >
            {displayBalance}
          </span>
        </>
      )}
    </div>
  );
}

export default function Nav() {
  const pathname = usePathname();
  const chainId = useChainId();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { address } = useAccount();
  const ensName = useEnsName(address);

  return (
    <nav className="sticky top-0 z-50 crt-overlay">
      {/* Nav background — dark terminal glass */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-xl border-b border-white/10" />
      {/* Green scan line accent at bottom edge */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#39ff14]/30 to-transparent" />

      <div className="relative max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        {/* Left: Logo + Live indicator */}
        <div className="flex items-center gap-3 shrink-0">
          <Link href="/" className="flex items-center gap-1 group">
            <span className="text-lg font-bold gold-text glitch-text tracking-tight">
              DEAL
              <span className="text-white/20 font-light italic mx-0.5 text-sm">or</span>
              NOT
            </span>
          </Link>
          <LiveIndicator />
        </div>

        {/* Center: Nav Links — Desktop */}
        <div className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((link) => {
            const isActive =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            const isWatch = link.href === "/watch";
            return (
              <Link key={link.href} href={link.href}>
                <button
                  className={cn(
                    "px-3 py-1.5 text-xs font-bold tracking-[0.08em] rounded-md transition-all duration-200",
                    "border border-transparent",
                    isWatch
                      ? cn(
                          "border-[#ff1744]/30 bg-[#ff1744]/10 text-[#ff1744]",
                          "hover:bg-[#ff1744]/20 hover:border-[#ff1744]/50",
                          isActive && "bg-[#ff1744]/20 border-[#ff1744]/50"
                        )
                      : isActive
                        ? "bg-white/15 border-white/30 text-white"
                        : "text-white/40 hover:text-white/70 hover:bg-white/5"
                  )}
                  style={isWatch ? { textShadow: "0 0 8px rgba(255,23,68,0.4)" } : undefined}
                >
                  {isWatch && <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#ff1744] mr-1.5 animate-pulse" />}
                  {link.label}
                </button>
              </Link>
            );
          })}
        </div>

        {/* Right: Chain + Wallet + GitHub — Desktop */}
        <div className="hidden md:flex items-center gap-2">
          <ConnectButton.Custom>
            {({
              account,
              chain,
              openChainModal,
              openConnectModal,
              openAccountModal,
              mounted,
            }) => {
              if (!mounted) return null;

              if (!account || !chain) {
                return (
                  <button
                    onClick={openConnectModal}
                    className={cn(
                      "px-4 py-1.5 text-xs font-bold tracking-[0.12em] uppercase rounded-md",
                      "border border-[#39ff14]/40 bg-[#39ff14]/10",
                      "text-[#39ff14] hover:bg-[#39ff14]/20 hover:border-[#39ff14]/60",
                      "transition-all duration-200",
                      "cursor-blink"
                    )}
                    style={{ textShadow: "0 0 8px rgba(57,255,20,0.4)" }}
                  >
                    CONNECT
                  </button>
                );
              }

              return (
                <div className="flex items-center gap-2">
                  {/* Chain selector */}
                  <button
                    onClick={openChainModal}
                    className="flex items-center gap-1.5 group cursor-pointer"
                  >
                    <ChainBadge
                      chainId={chain.id}
                      chainName={chain.name?.replace(" Sepolia", "") || "???"}
                    />
                    <svg
                      className="w-3 h-3 text-white/30 group-hover:text-white/60 transition-colors"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Wallet terminal display */}
                  <button onClick={openAccountModal} className="cursor-pointer">
                    <WalletTerminal
                      address={account.address}
                      displayBalance={account.displayBalance}
                      displayName={ensName}
                    />
                  </button>
                </div>
              );
            }}
          </ConnectButton.Custom>
          <a
            href="https://github.com/rdobbeck/deal-or-not"
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-md text-white/30 hover:text-white/70 hover:bg-white/5 transition-all"
            title="View on GitHub"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
          </a>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden text-white/60 hover:text-white p-2"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {mobileOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="relative md:hidden border-t border-white/5 bg-black/80 backdrop-blur-xl px-4 py-4 space-y-3">
          {NAV_LINKS.map((link) => {
            const isActive =
              link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "block px-4 py-2 rounded-lg text-xs font-bold tracking-[0.08em] transition-colors",
                  isActive
                    ? "bg-white/15 text-white"
                    : "text-white/40 hover:text-white hover:bg-white/5"
                )}
              >
                {link.label}
              </Link>
            );
          })}

          <a
            href="https://github.com/rdobbeck/deal-or-not"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold tracking-[0.08em] text-white/40 hover:text-white hover:bg-white/5 transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            GITHUB
          </a>

          {/* Mobile chain + wallet */}
          <div className="pt-3 border-t border-white/5 space-y-2">
            <ConnectButton.Custom>
              {({
                account,
                chain,
                openChainModal,
                openConnectModal,
                openAccountModal,
                mounted,
              }) => {
                if (!mounted) return null;
                if (!account || !chain) {
                  return (
                    <button
                      onClick={() => { openConnectModal(); setMobileOpen(false); }}
                      className={cn(
                        "w-full px-4 py-2 text-xs font-bold tracking-[0.12em] uppercase rounded-lg",
                        "border border-[#39ff14]/40 bg-[#39ff14]/10 text-[#39ff14]",
                        "hover:bg-[#39ff14]/20"
                      )}
                      style={{ textShadow: "0 0 8px rgba(57,255,20,0.4)" }}
                    >
                      CONNECT WALLET
                    </button>
                  );
                }
                return (
                  <div className="space-y-2">
                    <button onClick={openChainModal} className="w-full flex justify-between items-center">
                      <ChainBadge
                        chainId={chain.id}
                        chainName={chain.name?.replace(" Sepolia", "") || "???"}
                      />
                      <LiveIndicator />
                    </button>
                    <button onClick={openAccountModal} className="w-full">
                      <WalletTerminal
                        address={account.address}
                        displayBalance={account.displayBalance}
                        displayName={ensName}
                      />
                    </button>
                  </div>
                );
              }}
            </ConnectButton.Custom>
          </div>
        </div>
      )}
    </nav>
  );
}
