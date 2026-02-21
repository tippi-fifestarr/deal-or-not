"use client";

import { useAccount, useConnect, useDisconnect, useReadContract, useWriteContract, useChainId } from "wagmi";
import { injected } from "wagmi/connectors";
import { parseEther } from "viem";
import { useState, useEffect, useMemo } from "react";
import { AGENT_REGISTRY_ABI } from "../../lib/contracts";
import { getRegistryAddress, getChainConfig } from "../../lib/chains";
import ChainSelector from "../../components/ChainSelector";

const AGENT_TYPE_LABELS = ["Banker", "Player", "Both"];

const PRESET_STRATEGIES: Record<string, string> = {
  AGGRESSIVE: "You are an aggressive Deal or No Deal player. Reject deals unless they are at least 90% of the maximum remaining value. Always swap at the end.",
  CONSERVATIVE: "You are a conservative Deal or No Deal player. Accept deals that are above 60% of the average remaining value. Never swap.",
  VALUE: "You are a value-based Deal or No Deal player. Accept when the offer exceeds 85% of expected value. Swap only if EV suggests it.",
  RANDOM: "You are a random Deal or No Deal player. Make all decisions with a coin flip.",
};

// Hook to get registry config based on current chain
function useRegistryConfig() {
  const chainId = useChainId();
  const address = useMemo(() => getRegistryAddress(chainId), [chainId]);

  return useMemo(
    () =>
      address
        ? ({
            address,
            abi: AGENT_REGISTRY_ABI,
          } as const)
        : null,
    [address]
  );
}

interface AgentData {
  owner: string;
  wallet: string;
  strategyURI: string;
  agentType: number;
  gamesPlayed: bigint;
  totalProfitCents: bigint;
  active: boolean;
  createdAt: bigint;
}

export default function AgentsPage() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { writeContractAsync, isPending } = useWriteContract();
  const chainId = useChainId();
  const chainConfig = getChainConfig(chainId);
  const registryConfig = useRegistryConfig();

  const [strategy, setStrategy] = useState("");
  const [agentType, setAgentType] = useState(1);
  const [walletAddress, setWalletAddress] = useState("");
  const [fundAmount, setFundAmount] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<{ id: bigint; data: AgentData }[]>([]);

  const { data: ownerAgentIds, refetch: refetchOwnerAgents } = useReadContract({
    ...registryConfig,
    functionName: "getOwnerAgents",
    args: address ? [address] : undefined,
    query: { enabled: !!address && registryConfig !== null, refetchInterval: 5000 },
  });

  const { data: leaderboardData, refetch: refetchLeaderboard } = useReadContract({
    ...registryConfig,
    functionName: "getLeaderboard",
    args: [10n],
    query: { enabled: registryConfig !== null, refetchInterval: 5000 },
  });

  const { data: nextAgentId } = useReadContract({
    ...registryConfig,
    functionName: "nextAgentId",
    query: { enabled: registryConfig !== null, refetchInterval: 5000 },
  });

  useEffect(() => {
    if (!leaderboardData) { setLeaderboard([]); return; }
    const [topAgents, topIds] = leaderboardData as [AgentData[], bigint[]];
    const entries = topIds.map((id: bigint, i: number) => ({ id, data: topAgents[i] }));
    setLeaderboard(entries);
  }, [leaderboardData]);

  const handlePresetChange = (preset: string) => {
    setSelectedPreset(preset);
    if (preset && PRESET_STRATEGIES[preset]) setStrategy(PRESET_STRATEGIES[preset]);
  };

  const handleDeploy = async () => {
    if (!registryConfig) { setTxStatus("Error: Registry not deployed on this chain"); return; }
    if (!strategy || !walletAddress) { setTxStatus("Please fill in strategy and wallet address"); return; }
    try {
      setTxStatus("Deploying agent...");
      await writeContractAsync({ ...registryConfig, functionName: "registerAgent", args: [strategy, agentType, walletAddress as `0x${string}`] });
      setTxStatus("Agent deployed successfully!");
      refetchOwnerAgents(); refetchLeaderboard();
      setStrategy(""); setWalletAddress("");
    } catch (err) { setTxStatus("Error: " + ((err as Error).message?.slice(0, 80) || "Unknown")); }
  };

  const handleFund = async (agentId: bigint) => {
    if (!registryConfig) { setTxStatus("Error: Registry not deployed on this chain"); return; }
    if (!fundAmount) return;
    try {
      setTxStatus("Funding agent...");
      await writeContractAsync({ ...registryConfig, functionName: "fundAgent", args: [agentId], value: parseEther(fundAmount) });
      setTxStatus("Agent funded with " + fundAmount + " ETH");
      setFundAmount("");
    } catch (err) { setTxStatus("Error: " + ((err as Error).message?.slice(0, 80) || "Unknown")); }
  };

  const handleDeactivate = async (agentId: bigint) => {
    if (!registryConfig) { setTxStatus("Error: Registry not deployed on this chain"); return; }
    try {
      setTxStatus("Deactivating...");
      await writeContractAsync({ ...registryConfig, functionName: "deactivateAgent", args: [agentId] });
      setTxStatus("Agent deactivated");
      refetchOwnerAgents(); refetchLeaderboard();
    } catch (err) { setTxStatus("Error: " + ((err as Error).message?.slice(0, 80) || "Unknown")); }
  };

  const truncateAddr = (addr: string) => addr.slice(0, 6) + "..." + addr.slice(-4);
  const fmtProfit = (cents: bigint) => { const n=Number(cents); return (n>=0 ? "+" : "") + "$" + (n/100).toFixed(2); };

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <a href="/" className="text-amber-400 font-bold text-xl hover:text-amber-300">Deal or No Deal</a>
          <span className="text-gray-600">|</span>
          <span className="text-white font-semibold">AI Agents</span>
        </div>
        {isConnected ? (
          <div className="flex items-center gap-3">
            <ChainSelector />
            <span className="text-gray-400 text-sm">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
            <button className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm" onClick={() => disconnect()}>Disconnect</button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <ChainSelector />
            <button className="bg-amber-600 hover:bg-amber-500 text-white px-6 py-2 rounded-lg font-semibold" onClick={() => connect({ connector: injected() })}>Connect Wallet</button>
          </div>
        )}
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {txStatus && (
          <div className={"p-3 rounded-lg text-sm " + (txStatus.startsWith("Error") ? "bg-red-900/50 border border-red-700 text-red-300" : txStatus.includes("success") || txStatus.includes("funded") || txStatus.includes("deactivated") ? "bg-green-900/50 border border-green-700 text-green-300" : "bg-blue-900/50 border border-blue-700 text-blue-300")}>
            {txStatus}
            <button className="ml-4 text-gray-400 hover:text-white" onClick={() => setTxStatus(null)}>x</button>
          </div>
        )}

        {/* Deploy Agent */}
        <section className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h2 className="text-xl font-bold text-white mb-4">Deploy New Agent</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Preset Strategy</label>
                <select className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white" value={selectedPreset} onChange={(e) => handlePresetChange(e.target.value)}>
                  <option value="">Custom...</option>
                  {Object.keys(PRESET_STRATEGIES).map((name) => (<option key={name} value={name}>{name}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Strategy Prompt</label>
                <textarea className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white h-32 resize-none" placeholder="Describe the agent strategy..." value={strategy} onChange={(e) => setStrategy(e.target.value)} />
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Agent Type</label>
                <div className="flex gap-4">
                  {AGENT_TYPE_LABELS.map((label, i) => (
                    <label key={i} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="agentType" value={i} checked={agentType === i} onChange={() => setAgentType(i)} className="accent-amber-500" />
                      <span className="text-white text-sm">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Agent Wallet Address</label>
                <input className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white" placeholder="0x..." value={walletAddress} onChange={(e) => setWalletAddress(e.target.value)} />
                <p className="text-xs text-gray-500 mt-1">The wallet the agent bot will use to sign transactions</p>
              </div>
              <button className="w-full bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-6 py-3 rounded-lg font-semibold" onClick={handleDeploy} disabled={!isConnected || isPending || !strategy || !walletAddress}>
                {isPending ? "Deploying..." : "Deploy Agent"}
              </button>
              {(nextAgentId !== undefined) && <p className="text-xs text-gray-500">Total agents: {(nextAgentId as bigint).toString()}</p>}
            </div>
          </div>
        </section>

        {/* My Agents */}
        <section className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h2 className="text-xl font-bold text-white mb-4">My Agents</h2>
          {!isConnected ? (
            <p className="text-gray-500">Connect wallet to view your agents</p>
          ) : !ownerAgentIds || (ownerAgentIds as bigint[]).length === 0 ? (
            <p className="text-gray-500">No agents registered yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-400">
                    <th className="text-left py-2 px-3">ID</th>
                    <th className="text-left py-2 px-3">Type</th>
                    <th className="text-left py-2 px-3">Strategy</th>
                    <th className="text-right py-2 px-3">Games</th>
                    <th className="text-right py-2 px-3">P&amp;L</th>
                    <th className="text-center py-2 px-3">Status</th>
                    <th className="text-right py-2 px-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(ownerAgentIds as bigint[]).map((aid) => (
                    <AgentRow key={aid.toString()} agentId={aid} fundAmount={fundAmount} setFundAmount={setFundAmount} onFund={() => handleFund(aid)} onDeactivate={() => handleDeactivate(aid)} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Leaderboard */}
        <section className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h2 className="text-xl font-bold text-white mb-4">Leaderboard</h2>
          {leaderboard.length === 0 ? (
            <p className="text-gray-500">No agents have played games yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-400">
                    <th className="text-left py-2 px-3">Rank</th>
                    <th className="text-left py-2 px-3">Agent ID</th>
                    <th className="text-left py-2 px-3">Owner</th>
                    <th className="text-left py-2 px-3">Type</th>
                    <th className="text-right py-2 px-3">Games</th>
                    <th className="text-right py-2 px-3">Profit/Loss</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry, rank) => (
                    <tr key={entry.id.toString()} className="border-b border-gray-800/50 hover:bg-gray-800/50">
                      <td className="py-2 px-3">
                        <span className={rank === 0 ? "text-amber-400 font-bold" : rank === 1 ? "text-gray-300 font-semibold" : rank === 2 ? "text-orange-400 font-semibold" : "text-gray-400"}>#{rank + 1}</span>
                      </td>
                      <td className="py-2 px-3 text-white">{entry.id.toString()}</td>
                      <td className="py-2 px-3 text-gray-400">{truncateAddr(entry.data.owner)}</td>
                      <td className="py-2 px-3 text-gray-300">{AGENT_TYPE_LABELS[entry.data.agentType] || "Unknown"}</td>
                      <td className="py-2 px-3 text-right text-gray-300">{entry.data.gamesPlayed.toString()}</td>
                      <td className={"py-2 px-3 text-right font-semibold " + (Number(entry.data.totalProfitCents) >= 0 ? "text-green-400" : "text-red-400")}>{fmtProfit(entry.data.totalProfitCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function AgentRow({ agentId, fundAmount, setFundAmount, onFund, onDeactivate }: {
  agentId: bigint; fundAmount: string; setFundAmount: (v: string) => void; onFund: () => void; onDeactivate: () => void;
}) {
  const { data } = useReadContract({
    address: AGENT_REGISTRY_ADDRESS,
    abi: AGENT_REGISTRY_ABI,
    functionName: "getAgent",
    args: [agentId],
    query: { refetchInterval: 5000 },
  });

  const agent = data as AgentData | undefined;
  if (!agent) {
    return (<tr className="border-b border-gray-800/50"><td className="py-2 px-3 text-gray-500" colSpan={7}>Loading agent {agentId.toString()}...</td></tr>);
  }

  return (
    <tr className="border-b border-gray-800/50 hover:bg-gray-800/50">
      <td className="py-2 px-3 text-white">{agentId.toString()}</td>
      <td className="py-2 px-3 text-gray-300">{["Banker", "Player", "Both"][agent.agentType] || "?"}</td>
      <td className="py-2 px-3 text-gray-400 max-w-[200px] truncate">{agent.strategyURI.slice(0, 40)}{agent.strategyURI.length > 40 ? "..." : ""}</td>
      <td className="py-2 px-3 text-right text-gray-300">{agent.gamesPlayed.toString()}</td>
      <td className={"py-2 px-3 text-right font-semibold " + (Number(agent.totalProfitCents) >= 0 ? "text-green-400" : "text-red-400")}>
        {Number(agent.totalProfitCents) >= 0 ? "+" : ""}${((Number(agent.totalProfitCents)) / 100).toFixed(2)}
      </td>
      <td className="py-2 px-3 text-center">
        {agent.active ? (<span className="inline-block w-2 h-2 rounded-full bg-green-400" title="Active" />) : (<span className="inline-block w-2 h-2 rounded-full bg-red-400" title="Inactive" />)}
      </td>
      <td className="py-2 px-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <input className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs" placeholder="ETH" value={fundAmount} onChange={(e) => setFundAmount(e.target.value)} />
          <button className="bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded text-xs disabled:opacity-50" onClick={onFund} disabled={!agent.active}>Fund</button>
          <button className="bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded text-xs disabled:opacity-50" onClick={onDeactivate} disabled={!agent.active}>Deactivate</button>
        </div>
      </td>
    </tr>
  );
}