"use client";

import { useState, useCallback } from "react";
import { keccak256, encodePacked } from "viem";

interface CommitRevealState {
  caseIndex: number | null;
  salt: bigint | null;
  commitHash: bigint | null;
}

const STORAGE_KEY = "deal_commit_reveal";

function generateSalt(): bigint {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return BigInt("0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join(""));
}

export function useCommitReveal() {
  const [state, setState] = useState<CommitRevealState>(() => {
    if (typeof window === "undefined") return { caseIndex: null, salt: null, commitHash: null };
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          caseIndex: parsed.caseIndex,
          salt: BigInt(parsed.salt),
          commitHash: BigInt(parsed.commitHash),
        };
      }
    } catch {}
    return { caseIndex: null, salt: null, commitHash: null };
  });

  const generateCommit = useCallback((caseIndex: number) => {
    const salt = generateSalt();
    const hash = keccak256(encodePacked(["uint8", "uint256"], [caseIndex, salt]));
    const commitHash = BigInt(hash);

    const newState = { caseIndex, salt, commitHash };
    setState(newState);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        caseIndex,
        salt: salt.toString(),
        commitHash: commitHash.toString(),
      })
    );

    return { salt, commitHash };
  }, []);

  const clearCommit = useCallback(() => {
    setState({ caseIndex: null, salt: null, commitHash: null });
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    ...state,
    generateCommit,
    clearCommit,
  };
}
