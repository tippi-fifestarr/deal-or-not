# Contributing to Deal or NOT

## Team

| Commit Author | Who |
|---|---|
| `tippi-fifestarr` / `Tippi Fifestarr` | Tippi + Tippi's Claude |
| `uni` | Ryan + Ryan's Claude |
| `rdobbeck` | Ryan (GitHub merge buttons) |

## Git Workflow

### The One Rule

**Code flows one direction: your branch → main. Never main → your branch.**

```
CORRECT:
  your-branch ──── PR merge ────→ main

WRONG:
  main ──── merge ────→ your-branch
```

### Why This Matters

When you merge main into your feature branch, you inject everyone else's work into your branch's history. Your PR diff balloons with changes that aren't yours, making review impossible. Worse, if your branch replaces code that exists on main (which we do constantly — Functions → CRE, old ABI → new ABI), git can't tell which version wins and creates merge conflicts that someone else has to clean up.

Each merge-main-into-branch creates noise that propagates forward into the next branch and the next merge. It compounds.

### The Feature Branch Lifecycle

```bash
# 1. Create your branch from main
git checkout main
git pull
git checkout -b feat/my-feature

# 2. Do your work, commit as you go
git add <files>
git commit -m "feat: add the thing"

# 3. Push and open a PR
git push -u origin feat/my-feature
gh pr create --title "feat: add the thing"

# 4. PR gets reviewed and merged to main via GitHub
# 5. Delete your branch. Done.
```

### "But I Need Something From Main"

If Tippi landed a change on main that your code depends on (a function signature changed, a new interface you need):

**Option A — Rebase (preferred):**
```bash
# Replays YOUR commits on top of main's latest state
# Your branch stays clean — just your work, on a fresh base
git fetch origin
git rebase origin/main
```

**Option B — Ask first:**
If rebase feels risky, just ask: "Main has a change I need, what should I do?" That's always better than a merge that creates a mess.

**Option C — It can probably wait:**
Most of the time you don't actually need the new code from main. Just finish your feature, open the PR, and GitHub will merge it cleanly. Your branch doesn't need to be "up to date" — it needs to be correct.

### For Your Claude Too

If you're using Claude Code, make sure it follows the same rule. Don't let it run `git merge main` into your feature branch thinking it's being helpful. If Claude suggests merging main in, tell it no.

### Commit Messages

Write a short subject line describing what you did. If it's a big change, add a body explaining why.

```
feat: add AI Banker CRE workflow with Gemini integration

- Log trigger on RoundComplete events
- Gemini LLM generates snarky personality messages
- Temperature 0 for DON consensus across nodes
- Writes offer + message via setBankerOfferWithMessage()
```

Prefixes: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`

### PR Descriptions

Include a summary of what changed and why. Reference the whitepaper section if relevant. List any contracts deployed or addresses changed.

---

## Appendix: The Cautionary Tale

*See `docs/DEAL_OR_NOT_GIT_EDITION.md` for the full story of what happens when you merge main into your branch three times in a row.*
