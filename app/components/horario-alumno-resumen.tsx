"use client";

import { useEffect, useState } from "react";

import {
  actionObtenerHorarioAlumno,
  type HorarioGrupoConsultable,
} from "@/app/actions/horario";

/**
 * HORARIO SEMANAL del alumno — vista de lectura (FASE HORARIO).
 *
 * El servidor resuelve el grupo desde la inscripción ACTIVA de la CURP; este
 * componente solo pinta. Sin estados de asistencia: el horario responde «qué
 * clases están programadas»; la asistencia se deriva por separado (véase
 * CalendarioAsistenciaAlumno).
 */

const ORDEN_DIAS = ["lunes", "martes", "miercoles", "jueves", "viernes"];

const DIAS_LABEL: Record<string, string> = {
  lunes: "Lunes",
  martes: "Martes",
  miercoles: "Miércoles",
  jueves: "Jueves",
  viernes: "Viernes",
};

export function HorarioAlumnoResumen({ curp }: { curp: string }) {
  const [horario, setHorario] = useState<HorarioGrupoConsultable | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!curp) return;
    let activo = true;
    void actionObtenerHorarioAlumno(curp).then((r) => {
      if (!activo) return;
      setCargando(false);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setHorario(r.horario);
    });
    return () => {
      activo = false;
    };
  }, [curp]);

  if (cargando) {
    return (
      <p className="rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-[11px] font-semibold text-slate-600">
        Consultando horario oficial…
      </p>
    );
  }
  if (error) {
    return (
      <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700" role="alert">
        {error}
      </p>
    );
  }
  if (!horario || horario.bloques.length === 0) {
    return (
      <p className="rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-[11px] font-semibold text-slate-600">
        Sin horario oficial cargado para tu grupo en este periodo.
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-white/60 bg-white/75 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
      <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-sky-900">
        Horario semanal · {horario.grupo.grado} {horario.grupo.grupo}
        {horario.grupo.carreraClave ? ` · ${horario.grupo.carreraClave}` : ""}
      </p>
      <div className="grid grid-cols-5 gap-1.5">
        {ORDEN_DIAS.map((dia) => {
          const bloques = horario.bloques.filter((b) => b.diaSemana === dia);
          const total = horario.resumenPorDia[dia] ?? 0;
          return (
            <div
              key={dia}
              className="rounded-xl border border-white/70 bg-sky-50/80 p-1.5"
            >
              <p className="text-center text-[9px] font-extrabold uppercase tracking-wide text-sky-900">
                {DIAS_LABEL[dia]} · {total}
              </p>
              {bloques.length === 0 ? (
                <p className="text-center text-[9px] font-semibold text-slate-400">
                  —
                </p>
              ) : (
                bloques.map((b, i) => (
                  <div key={i} className="mt-1 rounded-lg bg-white/85 px-1 py-0.5">
                    <p className="text-[9px] font-extrabold text-sky-900">
                      {b.horaInicio}–{b.horaFin}
                    </p>
                    <p className="text-[9px] font-semibold leading-tight text-slate-700">
                      {b.materiaNombre}
                    </p>
                    <p className="text-[8px] font-semibold text-slate-500">
                      {b.profesor}
                    </p>
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
