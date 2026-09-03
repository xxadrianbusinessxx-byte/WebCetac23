"use client";

import { useState } from "react";
import { actionClonarContextoAcademico } from "@/app/actions/contexto-ciclo";
import type { DetalleCicloAdmin } from "@/app/actions/evaluaciones";

const input = "rounded-xl border border-white/70 bg-white/90 px-3 py-2 text-xs font-semibold text-slate-800";
const btn = "rounded-full bg-linear-to-b from-sky-500 via-sky-600 to-sky-700 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-white";

export function PasoAcademico({ periodoId, detalle, avisar }: {
  periodoId: string;
  detalle: DetalleCicloAdmin | null;
  avisar: (ok: boolean, x: string) => void;
}) {
  const [origen, setOrigen] = useState("");

  async function clonar() {
    if (!origen.trim()) return;
    const r = await actionClonarContextoAcademico(periodoId, origen.trim());
    avisar(Boolean(r.ok), r.ok ? (r.mensaje ?? "Contexto clonado.") : (r.error ?? "Error al clonar"));
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[10px] font-extrabold uppercase tracking-wide text-indigo-900">
        Paso 2 · Estructura académica (grupos · carreras · grupo↔materia)
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${input} min-w-[12rem] flex-1`} placeholder="periodo_id origen (copiar grupos y materias)" value={origen} onChange={(e) => setOrigen(e.target.value)} />
        <button type="button" className={btn} disabled={!origen.trim()} onClick={() => void clonar()}>Copiar estructura</button>
      </div>
      <p className="text-[10px] font-semibold text-slate-600">
        Copia grupos y grupo_materias del origen. NO copia alumnos ni inscripciones.
      </p>
      {detalle && (
        <div className="rounded-xl bg-white/80 p-2 text-[11px] font-semibold text-slate-700">
          Resumen actual: {detalle.conteos.grupos} grupos · {detalle.conteos.materiasActivas} materias asignadas.
        </div>
      )}
    </div>
  );
}
