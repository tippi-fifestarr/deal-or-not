"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useReadContract, useWatchContractEvent, useWriteContract } from "wagmi";
import { useBlockNumber } from "wagmi";
import { DEAL_OR_NO_DEAL_ABI } from "~~/contracts/DealOrNoDealAbi";
import scaffoldConfig from "~~/scaffold.config";

/**
 * Read from a DealOrNoDeal game clone contract.
 * Since clones aren't in deployedContracts, we use raw wagmi hooks with the ABI.
 */
export function useGameRead({
  gameAddress,
  functionName,
  args,
  enabled = true,
  watch = true,
}: {
  gameAddress: `0x${string}` | undefined;
  functionName: string;
  args?: readonly unknown[];
  enabled?: boolean;
  watch?: boolean;
}) {
  const chainId = scaffoldConfig.targetNetworks[0].id;

  const result = useReadContract({
    address: gameAddress,
    abi: DEAL_OR_NO_DEAL_ABI,
    functionName: functionName as any,
    args: args as any,
    chainId,
    query: {
      enabled: enabled && !!gameAddress,
    },
  });

  const queryClient = useQueryClient();
  const { data: blockNumber } = useBlockNumber({
    watch,
    chainId,
    query: { enabled: watch },
  });

  useEffect(() => {
    if (watch && blockNumber) {
      queryClient.invalidateQueries({ queryKey: result.queryKey });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockNumber]);

  return result;
}

/**
 * Write to a DealOrNoDeal game clone contract.
 */
export function useGameWrite() {
  const { writeContractAsync, isPending, ...rest } = useWriteContract();
  const chainId = scaffoldConfig.targetNetworks[0].id;

  const writeAsync = async ({
    gameAddress,
    functionName,
    args,
    value,
  }: {
    gameAddress: `0x${string}`;
    functionName: string;
    args?: readonly unknown[];
    value?: bigint;
  }) => {
    return writeContractAsync({
      address: gameAddress,
      abi: DEAL_OR_NO_DEAL_ABI,
      functionName,
      args,
      value,
      chainId,
    } as Parameters<typeof writeContractAsync>[0]);
  };

  return { writeAsync, isPending, ...rest };
}

/**
 * Watch events on a DealOrNoDeal game clone contract.
 */
export function useGameEvent({
  gameAddress,
  eventName,
  onLogs,
  enabled = true,
}: {
  gameAddress: `0x${string}` | undefined;
  eventName: string;
  onLogs: (logs: unknown[]) => void;
  enabled?: boolean;
}) {
  const chainId = scaffoldConfig.targetNetworks[0].id;

  useWatchContractEvent({
    address: gameAddress,
    abi: DEAL_OR_NO_DEAL_ABI,
    eventName,
    onLogs,
    chainId,
    enabled: enabled && !!gameAddress,
  } as Parameters<typeof useWatchContractEvent>[0]);
}
