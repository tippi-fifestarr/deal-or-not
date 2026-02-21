import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import Web3Provider from "../components/providers/Web3Provider";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Deal or No Deal",
  description: "On-chain Deal or No Deal with Chainlink VRF & Price Feeds",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistMono.variable} font-mono antialiased bg-gray-950 text-white min-h-screen`}>
        <Web3Provider>{children}</Web3Provider>
      </body>
    </html>
  );
}
