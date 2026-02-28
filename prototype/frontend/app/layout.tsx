import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import Web3Provider from "@/components/providers/Web3Provider";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Deal or NOT",
  description: "Quantum cases on Base Sepolia — Chainlink VRF + Commit-Reveal",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistMono.variable} antialiased bg-gray-950 text-gray-100 min-h-screen`}>
        <Web3Provider>{children}</Web3Provider>
      </body>
    </html>
  );
}
