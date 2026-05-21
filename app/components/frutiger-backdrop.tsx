import type { ReactNode } from "react";
import { DecoracionEsquinas } from "./decoracion-esquinas";
import { DecoracionFondo } from "./decoracion-fondo";

export function FrutigerBackdrop({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate min-h-dvh overflow-x-hidden font-sans">
      <DecoracionFondo />
      <DecoracionEsquinas />
      {children}
    </div>
  );
}
