"use client";

import dynamic from "next/dynamic";
import { type ReactNode } from "react";

const Web3Provider = dynamic(
  () => import("@/components/providers/Web3Provider"),
  { ssr: false }
);
const Nav = dynamic(() => import("@/components/Nav"), { ssr: false });

export default function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <Web3Provider>
      <Nav />
      {children}
    </Web3Provider>
  );
}
