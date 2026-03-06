# Frontend Integration Guide — CRE Confidential Workflows

How the Next.js frontend interacts with the CRE workflow system.

## Architecture

The frontend **does not call CRE directly**. Instead:

1. Frontend writes to the smart contract (player actions)
2. Contract emits events
3. CRE workflows listen for those events and act autonomously
4. Frontend reads updated contract state and events to reflect changes

```
Browser (Next.js)                     On-Chain                          CRE DON
  |                                     |                                 |
  |-- createGame() ------------------>  |                                 |
  |                                     |-- GameCreated event ----------> |
  |                                     |<-- VRF callback                 |
  |                                     |                                 |
  |-- pickCase(gid, case) ----------->  |                                 |
  |                                     |-- CasePicked event             |
  |                                     |                                 |
  |-- openCase(gid, case) ----------->  |                                 |
  |                                     |-- CaseOpenRequested event ---> |
  |                                     |                     confidential-reveal
  |                                     |                     sponsor-jackpot
  |                                     |<-- fulfillCaseValue()           |
  |                                     |-- CaseRevealed event           |
  |                                     |-- RoundComplete event -------> |
  |                                     |                     banker-ai  |
  |                                     |<-- setBankerOfferWithMessage()  |
  |<-- reads BankerOfferMade event -----|                                 |
  |<-- reads BankerMessage event -------|                                 |
  |                                     |                                 |
  |-- acceptDeal() / rejectDeal() --->  |                                 |
```

## Frontend Hooks

### `useGameContract.ts` — Primary contract interaction

**Read hooks** (poll contract state):
- `useGameState(gameId)` — Full game state tuple (phase, player, cases, offer, etc.)
- `useNextGameId()` — Counter for next game ID
- `useRemainingPool(gameId)` — Array of remaining case values
- `useBankerOfferCalc(gameId)` — On-chain banker offer calculation
- `useJackpot(gameId)` — Current jackpot amount from SponsorJackpot contract
- `useGameSponsor(gameId)` — Sponsor info for the game

**Write hook** (`useGameWrite()`):
- `createGame()` — Creates a new game, triggers VRF
- `pickCase(gameId, caseIndex)` — Player selects their case (0-4)
- `openCase(gameId, caseIndex)` — Opens a case, emits `CaseOpenRequested` for CRE
- `acceptDeal(gameId)` — Accept the banker's offer
- `rejectDeal(gameId)` — Reject and continue playing
- `keepCase(gameId)` — Keep your case in final round
- `swapCase(gameId)` — Swap your case in final round

### `useBankerMessage.ts` — AI Banker personality

Reads the latest banker message from the BestOfBanker contract:
```typescript
const message = useBankerMessage(gameId);
// Returns: "I've seen better poker faces on a goldfish. $0.35. Take it or leave it."
```

### `useCommitReveal.ts` — Local storage for commit-reveal

Used internally for the commit-reveal pattern. Stores salts in `localStorage` so the player can reveal if CRE fails.

## Game Phases

The frontend UI switches based on the `phase` field from `useGameState()`:

| Phase | Value | Frontend Shows |
|-------|-------|----------------|
| WaitingForVRF | 0 | Loading spinner, "Waiting for randomness..." |
| Created | 1 | Case selection grid (pick your case) |
| Round | 2 | Remaining cases to open |
| WaitingForCRE | 3 | Loading spinner, "Revealing case..." |
| AwaitingOffer | 4 | Loading spinner, "Banker is thinking..." |
| BankerOffer | 5 | Deal or No Deal decision UI with banker message |
| FinalRound | 6 | Keep or Swap decision |
| WaitingFinalCRE | 7 | Loading spinner, "Final reveal..." |
| GameOver | 8 | Results screen with payout |

## Event Monitoring — `EventLog.tsx`

The `EventLog` component watches 14+ contract events in real-time:

- Fetches historical events (last ~10k blocks)
- Watches for new events with 4s polling
- Deduplicates by event name + block number
- Color-coded by event type
- Auto-scrolls on new events

Key events the frontend reacts to:
- `CaseRevealed` — Update case grid with revealed value
- `BankerOfferMade` — Show banker offer amount
- `BankerMessage` — Display AI banker's snarky message
- `GameResolved` — Show final payout and results

## Case Values

5 cases with values in cents: `[1, 5, 10, 50, 100]` ($0.01 to $1.00).

Values are **not known until CRE reveals them**. The VRF seed provides entropy, and the CRE `confidential-reveal` workflow computes each value deterministically when the case is opened.

## Testing the Full Flow

The CRE workflows don't run automatically in development — you need the support script to simulate them locally.

```bash
# Terminal 1: Start the frontend
cd prototype/frontend
npm run dev

# Terminal 2: Start the CRE auto-orchestrator
cd prototype
cre login                          # token expires every 15 min
./scripts/cre-support.sh <GID> 5   # watches game, auto-triggers CRE workflows

# Terminal 3 (optional): Watch game state
watch -n 5 './scripts/game-state.sh <GID>'
```

Then in the browser:
1. Create a game (or use `./scripts/play-game.sh create` in a terminal)
2. Wait ~10s for VRF callback (phase changes from WaitingForVRF to Created)
3. Pick your case
4. Open cases — `cre-support.sh` will detect the `CaseOpenRequested` event and run the reveal + banker workflows
5. The banker offer and AI message appear in the UI automatically

If `cre-support.sh` isn't running, case reveals won't happen and the game will be stuck in `WaitingForCRE`.

## Adding a New Event to the Frontend

1. Add the event name to the `WATCHED_EVENTS` array in `EventLog.tsx`
2. The event will automatically appear in the event log
3. To react to the event in game logic, add a handler in the game page component that watches for the event via `useScaffoldEventHistory` or `useScaffoldWatchContractEvent`
