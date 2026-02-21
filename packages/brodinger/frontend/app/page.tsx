"use client";

import { useAccount, useConnect, useDisconnect, useChainId, useBalance } from "wagmi";
import { injected } from "wagmi/connectors";
import { useEffect, useState } from "react";
import GameBoard from "../components/game/GameBoard";
import ChainSelector from "../components/ChainSelector";
import { getCashCaseAddress, getChainConfig, CHAIN_IDS } from "../lib/chains";
import { useGameWrite } from "../hooks/useGameContract";

async function fundAccount(address: string) {
  try {
    // Use hardhat_setBalance to give 100 ETH
    await fetch("http://127.0.0.1:8545", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "hardhat_setBalance",
        params: [address, "0x56BC75E2D63100000"], // 100 ETH in hex wei
        id: 1,
      }),
    });
  } catch {
    // Silently fail if not on hardhat
  }
}

export default function Home() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { data: balance, refetch: refetchBalance } = useBalance({ address });
  const [funded, setFunded] = useState(false);
  const { isContractDeployed } = useGameWrite();

  const chainConfig = getChainConfig(chainId);
  const contractAddress = getCashCaseAddress(chainId);
  const isLocalhost = chainId === CHAIN_IDS.HARDHAT;

  // Auto-fund on localhost only if balance is 0
  useEffect(() => {
    if (isConnected && address && isLocalhost && !funded) {
      if (balance && balance.value === 0n) {
        fundAccount(address).then(() => {
          setFunded(true);
          setTimeout(() => refetchBalance(), 500);
        });
      }
    }
  }, [isConnected, address, isLocalhost, balance, funded, refetchBalance]);

  const handleConnect = async () => {
    connect({ connector: injected() });
  };

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4 flex justify-between items-center">
        <h1 className="text-amber-400 font-bold text-xl">Cash Case</h1>
        {isConnected ? (
          <div className="flex items-center gap-3">
            <ChainSelector />
            <span className="text-gray-400 text-sm">
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </span>
            <button
              className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm transition-colors"
              onClick={() => disconnect()}
              data-testid="disconnect-button"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <ChainSelector />
            <button
              className="bg-amber-600 hover:bg-amber-500 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
              onClick={handleConnect}
              data-testid="connect-button"
            >
              Connect Wallet
            </button>
          </div>
        )}
      </header>

      {/* Contract not deployed warning */}
      {isConnected && !isContractDeployed && contractAddress === null && (
        <div className="bg-yellow-900/50 border border-yellow-700 text-yellow-300 px-6 py-3 text-center">
          ⚠️ CashCase contract not deployed on {chainConfig?.name || "this chain"}. Please switch to a chain with deployed contracts or deploy the contract first.
        </div>
      )}

      {/* Game */}
      <GameBoard />
    </main>
  );
}
