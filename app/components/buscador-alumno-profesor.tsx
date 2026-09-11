"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { actionListarAlumnosGruposProfesor } from "@/app/actions/asistencias";
import { normalizarNombre } from "@/lib/escolar/nombres";
import { CalendarioAsistenciaAlumno } from "./calendario-asistencia-alumno";
import { HorarioAlumnoResumen } from "./horario-alumno-resumen";

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
      className="relative mt-6 overflow-hidden rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-3 sm:p-4"
      aria-label="Asistencia de mis alumnos"
    >
      <div className="relative z-[1] flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-2 px-1 pb-1">
          <span className="rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] sm:text-[11px]">
            Asistencia de mis alumnos
          </span>
          {alumnoSel && (
            <span className="rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-text)]">
              {alumnoSel.nombre} · {alumnoSel.grado} {alumnoSel.grupo}
              {alumnoSel.carrera ? ` · ${alumnoSel.carrera}` : ""}
            </span>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-input)] p-4">
          {cargando ? (
            <p className="text-center text-sm font-semibold text-[var(--oc-muted)]">
              Cargando tus grupos…
            </p>
          ) : error ? (
            <p
              className="text-center text-xs font-semibold text-[var(--oc-alert-text)]"
              role="alert"
            >
              {error}
            </p>
          ) : grupos.length === 0 ? (
            <p className="text-center text-xs font-semibold text-[var(--oc-muted)]">
              Aún no tienes grupos asignados.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-muted)]">
                    Grupo
                  </span>
                  <select
                    value={grupoSel}
                    onChange={(e) => {
                      setGrupoSel(e.target.value);
                      setAlumnoSel(null);
                    }}
                    className="rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] outline-none focus:border-[var(--oc-border-active)]"
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
                  <span className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-muted)]">
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
                    className="rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] placeholder:text-[var(--oc-muted)] outline-none focus:border-[var(--oc-border-active)]"
                  />
                </label>
              </div>

              <div className="max-h-56 overflow-auto rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-2">
                {alumnosFiltrados.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs font-semibold text-[var(--oc-muted)]">
                    Sin alumnos que coincidan.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {alumnosFiltrados.map((a) => (
                      <li key={a.curp} className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => elegirAlumno(a)}
                          className={`flex-1 rounded-xl border px-3 py-2 text-left text-[11px] font-bold transition hover:brightness-110 ${
                            alumnoSel?.curp === a.curp
                              ? "border-[var(--oc-border-active)] bg-[var(--oc-input)] text-[var(--oc-text)]"
                              : "border-[var(--oc-border)] bg-[var(--oc-input)] text-[var(--oc-text)]"
                          }`}
                        >
                          <span className="block truncate uppercase tracking-wide">
                            {a.nombre}
                          </span>
                          <span className="block text-[9px] font-semibold normal-case text-[var(--oc-muted)]">
                            {a.curp}
                          </span>
                        </button>
                        {/* FASE 2 — consulta del perfil del alumno (solo
                            lectura, autorizada server-side por el grupo del
                            maestro). */}
                        <Link
                          href={`/perfil?modo=maestro&curp=${encodeURIComponent(a.curp)}&desde=profesor`}
                          title="Ver perfil del alumno"
                          className="shrink-0 rounded-xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-3 py-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] transition hover:brightness-110"
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
          <div className="flex flex-col gap-4 rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-4">
            <HorarioAlumnoResumen curp={alumnoSel.curp} />
            <CalendarioAsistenciaAlumno
              curp={alumnoSel.curp}
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
