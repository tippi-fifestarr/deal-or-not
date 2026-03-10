"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useAccount } from "wagmi";
import { useWallet } from "@aptos-labs/wallet-adapter-react";

export type ActiveChain = "evm" | "aptos" | "none";

interface ChainContextValue {
  activeChain: ActiveChain;
  isAptos: boolean;
  isEvm: boolean;
  isConnected: boolean;
  // Switch preference (user explicitly chose Aptos/EVM)
  preferAptos: boolean;
  setPreferAptos: (v: boolean) => void;
}

const ChainContext = createContext<ChainContextValue>({
  activeChain: "none",
  isAptos: false,
  isEvm: false,
  isConnected: false,
  preferAptos: false,
  setPreferAptos: () => {},
});

export function ChainProvider({ children }: { children: ReactNode }) {
  const { isConnected: evmConnected } = useAccount();
  const { connected: aptosConnected } = useWallet();
  const [preferAptos, setPreferAptos] = useState(false);

  // Determine active chain:
  // - If user explicitly prefers Aptos and Aptos wallet is connected → aptos
  // - If EVM wallet is connected and not preferring Aptos → evm
  // - If only Aptos connected → aptos
  // - If only EVM connected → evm
  let activeChain: ActiveChain = "none";
  if (preferAptos && aptosConnected) {
    activeChain = "aptos";
  } else if (evmConnected && !preferAptos) {
    activeChain = "evm";
  } else if (aptosConnected) {
    activeChain = "aptos";
  } else if (evmConnected) {
    activeChain = "evm";
  }

  return (
    <ChainContext.Provider value={{
      activeChain,
      isAptos: activeChain === "aptos",
      isEvm: activeChain === "evm",
      isConnected: activeChain !== "none",
      preferAptos,
      setPreferAptos,
    }}>
      {children}
    </ChainContext.Provider>
  );
}

export function useChainContext() {
  return useContext(ChainContext);
}
