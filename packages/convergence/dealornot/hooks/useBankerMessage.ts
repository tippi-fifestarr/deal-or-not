"use client";

import { useState, useEffect, useRef } from "react";
import { usePublicClient } from "wagmi";
import { parseAbiItem } from "viem";
import { CONTRACT_ADDRESS } from "@/lib/config";

const BANKER_MESSAGE_EVENT = parseAbiItem(
  "event BankerMessage(uint256 indexed gameId, string message)"
);

/// Read the banker message from the BankerMessage event log on the game contract.
/// Uses both log polling and watchContractEvent for reliability on public RPCs.
export function useBankerMessage(gameId: bigint | undefined): string | null {
  const [message, setMessage] = useState<string | null>(null);
  const foundRef = useRef(false);
  const publicClient = usePublicClient();

  useEffect(() => {
    if (!publicClient || gameId === undefined) return;
    foundRef.current = false;

    const fetchMessage = async () => {
      if (foundRef.current) return;
      try {
        const currentBlock = await publicClient.getBlockNumber();
        const fromBlock = currentBlock - 10000n;

        const logs = await publicClient.getLogs({
          address: CONTRACT_ADDRESS,
          event: BANKER_MESSAGE_EVENT,
          args: { gameId },
          fromBlock,
          toBlock: currentBlock,
        });

        if (logs.length > 0) {
          const latest = logs[logs.length - 1];
          const msg = (latest.args as { message?: string }).message;
          if (msg) {
            foundRef.current = true;
            setMessage(msg);
          }
        }
      } catch (err) {
        console.error("Error fetching BankerMessage event:", err);
      }
    };

    fetchMessage();

    // Poll every 3s until found — watchContractEvent is unreliable on public RPCs
    const interval = setInterval(fetchMessage, 3000);

    const unwatch = publicClient.watchContractEvent({
      address: CONTRACT_ADDRESS,
      abi: [BANKER_MESSAGE_EVENT],
      args: { gameId },
      pollingInterval: 4_000,
      onLogs: (logs) => {
        for (const log of logs) {
          const msg = (log.args as { message?: string }).message;
          if (msg) {
            foundRef.current = true;
            setMessage(msg);
          }
        }
      },
    });

    return () => {
      clearInterval(interval);
      unwatch();
      setMessage(null);
    };
  }, [publicClient, gameId]);

  return message;
}
