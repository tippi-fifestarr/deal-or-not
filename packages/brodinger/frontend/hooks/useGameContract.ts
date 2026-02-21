"use client";

import { useReadContract, useWriteContract, useWatchContractEvent, useChainId } from "wagmi";
import { DEAL_OR_NO_DEAL_ABI } from "../lib/contracts";
import { getCashCaseAddress } from "../lib/constants";
import { type GameState, GamePhase } from "../types/game";
import { useMemo } from "react";

// Hook to get contract config based on current chain
function useContractConfig() {
  const chainId = useChainId();
  const address = useMemo(() => getCashCaseAddress(chainId), [chainId]);

  return useMemo(
    () =>
      address
        ? ({
            address,
            abi: DEAL_OR_NO_DEAL_ABI,
          } as const)
        : null,
    [address]
  );
}

export function useGameState(gameId: bigint | undefined) {
  const contractConfig = useContractConfig();
  const { data, isLoading, refetch } = useReadContract({
    ...contractConfig,
    functionName: "getGameState",
    args: gameId !== undefined ? [gameId] : undefined,
    query: {
      enabled: gameId !== undefined && contractConfig !== null,
      refetchInterval: 2000,
    },
  });

  const gameState: GameState | null = data
    ? {
        banker: data[0] as string,
        player: data[1] as string,
        phase: Number(data[2]) as GamePhase,
        playerCaseIndex: Number(data[3]),
        currentRound: Number(data[4]),
        casesOpenedThisRound: Number(data[5]),
        openedBitmap: data[6] as bigint,
        bankerOffer: data[7] as bigint,
        finalPayout: data[8] as bigint,
      }
    : null;

  return { gameState, isLoading, refetch };
}

export function useNextGameId() {
  const contractConfig = useContractConfig();
  const { data, refetch } = useReadContract({
    ...contractConfig,
    functionName: "nextGameId",
    query: { enabled: contractConfig !== null, refetchInterval: 3000 },
  });
  return { nextGameId: data as bigint | undefined, refetch };
}

export function useUsdToWei(usdCents: bigint) {
  const contractConfig = useContractConfig();
  const { data } = useReadContract({
    ...contractConfig,
    functionName: "usdToWei",
    args: [usdCents],
    query: { enabled: contractConfig !== null },
  });
  return data as bigint | undefined;
}

export function useEthUsdPrice() {
  const contractConfig = useContractConfig();
  const { data } = useReadContract({
    ...contractConfig,
    functionName: "getEthUsdPrice",
    query: { enabled: contractConfig !== null, refetchInterval: 10000 },
  });
  return data as bigint | undefined;
}

export function useRemainingValues(gameId: bigint | undefined) {
  const contractConfig = useContractConfig();
  const { data, refetch } = useReadContract({
    ...contractConfig,
    functionName: "getRemainingValues",
    args: gameId !== undefined ? [gameId] : undefined,
    query: {
      enabled: gameId !== undefined && contractConfig !== null,
      refetchInterval: 2000,
    },
  });
  return { remainingValues: data as bigint[] | undefined, refetch };
}

export function useCaseValue(gameId: bigint | undefined, caseIndex: number, enabled: boolean) {
  const contractConfig = useContractConfig();
  const { data } = useReadContract({
    ...contractConfig,
    functionName: "getCaseValue",
    args: gameId !== undefined ? [gameId, caseIndex] : undefined,
    query: { enabled: enabled && gameId !== undefined && contractConfig !== null },
  });
  return data as bigint | undefined;
}

export function useGameWrite() {
  const contractConfig = useContractConfig();
  const { writeContractAsync, isPending } = useWriteContract();

  const createGame = async (value: bigint) => {
    if (!contractConfig) throw new Error("Contract not deployed on this chain");
    return writeContractAsync({
      ...contractConfig,
      functionName: "createGame",
      value,
    });
  };

  const joinGame = async (gameId: bigint, commitHash: bigint, value: bigint) => {
    if (!contractConfig) throw new Error("Contract not deployed on this chain");
    return writeContractAsync({
      ...contractConfig,
      functionName: "joinGame",
      args: [gameId, commitHash],
      value,
    });
  };

  const revealCase = async (gameId: bigint, caseIndex: number, salt: bigint) => {
    if (!contractConfig) throw new Error("Contract not deployed on this chain");
    return writeContractAsync({
      ...contractConfig,
      functionName: "revealCase",
      args: [gameId, caseIndex, salt],
    });
  };

  const openCase = async (gameId: bigint, caseIndex: number) => {
    if (!contractConfig) throw new Error("Contract not deployed on this chain");
    return writeContractAsync({
      ...contractConfig,
      functionName: "openCase",
      args: [gameId, caseIndex],
    });
  };

  const acceptDeal = async (gameId: bigint) => {
    if (!contractConfig) throw new Error("Contract not deployed on this chain");
    return writeContractAsync({
      ...contractConfig,
      functionName: "acceptDeal",
      args: [gameId],
    });
  };

  const rejectDeal = async (gameId: bigint) => {
    if (!contractConfig) throw new Error("Contract not deployed on this chain");
    return writeContractAsync({
      ...contractConfig,
      functionName: "rejectDeal",
      args: [gameId],
    });
  };

  const finalDecision = async (gameId: bigint, swap: boolean) => {
    if (!contractConfig) throw new Error("Contract not deployed on this chain");
    return writeContractAsync({
      ...contractConfig,
      functionName: "finalDecision",
      args: [gameId, swap],
    });
  };

  return {
    createGame,
    joinGame,
    revealCase,
    openCase,
    acceptDeal,
    rejectDeal,
    finalDecision,
    isPending,
    isContractDeployed: contractConfig !== null,
  };
}
