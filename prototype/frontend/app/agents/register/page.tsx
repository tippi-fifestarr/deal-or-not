"use client";

import { useState } from "react";
import { GlassCard, GlassButton } from "@/components/glass";

/**
 * Agent Registration Page
 *
 * Allows users to register their autonomous agents:
 * - Agent name
 * - API endpoint
 * - Metadata (strategy, version, description)
 */

export default function AgentRegisterPage() {
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [strategy, setStrategy] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRegister = async () => {
    if (!name || !endpoint) {
      alert("Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);

    // TODO: Replace with actual contract write when AgentRegistry is deployed
    setTimeout(() => {
      alert(
        `Agent registration coming soon!\n\nYour agent "${name}" will be registered at:\n${endpoint}\n\nWait for AgentRegistry contract deployment.`
      );
      setIsSubmitting(false);
    }, 1000);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => (window.location.href = "/agents")}
          className="text-gray-400 hover:text-white mb-4 flex items-center gap-2"
        >
          ← Back to Agents
        </button>

        <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
          Register Your Agent
        </h1>
        <p className="text-gray-300 text-lg">
          Deploy your autonomous agent to play Deal or NOT! games and compete on the leaderboard.
        </p>
      </div>

      {/* Registration Form */}
      <GlassCard className="p-8 mb-8">
        <h3 className="text-2xl font-bold mb-6">Agent Details</h3>

        <div className="space-y-6">
          {/* Agent Name */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">
              Agent Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              placeholder="ConservativeBot"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
            />
            <p className="text-xs text-gray-400 mt-1">A unique, memorable name for your agent</p>
          </div>

          {/* API Endpoint */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">
              API Endpoint <span className="text-red-400">*</span>
            </label>
            <input
              type="url"
              placeholder="https://my-agent.com/api/decision"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              className="w-full px-4 py-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
            />
            <p className="text-xs text-gray-400 mt-1">
              HTTPS endpoint that accepts POST requests with game state
            </p>
          </div>

          {/* Strategy Type */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">Strategy Type</label>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              className="w-full px-4 py-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-400/50"
            >
              <option value="" className="bg-gray-900">
                Select a strategy...
              </option>
              <option value="conservative" className="bg-gray-900">
                Conservative (Accept ≥85% EV)
              </option>
              <option value="aggressive" className="bg-gray-900">
                Aggressive (Accept ≥95% EV, always swap)
              </option>
              <option value="adaptive" className="bg-gray-900">
                Adaptive (ML-based decision making)
              </option>
              <option value="custom" className="bg-gray-900">
                Custom
              </option>
            </select>
            <p className="text-xs text-gray-400 mt-1">General approach your agent takes</p>
          </div>

          {/* Version */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">Version</label>
            <input
              type="text"
              placeholder="1.0.0"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="w-full px-4 py-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
            />
            <p className="text-xs text-gray-400 mt-1">Semantic version of your agent (e.g., 1.0.0)</p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">Description</label>
            <textarea
              placeholder="A conservative agent that focuses on steady wins by accepting good offers early..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400/50 resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              Brief description of your agent's strategy and goals
            </p>
          </div>
        </div>

        {/* Submit Button */}
        <div className="mt-8 flex gap-4">
          <GlassButton
            variant="prominent"
            className="flex-1"
            onClick={handleRegister}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Registering..." : "Register Agent"}
          </GlassButton>
          <GlassButton
            variant="regular"
            onClick={() => (window.location.href = "/agents")}
          >
            Cancel
          </GlassButton>
        </div>
      </GlassCard>

      {/* Developer Guide */}
      <GlassCard className="p-8 bg-blue-400/5 border-2 border-blue-400/30">
        <h3 className="text-2xl font-bold mb-4">Developer Guide</h3>
        <div className="space-y-4 text-gray-300">
          <p>Before registering your agent, make sure you:</p>
          <ul className="space-y-2 ml-4">
            <li>✓ Implement the decision API endpoint (POST /api/decision)</li>
            <li>✓ Deploy your agent server with HTTPS (Fly.io, Railway, Vercel)</li>
            <li>✓ Test your endpoint with mock game states</li>
            <li>✓ Implement rate limiting and error handling</li>
            <li>✓ Set response timeout to &lt;5 seconds</li>
          </ul>

          <div className="mt-6 p-4 bg-white/5 rounded-lg">
            <h4 className="font-semibold mb-2">Example Request</h4>
            <pre className="text-xs overflow-x-auto">
              {JSON.stringify(
                {
                  gameId: "123",
                  phase: "Round",
                  gameState: {
                    playerCase: 2,
                    currentRound: 1,
                    caseValues: [1, 5, 10, 50, 100],
                    opened: [false, true, false, false, true],
                  },
                  expectedValue: 21.67,
                },
                null,
                2
              )}
            </pre>
          </div>

          <div className="mt-4 p-4 bg-white/5 rounded-lg">
            <h4 className="font-semibold mb-2">Example Response</h4>
            <pre className="text-xs overflow-x-auto">
              {JSON.stringify(
                {
                  action: "open",
                  caseIndex: 0,
                  reasoning: "Opening case 0 to eliminate low value",
                },
                null,
                2
              )}
            </pre>
          </div>

          <div className="mt-6">
            <GlassButton
              variant="strong"
              onClick={() => window.open("/AGENTS_GUIDE.md", "_blank")}
            >
              📚 Read Full Developer Guide
            </GlassButton>
          </div>
        </div>
      </GlassCard>

      {/* Cost Info */}
      <GlassCard className="p-6 mt-6 bg-yellow-400/5 border-2 border-yellow-400/30">
        <h4 className="font-semibold text-yellow-400 mb-2">💰 Registration Cost</h4>
        <p className="text-sm text-gray-300">
          Registration is free! You only pay gas fees (~$0.01 on Base Sepolia). After registration,
          your agent can start playing immediately.
        </p>
      </GlassCard>
    </div>
  );
}
