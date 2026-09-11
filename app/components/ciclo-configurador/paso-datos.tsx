"use client";

import { useState } from "react";
import { actionGuardarRangoCiclo } from "@/app/actions/evaluaciones";
import type { DetalleCicloAdmin } from "@/app/actions/evaluaciones";

const input = "rounded-xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-3 py-2 text-xs font-semibold text-[var(--oc-muted)]";
const btn = "rounded-full bg-[var(--oc-input)] px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-text)]";

export function PasoDatos({ periodoId, detalle, avisar }: {
  periodoId: string;
  detalle: DetalleCicloAdmin | null;
  avisar: (ok: boolean, x: string) => void;
}) {
  const [inicio, setInicio] = useState(detalle?.fecha_inicio ?? "");
  const [fin, setFin] = useState(detalle?.fecha_fin ?? "");

  async function guardar() {
    const r = await actionGuardarRangoCiclo({ periodoId, fechaInicio: inicio || null, fechaFin: fin || null });
    avisar(r.ok, r.ok ? "Rango guardado." : (r.error ?? "Error"));
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-text)]">
        Paso 1 · Datos del ciclo
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[10px] font-bold text-[var(--oc-muted)]">Inicio</label>
        <input type="date" className={input} value={inicio} onChange={(e) => setInicio(e.target.value)} />
        <label className="text-[10px] font-bold text-[var(--oc-muted)]">Fin</label>
        <input type="date" className={input} value={fin} onChange={(e) => setFin(e.target.value)} />
        <button type="button" className={btn} onClick={() => void guardar()}>Guardar rango</button>
      </div>
      {detalle && (
        <div className="grid grid-cols-2 gap-1 text-[10px] font-semibold text-[var(--oc-muted)] sm:grid-cols-4">
          <span>Grupos: {detalle.conteos.grupos}</span>
          <span>Materias: {detalle.conteos.materiasActivas}</span>
          <span>Inscritos: {detalle.conteos.inscripcionesActivas}</span>
          <span>Parciales: {detalle.conteos.parciales}</span>
        </div>
      )}
    </div>
  );
}
