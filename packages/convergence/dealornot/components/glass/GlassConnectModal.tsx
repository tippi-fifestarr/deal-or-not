"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { useConnect, useAccount, useDisconnect } from "wagmi";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { cn, getGlassClasses } from "@/lib/glass";
import { GlassButton } from "./GlassButton";
import { GlassCard } from "./GlassContainer";
import { useChainContext } from "@/contexts/ChainContext";
import RotatingAd from "@/components/RotatingAd";

const SNARKY_SUBTITLES = [
  "Pick wisely. The Banker doesn\u2019t care.",
  "One of these chains has your $0.25. Choose wrong and it\u2019s still $0.25.",
  "The Banker accepts all currencies. Especially yours.",
  "Your wallet, your rules. The Banker\u2019s offer, his rules.",
  "Two ecosystems. One game show. Zero financial advice.",
  "Connect now. Regret later. That\u2019s the Deal or NOT promise.",
  "The Banker is patient. Your gas fees are not.",
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

interface GlassConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GlassConnectModal({ isOpen, onClose }: GlassConnectModalProps) {
  const { connectors, connect } = useConnect();
  const { isConnected: evmConnected } = useAccount();
  const { disconnect: evmDisconnect } = useDisconnect();
  const {
    wallets: aptosWallets,
    connect: aptosConnect,
    disconnect: aptosDisconnect,
    connected: aptosConnected,
  } = useWallet();
  const { setPreferAptos, isAptos, isEvm } = useChainContext();

  const [subtitle, setSubtitle] = useState(
    () => SNARKY_SUBTITLES[Math.floor(Math.random() * SNARKY_SUBTITLES.length)]
  );

  // Rotate subtitle every 4 seconds while modal is open
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setSubtitle(SNARKY_SUBTITLES[Math.floor(Math.random() * SNARKY_SUBTITLES.length)]);
    }, 4000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Deduplicate connectors by name and filter out generic "Injected"
  const uniqueConnectors = connectors
    .filter((c, i, arr) => arr.findIndex((x) => x.name === c.name) === i)
    .filter((c) => c.name !== "Injected");

  const handleEvmConnect = (connector: (typeof connectors)[number]) => {
    connect({ connector });
    setPreferAptos(false);
    onClose();
  };

  const handleAptosConnect = (walletName: string) => {
    aptosConnect(walletName);
    setPreferAptos(true);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            className={cn(
              getGlassClasses("strong", "card", false),
              "relative max-w-2xl w-full p-6 md:p-8 space-y-6 crt-overlay"
            )}
            initial={{ scale: 0.8, y: 50, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.8, y: 50, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/40 text-white/60 hover:text-white transition-all duration-200"
              aria-label="Close"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Header */}
            <div className="text-center space-y-3">
              <div className="flex items-center justify-center gap-2">
                <SignalBars strength={4} />
                <span className="text-[10px] font-bold tracking-[0.3em] uppercase text-white/30">
                  Signal Acquired
                </span>
                <SignalBars strength={4} />
              </div>
              <h2 className="text-3xl md:text-4xl font-black gold-text glitch-text tracking-tight">
                CHOOSE YOUR CHAIN
              </h2>
              <motion.p
                key={subtitle}
                className="text-white/40 text-sm italic"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                &ldquo;{subtitle}&rdquo;
              </motion.p>
            </div>

            {/* Chain cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* EVM Column */}
              <GlassCard className="p-4 space-y-3" tint="blue">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="chain-badge chain-badge-base" style={{ fontSize: "0.6rem", padding: "2px 8px" }}>
                      <SignalBars strength={evmConnected ? 4 : 2} />
                      EVM
                    </span>
                  </div>
                  <span className="text-[9px] font-mono text-white/20 tracking-wider">
                    FREQ: 84532
                  </span>
                </div>

                {/* Chain labels */}
                <div className="flex gap-1.5">
                  <span className="chain-badge chain-badge-base" style={{ fontSize: "0.55rem", padding: "1px 6px" }}>
                    Base Sepolia
                  </span>
                  <span className="chain-badge chain-badge-eth" style={{ fontSize: "0.55rem", padding: "1px 6px" }}>
                    ETH Sepolia
                  </span>
                </div>

                {evmConnected && isEvm ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20">
                      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                      <span className="text-green-400 text-xs font-bold uppercase tracking-wider">Connected</span>
                    </div>
                    <GlassButton
                      variant="regular"
                      size="sm"
                      className="w-full"
                      onClick={() => { evmDisconnect(); }}
                    >
                      Disconnect
                    </GlassButton>
                  </div>
                ) : uniqueConnectors.length > 0 ? (
                  <div className="space-y-2">
                    {uniqueConnectors.map((connector) => (
                      <motion.button
                        key={connector.uid}
                        onClick={() => handleEvmConnect(connector)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg",
                          "bg-white/5 border border-white/10",
                          "hover:bg-blue-500/10 hover:border-blue-500/30",
                          "transition-all duration-200 group cursor-pointer"
                        )}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {connector.icon && (
                          <img
                            src={connector.icon}
                            alt=""
                            className="w-6 h-6 rounded-md"
                          />
                        )}
                        <span className="text-white/80 text-sm font-bold group-hover:text-white transition-colors">
                          {connector.name}
                        </span>
                      </motion.button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3 py-2">
                    <p className="text-white/30 text-xs text-center">
                      No EVM wallets detected
                    </p>
                    <a
                      href="https://metamask.io/download/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "block w-full text-center px-3 py-2.5 rounded-lg",
                        "bg-blue-500/10 border border-blue-500/20",
                        "text-blue-400/70 text-sm font-bold",
                        "hover:bg-blue-500/20 hover:border-blue-500/40 hover:text-blue-400",
                        "transition-all duration-200"
                      )}
                    >
                      Get MetaMask &rarr;
                    </a>
                  </div>
                )}
              </GlassCard>

              {/* Aptos Column */}
              <GlassCard
                className="p-4 space-y-3 bg-[#00d2be]/5 border-[#00d2be]/20"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="chain-badge chain-badge-aptos" style={{ fontSize: "0.6rem", padding: "2px 8px" }}>
                      <SignalBars strength={aptosConnected ? 4 : 2} />
                      APTOS
                    </span>
                  </div>
                  <span className="text-[9px] font-mono text-white/20 tracking-wider">
                    FREQ: APT-2
                  </span>
                </div>

                {/* Chain label */}
                <div className="flex gap-1.5">
                  <span className="chain-badge chain-badge-aptos" style={{ fontSize: "0.55rem", padding: "1px 6px" }}>
                    Aptos Testnet
                  </span>
                </div>

                {aptosConnected && isAptos ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20">
                      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                      <span className="text-green-400 text-xs font-bold uppercase tracking-wider">Connected</span>
                    </div>
                    <GlassButton
                      variant="regular"
                      size="sm"
                      className="w-full"
                      onClick={() => { aptosDisconnect(); setPreferAptos(false); }}
                    >
                      Disconnect
                    </GlassButton>
                  </div>
                ) : aptosWallets && aptosWallets.length > 0 ? (
                  <div className="space-y-2">
                    {aptosWallets.map((wallet) => (
                      <motion.button
                        key={wallet.name}
                        onClick={() => handleAptosConnect(wallet.name)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg",
                          "bg-white/5 border border-white/10",
                          "hover:bg-[#00d2be]/10 hover:border-[#00d2be]/30",
                          "transition-all duration-200 group cursor-pointer"
                        )}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {wallet.icon && (
                          <img
                            src={wallet.icon}
                            alt=""
                            className="w-6 h-6 rounded-md"
                          />
                        )}
                        <span className="text-white/80 text-sm font-bold group-hover:text-white transition-colors">
                          {wallet.name}
                        </span>
                      </motion.button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3 py-2">
                    <p className="text-white/30 text-xs text-center">
                      No Aptos wallets detected
                    </p>
                    <a
                      href="https://petra.app"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "block w-full text-center px-3 py-2.5 rounded-lg",
                        "bg-[#00d2be]/10 border border-[#00d2be]/20",
                        "text-[#00d2be]/70 text-sm font-bold",
                        "hover:bg-[#00d2be]/20 hover:border-[#00d2be]/40 hover:text-[#00d2be]",
                        "transition-all duration-200"
                      )}
                    >
                      Get Petra Wallet &rarr;
                    </a>
                  </div>
                )}

              </GlassCard>
            </div>

            {/* Commercial break */}
            <div className="pt-2">
              <RotatingAd variant="sidebar" />
            </div>

            {/* Footer disclaimer */}
            <p className="text-white/15 text-[9px] text-center tracking-wider uppercase">
              This wallet selection is not financial advice. Neither is anything else here.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
