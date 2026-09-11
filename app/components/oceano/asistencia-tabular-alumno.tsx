"use client";

/**
 * asistencia-tabular-alumno.tsx — sub-vista «Datos crudos» del apartado
 * «Calendario › Asistencia» (Fase 3, punto C).
 *
 * NO calcula nada: la tabla y el desglose salen del módulo puro
 * `lib/escolar/asistencia/asistencia-tabular.ts`, que ya decide las dos reglas
 * que aquí NO se deshacen:
 *   · el porcentaje global se recalcula desde los conteos — promediar los
 *     porcentajes de cada parcial da un número sin significado;
 *   · un parcial sin clases registradas muestra guion, no 0 %.
 *
 * La lectura es la MISMA acción que alimenta el calendario visual
 * (`actionObtenerEstadosAsistenciaAlumno`): no se abre una segunda vía de
 * lectura de asistencia (R6). Las dos sub-vistas del apartado son excluyentes,
 * así que solo hay una lectura viva a la vez.
 */
import { useEffect, useState } from "react";
import { actionObtenerEstadosAsistenciaAlumno } from "@/app/actions/asistencias";
import { MateriaTablaVistaPanel } from "@/app/components/materia-tabla-vista";
import {
  detallePorParcial,
  vistaTabularAsistencia,
} from "@/lib/escolar/asistencia/asistencia-tabular";
import type { ResumenPorParcial } from "@/lib/escolar/asistencia/asistencias";

export function AsistenciaTabularAlumno({
  curp,
  nombreAlumno,
}: {
  curp: string;
  nombreAlumno: string;
}) {
  const [resumen, setResumen] = useState<ResumenPorParcial[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!curp) return;
    let activo = true;
    void actionObtenerEstadosAsistenciaAlumno({ curp }).then((r) => {
      if (!activo) return;
      setCargando(false);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setResumen(r.resumenPorParcial);
    });
    return () => {
      activo = false;
    };
  }, [curp]);

  if (cargando) {
    return (
      <p className="text-center text-sm font-semibold text-[var(--oc-muted)]">
        Consultando asistencia…
      </p>
    );
  }
  if (error) {
    return (
      <p className="text-center text-sm font-semibold text-[var(--oc-alert-text)]" role="alert">
        {error}
      </p>
    );
  }

  const vista = vistaTabularAsistencia(resumen, { nombreAlumno });
  const detalle = detallePorParcial(resumen);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-3 sm:p-4">
        <p className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-[var(--oc-muted)]">
          Asistencia por parcial
        </p>
        <MateriaTablaVistaPanel
          vista={{ encabezados: vista.encabezados, filas: vista.filas }}
          materiaNombre="Asistencia"
          filaDestacada={vista.filaDestacada}
        />
        <p className="mt-2 text-[10px] font-semibold text-[var(--oc-muted)]">
          El porcentaje final se calcula sobre las clases registradas. Un parcial sin
          clases registradas no aporta porcentaje y se muestra con guion.
        </p>
      </div>

      {detalle.length > 0 && (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {detalle.map((d) => (
            <li
              key={d.etiqueta}
              className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-3 py-2"
            >
              <p className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-muted)]">
                {d.etiqueta}
              </p>
              <p className="mt-1 text-sm font-extrabold text-[var(--oc-text)]">
                {d.porcentaje === null ? "—" : `${d.porcentaje}%`}
              </p>
              <p className="text-[10px] font-semibold text-[var(--oc-muted)]">
                {d.asistencias} asistió · {d.faltas} falta · {d.pendientes} pendiente
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
