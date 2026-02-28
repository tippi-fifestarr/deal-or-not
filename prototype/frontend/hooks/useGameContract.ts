"use client";

import { useReadContract, useWriteContract } from "wagmi";
import { DEAL_OR_NOT_ABI } from "@/lib/abi";
import { CONTRACT_ADDRESS } from "@/lib/config";
import { type GameState, Phase } from "@/types/game";
import { useMemo } from "react";

const contractConfig = {
  address: CONTRACT_ADDRESS,
  abi: DEAL_OR_NOT_ABI,
} as const;

// ── Read Hooks ──

export function useGameState(gameId: bigint | undefined) {
  const { data, isLoading, refetch } = useReadContract({
    ...contractConfig,
    functionName: "getGameState",
    args: gameId !== undefined ? [gameId] : undefined,
    query: {
      enabled: gameId !== undefined,
      refetchInterval: 3000,
    },
  });

  const gameState: GameState | null = useMemo(() => {
    if (!data) return null;
    const [
      host, player, mode, phase, playerCase, currentRound, totalCollapsed,
      bankerOffer, finalPayout, ethPerDollar, commitBlock, caseValues, opened,
    ] = data;
    return {
      host,
      player,
      mode: Number(mode),
      phase: Number(phase) as Phase,
      playerCase: Number(playerCase),
      currentRound: Number(currentRound),
      totalCollapsed: Number(totalCollapsed),
      bankerOffer,
      finalPayout,
      ethPerDollar,
      commitBlock,
      caseValues,
      opened,
    };
  }, [data]);

  return { gameState, isLoading, refetch };
}

export function useNextGameId() {
  const { data, refetch } = useReadContract({
    ...contractConfig,
    functionName: "nextGameId",
    query: { refetchInterval: 5000 },
  });
  return { nextGameId: data as bigint | undefined, refetch };
}

export function useRemainingPool(gameId: bigint | undefined) {
  const { data, refetch } = useReadContract({
    ...contractConfig,
    functionName: "getRemainingValuePool",
    args: gameId !== undefined ? [gameId] : undefined,
    query: {
      enabled: gameId !== undefined,
      refetchInterval: 3000,
    },
  });
  return { remainingValues: data as bigint[] | undefined, refetch };
}

export function useBankerOfferCalc(gameId: bigint | undefined, enabled: boolean) {
  const { data } = useReadContract({
    ...contractConfig,
    functionName: "calculateBankerOfferFull",
    args: gameId !== undefined ? [gameId] : undefined,
    query: { enabled: enabled && gameId !== undefined },
  });
  return data as bigint | undefined;
}

export function useCentsToWei(gameId: bigint | undefined, cents: bigint | undefined) {
  const { data } = useReadContract({
    ...contractConfig,
    functionName: "centsToWei",
    args: gameId !== undefined && cents !== undefined ? [gameId, cents] : undefined,
    query: { enabled: gameId !== undefined && cents !== undefined },
  });
  return data as bigint | undefined;
}

// ── Write Hook ──

export function useGameWrite() {
  const { writeContractAsync, isPending } = useWriteContract();

  const createGame = async () => {
    return writeContractAsync({
      ...contractConfig,
      functionName: "createGame",
    });
  };

  const pickCase = async (gameId: bigint, caseIndex: number) => {
    return writeContractAsync({
      ...contractConfig,
      functionName: "pickCase",
      args: [gameId, caseIndex],
    });
  };

  const commitCase = async (gameId: bigint, commitHash: bigint) => {
    return writeContractAsync({
      ...contractConfig,
      functionName: "commitCase",
      args: [gameId, commitHash],
    });
  };

  const revealCase = async (gameId: bigint, caseIndex: number, salt: bigint) => {
    return writeContractAsync({
      ...contractConfig,
      functionName: "revealCase",
      args: [gameId, caseIndex, salt],
    });
  };

  const setBankerOffer = async (gameId: bigint, offerCents: bigint) => {
    return writeContractAsync({
      ...contractConfig,
      functionName: "setBankerOffer",
      args: [gameId, offerCents],
    });
  };

  const acceptDeal = async (gameId: bigint) => {
    return writeContractAsync({
      ...contractConfig,
      functionName: "acceptDeal",
      args: [gameId],
    });
  };

  const rejectDeal = async (gameId: bigint) => {
    return writeContractAsync({
      ...contractConfig,
      functionName: "rejectDeal",
      args: [gameId],
    });
  };

  const commitFinalDecision = async (gameId: bigint, commitHash: bigint) => {
    return writeContractAsync({
      ...contractConfig,
      functionName: "commitFinalDecision",
      args: [gameId, commitHash],
    });
  };

  const revealFinalDecision = async (gameId: bigint, swap: boolean, salt: bigint) => {
    return writeContractAsync({
      ...contractConfig,
      functionName: "revealFinalDecision",
      args: [gameId, swap, salt],
    });
  };

  return {
    createGame,
    pickCase,
    commitCase,
    revealCase,
    setBankerOffer,
    acceptDeal,
    rejectDeal,
    commitFinalDecision,
    revealFinalDecision,
    isPending,
  };
}
