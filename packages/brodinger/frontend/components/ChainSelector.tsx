"use client";

import { useChainId, useSwitchChain } from "wagmi";
import { useState } from "react";
import { SUPPORTED_CHAINS, getChainConfig, getAddChainParams, HOME_CHAIN_ID } from "../lib/chains";

export default function ChainSelector() {
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();
  const [isOpen, setIsOpen] = useState(false);
  const currentChain = getChainConfig(chainId);

  const handleChainSelect = async (targetChainId: number) => {
    if (targetChainId === chainId) {
      setIsOpen(false);
      return;
    }

    try {
      // Try to switch to the chain
      switchChain({ chainId: targetChainId });
      setIsOpen(false);
    } catch (error: any) {
      // If chain not added, add it first
      if (error?.code === 4902 || error?.message?.includes("not added")) {
        const chainParams = getAddChainParams(targetChainId);
        if (chainParams && typeof window !== "undefined" && window.ethereum) {
          try {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [chainParams],
            });
            // After adding, switch to it
            switchChain({ chainId: targetChainId });
            setIsOpen(false);
          } catch (addError) {
            console.error("Failed to add chain:", addError);
          }
        }
      } else {
        console.error("Failed to switch chain:", error);
      }
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isPending}
        className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 disabled:opacity-50"
      >
        {currentChain ? (
          <>
            <span>{currentChain.name}</span>
            {currentChain.isHomeChain && (
              <span className="bg-amber-600 text-white text-xs px-2 py-0.5 rounded">Home</span>
            )}
            {!currentChain.isHomeChain && currentChain.hasCCIP && (
              <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded">Spoke</span>
            )}
          </>
        ) : (
          <span>Select Chain</span>
        )}
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-64 bg-gray-900 border border-gray-700 rounded-lg shadow-lg z-20">
            <div className="p-2">
              <div className="text-xs text-gray-400 px-3 py-2 mb-1">Select Network</div>
              {SUPPORTED_CHAINS.map((chain) => {
                const config = getChainConfig(chain.id);
                const isSelected = chain.id === chainId;
                const isHome = chain.id === HOME_CHAIN_ID;

                return (
                  <button
                    key={chain.id}
                    onClick={() => handleChainSelect(chain.id)}
                    disabled={isSelected || isPending}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                      isSelected
                        ? "bg-amber-600 text-white"
                        : "hover:bg-gray-800 text-gray-300"
                    } disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between`}
                  >
                    <div className="flex items-center gap-2">
                      <span>{chain.name}</span>
                      {isHome && (
                        <span className="bg-amber-600 text-white text-xs px-1.5 py-0.5 rounded">
                          Home
                        </span>
                      )}
                      {!isHome && config?.hasCCIP && (
                        <span className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded">
                          Spoke
                        </span>
                      )}
                    </div>
                    {isSelected && (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
