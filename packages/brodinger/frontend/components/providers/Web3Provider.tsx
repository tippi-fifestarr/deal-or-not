"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { type ReactNode, useState } from "react";
import { SUPPORTED_CHAINS } from "../../lib/chains";

const config = createConfig({
  chains: SUPPORTED_CHAINS,
  transports: {
    // Hardhat localhost
    31337: http("http://127.0.0.1:8545"),
    // Base Sepolia
    84532: http("https://sepolia.base.org"),
    // 0G Newton Testnet
    16602: http("https://evmrpc-testnet.0g.ai"),
    // ADI Chain
    36900: http("https://rpc.adifoundation.ai/"),
  },
});

export default function Web3Provider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}

export { config };
