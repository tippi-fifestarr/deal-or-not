"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { GlassButton } from "@/components/glass";
import { cn } from "@/lib/glass";

const NAV_LINKS = [
  { href: "/", label: "Play" },
  { href: "/watch", label: "Watch" },
  { href: "/agents", label: "Agents" },
  { href: "/markets", label: "Markets" },
  { href: "/agents/register", label: "Register Agent" },
];

export default function Nav() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 bg-white/10 backdrop-blur-md border-b border-white/20 shadow-[0_4px_30px_rgba(0,0,0,0.3)]">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="text-xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Deal or NOT
          </span>
        </Link>

        {/* Center Links — Desktop */}
        <div className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((link) => {
            const isActive =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link key={link.href} href={link.href}>
                <GlassButton
                  size="sm"
                  variant={isActive ? "strong" : "regular"}
                  className={cn(
                    "text-sm",
                    isActive && "bg-white/20 border-white/40"
                  )}
                >
                  {link.label}
                </GlassButton>
              </Link>
            );
          })}
        </div>

        {/* Right: Wallet — Desktop */}
        <div className="hidden md:flex items-center gap-2">
          {isConnected ? (
            <>
              <span className="text-white/60 text-xs font-mono">
                {address?.slice(0, 6)}...{address?.slice(-4)}
              </span>
              <GlassButton
                size="sm"
                variant="regular"
                onClick={() => disconnect()}
              >
                Disconnect
              </GlassButton>
            </>
          ) : (
            <GlassButton
              size="sm"
              variant="prominent"
              onClick={() => connect({ connector: connectors[0] })}
            >
              Connect Wallet
            </GlassButton>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden text-white/80 hover:text-white p-2"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {mobileOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-white/10 bg-white/5 backdrop-blur-lg px-4 py-4 space-y-3">
          {NAV_LINKS.map((link) => {
            const isActive =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "block px-4 py-2 rounded-xl text-sm font-semibold transition-colors",
                  isActive
                    ? "bg-white/20 text-white"
                    : "text-white/60 hover:text-white hover:bg-white/10"
                )}
              >
                {link.label}
              </Link>
            );
          })}
          <div className="pt-2 border-t border-white/10">
            {isConnected ? (
              <div className="flex items-center justify-between">
                <span className="text-white/60 text-xs font-mono">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </span>
                <GlassButton
                  size="sm"
                  variant="regular"
                  onClick={() => {
                    disconnect();
                    setMobileOpen(false);
                  }}
                >
                  Disconnect
                </GlassButton>
              </div>
            ) : (
              <GlassButton
                size="sm"
                variant="prominent"
                className="w-full"
                onClick={() => {
                  connect({ connector: connectors[0] });
                  setMobileOpen(false);
                }}
              >
                Connect Wallet
              </GlassButton>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
