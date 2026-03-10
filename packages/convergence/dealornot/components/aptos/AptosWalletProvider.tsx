"use client";

import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import { Network } from "@aptos-labs/ts-sdk";
import { type ReactNode } from "react";
import { APTOS_NETWORK } from "@/lib/aptos/config";

const NETWORK_MAP = {
  mainnet: Network.MAINNET,
  testnet: Network.TESTNET,
  devnet: Network.DEVNET,
} as const;

export default function AptosWalletProvider({ children }: { children: ReactNode }) {
  return (
    <AptosWalletAdapterProvider
      autoConnect={true}
      dappConfig={{
        network: NETWORK_MAP[APTOS_NETWORK],
      }}
      onError={(error) => {
        console.warn("Aptos wallet error:", error);
      }}
    >
      {children}
    </AptosWalletAdapterProvider>
  );
}
