"use client";

import type { DetalleCicloAdmin } from "@/app/actions/evaluaciones";

const btn = "rounded-full bg-linear-to-b from-emerald-500 via-emerald-600 to-emerald-700 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-white disabled:opacity-50";

export function PasoValidacion({ periodoId, detalle, onActivar }: {
  periodoId: string;
  detalle: DetalleCicloAdmin | null;
  onActivar: () => void;
}) {
  if (!detalle) return <p className="text-xs font-semibold text-slate-600">Cargando validación…</p>;
  const d = detalle;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[10px] font-extrabold uppercase tracking-wide text-indigo-900">
        Paso 7 · Validación y activación del ciclo
      </p>
      <div className="grid grid-cols-2 gap-1 text-[10px] font-semibold text-slate-600 sm:grid-cols-3">
        <span>Grupos: {d.conteos.grupos}</span>
        <span>Materias: {d.conteos.materiasActivas}</span>
        <span>Inscritos: {d.conteos.inscripcionesActivas}</span>
        <span>Parciales: {d.conteos.parciales}</span>
        <span>Días clase: {d.conteos.diasClase}</span>
        <span className={d.ok ? "text-emerald-700" : "text-red-700"}>{d.ok ? "Puede activarse" : "NO puede activarse"}</span>
      </div>
      {d.errores.length > 0 && (
        <div className="rounded-xl bg-red-50 p-2">
          <p className="text-[10px] font-extrabold uppercase text-red-700">Bloqueadores</p>
          <ul className="ml-4 list-disc text-[11px] font-semibold text-red-800">
            {d.errores.map((e) => <li key={e.codigo}>{e.mensaje}</li>)}
          </ul>
        </div>
      )}
      {d.advertencias.length > 0 && (
        <div className="rounded-xl bg-amber-50 p-2">
          <p className="text-[10px] font-extrabold uppercase text-amber-700">Advertencias</p>
          <ul className="ml-4 list-disc text-[11px] font-semibold text-amber-800">
            {d.advertencias.map((e) => <li key={e.codigo}>{e.mensaje}</li>)}
          </ul>
        </div>
      )}
      <button type="button" className={btn} disabled={!d.ok || d.activo} onClick={() => onActivar()}>
        {d.activo ? "Ya es OPERATIVO" : "Activar como OPERATIVO"}
      </button>
      <span className="text-[10px] font-semibold text-slate-600">
        Validación definitiva en servidor (F1/F4) · periodoId {periodoId}.
      </span>
    </div>
  );
}
