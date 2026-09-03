"use client";

import { useState } from "react";
import {
  actionCargarMateriasDesdeCatalogo,
  actionClonarContextoAcademico,
} from "@/app/actions/contexto-ciclo";
import type { DetalleCicloAdmin } from "@/app/actions/evaluaciones";

const input = "rounded-xl border border-white/70 bg-white/90 px-3 py-2 text-xs font-semibold text-slate-800";
const btn = "rounded-full bg-linear-to-b from-sky-500 via-sky-600 to-sky-700 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-white disabled:opacity-50";
const btnSec = "rounded-full border border-sky-700/40 bg-white/85 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-sky-900 disabled:opacity-50";

export function PasoAcademico({ periodoId, detalle, avisar, onCambio }: {
  periodoId: string;
  detalle: DetalleCicloAdmin | null;
  avisar: (ok: boolean, x: string) => void;
  onCambio?: () => void;
}) {
  const [origen, setOrigen] = useState("");
  const [clonando, setClonando] = useState(false);
  const [cargando, setCargando] = useState(false);

  async function clonar() {
    if (!origen.trim() || clonando) return;
    setClonando(true);
    const r = await actionClonarContextoAcademico(periodoId, origen.trim());
    setClonando(false);
    avisar(Boolean(r.ok), r.ok ? (r.mensaje ?? "Contexto clonado.") : (r.error ?? "Error al clonar"));
    if (r.ok) onCambio?.();
  }

  async function cargarDesdeCatalogo() {
    if (cargando) return;
    setCargando(true);
    const r = await actionCargarMateriasDesdeCatalogo(periodoId);
    setCargando(false);
    avisar(
      Boolean(r.ok),
      r.ok
        ? (r.mensaje ??
          `Materias cargadas desde el catálogo: ${r.gruposCreados} grupos nuevos · ${r.materiasVinculadas} materias asignadas.`)
        : (r.error ?? "Error al cargar materias"),
    );
    if (r.ok) onCambio?.();
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[10px] font-extrabold uppercase tracking-wide text-indigo-900">
        Paso 2 · Estructura académica (grupos · carreras · grupo↔materia)
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${input} min-w-[12rem] flex-1`} placeholder="periodo_id origen (copiar grupos y materias)" value={origen} onChange={(e) => setOrigen(e.target.value)} />
        <button type="button" className={btn} disabled={!origen.trim() || clonando} onClick={() => void clonar()}>{clonando ? "Copiando…" : "Copiar estructura"}</button>
      </div>
      <p className="text-[10px] font-semibold text-slate-600">
        Copia grupos y grupo_materias del origen. NO copia alumnos ni inscripciones.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btnSec} disabled={cargando} onClick={() => void cargarDesdeCatalogo()}>
          {cargando ? "Cargando…" : "Cargar materias según catálogo"}
        </button>
      </div>
      <p className="text-[10px] font-semibold text-slate-600">
        Crea los grupos del catálogo legacy que falten y vincula cada tabla física (grupo_materias.tabla_legacy) a su materia del catálogo. Idempotente: no duplica parejas.
      </p>
      {detalle && (
        <div className="rounded-xl bg-white/80 p-2 text-[11px] font-semibold text-slate-700">
          Resumen actual: {detalle.conteos.grupos} grupos · {detalle.conteos.materiasActivas} materias asignadas.
        </div>
      )}
    </div>
  );
}
