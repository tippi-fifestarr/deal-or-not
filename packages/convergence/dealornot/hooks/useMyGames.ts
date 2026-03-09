"use client";

import { useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { DEAL_OR_NOT_ABI } from "@/lib/abi";
import { CONTRACT_ADDRESS } from "@/lib/config";
import { useNextGameId } from "./useGameContract";
import { Phase } from "@/types/game";

type MyGame = {
  gameId: number;
  phase: Phase;
  currentRound: number;
};

const SCAN_COUNT = 10; // Check last N games

export function useMyGames(): { games: MyGame[]; isLoading: boolean } {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: baseSepolia.id });
  const { nextGameId } = useNextGameId();
  const [games, setGames] = useState<MyGame[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!address || !publicClient || nextGameId === undefined) {
      setGames([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    async function scan() {
      const results: MyGame[] = [];
      const start = Number(nextGameId) - 1;
      const end = Math.max(0, start - SCAN_COUNT + 1);

      const calls = [];
      for (let i = start; i >= end; i--) {
        calls.push(
          publicClient!.readContract({
            address: CONTRACT_ADDRESS,
            abi: DEAL_OR_NOT_ABI,
            functionName: "getGameState",
            args: [BigInt(i)],
          }).then((data) => ({ gameId: i, data })).catch(() => null)
        );
      }

      const settled = await Promise.all(calls);
      for (const result of settled) {
        if (!result || cancelled) continue;
        const d = result.data as readonly unknown[];
        // getGameState returns: host, player, mode, phase, playerCase, ...
        const player = (d[1] as string).toLowerCase();
        const phase = Number(d[3]) as Phase;
        const currentRound = Number(d[5]);

        if (player === address!.toLowerCase() && phase !== Phase.GameOver) {
          results.push({ gameId: result.gameId, phase, currentRound });
        }
      }

      if (!cancelled) {
        setGames(results);
        setIsLoading(false);
      }
    }

    scan();
    return () => { cancelled = true; };
  }, [address, publicClient, nextGameId]);

  return { games, isLoading };
}
