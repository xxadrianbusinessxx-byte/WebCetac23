"use client";

import { useEffect, useState } from "react";
import {
  actionCargarMateriasDesdeCatalogo,
  actionClonarContextoAcademico,
  actionListarPeriodosContexto,
  actionPrevisualizarRepararTablaLegacy,
  actionRepararTablaLegacy,
  type PeriodoSimple,
} from "@/app/actions/contexto-ciclo";
import type { DetalleCicloAdmin } from "@/app/actions/evaluaciones";
import type { ResultadoRepararTablaLegacy } from "@/lib/escolar/contexto-ciclo";

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

  // Reparación de `tabla_legacy` (puente físico grupo_materias → tabla legacy).
  const [periodos, setPeriodos] = useState<PeriodoSimple[]>([]);
  const [origenReparar, setOrigenReparar] = useState("");
  const [previewReparar, setPreviewReparar] =
    useState<ResultadoRepararTablaLegacy | null>(null);
  const [previewCargando, setPreviewCargando] = useState(false);
  const [reparando, setReparando] = useState(false);

  useEffect(() => {
    let activo = true;
    void actionListarPeriodosContexto().then((r) => {
      if (!activo || !r.ok) return;
      const lista = r.periodos.filter((p) => p.id !== periodoId);
      setPeriodos(lista);
      if (lista.length > 0) setOrigenReparar(lista[0]!.id);
    });
    return () => {
      activo = false;
    };
  }, [periodoId]);

  async function previsualizarReparar() {
    if (!origenReparar || previewCargando || reparando) return;
    setPreviewCargando(true);
    setPreviewReparar(null);
    const r = await actionPrevisualizarRepararTablaLegacy(
      periodoId,
      origenReparar,
    );
    setPreviewCargando(false);
    if (!r.ok) {
      avisar(false, r.error ?? "No se pudo calcular el preview.");
      return;
    }
    setPreviewReparar(r);
  }

  async function aplicarReparar() {
    if (!origenReparar || reparando || !previewReparar?.ok) return;
    setReparando(true);
    const r = await actionRepararTablaLegacy(periodoId, origenReparar);
    setReparando(false);
    setPreviewReparar(null);
    avisar(
      Boolean(r.ok),
      r.ok
        ? (r.mensaje ?? "tabla_legacy reparado correctamente.")
        : (r.error ?? "Error al reparar tabla_legacy."),
    );
    if (r.ok) onCambio?.();
  }

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
      <div className="mt-1 flex flex-wrap items-center gap-2 rounded-2xl border border-white/50 bg-indigo-100/40 p-2">
        <span className="text-[10px] font-extrabold uppercase tracking-wide text-indigo-900">
          Reparar puente de materias (tabla_legacy)
        </span>
        <select
          className={`${input} min-w-[10rem] flex-1`}
          value={origenReparar}
          onChange={(e) => {
            setOrigenReparar(e.target.value);
            setPreviewReparar(null);
          }}
        >
          {periodos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={btnSec}
          disabled={!origenReparar || previewCargando || reparando}
          onClick={() => void previsualizarReparar()}
        >
          {previewCargando ? "Calculando…" : "Ver preview"}
        </button>
        <button
          type="button"
          className={btn}
          disabled={
            !previewReparar?.ok ||
            (previewReparar?.match ?? 0) === 0 ||
            reparando
          }
          onClick={() => void aplicarReparar()}
        >
          {reparando ? "Aplicando…" : "Aplicar reparación"}
        </button>
      </div>
      {previewReparar?.ok && (
        <p className="text-[10px] font-semibold text-slate-600">
          Preview: {previewReparar.match} filas por reparar (match) ·{" "}
          {previewReparar.yaTiene} ya tenían puente ·{" "}
          {previewReparar.sinOrigen} sin origen · {previewReparar.ambiguos}{" "}
          ambiguas. Aplicar solo escribe las filas match con tabla_legacy NULL
          (idempotente).
        </p>
      )}
      {detalle && (
        <div className="rounded-xl bg-white/80 p-2 text-[11px] font-semibold text-slate-700">
          Resumen actual: {detalle.conteos.grupos} grupos · {detalle.conteos.materiasActivas} materias asignadas.
        </div>
      )}
    </div>
  );
}
