"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { actionListarAlumnosGruposProfesor } from "@/app/actions/asistencias";
import { normalizarNombre } from "@/lib/escolar/nombres";
import { CalendarioAsistenciaAlumno } from "./calendario-asistencia-alumno";

type GrupoConAlumnos = {
  grado: string;
  grupo: string;
  carrera: string;
  alumnos: { curp: string; nombre: string }[];
};

type AlumnoSeleccionado = {
  curp: string;
  grado: string;
  grupo: string;
  carrera: string;
  nombre: string;
};

/**
 * BLOQUE 9 (PIEZA 4) — Buscador de alumnos para el PROFESOR.
 *
 * NO busca sobre los 461 alumnos completos: solo sobre los grupos donde el
 * profesor de sesión imparte clase. REUTILIZA `resolverAsignacionesProfesor`
 * (lib/escolar/catalogo-academico.ts) y `obtenerAlumnosDelGrupo`
 * (lib/escolar/asistencias.ts) vía la Server Action
 * `actionListarAlumnosGruposProfesor`.
 *
 * Al elegir un alumno renderiza <CalendarioAsistenciaAlumno> con
 * `profesorClave` + `permitirJustificacion` + `permitirAnulacion` — TODO
 * reutilizado, cero lógica de calendario nueva.
 */
export function BuscadorAlumnoProfesor({
  profesorClave,
}: {
  profesorClave: string;
}) {
  const [grupos, setGrupos] = useState<GrupoConAlumnos[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [grupoSel, setGrupoSel] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [alumnoSel, setAlumnoSel] = useState<AlumnoSeleccionado | null>(null);

  useEffect(() => {
    let activo = true;
    void actionListarAlumnosGruposProfesor().then((r) => {
      if (!activo) return;
      setCargando(false);
      if (r.ok) {
        setGrupos(r.grupos);
        if (r.grupos.length > 0) {
          const primero = r.grupos[0]!;
          setGrupoSel(`${primero.grado}|${primero.grupo}|${primero.carrera}`);
        }
      } else {
        setError(r.error);
      }
    });
    return () => {
      activo = false;
    };
  }, []);

  const grupoActual = useMemo(
    () =>
      grupos.find((g) => `${g.grado}|${g.grupo}|${g.carrera}` === grupoSel) ??
      null,
    [grupos, grupoSel],
  );

  const alumnosFiltrados = useMemo(() => {
    if (!grupoActual) return [];
    const q = normalizarNombre(busqueda);
    if (!q) return grupoActual.alumnos;
    return grupoActual.alumnos.filter(
      (a) =>
        normalizarNombre(a.nombre).includes(q) ||
        normalizarNombre(a.curp).includes(q),
    );
  }, [grupoActual, busqueda]);

  function elegirAlumno(a: { curp: string; nombre: string }) {
    if (!grupoActual) return;
    setAlumnoSel({
      curp: a.curp,
      grado: grupoActual.grado,
      grupo: grupoActual.grupo,
      carrera: grupoActual.carrera,
      nombre: a.nombre,
    });
  }

  return (
    <section
      className="relative mt-6 overflow-hidden rounded-[2rem] border-[3px] border-sky-800/50 bg-sky-100/35 p-3 shadow-[0_12px_40px_rgba(56,189,248,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl backdrop-saturate-150 sm:p-4"
      aria-label="Asistencia de mis alumnos"
    >
      <div className="relative z-[1] flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-2 px-1 pb-1">
          <span className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] sm:text-[11px]">
            Asistencia de mis alumnos
          </span>
          {alumnoSel && (
            <span className="rounded-full border border-white/60 bg-white/80 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-sky-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
              {alumnoSel.nombre} · {alumnoSel.grado} {alumnoSel.grupo}
              {alumnoSel.carrera ? ` · ${alumnoSel.carrera}` : ""}
            </span>
          )}
        </div>

        <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
          {cargando ? (
            <p className="text-center text-sm font-semibold text-slate-600">
              Cargando tus grupos…
            </p>
          ) : error ? (
            <p
              className="text-center text-xs font-semibold text-red-700"
              role="alert"
            >
              {error}
            </p>
          ) : grupos.length === 0 ? (
            <p className="text-center text-xs font-semibold text-slate-600">
              Aún no tienes grupos asignados.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-extrabold uppercase tracking-wide text-sky-900">
                    Grupo
                  </span>
                  <select
                    value={grupoSel}
                    onChange={(e) => {
                      setGrupoSel(e.target.value);
                      setAlumnoSel(null);
                    }}
                    className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] outline-none focus:ring-2 focus:ring-sky-400/60"
                  >
                    {grupos.map((g) => (
                      <option
                        key={`${g.grado}|${g.grupo}|${g.carrera}`}
                        value={`${g.grado}|${g.grupo}|${g.carrera}`}
                      >
                        {g.grado} · {g.grupo}
                        {g.carrera ? ` · ${g.carrera}` : ""} (
                        {g.alumnos.length} alumnos)
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-extrabold uppercase tracking-wide text-sky-900">
                    Buscar por nombre o CURP
                  </span>
                  <input
                    type="text"
                    value={busqueda}
                    onChange={(e) => {
                      setBusqueda(e.target.value);
                      setAlumnoSel(null);
                    }}
                    placeholder="Nombre o CURP…"
                    className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white placeholder:text-white/75 shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] outline-none focus:ring-2 focus:ring-sky-400/60"
                  />
                </label>
              </div>

              <div className="max-h-56 overflow-auto rounded-2xl border border-white/60 bg-white/70 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
                {alumnosFiltrados.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs font-semibold text-slate-600">
                    Sin alumnos que coincidan.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {alumnosFiltrados.map((a) => (
                      <li key={a.curp} className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => elegirAlumno(a)}
                          className={`flex-1 rounded-xl border px-3 py-2 text-left text-[11px] font-bold transition hover:brightness-105 ${
                            alumnoSel?.curp === a.curp
                              ? "border-sky-500/60 bg-sky-100/90 text-sky-900"
                              : "border-white/60 bg-white/80 text-sky-900 hover:bg-white"
                          }`}
                        >
                          <span className="block truncate uppercase tracking-wide">
                            {a.nombre}
                          </span>
                          <span className="block text-[9px] font-semibold normal-case text-slate-500">
                            {a.curp}
                          </span>
                        </button>
                        {/* FASE 2 — consulta del perfil del alumno (solo
                            lectura, autorizada server-side por el grupo del
                            maestro). */}
                        <Link
                          href={`/perfil?modo=maestro&curp=${encodeURIComponent(a.curp)}&desde=profesor`}
                          title="Ver perfil del alumno"
                          className="shrink-0 rounded-xl border border-sky-500/50 bg-sky-100/90 px-3 py-2 text-[11px] font-extrabold uppercase tracking-wide text-sky-900 transition hover:bg-white"
                        >
                          Perfil
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        {alumnoSel && (
          <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
            <CalendarioAsistenciaAlumno
              curp={alumnoSel.curp}
              grado={alumnoSel.grado}
              grupo={alumnoSel.grupo}
              carrera={alumnoSel.carrera}
              nombreAlumno={alumnoSel.nombre}
              profesorClave={profesorClave}
              permitirJustificacion
              permitirAnulacion
            />
          </div>
        )}
      </div>
    </section>
  );
}
