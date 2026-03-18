# EVM → Aptos Move Cheatsheet

Quick reference for translating Solidity patterns to Move.

## Types

| Solidity | Move | Notes |
|----------|------|-------|
| `uint256` | `u64` or `u128` | Move has no u256. Use u128 for intermediate math |
| `int256` | `u64` + manual sign | Move has no signed integers. Use struct `{ value: u64, negative: bool }` |
| `address` | `address` | Same concept, different format (0x + 64 hex chars) |
| `bool` | `bool` | Same |
| `string` | `vector<u8>` | UTF-8 bytes, no native string type |
| `bytes32` | `vector<u8>` | Fixed-length via assertions |
| `mapping(K => V)` | `SmartTable<K, V>` | Must be in a resource struct |
| `uint256[5]` | `vector<u64>` | Dynamic size, check length manually |

## State & Storage

| Solidity | Move |
|----------|------|
| Contract state variable | Field in a `struct` with `key` ability, stored via `move_to` |
| `mapping(uint => Game) games;` | `games: SmartTable<u64, Game>` inside a resource |
| `games[id]` | `smart_table::borrow(&store.games, id)` |
| `games[id] = game;` | `smart_table::add(&mut store.games, id, game)` |
| `address(this)` | The address where the resource is stored |

## Access Control

| Solidity | Move |
|----------|------|
| `msg.sender` | `signer::address_of(signer)` |
| `require(msg.sender == owner)` | `assert!(signer::address_of(signer) == store.owner, E_NOT_OWNER)` |
| `onlyOwner` modifier | `assert!()` at function start |
| `payable` | `aptos_account::transfer(signer, to, amount)` (explicit) |

## Functions

| Solidity | Move |
|----------|------|
| `function foo() external` | `public entry fun foo(signer: &signer)` |
| `function foo() public view` | `#[view] public fun foo(): T` |
| `function foo() internal` | `fun foo()` (module-private) |
| `function foo() public` (other contracts) | `public fun foo()` or `public(friend) fun foo()` |

## Events

| Solidity | Move |
|----------|------|
| `event GameCreated(uint id, address player)` | `#[event] struct GameCreated has drop, store { game_id: u64, player: address }` |
| `emit GameCreated(id, player)` | `std::event::emit(GameCreated { game_id: id, player })` |

## Tokens

| Solidity (ETH) | Move (APT) |
|----------------|------------|
| `msg.value` | Explicit: `aptos_account::transfer(signer, to, octas)` |
| `address(this).balance` | `coin::balance<AptosCoin>(vault_addr)` |
| `payable(player).transfer(amount)` | `aptos_account::transfer(&vault_signer, player, octas)` |
| 18 decimals (wei) | 8 decimals (octas) |
| `1 ether = 1e18 wei` | `1 APT = 1e8 octas` |

## Math Conversion (18 → 8 decimals)

EVM: `(usdCents * 1e24) / ethUsdPrice` (24 = 18 + 8 - 2)
Aptos: `(usdCents * 1e14) / aptUsdPrice` (14 = 8 + 8 - 2)

## Testing

| Foundry | Aptos Move |
|---------|------------|
| `vm.prank(addr)` | Use named signer in test: `#[test(player = @0x123)]` |
| `vm.expectRevert("...")` | `#[expected_failure(abort_code = E_CODE)]` |
| `vm.warp(timestamp)` | `timestamp::fast_forward_seconds(delta)` |
| `vm.deal(addr, amount)` | `coin::mint<AptosCoin>(amount, &mint_cap)` + `coin::deposit(addr, coins)` |
| `vm.startPrank(addr)` | Pass the signer through function calls |

## Deployment

| Foundry | Aptos CLI |
|---------|-----------|
| `forge script Deploy.s.sol` | `aptos move publish --named-addresses ...` |
| `.env` with private keys | `aptos init --profile <name>` (stored in ~/.aptos/config.yaml) |
| Contract address from deploy | Module address = deployer account address |
| Constructor args | Separate `initialize()` call after publish |
