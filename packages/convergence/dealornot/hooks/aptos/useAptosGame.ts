"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import {
  APTOS_MODULE_ADDRESS,
  APTOS_NETWORK,
  APTOS_PHASES,
  APT_DECIMALS,
  OCTAS_PER_APT,
} from "@/lib/aptos/config";

const NETWORK_MAP = {
  mainnet: Network.MAINNET,
  testnet: Network.TESTNET,
  devnet: Network.DEVNET,
} as const;

const aptosConfig = new AptosConfig({ network: NETWORK_MAP[APTOS_NETWORK] });
const aptos = new Aptos(aptosConfig);

// ── Types ──

export interface AptosGameState {
  player: string;
  phase: number;
  playerCase: number;
  currentRound: number;
  totalCollapsed: number;
  bankerOffer: number; // cents
  finalPayout: number; // cents
  aptPerDollar: number;
  caseValues: number[]; // cents
  opened: boolean[];
}

// ── Read Hooks ──

export function useAptosGameState(gameId: number | undefined) {
  const [gameState, setGameState] = useState<AptosGameState | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchGameState = useCallback(async () => {
    if (gameId === undefined) return;
    setIsLoading(true);
    try {
      const result = await aptos.view({
        payload: {
          function: `${APTOS_MODULE_ADDRESS}::deal_or_not_quickplay::get_game_state`,
          functionArguments: [APTOS_MODULE_ADDRESS, gameId.toString()],
        },
      });

      // Parse the view result
      // Returns: (player, phase, player_case, current_round, total_collapsed,
      //           banker_offer, final_payout, apt_per_dollar, case_values, opened)
      const [player, phase, playerCase, currentRound, totalCollapsed,
             bankerOffer, finalPayout, aptPerDollar, caseValues, opened] = result as [
        string, number, number, number, number,
        number, number, number, number[], boolean[]
      ];

      setGameState({
        player,
        phase: Number(phase),
        playerCase: Number(playerCase),
        currentRound: Number(currentRound),
        totalCollapsed: Number(totalCollapsed),
        bankerOffer: Number(bankerOffer),
        finalPayout: Number(finalPayout),
        aptPerDollar: Number(aptPerDollar),
        caseValues: (caseValues as number[]).map(Number),
        opened: opened as boolean[],
      });
    } catch (err) {
      console.error("Failed to fetch Aptos game state:", err);
      setGameState(null);
    } finally {
      setIsLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    fetchGameState();
    const interval = setInterval(fetchGameState, 3000);
    return () => clearInterval(interval);
  }, [fetchGameState]);

  return { gameState, isLoading, refetch: fetchGameState };
}

export function useAptosEntryFee() {
  const [fee, setFee] = useState<{ baseOctas: number; withSlippage: number } | null>(null);

  useEffect(() => {
    async function fetchFee() {
      try {
        // Read entry fee from price feed: 25 cents → octas
        const result = await aptos.view({
          payload: {
            function: `${APTOS_MODULE_ADDRESS}::price_feed_helper::usd_to_octas`,
            functionArguments: [APTOS_MODULE_ADDRESS, "25"],
          },
        });
        const baseOctas = Number(result[0]);
        // 5% slippage (500 bps)
        const withSlippage = Math.ceil(baseOctas * 10500 / 10000);
        setFee({ baseOctas, withSlippage });
      } catch {
        // Fallback: ~$0.25 at ~$8.50/APT ≈ 0.029 APT ≈ 2_941_176 octas
        setFee({ baseOctas: 2_941_176, withSlippage: 3_088_235 });
      }
    }
    fetchFee();
    const interval = setInterval(fetchFee, 30000);
    return () => clearInterval(interval);
  }, []);

  return fee;
}

export function useAptosNextGameId() {
  const [nextGameId, setNextGameId] = useState<number | null>(null);

  const fetchNextGameId = useCallback(async () => {
    try {
      const result = await aptos.view({
        payload: {
          function: `${APTOS_MODULE_ADDRESS}::deal_or_not_quickplay::get_next_game_id`,
          functionArguments: [APTOS_MODULE_ADDRESS],
        },
      });
      setNextGameId(Number(result[0]));
    } catch {
      setNextGameId(null);
    }
  }, []);

  useEffect(() => {
    fetchNextGameId();
  }, [fetchNextGameId]);

  return { nextGameId, refetch: fetchNextGameId };
}

// ── Write Hooks ──

export function useAptosGameWrite() {
  const { signAndSubmitTransaction, account } = useWallet();
  const [isPending, setIsPending] = useState(false);

  const submitTx = useCallback(async (
    functionName: string,
    args: (string | number)[],
  ) => {
    if (!account) throw new Error("Wallet not connected");
    setIsPending(true);
    try {
      const response = await signAndSubmitTransaction({
        data: {
          function: `${APTOS_MODULE_ADDRESS}::deal_or_not_quickplay::${functionName}`,
          functionArguments: args.map(String),
        },
      });
      // Wait for transaction — wallet adapter may return hash as string or object
      const hash = typeof response === 'string' ? response : response.hash;
      await aptos.waitForTransaction({ transactionHash: hash });
      return hash;
    } finally {
      setIsPending(false);
    }
  }, [account, signAndSubmitTransaction]);

  const createGame = useCallback(async () => {
    return submitTx("create_game", [APTOS_MODULE_ADDRESS]);
  }, [submitTx]);

  const pickCase = useCallback(async (gameId: number, caseIndex: number) => {
    return submitTx("pick_case", [APTOS_MODULE_ADDRESS, gameId, caseIndex]);
  }, [submitTx]);

  const openCase = useCallback(async (gameId: number, caseIndex: number) => {
    return submitTx("open_case", [APTOS_MODULE_ADDRESS, gameId, caseIndex]);
  }, [submitTx]);

  const acceptDeal = useCallback(async (gameId: number) => {
    return submitTx("accept_deal", [APTOS_MODULE_ADDRESS, gameId]);
  }, [submitTx]);

  const rejectDeal = useCallback(async (gameId: number) => {
    return submitTx("reject_deal", [APTOS_MODULE_ADDRESS, gameId]);
  }, [submitTx]);

  // NOTE: keep_case and swap_case are #[randomness] entry functions callable
  // ONLY by the resolver (not the player). The player's wallet will get
  // E_NOT_RESOLVER (302) if they try to call these directly.
  // TODO: Add request_keep/request_swap player-callable functions to the contract
  // that set an on-chain flag. The resolver then polls and executes.
  // For now, these are placeholder stubs that will fail at runtime.
  const keepCase = useCallback(async (gameId: number) => {
    return submitTx("keep_case", [APTOS_MODULE_ADDRESS, gameId]);
  }, [submitTx]);

  const swapCase = useCallback(async (gameId: number) => {
    return submitTx("swap_case", [APTOS_MODULE_ADDRESS, gameId]);
  }, [submitTx]);

  return {
    createGame,
    pickCase,
    openCase,
    acceptDeal,
    rejectDeal,
    keepCase,
    swapCase,
    isPending,
  };
}

// ── Utility ──

export function octasToApt(octas: number): string {
  return (octas / OCTAS_PER_APT).toFixed(APT_DECIMALS > 4 ? 6 : APT_DECIMALS);
}

export function isAptosPhaseGameOver(phase: number): boolean {
  return phase === APTOS_PHASES.GameOver;
}
