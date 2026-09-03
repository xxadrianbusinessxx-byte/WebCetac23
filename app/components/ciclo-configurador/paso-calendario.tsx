"use client";

import { CalendarioEscolarPanel } from "../calendario-escolar-panel";

export function PasoCalendario({ periodoId, nombreCiclo }: { periodoId: string; nombreCiclo: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-extrabold uppercase tracking-wide text-indigo-900">
        Paso 5 · Calendario del ciclo — {nombreCiclo}
      </p>
      <CalendarioEscolarPanel periodoIdInicial={periodoId} periodoNombre={nombreCiclo} />
    </div>
  );
}
