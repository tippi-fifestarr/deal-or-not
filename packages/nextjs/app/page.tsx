"use client";

import Link from "next/link";
import { Address } from "@scaffold-ui/components";
import type { NextPage } from "next";
import { hardhat } from "viem/chains";
import { useAccount } from "wagmi";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";

const Home: NextPage = () => {
  const { address: connectedAddress } = useAccount();
  const { targetNetwork } = useTargetNetwork();

  return (
    <>
      <div className="flex items-center flex-col grow pt-10">
        <div className="px-5 max-w-4xl">
          <h1 className="text-center mb-8">
            <span className="block text-5xl font-bold mb-4">💼 Deal or No Deal</span>
            <span className="block text-xl opacity-70">Onchain Game Show with ZK Proofs</span>
          </h1>

          <div className="flex justify-center items-center space-x-2 flex-col mb-8">
            <p className="my-2 font-medium">Connected Address:</p>
            <Address
              address={connectedAddress}
              chain={targetNetwork}
              blockExplorerAddressLink={
                targetNetwork.id === hardhat.id ? `/blockexplorer/address/${connectedAddress}` : undefined
              }
            />
          </div>

          <div className="card bg-base-200 shadow-xl mb-6">
            <div className="card-body">
              <h2 className="card-title">How to Play</h2>
              <ol className="list-decimal list-inside space-y-2 text-sm">
                <li>Create or join a game via the lottery system</li>
                <li>Winner selects their briefcase (26 cases, each with a hidden prize)</li>
                <li>Open cases each round to eliminate values</li>
                <li>Receive banker offers based on remaining case values</li>
                <li>Choose DEAL (accept offer) or NO DEAL (keep playing)</li>
                <li>Win the progressive jackpot by holding the highest value case!</li>
              </ol>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="card bg-base-200 shadow-lg">
              <div className="card-body items-center text-center">
                <div className="text-3xl mb-2">🎰</div>
                <h3 className="font-bold">Fair Lottery</h3>
                <p className="text-sm opacity-70">Commit-reveal system prevents front-running</p>
              </div>
            </div>
            <div className="card bg-base-200 shadow-lg">
              <div className="card-body items-center text-center">
                <div className="text-3xl mb-2">🔐</div>
                <h3 className="font-bold">ZK Proofs</h3>
                <p className="text-sm opacity-70">Cryptographic verification of case values</p>
              </div>
            </div>
            <div className="card bg-base-200 shadow-lg">
              <div className="card-body items-center text-center">
                <div className="text-3xl mb-2">💰</div>
                <h3 className="font-bold">Progressive Jackpot</h3>
                <p className="text-sm opacity-70">Grows with each game, resets on win</p>
              </div>
            </div>
          </div>

          <div className="flex justify-center gap-4">
            <Link href="/browse">
              <button className="btn btn-primary btn-lg">Browse Games</button>
            </Link>
            <Link href="/stats">
              <button className="btn btn-outline btn-lg">View Stats</button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default Home;
