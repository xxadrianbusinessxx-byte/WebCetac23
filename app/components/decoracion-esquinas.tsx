"use client";

import Image from "next/image";
import { LOGO_ESQUINAS_SRC } from "@/lib/decoraciones/config";

export function DecoracionEsquinas() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      aria-hidden
    >
      <div
        className="absolute right-0 bottom-0 p-2 sm:p-3"
        style={{
          animation: "decor-drift-a 11s ease-in-out infinite",
        }}
      >
        <Image
          src={LOGO_ESQUINAS_SRC}
          alt=""
          width={160}
          height={160}
          unoptimized
          className="h-auto w-[min(22vw,150px)] max-w-[150px] opacity-[0.42] drop-shadow-[0_6px_20px_rgba(0,0,0,0.12)] sm:w-[min(18vw,160px)] sm:max-w-[160px] sm:opacity-45"
        />
      </div>
    </div>
  );
}
