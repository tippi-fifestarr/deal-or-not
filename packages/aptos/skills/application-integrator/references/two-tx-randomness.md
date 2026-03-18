# Two-TX Randomness Pattern — Full Application Guide

## The Problem

In blockchain games, if randomness is generated in the same transaction the player controls, they can:
1. **Undergasing attack:** Set gas just high enough to see the result, abort if unfavorable
2. **Selective abort:** Abort the TX if the random outcome is bad

## The Solution: Two-TX Pattern

**TX1 (Player):** Commits intent. No randomness consumed.
```move
public entry fun open_case(
    player: &signer,
    game_store_addr: address,
    game_id: u64,
    case_index: u8,
) acquires GameStore {
    // ... validate phase, player, case ...
    game.pending_case_index = case_index;
    game.phase = PHASE_WAITING_FOR_REVEAL;
    std::event::emit(CaseOpenRequested { game_id, case_index });
}
```

**TX2 (Resolver):** Generates randomness. Player can't influence this.
```move
#[randomness]
entry fun reveal_case(
    resolver: &signer,
    game_store_addr: address,
    game_id: u64,
) acquires GameStore {
    let store = borrow_global_mut<GameStore>(game_store_addr);
    assert!(signer::address_of(resolver) == store.resolver, E_NOT_RESOLVER);
    // ... use randomness::u64_range() ...
}
```

## The Missing Piece: The Resolver

TX2 doesn't happen by itself. Something must:
1. Watch for the game to enter `WaitingForReveal` phase
2. Submit the `reveal_case` transaction as the resolver account

On EVM, Chainlink CRE triggers workflows on events. **Aptos has no equivalent.**

### Script Resolver (what we built)

```bash
# aptos-resolver.sh — polls game state, acts on phase changes
while true; do
  PHASE=$(get_phase $GAME_ID)
  case "$PHASE" in
    WaitingForReveal) reveal_case ;;
    AwaitingOffer)    calc_and_set_offer ;;
    FinalRound)       keep_or_swap_case ;;
    GameOver)         exit 0 ;;
  esac
  sleep 3
done
```

### Frontend Integration

The frontend must NOT call `#[randomness]` functions. The player's wallet will get `E_NOT_RESOLVER`.

```typescript
// WRONG — player can't call this
const keepCase = () => submitTx("keep_case", [addr, gameId]);

// RIGHT — player signals intent, resolver executes
const requestKeep = () => submitTx("request_keep", [addr, gameId]);
// Then resolver polls for player_final_choice and calls keep_case
```

## Full State Machine

```
Player TX:  create_game → pick_case → open_case ──→ accept_deal / reject_deal ──→ request_keep/swap
                                          │                    ↑                        │
Resolver TX:                              └→ reveal_case → set_offer              keep_case / swap_case
```

## Key Files

- Contract: `sources/deal_or_not_quickplay.move` (lines 258-305 for reveal_case)
- Resolver: `scripts/aptos-resolver.sh`
- Frontend hook: `dealornot/hooks/aptos/useAptosGame.ts`
