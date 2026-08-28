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
      className={`relative flex-none overflow-hidden rounded-full border border-white/40 px-4 py-2.5 text-center text-sm font-extrabold uppercase tracking-wider shadow-[inset_0_2px_0_rgba(255,255,255,0.4),inset_0_-2px_0_rgba(0,0,0,0.28),0_6px_18px_rgba(2,6,23,0.35)] ring-1 ring-white/20 transition hover:brightness-110 sm:px-10 ${
        active
          ? "bg-linear-to-b from-sky-400 via-sky-600 to-sky-800 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
          : "bg-linear-to-b from-sky-600 via-sky-800 to-sky-950 text-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
      } before:pointer-events-none before:absolute before:inset-x-4 before:top-0 before:h-[46%] before:rounded-b-[100%] before:bg-linear-to-b before:from-white/45 before:to-transparent`}
    >
      {children}
    </Link>
  );
}
