"use client";

import dynamic from "next/dynamic";
import { type ReactNode } from "react";
import { Toaster } from "sonner";

const ApolloProvider = dynamic(
  () => import("@/components/providers/ApolloProvider"),
  { ssr: false }
);
const Web3Provider = dynamic(
  () => import("@/components/providers/Web3Provider"),
  { ssr: false }
);
const AptosWalletProvider = dynamic(
  () => import("@/components/aptos/AptosWalletProvider"),
  { ssr: false }
);
const Nav = dynamic(() => import("@/components/Nav"), { ssr: false });

// ChainProvider must be inside both wallet providers to detect connections
const ChainProviderDynamic = dynamic(
  () => import("@/contexts/ChainContext").then(mod => ({ default: mod.ChainProvider })),
  { ssr: false }
);

export default function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <ApolloProvider>
      <Web3Provider>
        <AptosWalletProvider>
          <ChainProviderDynamic>
            <Nav />
            {children}
            <Toaster position="top-right" theme="dark" />
          </ChainProviderDynamic>
        </AptosWalletProvider>
      </Web3Provider>
    </ApolloProvider>
  );
}
