"use client";

/**
 * asistencias-catalogo.tsx — la COLUMNA IZQUIERDA de «Asistencia»: el contexto
 * y las materias a las que se les puede pasar lista. 2026-11-17.
 *
 * Por qué existe. Subir asistencia y subir calificaciones son la misma tarea y
 * se veían como dos pantallas sin parentesco: calificaciones es *catálogo a la
 * izquierda + una tarjeta a la derecha*, y asistencia era una sola columna con
 * siete tarjetas apiladas del mismo peso, donde nada guiaba la vista. Esta
 * pieza le da a asistencia la mitad izquierda, con el lenguaje visual de
 * `materia-selector.tsx`: buscador, filtros y filas altas que se pulsan.
 *
 * Por qué NO reutiliza `MateriaSelector`. Aquel lista el CATÁLOGO académico
 * (`MateriaConNombreVisible`: identidad, tabla física, facetas propias) y
 * filtra por grado/grupo/carrera DENTRO de la lista. Aquí las materias salen
 * del HORARIO OFICIAL del grupo (`MateriaHorarioUI`), así que grado y grupo no
 * filtran una lista ya cargada: son lo que la hace existir, y hasta que no se
 * eligen no hay nada que listar. Forzar un selector sobre el otro habría
 * obligado a inventar un `idInterno` y unas facetas que estas materias no
 * tienen. Lo que se comparte es el ASPECTO, no la lógica.
 *
 * No decide nada: recibe el estado y los manejadores del panel. Todo el
 * cableado (ciclo operativo, horario, parciales) sigue viviendo allí.
 */
import { useId, useMemo, useState } from "react";

import type { MateriaHorarioUI } from "@/app/actions/asistencias";

/** Un `<select>` de los que filtran, en la caja del catálogo. */
function FiltroCatalogo({
  etiqueta,
  valor,
  onChange,
  opciones,
  vacio,
  deshabilitado = false,
}: {
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
  opciones: string[];
  vacio: string;
  deshabilitado?: boolean;
}) {
  return (
    <select
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      aria-label={etiqueta}
      title={etiqueta}
      disabled={deshabilitado}
      className="min-w-0 rounded-xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-2 py-1.5 text-[10px] font-bold text-[var(--oc-text)] outline-none focus:border-[var(--oc-border-active)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <option value="">{vacio}</option>
      {opciones.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

export function CatalogoMateriasAsistencia({
  grado,
  grupo,
  carrera,
  grados,
  gruposDelGrado,
  carrerasDelGrupo,
  onGradoChange,
  onGrupoChange,
  onCarreraChange,
  ciclo,
  parciales,
  parcialId,
  onParcialChange,
  materias,
  materiaClave,
  onMateriaChange,
  horarioCargado,
  avisoHorario,
  className = "",
}: {
  grado: string;
  grupo: string;
  carrera: string;
  grados: string[];
  gruposDelGrado: string[];
  carrerasDelGrupo: string[];
  onGradoChange: (v: string) => void;
  onGrupoChange: (v: string) => void;
  onCarreraChange: (v: string) => void;
  /** Nombre del periodo OPERATIVO. No se elige: se enseña. */
  ciclo: string;
  parciales: { id: string; nombre: string; fecha_inicio: string; fecha_fin: string }[];
  parcialId: string;
  onParcialChange: (v: string) => void;
  materias: MateriaHorarioUI[];
  materiaClave: string;
  onMateriaChange: (clave: string) => void;
  horarioCargado: boolean;
  avisoHorario: string | null;
  className?: string;
}) {
  const idBusqueda = useId();
  const [busqueda, setBusqueda] = useState("");

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return materias;
    return materias.filter((m) => m.nombre.toLowerCase().includes(q));
  }, [materias, busqueda]);

  const faltaContexto = !grado || !grupo;

  return (
    <aside
      aria-label="Materias del grupo"
      className={`flex w-full flex-col rounded-3xl border border-[var(--oc-border)] bg-[var(--oc-input)] p-3 ${className}`}
    >
      <p className="mb-2 px-1 text-[10px] font-extrabold uppercase tracking-widest text-[var(--oc-muted)]">
        Materias del grupo
      </p>

      <div className="relative mb-3">
        <label className="sr-only" htmlFor={idBusqueda}>
          Buscar materia
        </label>
        <input
          id={idBusqueda}
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar materia…"
          disabled={!horarioCargado}
          className="w-full rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] px-3 py-2 text-[11px] font-bold text-[var(--oc-text)] outline-none placeholder:text-[var(--oc-muted)] focus:border-[var(--oc-border-active)] disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      {/* Grado y grupo no FILTRAN la lista: la hacen existir (las materias salen
          del horario oficial de ESE grupo). Por eso van arriba y no se pueden
          dejar en blanco. */}
      <div className="mb-2 grid grid-cols-3 gap-1.5">
        <FiltroCatalogo
          etiqueta="Grado"
          valor={grado}
          onChange={onGradoChange}
          opciones={grados}
          vacio="Grado…"
        />
        <FiltroCatalogo
          etiqueta="Grupo"
          valor={grupo}
          onChange={onGrupoChange}
          opciones={gruposDelGrado}
          vacio="Grupo…"
          deshabilitado={!grado}
        />
        <FiltroCatalogo
          etiqueta="Carrera (opcional)"
          valor={carrera}
          onChange={onCarreraChange}
          opciones={carrerasDelGrupo}
          vacio="Carrera: todas"
          deshabilitado={!grupo}
        />
      </div>

      <select
        value={parcialId}
        onChange={(e) => onParcialChange(e.target.value)}
        disabled={parciales.length === 0}
        aria-label="Parcial"
        title="Parcial"
        className="mb-2 w-full rounded-xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-2 py-1.5 text-[10px] font-bold text-[var(--oc-text)] outline-none focus:border-[var(--oc-border-active)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="">
          {parciales.length === 0 ? "Sin parciales activos" : "Parcial…"}
        </option>
        {parciales.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre} · {p.fecha_inicio} a {p.fecha_fin}
          </option>
        ))}
      </select>

      <p className="mb-3 px-1 text-[10px] font-semibold text-[var(--oc-muted)]">
        Ciclo:{" "}
        <span
          className={
            ciclo ? "font-extrabold text-[var(--oc-ok)]" : "font-extrabold text-[var(--oc-muted)]"
          }
        >
          {ciclo || "sin ciclo operativo"}
        </span>
      </p>

      <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-1 lg:max-h-[28rem]">
        {faltaContexto ? (
          <p className="px-1 py-2 text-center text-xs font-semibold text-[var(--oc-muted)]">
            Elige grado y grupo para ver sus materias programadas.
          </p>
        ) : !horarioCargado ? (
          <p
            className="rounded-2xl border border-[var(--oc-alert)]/40 bg-[var(--oc-alert)]/15 px-3 py-2 text-[11px] font-semibold text-[var(--oc-alert-text)]"
            role="alert"
          >
            {avisoHorario ?? "El grupo no tiene horario oficial cargado para este ciclo."}
          </p>
        ) : visibles.length === 0 ? (
          <p className="px-1 py-2 text-center text-xs font-semibold text-[var(--oc-muted)]">
            {materias.length === 0 ? "Sin materias programadas." : "Sin coincidencias."}
          </p>
        ) : (
          visibles.map((m) => {
            const activa = m.clave === materiaClave;
            return (
              <button
                key={m.clave}
                type="button"
                onClick={() => onMateriaChange(m.clave)}
                aria-pressed={activa}
                className={`flex min-h-12 w-full flex-col justify-center rounded-2xl border px-3 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oc-border-active)] ${
                  activa
                    ? "border-[var(--oc-border-active)] bg-[var(--oc-surface)]"
                    : "border-[var(--oc-border)] bg-transparent hover:bg-[var(--oc-surface)]"
                }`}
              >
                <span className="text-[11px] font-extrabold uppercase leading-snug tracking-wide text-[var(--oc-text)]">
                  {m.nombre}
                </span>
                <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--oc-muted)]">
                  {m.totalSemana} clase(s) por semana
                </span>
              </button>
            );
          })
        )}
      </div>

      {/* El horario carga, pero con algo que contar (una materia sin bloques,
          un alias sin resolver). No es un error: no debe tapar la lista. */}
      {horarioCargado && avisoHorario && (
        <p className="mt-2 px-1 text-[10px] font-semibold text-[var(--oc-alert-text)]">
          {avisoHorario}
        </p>
      )}
    </aside>
  );
}
