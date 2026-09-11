"use client";

import type { DetalleCicloAdmin } from "@/app/actions/evaluaciones";

const btn = "rounded-full bg-[var(--oc-input)] px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] disabled:opacity-50";

export function PasoValidacion({ periodoId, detalle, onActivar }: {
  periodoId: string;
  detalle: DetalleCicloAdmin | null;
  onActivar: () => void;
}) {
  if (!detalle) return <p className="text-xs font-semibold text-[var(--oc-muted)]">Cargando validación…</p>;
  const d = detalle;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-text)]">
        Paso 7 · Validación y activación del ciclo
      </p>
      <div className="grid grid-cols-2 gap-1 text-[10px] font-semibold text-[var(--oc-muted)] sm:grid-cols-3">
        <span>Grupos: {d.conteos.grupos}</span>
        <span>Materias: {d.conteos.materiasActivas}</span>
        <span>Inscritos: {d.conteos.inscripcionesActivas}</span>
        <span>Parciales: {d.conteos.parciales}</span>
        <span>Días clase: {d.conteos.diasClase}</span>
        <span className={d.ok ? "text-[var(--oc-ok)]" : "text-[var(--oc-alert-text)]"}>{d.ok ? "Puede activarse" : "NO puede activarse"}</span>
      </div>
      {d.errores.length > 0 && (
        <div className="rounded-xl bg-[var(--oc-alert)]/15 p-2">
          <p className="text-[10px] font-extrabold uppercase text-[var(--oc-alert-text)]">Bloqueadores</p>
          <ul className="ml-4 list-disc text-[11px] font-semibold text-[var(--oc-alert-text)]">
            {d.errores.map((e) => <li key={e.codigo}>{e.mensaje}</li>)}
          </ul>
        </div>
      )}
      {d.advertencias.length > 0 && (
        <div className="rounded-xl bg-[var(--oc-alert)]/15 p-2">
          <p className="text-[10px] font-extrabold uppercase text-[var(--oc-alert-text)]">Advertencias</p>
          <ul className="ml-4 list-disc text-[11px] font-semibold text-[var(--oc-alert-text)]">
            {d.advertencias.map((e) => <li key={e.codigo}>{e.mensaje}</li>)}
          </ul>
        </div>
      )}
      <button type="button" className={btn} disabled={!d.ok || d.activo} onClick={() => onActivar()}>
        {d.activo ? "Ya es OPERATIVO" : "Activar como OPERATIVO"}
      </button>
      <span className="text-[10px] font-semibold text-[var(--oc-muted)]">
        Validación definitiva en servidor (F1/F4) · periodoId {periodoId}.
      </span>
    </div>
  );
}
