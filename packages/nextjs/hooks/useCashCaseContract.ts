"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useReadContract, useWatchContractEvent, useWriteContract } from "wagmi";
import { useBlockNumber } from "wagmi";
import { CASH_CASE_ABI, CASH_CASE_ADDRESS } from "~~/contracts/CashCaseAbi";
import scaffoldConfig from "~~/scaffold.config";

/**
 * Read from the CashCase contract (single deployed instance, not clones).
 */
export function useCashCaseRead({
  functionName,
  args,
  enabled = true,
  watch = true,
}: {
  functionName: string;
  args?: readonly unknown[];
  enabled?: boolean;
  watch?: boolean;
}) {
  const chainId = scaffoldConfig.targetNetworks[0].id;

  const result = useReadContract({
    address: CASH_CASE_ADDRESS,
    abi: CASH_CASE_ABI,
    functionName: functionName as any,
    args: args as any,
    chainId,
    query: {
      enabled,
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
 * Write to the CashCase contract.
 */
export function useCashCaseWrite() {
  const { writeContractAsync, isPending, ...rest } = useWriteContract();
  const chainId = scaffoldConfig.targetNetworks[0].id;

  const writeAsync = async ({
    functionName,
    args,
    value,
  }: {
    functionName: string;
    args?: readonly unknown[];
    value?: bigint;
  }) => {
    return writeContractAsync({
      address: CASH_CASE_ADDRESS,
      abi: CASH_CASE_ABI,
      functionName,
      args,
      value,
      chainId,
    } as Parameters<typeof writeContractAsync>[0]);
  };

  return { writeAsync, isPending, ...rest };
}

/**
 * Watch events on the CashCase contract.
 */
export function useCashCaseEvent({
  eventName,
  onLogs,
  enabled = true,
}: {
  eventName: string;
  onLogs: (logs: unknown[]) => void;
  enabled?: boolean;
}) {
  const chainId = scaffoldConfig.targetNetworks[0].id;

  useWatchContractEvent({
    address: CASH_CASE_ADDRESS,
    abi: CASH_CASE_ABI,
    eventName,
    onLogs,
    chainId,
    enabled,
  } as Parameters<typeof useWatchContractEvent>[0]);
}
