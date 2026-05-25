"use client";

import { useMemo } from "react";
import { ImagenEager, ImagenEagerFill } from "@/app/components/imagen-eager";
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
          <ImagenEagerFill
            src={fondo.src}
            alt=""
            className="object-cover object-center"
          />
        </div>
      )}

      {stickers.map((capa, i) => {
        const layout = STICKER_LAYOUT[i % STICKER_LAYOUT.length];
        const usarDerecha = layout.left === "right";
        return (
          <ImagenEager
            key={capa.nombre}
            src={capa.src}
            alt=""
            width={400}
            height={400}
            fetchPriority="high"
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
