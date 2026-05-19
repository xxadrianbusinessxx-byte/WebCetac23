"use client";

import Image from "next/image";
import { useMemo } from "react";
import {
  separarCapasDecoracion,
  STICKER_LAYOUT,
} from "@/lib/decoraciones/capas";

export function DecoracionFondo() {
  const { fondo, stickers } = useMemo(() => separarCapasDecoracion(), []);

  if (!fondo && !stickers.length) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      aria-hidden
    >
      {fondo && (
        <div className="absolute inset-0">
          <Image
            src={fondo.src}
            alt=""
            fill
            priority
            quality={92}
            sizes="100vw"
            className="object-cover object-center"
          />
        </div>
      )}

      {stickers.map((capa, i) => {
        const layout = STICKER_LAYOUT[i % STICKER_LAYOUT.length];
        const usarDerecha = layout.left === "right";
        return (
          <Image
            key={capa.nombre}
            src={capa.src}
            alt=""
            width={400}
            height={400}
            unoptimized={capa.nombre.endsWith(".png")}
            className="absolute h-auto drop-shadow-[0_10px_28px_rgba(0,0,0,0.4)] will-change-transform transition-opacity duration-500"
            style={{
              left: usarDerecha ? undefined : layout.left,
              right: usarDerecha ? "2%" : undefined,
              top: layout.top,
              width: layout.width,
              opacity: 0.88,
              animation: `${layout.anim} 9s ease-in-out infinite`,
              animationDelay: layout.delay,
            }}
          />
        );
      })}
    </div>
  );
}
