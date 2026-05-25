import type { ReactNode } from "react";
import { DecoracionEsquinas } from "./decoracion-esquinas";
import { DecoracionFondo } from "./decoracion-fondo";
import { ForzarImagenesEager } from "./forzar-imagenes-eager";

export function FrutigerBackdrop({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate min-h-dvh overflow-x-hidden font-sans">
      <ForzarImagenesEager />
      <DecoracionFondo />
      <DecoracionEsquinas />
      {children}
    </div>
  );
}
