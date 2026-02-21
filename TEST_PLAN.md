# Test Plan - Deal or No Deal

## ✅ Testing Checklist

### Phase 1: New Features Smoke Test
- [ ] **Homepage** (`/`)
  - [ ] "Browse Games" button visible
  - [ ] "View Stats" button visible
  - [ ] Both links work

- [ ] **Browse Page** (`/browse`)
  - [ ] Shows all created games
  - [ ] Filter buttons work (All/Lottery/Active/Completed)
  - [ ] Search box filters by address
  - [ ] Game cards display correctly
  - [ ] Click game card → navigates to game page

- [ ] **Stats Page** (`/stats`)
  - [ ] Total games count displays
  - [ ] Progressive jackpot shows (in USD if available)
  - [ ] Total paid out calculates
  - [ ] Deal rate % shows
  - [ ] Top 10 leaderboard populates
  - [ ] Outcome breakdown (Deal/No Deal/Timeout) shows

- [ ] **Live Countdown Timers**
  - [ ] Lottery timer counts down live (updates every second)
  - [ ] Reveal timer counts down live
  - [ ] Format changes: `5h 30m 15s` → `30m 15s` → `15s`
  - [ ] Timer highlighted in warning color

- [ ] **Browser Notifications**
  - [ ] Permission requested on first visit (when wallet connected)
  - [ ] (Test later during game flow)

- [ ] **USD Pricing**
  - [ ] Prize board shows USD values
  - [ ] Banker offer shows USD (large) + ETH (small)
  - [ ] EV Dashboard shows USD
  - [ ] Jackpot badge shows USD
  - [ ] Game over screen shows USD

---

### Phase 2: Full Game Flow Test

#### Setup
- [ ] Anvil running (`yarn chain`)
- [ ] Contracts deployed
- [ ] Frontend running (`yarn start`)
- [ ] Wallet connected
- [ ] Factory address known

#### Game Creation
- [ ] Host creates game with:
  - Entry fee: 0.1 ETH
  - Lottery duration: 300s (5 min)
  - Reveal duration: 180s (3 min)
  - Min players: 2
- [ ] Game appears on browse page
- [ ] Navigate to game page

#### Lottery Phase
- [ ] Host clicks "Open Lottery"
- [ ] **Countdown timer starts** ✅ NEW
- [ ] **Timer updates every second** ✅ NEW
- [ ] Switch to player wallet (Account #1)
- [ ] Player enters lottery (commits hash)
- [ ] Switch to player wallet (Account #2)
- [ ] Player enters lottery
- [ ] **Try to enter as host** → Should FAIL with HostCannotEnterLottery ✅ SECURITY FIX
- [ ] Wait for timer OR fast-forward time with anvil
- [ ] **"Close Lottery" button appears** ✅ NEW
- [ ] **Button shows for ALL players, not just host** ✅ NEW
- [ ] Anyone clicks "Close Lottery"
- [ ] **Notification: "Lottery closed! Reveal your secret"** ✅ NEW

#### Reveal Phase
- [ ] **Reveal countdown timer starts** ✅ NEW
- [ ] Player 1 reveals secret
- [ ] Player 2 reveals secret
- [ ] **Notification: "Reveal window closing in 1 minute"** (if timer > 60s) ✅ NEW
- [ ] Wait for timer OR fast-forward
- [ ] **"Draw Winner" button appears for ALL players** ✅ NEW
- [ ] Anyone clicks "Draw Winner"
- [ ] **Winner notification appears** ✅ NEW

#### Game Play Phase
- [ ] Winner selects briefcase
- [ ] **Briefcase values show in USD** ✅ NEW
- [ ] Open 6 cases (Round 1)
- [ ] Banker offer appears
- [ ] **Banker offer shows USD (large) + ETH (small)** ✅ NEW
- [ ] **Notification: "Banker calling!"** (for contestant only) ✅ NEW
- [ ] **EV Dashboard shows USD** ✅ NEW
- [ ] Reject offer (NO DEAL)
- [ ] Continue through rounds
- [ ] Accept offer OR reveal final case

#### Game End
- [ ] **Game over screen shows USD payout** ✅ NEW
- [ ] Non-winners can claim refunds
- [ ] Game appears as "Completed" on browse page
- [ ] Stats page updates:
  - [ ] Total games +1
  - [ ] Total paid out increases
  - [ ] Leaderboard updates (if big win)
  - [ ] Deal rate % recalculates

---

### Phase 3: Edge Case Testing

#### Security Tests
- [ ] Host CANNOT enter lottery (reverts with HostCannotEnterLottery)
- [ ] Player cannot reveal with wrong secret
- [ ] Player cannot claim refund twice
- [ ] Cannot open same case twice
- [ ] Cannot skip game states

#### Timeout Tests
- [ ] No one enters → game cancels → refunds all
- [ ] No one reveals → game cancels → refunds all
- [ ] Contestant never selects case → timeout resolution works
- [ ] Contestant abandons mid-game → timeout resolution works

#### Multi-Game Tests
- [ ] Create 3 games simultaneously
- [ ] All 3 appear on browse page
- [ ] Filter "Active" shows all 3
- [ ] Join lottery in 2 different games
- [ ] Games progress independently
- [ ] Browse page updates as games complete
- [ ] Stats page aggregates all games

#### Notification Tests
- [ ] Notifications disabled if wallet not connected
- [ ] Notifications don't duplicate
- [ ] Clicking notification focuses browser tab (browser default)
- [ ] Notifications work across page refreshes

---

### Phase 4: Performance Testing

#### Large Game Test
- [ ] Create game with 20+ players
- [ ] All enter lottery
- [ ] All reveal secrets
- [ ] Winner drawn successfully
- [ ] Refunds process for all losers
- [ ] No gas limit issues

#### Browser Test
- [ ] Test in Chrome
- [ ] Test in Firefox
- [ ] Test in Safari
- [ ] Test mobile responsive (iPhone/Android size)

---

## 🐛 Bug Tracking

| Bug ID | Description | Severity | Status | Fix |
|--------|-------------|----------|--------|-----|
| | | | | |

---

## 📊 Test Results Summary

**Date**: ___________
**Tester**: ___________
**Environment**: Localhost / Testnet / Mainnet

**Passed**: _____ / _____
**Failed**: _____ / _____
**Blocked**: _____ / _____

**Critical Issues Found**: _____
**Recommendations**: _____

---

## 🚀 Ready for Production?

**Checklist:**
- [ ] All Phase 1 tests pass
- [ ] All Phase 2 tests pass
- [ ] All Phase 3 tests pass
- [ ] 0 critical bugs
- [ ] Performance acceptable (< 5s load time)
- [ ] Mobile responsive
- [ ] Real ZK proofs implemented (CRITICAL)
- [ ] Testnet deployment successful
- [ ] Professional security audit completed

**Status**: ⬜ NOT READY | ⬜ READY FOR TESTNET | ⬜ READY FOR PRODUCTION
