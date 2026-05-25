import Link from "next/link";
import type { ReactNode } from "react";

export function GlossyNavPill({
  children,
  active,
  href,
}: {
  children: ReactNode;
  active?: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={`relative flex-1 overflow-hidden rounded-full border border-white/35 px-6 py-2.5 text-center text-sm font-extrabold uppercase tracking-wider shadow-[inset_0_2px_0_rgba(255,255,255,0.35),inset_0_-2px_0_rgba(0,0,0,0.2),0_4px_14px_rgba(2,6,23,0.12)] transition hover:brightness-105 sm:flex-none sm:px-10 ${
        active
          ? "bg-linear-to-b from-sky-500 via-sky-700 to-sky-900 text-white"
          : "bg-linear-to-b from-sky-600 via-sky-800 to-sky-950 text-white/95"
      } before:pointer-events-none before:absolute before:inset-x-4 before:top-0 before:h-[46%] before:rounded-b-[100%] before:bg-linear-to-b before:from-white/45 before:to-transparent`}
    >
      {children}
    </Link>
  );
}
