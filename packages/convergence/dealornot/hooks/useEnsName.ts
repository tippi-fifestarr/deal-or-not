"use client";

import { useState, useEffect } from "react";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: http(),
});

/**
 * Resolve ENS name from mainnet without adding mainnet to wagmi config.
 * Returns the ENS name or undefined.
 */
export function useEnsName(address: `0x${string}` | undefined) {
  const [ensName, setEnsName] = useState<string | undefined>();

  useEffect(() => {
    if (!address) { setEnsName(undefined); return; }

    let cancelled = false;
    mainnetClient.getEnsName({ address }).then((name) => {
      if (!cancelled) setEnsName(name ?? undefined);
    }).catch(() => {
      if (!cancelled) setEnsName(undefined);
    });

    return () => { cancelled = true; };
  }, [address]);

  return ensName;
}
