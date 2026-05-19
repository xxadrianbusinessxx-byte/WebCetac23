import type { ReactNode } from "react";
import { DecoracionFondo } from "./decoracion-fondo";

export function FrutigerBackdrop({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate min-h-dvh overflow-x-hidden font-sans">
      <DecoracionFondo />
      {children}
    </div>
  );
}
