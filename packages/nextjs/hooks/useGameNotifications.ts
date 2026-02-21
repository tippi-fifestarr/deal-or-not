"use client";

import { useEffect, useRef } from "react";
import { GameState } from "~~/contracts/DealOrNoDealAbi";

export const useGameNotifications = ({
  gameState,
  lotteryEndTime,
  revealEndTime,
  isContestant,
  enabled = true,
}: {
  gameState: number;
  lotteryEndTime: bigint | undefined;
  revealEndTime: bigint | undefined;
  isContestant: boolean;
  enabled?: boolean;
}) => {
  const lastStateRef = useRef<number>(gameState);
  const notifiedLotteryClose = useRef(false);
  const notifiedRevealClose = useRef(false);

  // Request notification permission
  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !("Notification" in window)) return;

    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [enabled]);

  // Notify on state changes
  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const prevState = lastStateRef.current;
    lastStateRef.current = gameState;

    // Lottery closed - time to reveal
    if (prevState === GameState.LotteryOpen && gameState === GameState.LotteryReveal) {
      new Notification("Deal or NOT!", {
        body: "Lottery closed! Reveal your secret now.",
        icon: "/favicon.ico",
        tag: "lottery-reveal",
      });
    }

    // Winner drawn - game starting
    if (prevState === GameState.LotteryReveal && gameState === GameState.LotteryComplete) {
      if (isContestant) {
        new Notification("Deal or NOT! - YOU WON!", {
          body: "You won the lottery! Select your briefcase.",
          icon: "/favicon.ico",
          tag: "winner",
        });
      } else {
        new Notification("Deal or NOT!", {
          body: "Winner has been drawn. Game is starting!",
          icon: "/favicon.ico",
          tag: "game-start",
        });
      }
    }

    // Banker offer
    if (gameState === GameState.BankerOffer && isContestant) {
      new Notification("Deal or NOT! - Banker Calling!", {
        body: "The banker has made an offer. Deal… or NOT?",
        icon: "/favicon.ico",
        tag: "banker-offer",
      });
    }
  }, [gameState, isContestant, enabled]);

  // Notify when timers expire
  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const checkTimers = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);

      // Lottery closing soon
      if (gameState === GameState.LotteryOpen && lotteryEndTime && !notifiedLotteryClose.current) {
        const secondsLeft = Number(lotteryEndTime) - now;
        if (secondsLeft <= 60 && secondsLeft > 0) {
          notifiedLotteryClose.current = true;
          new Notification("Deal or NOT!", {
            body: "Lottery closing in 1 minute! Enter now or miss out.",
            icon: "/favicon.ico",
            tag: "lottery-closing",
          });
        }
      }

      // Reveal window closing soon
      if (gameState === GameState.LotteryReveal && revealEndTime && !notifiedRevealClose.current) {
        const secondsLeft = Number(revealEndTime) - now;
        if (secondsLeft <= 60 && secondsLeft > 0) {
          notifiedRevealClose.current = true;
          new Notification("Deal or NOT!", {
            body: "Reveal window closing in 1 minute! Reveal your secret now.",
            icon: "/favicon.ico",
            tag: "reveal-closing",
          });
        }
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(checkTimers);
  }, [gameState, lotteryEndTime, revealEndTime, enabled]);

  // Reset notification flags when state changes
  useEffect(() => {
    if (gameState !== GameState.LotteryOpen) {
      notifiedLotteryClose.current = false;
    }
    if (gameState !== GameState.LotteryReveal) {
      notifiedRevealClose.current = false;
    }
  }, [gameState]);
};
