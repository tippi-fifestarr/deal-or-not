"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { hardhat } from "viem/chains";
import { Bars3Icon, BugAntIcon } from "@heroicons/react/24/outline";
import { PresentationSlides } from "~~/components/PresentationSlides";
import { FaucetButton, RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useOutsideClick, useTargetNetwork } from "~~/hooks/scaffold-eth";

type HeaderMenuLink = {
  label: string;
  href: string;
  icon?: React.ReactNode;
};

export const menuLinks: HeaderMenuLink[] = [
  {
    label: "ZK Mode",
    href: "/game",
  },
  {
    label: "Br\u00F6dinger's",
    href: "/cashcase",
  },
];

export const HeaderMenuLinks = () => {
  const pathname = usePathname();

  return (
    <>
      {menuLinks.map(({ label, href, icon }) => {
        const isActive = pathname === href;
        return (
          <li key={href}>
            <Link
              href={href}
              passHref
              className={`${
                isActive ? "bg-secondary shadow-md" : ""
              } hover:bg-secondary hover:shadow-md focus:!bg-secondary active:!text-neutral py-1.5 px-3 text-sm rounded-full gap-2 grid grid-flow-col`}
            >
              {icon}
              <span>{label}</span>
            </Link>
          </li>
        );
      })}
    </>
  );
};

/**
 * Site header
 */
export const Header = () => {
  const { targetNetwork } = useTargetNetwork();
  const isLocalNetwork = targetNetwork.id === hardhat.id;
  const [showSlides, setShowSlides] = useState(false);

  const burgerMenuRef = useRef<HTMLDetailsElement>(null);
  useOutsideClick(burgerMenuRef, () => {
    burgerMenuRef?.current?.removeAttribute("open");
  });

  return (
    <>
      <div className="sticky lg:static top-0 navbar bg-base-100 min-h-0 shrink-0 justify-between z-20 shadow-md shadow-secondary px-0 sm:px-2">
        <div className="navbar-start w-auto lg:w-1/2">
          <details className="dropdown" ref={burgerMenuRef}>
            <summary className="ml-1 btn btn-ghost lg:hidden hover:bg-transparent">
              <Bars3Icon className="h-1/2" />
            </summary>
            <ul
              className="menu menu-compact dropdown-content mt-3 p-2 shadow-sm bg-base-100 rounded-box w-52"
              onClick={() => {
                burgerMenuRef?.current?.removeAttribute("open");
              }}
            >
              <HeaderMenuLinks />
              <li>
                <button onClick={() => setShowSlides(true)} className="py-1.5 px-3 text-sm">
                  About
                </button>
              </li>
              <li>
                <Link href="/debug" className="py-1.5 px-3 text-sm">
                  <BugAntIcon className="h-4 w-4" /> Debug
                </Link>
              </li>
            </ul>
          </details>
          <Link href="/" passHref className="hidden lg:flex items-center gap-2 ml-4 mr-6 shrink-0">
            <span className="text-2xl">💼</span>
            <div className="flex flex-col">
              <span className="font-bold leading-tight">Deal or NOT!</span>
              <span className="text-xs opacity-70">Cash Case</span>
            </div>
          </Link>
          <ul className="hidden lg:flex lg:flex-nowrap menu menu-horizontal px-1 gap-2">
            <HeaderMenuLinks />
            <li>
              <button
                onClick={() => setShowSlides(true)}
                className="py-1.5 px-3 text-sm rounded-full hover:bg-secondary hover:shadow-md"
              >
                About
              </button>
            </li>
          </ul>
        </div>

        <div className="navbar-end w-auto lg:w-1/2 grow mr-4">
          <RainbowKitCustomConnectButton />
          {isLocalNetwork && <FaucetButton />}
        </div>
      </div>

      {/* Presentation slides modal */}
      <PresentationSlides open={showSlides} onClose={() => setShowSlides(false)} />
    </>
  );
};
