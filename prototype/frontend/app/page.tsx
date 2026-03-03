import GameBoard from "@/components/game/GameBoard";
import BestOfBanker from "@/components/BestOfBanker";

export default function Home() {
  return (
    <main className="min-h-screen px-4 py-8">
      <GameBoard />
      <BestOfBanker />
    </main>
  );
}
