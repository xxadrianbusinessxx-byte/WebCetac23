"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import {
  actionCambiarVisibilidadMateria,
  actionGuardarNombreVisibleMateria,
  actionListarMateriasConfiguracion,
  actionQuitarAliasMateria,
} from "@/app/actions/materias";
import { normalizarNombre } from "@/lib/escolar/nombres";
import type { MateriaConNombreVisible } from "@/lib/escolar/materia/nombres-visibles";
import { AliasesVolumenPanel } from "./aliases-volumen-panel";

type Props = {
  materias: readonly MateriaConNombreVisible[];
};

type Mensaje = { ok: boolean; texto: string } | null;

/**
 * Sección «Configuración de materias» del panel directivo (BLOQUE 7A).
 * Permite:
 *   - buscar materia (por nombre visible, asignatura o ID técnico)
 *   - ver el nombre visible actual
 *   - ver el identificador técnico (solo lectura, nunca editable)
 *   - editar y guardar ÚNICAMENTE el nombre visible.
 *
 * El identificador técnico es el nombre real de la tabla Supabase y NUNCA se
 * puede modificar desde esta pantalla.
 */
export function MateriasConfigPanel({ materias }: Props) {
  const router = useRouter();
  const idBusqueda = useId();
  const [lista, setLista] = useState<MateriaConNombreVisible[]>(() => [
    ...materias,
  ]);
  const [busqueda, setBusqueda] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [borrador, setBorrador] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<Mensaje>(null);
  const [ocultas, setOcultas] = useState<ReadonlySet<string>>(new Set());
  const [abierto, setAbierto] = useState(false);
  const [cargandoConfig, setCargandoConfig] = useState(false);

  useEffect(() => {
    setLista([...materias]);
  }, [materias]);

  // C4.19 — carga PEREZOSA del catálogo completo (eficiencia): no se cargan
  // los cientos de materias al montar; se abren con el botón "Abrir catálogo".
  async function abrirCatalogo() {
    setCargandoConfig(true);
    setMensaje(null);
    const r = await actionListarMateriasConfiguracion();
    setCargandoConfig(false);
    if ("ok" in r && r.ok) {
      setLista([...r.materias]);
      setOcultas(new Set(r.ocultas));
      setAbierto(true);
    } else if ("error" in r) {
      setMensaje({ ok: false, texto: r.error });
    }
  }

  function cerrarCatalogo() {
    setAbierto(false);
    setLista([]);
    setMensaje(null);
  }

  const filtradas = useMemo(() => {
    const q = normalizarNombre(busqueda);
    if (!q) return lista;
    return lista.filter(
      (m) =>
        normalizarNombre(m.nombreVisible).includes(q) ||
        normalizarNombre(m.asignatura).includes(q) ||
        normalizarNombre(m.idInterno).includes(q),
    );
  }, [busqueda, lista]);

  async function guardar(m: MateriaConNombreVisible) {
    setGuardando(true);
    setMensaje(null);
    const r = await actionGuardarNombreVisibleMateria(m.idInterno, borrador);
    setGuardando(false);
    if (r.ok) {
      setLista((prev) =>
        prev.map((x) =>
          x.idInterno === m.idInterno
            ? { ...x, nombreVisible: borrador.trim() }
            : x,
        ),
      );
      setEditandoId(null);
      setBorrador("");
      setMensaje({ ok: true, texto: "Nombre visible actualizado." });
      // Refresca los datos del servidor para que el resto del panel
      // (selector, etc.) muestre el nuevo nombre.
      router.refresh();
    } else {
      setMensaje({ ok: false, texto: r.error });
    }
  }

  // C4.18 — desactivar/activar la visibilidad de la materia en el catálogo.
  async function cambiarVisibilidad(m: MateriaConNombreVisible) {
    const visible = !ocultas.has(m.idInterno);
    setGuardando(true);
    setMensaje(null);
    const r = await actionCambiarVisibilidadMateria(m.idInterno, visible);
    setGuardando(false);
    if (r.ok) {
      setOcultas((prev) => {
        const next = new Set(prev);
        if (visible) next.delete(m.idInterno);
        else next.add(m.idInterno);
        return next;
      });
      setMensaje({ ok: true, texto: r.mensaje });
      router.refresh();
    } else {
      setMensaje({ ok: false, texto: r.error });
    }
  }

  // PROMPT-4/T2 — quitar el alias (activo=false, nunca DELETE). La materia
  // vuelve a mostrarse por su idInterno en toda la UI.
  async function quitarAlias(m: MateriaConNombreVisible) {
    const confirma = window.confirm(
      `¿Quitar el alias de "${m.idInterno}"?\nLa materia volverá a mostrarse con su nombre técnico. Puedes volver a ponerlo después.`,
    );
    if (!confirma) return;
    setGuardando(true);
    setMensaje(null);
    const r = await actionQuitarAliasMateria(m.idInterno);
    setGuardando(false);
    if (r.ok) {
      setLista((prev) =>
        prev.map((x) =>
          x.idInterno === m.idInterno
            ? { ...x, nombreVisible: x.idInterno }
            : x,
        ),
      );
      setMensaje({
        ok: true,
        texto: `Alias quitado: "${m.idInterno}" se mostrará por su nombre técnico.`,
      });
      router.refresh();
    } else {
      setMensaje({ ok: false, texto: r.error });
    }
  }

  return (
    <div
      className="relative mt-6 flex flex-1 flex-col gap-6 overflow-hidden rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-3 sm:p-4"
      aria-label="Configuración de materias"
    >
      <div className="mx-auto w-fit rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] sm:text-[11px]">
        Configuración de materias
      </div>

      <div className="relative z-[1] flex flex-col gap-4">
        <div className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-3 text-center text-xs font-bold text-[var(--oc-muted)]">
          Este cambio solo modifica cómo se muestra la materia. No cambia la
          tabla ni las calificaciones.
        </div>

        {!abierto ? (
          <button
            type="button"
            onClick={() => void abrirCatalogo()}
            disabled={cargandoConfig}
            className="rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-5 py-2 text-xs font-extrabold uppercase tracking-wide text-[var(--oc-text)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cargandoConfig
              ? "Cargando catálogo…"
              : "Abrir catálogo completo"}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={cerrarCatalogo}
              className="w-fit rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] transition hover:brightness-110"
            >
              No ver nada (ocultar catálogo)
            </button>

            <div className="relative">
              <label className="sr-only" htmlFor={idBusqueda}>
                Buscar materia
              </label>
              <input
                id={idBusqueda}
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre visible, asignatura o ID técnico…"
                className="w-full rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2.5 text-xs font-bold text-[var(--oc-text)] outline-none placeholder:text-[var(--oc-muted)] focus:border-[var(--oc-border-active)]"
              />
            </div>

        {mensaje && (
          <p
            role="status"
            className={`text-center text-xs font-semibold ${
              mensaje.ok ? "text-[var(--oc-text)]" : "text-[var(--oc-alert-text)]"
            }`}
          >
            {mensaje.texto}
          </p>
        )}

        {/* PROMPT-4/T2 — edición en volumen (previsualizar → confirmar). */}
        <AliasesVolumenPanel />

        {filtradas.length === 0 ? (
          <p className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] px-4 py-6 text-center text-sm font-semibold text-[var(--oc-muted)]">
            No se encontraron materias.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtradas.map((m) => {
              const editando = editandoId === m.idInterno;
              return (
                <div
                  key={m.idInterno}
                  className="flex flex-col gap-2 rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-4"
                >
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--oc-muted)]">
                    Materia
                  </p>
                  <p className="text-sm font-extrabold uppercase leading-snug tracking-wide text-[var(--oc-text)]">
                    {m.nombreVisible}
                  </p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--oc-muted)]">
                    ID técnico: {m.idInterno}
                  </p>
                  {ocultas.has(m.idInterno) && (
                    <span className="mt-1 inline-block w-fit rounded-full bg-[var(--oc-alert)]/20 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-[var(--oc-alert-text)]">
                      Oculto del panel de calificaciones y del alumno
                    </span>
                  )}

                  {editando ? (
                    <div className="mt-1 flex flex-col gap-2">
                      <label
                        className="sr-only"
                        htmlFor={`nombre-visible-${m.idInterno}`}
                      >
                        Nuevo nombre visible
                      </label>
                      <input
                        id={`nombre-visible-${m.idInterno}`}
                        type="text"
                        value={borrador}
                        onChange={(e) => setBorrador(e.target.value)}
                        maxLength={120}
                        placeholder="Nuevo nombre…"
                        className="w-full rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-3 py-2 text-xs font-bold text-[var(--oc-text)] outline-none placeholder:text-[var(--oc-muted)] focus:border-[var(--oc-border-active)]"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={guardando}
                          onClick={() => void guardar(m)}
                          className="rounded-full bg-[var(--oc-mint)] px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-mint-ink)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {guardando ? "Guardando…" : "Guardar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditandoId(null);
                            setBorrador("");
                          }}
                          className="rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] transition hover:brightness-110"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditandoId(m.idInterno);
                          setBorrador(m.nombreVisible);
                          setMensaje(null);
                        }}
                        className="w-fit rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] transition hover:brightness-110"
                      >
                        Editar nombre
                      </button>
                      {m.nombreVisible !== m.idInterno && (
                        <button
                          type="button"
                          disabled={guardando || cargandoConfig}
                          onClick={() => void quitarAlias(m)}
                          title="Quitar el alias: la materia volverá a mostrarse por su idInterno (no borra nada)."
                          className="w-fit rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] transition hover:brightness-110"
                        >
                          Quitar alias
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={guardando || cargandoConfig}
                        onClick={() => void cambiarVisibilidad(m)}
                        className={`w-fit rounded-full border border-[var(--oc-border)] px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-wide transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 ${
                          ocultas.has(m.idInterno)
                            ? "bg-[var(--oc-input)] text-[var(--oc-text)]"
                            : "bg-[var(--oc-input)] text-[var(--oc-alert-text)]"
                        }`}
                      >
                        {ocultas.has(m.idInterno) ? "Activar" : "Desactivar"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}
