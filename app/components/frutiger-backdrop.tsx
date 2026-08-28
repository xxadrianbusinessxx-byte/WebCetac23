import type { ReactNode } from "react";

/**
 * C4.27-A — El fondo global (DecoracionFondo + DecoracionEsquinas) se monta
 * UNA sola vez en app/layout.tsx. Este componente es solo el shell de contenido:
 * crea el stacking context que coloca las páginas por encima del fondo fijo.
 */
export function FrutigerBackdrop({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate z-[1] min-h-dvh overflow-x-hidden font-sans">
      {children}
    </div>
  );
}
