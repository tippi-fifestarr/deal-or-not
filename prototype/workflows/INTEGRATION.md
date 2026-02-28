# Frontend Integration Guide: Phase 2 CRE Auto-Reveal

This guide shows how to integrate CRE auto-reveal into your Next.js frontend.

## Overview

With Phase 2, players only send **1 transaction** instead of 2:

**Before (Phase 1)**:
```typescript
// Player sends 2 transactions
await contract.commitCase(gameId, hash);     // TX 1
await sleep(12_000); // Wait 1 block
await contract.revealCase(gameId, case, salt); // TX 2
```

**After (Phase 2)**:
```typescript
// Player sends 1 transaction + HTTP request
await contract.commitCase(gameId, hash);     // TX 1
await submitRevealToCRE({gameId, case, salt}); // HTTP to CRE
// CRE auto-reveals after 1 block (no TX 2 needed)
```

## Step 1: Create CRE Client Hook

Create `packages/nextjs/hooks/useCREAutoReveal.ts`:

```typescript
import { useState } from "react";
import { usePublicClient } from "wagmi";
import { keccak256, encodePacked } from "viem";

interface RevealData {
  gameId: bigint;
  caseIndex: number;
  salt: bigint;
}

export function useCREAutoReveal() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const publicClient = usePublicClient();

  const submitRevealToCRE = async (data: RevealData) => {
    setIsSubmitting(true);
    try {
      // Get current block number
      const blockNumber = await publicClient.getBlockNumber();

      // Submit to CRE endpoint
      const response = await fetch(
        process.env.NEXT_PUBLIC_CRE_ENDPOINT || "http://localhost:3001/reveal",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gameId: data.gameId.toString(),
            caseIndex: data.caseIndex,
            salt: data.salt.toString(),
            player: publicClient.account?.address,
            commitBlock: Number(blockNumber),
            timestamp: Date.now(),
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`CRE submission failed: ${response.statusText}`);
      }

      console.log("[CRE] Auto-reveal request submitted successfully");
    } catch (error) {
      console.error("[CRE] Failed to submit reveal:", error);
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  };

  return { submitRevealToCRE, isSubmitting };
}
```

## Step 2: Update Game Component

Modify your game component to use auto-reveal:

```typescript
"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { keccak256, encodePacked, parseEther } from "viem";
import { useScaffoldWriteContract, useScaffoldEventHistory } from "~~/hooks/scaffold-eth";
import { useCREAutoReveal } from "~~/hooks/useCREAutoReveal";

export default function GamePlay({ gameId }: { gameId: bigint }) {
  const { address } = useAccount();
  const [selectedCase, setSelectedCase] = useState<number | null>(null);

  const { writeContractAsync, isPending } = useScaffoldWriteContract({
    contractName: "DealOrNot",
  });

  const { submitRevealToCRE, isSubmitting } = useCREAutoReveal();

  // Listen for auto-reveal completion
  const { data: collapseEvents } = useScaffoldEventHistory({
    contractName: "DealOrNot",
    eventName: "CaseCollapsed",
    filters: { gameId },
    watch: true,
  });

  const handleOpenCase = async (caseIndex: number) => {
    if (!address) return;

    try {
      // Generate random salt
      const salt = BigInt(Math.floor(Math.random() * 1e18));

      // Compute commitment hash
      const commitHash = keccak256(
        encodePacked(["uint8", "uint256"], [caseIndex, salt])
      );

      console.log("[Game] Committing case", caseIndex);

      // Step 1: Commit on-chain (TX 1)
      const tx = await writeContractAsync({
        functionName: "commitCase",
        args: [gameId, commitHash],
      });

      console.log("[Game] Commit transaction sent:", tx);

      // Step 2: Submit reveal data to CRE (HTTP request)
      await submitRevealToCRE({
        gameId,
        caseIndex,
        salt,
      });

      console.log("[Game] CRE will auto-reveal after 1 block");

      // UI shows "Revealing..." state
      setSelectedCase(caseIndex);

    } catch (error) {
      console.error("[Game] Failed to open case:", error);
      // Fallback: Player can manually reveal if CRE fails
      // (contract still accepts player reveals)
    }
  };

  return (
    <div>
      <h2>Choose a case to open</h2>

      <div className="grid grid-cols-5 gap-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <button
            key={i}
            onClick={() => handleOpenCase(i)}
            disabled={isPending || isSubmitting}
            className="btn btn-primary"
          >
            Case {i + 1}
          </button>
        ))}
      </div>

      {(isPending || isSubmitting) && (
        <div className="alert alert-info mt-4">
          <span>Processing... CRE will auto-reveal after 1 block</span>
        </div>
      )}

      {collapseEvents && collapseEvents.length > 0 && (
        <div className="alert alert-success mt-4">
          <span>
            Case revealed: ${Number(collapseEvents[collapseEvents.length - 1].args.valueCents) / 100}
          </span>
        </div>
      )}
    </div>
  );
}
```

## Step 3: Environment Configuration

Add to `.env.local`:

```bash
# CRE Auto-Reveal Endpoint
NEXT_PUBLIC_CRE_ENDPOINT=http://localhost:3001/reveal

# For production:
# NEXT_PUBLIC_CRE_ENDPOINT=https://cre.dealornot.app/reveal
```

## Step 4: Fallback to Manual Reveal

Always provide a fallback if CRE fails:

```typescript
const [showManualReveal, setShowManualReveal] = useState(false);

// After 30 seconds, show manual reveal option
useEffect(() => {
  if (isPending || isSubmitting) {
    const timer = setTimeout(() => {
      setShowManualReveal(true);
    }, 30000);
    return () => clearTimeout(timer);
  }
}, [isPending, isSubmitting]);

const handleManualReveal = async () => {
  // Player can still reveal manually if CRE fails
  await writeContractAsync({
    functionName: "revealCase",
    args: [gameId, selectedCase!, salt],
  });
};

return (
  <>
    {/* ... existing UI ... */}

    {showManualReveal && (
      <div className="alert alert-warning">
        <span>CRE taking too long?</span>
        <button onClick={handleManualReveal} className="btn btn-sm">
          Reveal Manually
        </button>
      </div>
    )}
  </>
);
```

## Step 5: Testing Locally

### Terminal 1: Run Anvil
```bash
cd prototype/contracts
anvil
```

### Terminal 2: Deploy Contract
```bash
forge script script/Deploy.s.sol --broadcast --rpc-url http://localhost:8545
```

### Terminal 3: Run CRE Workflow
```bash
cd prototype/workflows
npm install
cp .env.example .env
# Edit .env with contract address and test private key
npm start
```

### Terminal 4: Run Frontend
```bash
cd prototype/frontend
npm run dev
```

### Browser
1. Open http://localhost:3000
2. Connect wallet (MetaMask with localhost:8545)
3. Create game
4. Open a case
5. Watch CRE auto-reveal after 1 block (~2 seconds on Anvil)

## Step 6: Production Deployment

### 1. Deploy CRE Workflow

Deploy CRE workflow to DON infrastructure:

```bash
# Package workflow
cd workflows
npm run build

# Deploy to Chainlink DON (via Chainlink dashboard)
# Upload: case-reveal-orchestrator.ts
# Set env vars in DON config
```

### 2. Set Keystone Forwarder

After contract deployment:

```bash
# Get Keystone address from Chainlink docs
# Base: 0x... (check docs.chain.link)

cast send $CONTRACT_ADDRESS "setKeystoneForwarder(address)" $KEYSTONE_ADDRESS \
  --rpc-url $BASE_RPC \
  --private-key $DEPLOYER_KEY

cast send $CONTRACT_ADDRESS "setAutoRevealEnabled(bool)" true \
  --rpc-url $BASE_RPC \
  --private-key $DEPLOYER_KEY
```

### 3. Update Frontend ENV

```bash
# .env.production
NEXT_PUBLIC_CRE_ENDPOINT=https://cre-api.dealornot.app/reveal
NEXT_PUBLIC_ENABLE_AUTO_REVEAL=true
```

### 4. Monitor CRE

Set up monitoring:
- CRE workflow health checks
- Reveal success rate
- Average reveal latency
- Keystone consensus failures

## Security Checklist

- [ ] CRE endpoint requires player signature verification
- [ ] Rate limiting on reveal submissions (max 1 per block per player)
- [ ] Verify commit exists on-chain before accepting reveal data
- [ ] Check reveal data hasn't expired (< 256 blocks)
- [ ] Keystone Forwarder address is correct for target network
- [ ] Auto-reveal can be disabled by owner if needed
- [ ] Fallback to manual reveal always available
- [ ] Don't expose DON_NODE_KEY in frontend

## Cost Comparison

| Scenario | Player Pays | DON Pays | Total Cost |
|----------|-------------|----------|------------|
| **Phase 1 (Manual)** | 2 TX (~$0.017) | $0 | $0.017 |
| **Phase 2 (Auto-Reveal)** | 1 TX (~$0.005) | 1 TX (~$0.014) | $0.019 |

**Player saves**: ~70% gas cost
**DON cost**: ~$0.014 per game (can be subsidized by protocol)

## Troubleshooting

### "CRE endpoint not responding"
- Check CRE workflow is running: `curl http://localhost:3001/health`
- Check network connectivity
- Verify NEXT_PUBLIC_CRE_ENDPOINT is correct

### "Reveal not happening"
- Check DON node logs for errors
- Verify Keystone Forwarder address is set correctly
- Check autoRevealEnabled is true on contract
- Verify reveal data was submitted successfully

### "Reveal failed: NotAuthorizedRevealer"
- Keystone Forwarder address mismatch
- autoRevealEnabled is false
- Check contract.keystoneForwarder() returns correct address

### "Reveal failed: InvalidReveal"
- Hash mismatch (caseIndex or salt incorrect)
- Check reveal data submitted matches commit

## Next Steps

After Phase 2 is working:
- **Phase 3**: Add threshold encryption for reveal data
- **Phase 4**: Add AI Banker CRE workflow
- **Phase 5**: CCIP cross-chain games

See `workflows/README.md` for roadmap details.
