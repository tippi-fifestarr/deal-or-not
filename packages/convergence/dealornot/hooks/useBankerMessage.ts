"use client";

import { useReadContract } from "wagmi";
import { BEST_OF_BANKER_ABI } from "@/lib/bestOfBankerAbi";
import { BEST_OF_BANKER_ADDRESS } from "@/lib/config";

/// Read the latest banker message for a game from the BestOfBanker contract.
/// This is a simple view call — no event log issues with Alchemy free tier.
export function useBankerMessage(gameId: bigint | undefined): string | null {
  const { data, isFetching } = useReadContract({
    address: BEST_OF_BANKER_ADDRESS,
    abi: BEST_OF_BANKER_ABI,
    functionName: "getLatestMessage",
    args: gameId !== undefined ? [gameId] : undefined,
    query: {
      enabled: gameId !== undefined,
      refetchInterval: 4000,
    },
  });

  // Don't return stale data while refetching for a (potentially new) gameId
  if (isFetching) return null;
  if (!data || data === "") return null;
  return data as string;
}
