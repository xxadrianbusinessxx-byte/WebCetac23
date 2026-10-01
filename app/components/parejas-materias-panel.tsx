"use client";

import { useCallback, useEffect, useState } from "react";
import {
  actionAltaMateriaEnGrupo,
  actionCambiarEstadoMateriaEnGrupo,
  actionGuardarAliasPorPareja,
  actionListarParejasParaGestion,
} from "@/app/actions/calificaciones-normalizadas";
import type {
  CatalogoParaAlta,
  ParejaParaGestion,
} from "@/lib/escolar/materia/calificaciones";

/**
 * Pantalla del técnico: qué materias tiene cada grupo del ciclo operativo.
 * Lista agrupada por grupo («1RO A») con activas e inactivas; desactivar pide
 * confirmación (nunca borra) y reactivar es directo; alias editable en línea;
 * alta por grupo + materia (si ya existía, el servidor la reactiva).
 *
 * Reglas respetadas: el estado se pinta con un <span> (no hay píldora
 * compartida y C11 cuenta componentes duplicados); los avisos son elementos con
 * clases, no un `function Aviso`; `materiaClave` y `tieneTablaFisica` no se
 * muestran (C4.28); y no se pide periodo (la action usa el ciclo operativo).
 */
/** «2DO A · RH». La carrera es lo que distingue a los grupos que comparten
 *  grado y nombre; 1RO no tiene y queda «1RO A». Solo presentación. */
const etiquetaGrupo = (grado: string, nombre: string, carrera: string | null) =>
  [[grado, nombre].filter(Boolean).join(" "), carrera].filter(Boolean).join(" · ");

export function ParejasMateriasPanel() {
  const [datos, setDatos] = useState<{
    parejas: ParejaParaGestion[];
    catalogo: CatalogoParaAlta;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const [nuevoGrupo, setNuevoGrupo] = useState("");
  const [nuevaMateria, setNuevaMateria] = useState("");

  const [aliasEditando, setAliasEditando] = useState<{
    grupoMateriaId: string;
    valor: string;
  } | null>(null);
  const [confirmarDesactivar, setConfirmarDesactivar] = useState<string | null>(
    null,
  );

  // `cargar` no vacía la pantalla: reemplaza `datos` solo cuando llega la
  // respuesta. Tras una acción la lista vieja sigue visible, y «no hay
  // materias» solo se dice cuando de verdad lo es.
  const cargar = useCallback(async () => {
    try {
      const r = await actionListarParejasParaGestion();
      if (r.ok) setDatos({ parejas: r.parejas, catalogo: r.catalogo });
      else setError(r.error);
    } catch {
      setError(
        "No se pudo cargar la lista de materias por grupo (se perdió la conexión).",
      );
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
  }, [cargar]);

  async function darDeAlta() {
    if (!nuevoGrupo || !nuevaMateria) return;
    setTrabajando(true);
    setError(null);
    try {
      const r = await actionAltaMateriaEnGrupo(nuevoGrupo, nuevaMateria);
      if (r.ok) {
        setNuevoGrupo("");
        setNuevaMateria("");
        await cargar();
      } else {
        setError(r.error);
      }
    } catch {
      setError("No se pudo dar de alta la materia (se perdió la conexión).");
    } finally {
      setTrabajando(false);
    }
  }

  async function cambiarEstado(grupoMateriaId: string, activo: boolean) {
    setTrabajando(true);
    setError(null);
    try {
      const r = await actionCambiarEstadoMateriaEnGrupo(grupoMateriaId, activo);
      if (r.ok) {
        setConfirmarDesactivar(null);
        await cargar();
      } else {
        setError(r.error);
      }
    } catch {
      setError(
        "No se pudo cambiar el estado de la materia (se perdió la conexión).",
      );
    } finally {
      setTrabajando(false);
    }
  }

  async function guardarAlias(grupoMateriaId: string, valor: string) {
    setTrabajando(true);
    setError(null);
    try {
      const r = await actionGuardarAliasPorPareja(grupoMateriaId, valor);
      if (r.ok) {
        setAliasEditando(null);
        await cargar();
      } else {
        setError(r.error);
      }
    } catch {
      setError("No se pudo guardar el alias (se perdió la conexión).");
    } finally {
      setTrabajando(false);
    }
  }

  // Se agrupa por la IDENTIDAD del grupo (`grupoId`), no por su nombre: «2DO A»
  // existe en Mecatrónica y en RH (10 de las 24 etiquetas del ciclo 2026-2027
  // se repiten así), y agrupar por el texto mezclaba las materias de dos grupos
  // distintos en una sola sección.
  const agrupadas = new Map<string, { etiqueta: string; items: ParejaParaGestion[] }>();
  if (datos) {
    for (const p of datos.parejas) {
      const g = agrupadas.get(p.grupoId) ?? {
        etiqueta: etiquetaGrupo(p.grado, p.grupo, p.carrera),
        items: [],
      };
      g.items.push(p);
      agrupadas.set(p.grupoId, g);
    }
  }

  const btn =
    "rounded-full border border-[var(--oc-border)] bg-[var(--oc-surface)] px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-4">
      <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-[var(--oc-text)]">
        Materias por grupo
      </p>

      {error && (
        <p
          role="alert"
          className="mb-3 rounded-xl bg-[var(--oc-alert)]/15 px-3 py-2 text-xs font-bold text-[var(--oc-alert-text)]"
        >
          {error}
        </p>
      )}

      {datos === null ? (
        // Si la primera carga falló, «Cargando…» sería falso para siempre: se
        // ofrece reintentar, y el motivo ya está en el aviso de arriba.
        error ? (
          <button
            type="button"
            onClick={() => {
              setError(null);
              void cargar();
            }}
            className={btn}
          >
            Reintentar
          </button>
        ) : (
          <p className="text-xs font-semibold text-[var(--oc-muted)]">
            Cargando materias…
          </p>
        )
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-input)] p-3">
            <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-[var(--oc-muted)]">
              Grupo
              <select
                value={nuevoGrupo}
                onChange={(e) => setNuevoGrupo(e.target.value)}
                disabled={trabajando}
                className="rounded-xl border border-[var(--oc-border)] bg-[var(--oc-surface)] px-2 py-1.5 text-xs font-semibold text-[var(--oc-text)]"
              >
                <option value="">Elegir grupo…</option>
                {datos.catalogo.grupos.map((g) => (
                  <option key={g.id} value={g.id}>
                    {etiquetaGrupo(g.grado, g.nombre, g.carrera)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-[var(--oc-muted)]">
              Materia
              <select
                value={nuevaMateria}
                onChange={(e) => setNuevaMateria(e.target.value)}
                disabled={trabajando}
                className="rounded-xl border border-[var(--oc-border)] bg-[var(--oc-surface)] px-2 py-1.5 text-xs font-semibold text-[var(--oc-text)]"
              >
                <option value="">Elegir materia…</option>
                {datos.catalogo.materias.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => void darDeAlta()}
              disabled={!nuevoGrupo || !nuevaMateria || trabajando}
              className="rounded-full border border-transparent bg-[var(--oc-mint)] px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-mint-ink)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {trabajando ? "Dando de alta…" : "Dar de alta"}
            </button>
          </div>

          {agrupadas.size === 0 ? (
            <p className="text-xs font-semibold text-[var(--oc-muted)]">
              No hay materias por grupo todavía.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {[...agrupadas.entries()].map(([grupoId, { etiqueta, items }]) => (
                <section key={grupoId} className="flex flex-col gap-1.5">
                  <h3 className="text-[11px] font-extrabold uppercase tracking-widest text-[var(--oc-muted)]">
                    {etiqueta}
                  </h3>
                  <ul className="flex flex-col gap-1.5">
                    {items.map((p) => {
                      if (confirmarDesactivar === p.grupoMateriaId) {
                        return (
                          <li
                            key={p.grupoMateriaId}
                            className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-3 py-2"
                          >
                            <span className="text-sm font-semibold text-[var(--oc-text)]">
                              {p.alias ?? p.materiaNombre}
                            </span>
                            <span className="text-[11px] font-semibold text-[var(--oc-muted)]">
                              La materia deja de mostrarse en este grupo. Sus
                              calificaciones se conservan y vuelven si la
                              reactivas.
                            </span>
                            <span className="ml-auto flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                disabled={trabajando}
                                onClick={() => void cambiarEstado(p.grupoMateriaId, false)}
                                className="rounded-full border border-transparent bg-[var(--oc-alert)]/20 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-alert-text)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Sí, desactivar
                              </button>
                              <button
                                type="button"
                                disabled={trabajando}
                                onClick={() => setConfirmarDesactivar(null)}
                                className={btn}
                              >
                                Cancelar
                              </button>
                            </span>
                          </li>
                        );
                      }
                      const editando =
                        aliasEditando?.grupoMateriaId === p.grupoMateriaId;
                      return (
                        <li
                          key={p.grupoMateriaId}
                          className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-3 py-2"
                        >
                          <span className="text-sm font-semibold text-[var(--oc-text)]">
                            {p.alias ?? p.materiaNombre}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                              p.activo
                                ? "bg-[var(--oc-ok)]/15 text-[var(--oc-ok)]"
                                : "bg-[var(--oc-alert)]/15 text-[var(--oc-alert-text)]"
                            }`}
                          >
                            {p.activo ? "Activa" : "Desactivada"}
                          </span>

                          <span className="ml-auto flex flex-wrap items-center gap-1.5">
                            {editando ? (
                              <>
                                <input
                                  value={aliasEditando?.valor ?? ""}
                                  onChange={(e) =>
                                    setAliasEditando({
                                      grupoMateriaId: p.grupoMateriaId,
                                      valor: e.target.value,
                                    })
                                  }
                                  disabled={trabajando}
                                  className="w-44 rounded-xl border border-[var(--oc-border)] bg-[var(--oc-surface)] px-2 py-1 text-xs font-semibold text-[var(--oc-text)] outline-none"
                                />
                                <button
                                  type="button"
                                  disabled={trabajando}
                                  onClick={() =>
                                    void guardarAlias(
                                      p.grupoMateriaId,
                                      aliasEditando?.valor ?? "",
                                    )
                                  }
                                  className="rounded-full border border-transparent bg-[var(--oc-mint)] px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-mint-ink)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Guardar
                                </button>
                                <button
                                  type="button"
                                  disabled={trabajando}
                                  onClick={() => setAliasEditando(null)}
                                  className={btn}
                                >
                                  Cancelar
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  disabled={trabajando}
                                  onClick={() =>
                                    setAliasEditando({
                                      grupoMateriaId: p.grupoMateriaId,
                                      valor: p.alias ?? "",
                                    })
                                  }
                                  className={btn}
                                >
                                  Editar alias
                                </button>
                                {p.activo ? (
                                  <button
                                    type="button"
                                    disabled={trabajando}
                                    onClick={() =>
                                      setConfirmarDesactivar(p.grupoMateriaId)
                                    }
                                    className={btn}
                                  >
                                    Desactivar
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={trabajando}
                                    onClick={() =>
                                      void cambiarEstado(p.grupoMateriaId, true)
                                    }
                                    className={btn}
                                  >
                                    Reactivar
                                  </button>
                                )}
                              </>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
