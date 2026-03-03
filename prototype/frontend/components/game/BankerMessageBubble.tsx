"use client";

import { useState, useEffect } from "react";
import { usePublicClient } from "wagmi";
import { parseAbiItem } from "viem";
import { CONTRACT_ADDRESS } from "@/lib/config";

interface BankerMessageBubbleProps {
  gameId: bigint;
}

export default function BankerMessageBubble({ gameId }: BankerMessageBubbleProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [displayedText, setDisplayedText] = useState("");
  const publicClient = usePublicClient();

  // Poll for BankerMessage events
  useEffect(() => {
    if (!publicClient) return;

    let cancelled = false;

    const fetchMessage = async () => {
      try {
        const logs = await publicClient.getLogs({
          address: CONTRACT_ADDRESS,
          event: parseAbiItem("event BankerMessage(uint256 indexed gameId, string message)"),
          args: { gameId },
          fromBlock: "earliest",
          toBlock: "latest",
        });

        if (logs.length > 0 && !cancelled) {
          const latestLog = logs[logs.length - 1];
          const msg = latestLog.args.message;
          if (msg && msg !== message) {
            setMessage(msg);
            setDisplayedText("");
          }
        }
      } catch {
        // Ignore polling errors
      }
    };

    fetchMessage();
    const interval = setInterval(fetchMessage, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [publicClient, gameId, message]);

  // Typewriter effect
  useEffect(() => {
    if (!message) return;
    if (displayedText === message) return;

    const timer = setTimeout(() => {
      setDisplayedText(message.slice(0, displayedText.length + 1));
    }, 30);

    return () => clearTimeout(timer);
  }, [message, displayedText]);

  if (!message) return null;

  return (
    <div className="bg-gray-900/90 border border-amber-600/50 rounded-xl p-4 mb-4 max-w-md mx-auto">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
        <span className="text-amber-400 text-xs uppercase tracking-widest font-bold">
          The Banker
        </span>
      </div>
      <p className="text-white text-sm leading-relaxed">
        &ldquo;{displayedText}
        {displayedText !== message && (
          <span className="animate-pulse">|</span>
        )}
        {displayedText === message && "&rdquo;"}
      </p>
    </div>
  );
}
