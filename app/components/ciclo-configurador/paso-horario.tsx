"use client";

import { HorarioEscolarPanel } from "../horario-escolar-panel";

export function PasoHorario({ periodoId }: { periodoId: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-extrabold uppercase tracking-wide text-indigo-900">
        Paso 6 · Horario del periodo
      </p>
      <HorarioEscolarPanel periodoIdInicial={periodoId} />
    </div>
  );
}
