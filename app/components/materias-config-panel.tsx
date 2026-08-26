"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { actionGuardarNombreVisibleMateria } from "@/app/actions/materias";
import { normalizarNombre } from "@/lib/escolar/nombres";
import type { MateriaConNombreVisible } from "@/lib/escolar/nombres-visibles";

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

  useEffect(() => {
    setLista([...materias]);
  }, [materias]);

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

  return (
    <div
      className="relative mt-6 flex flex-1 flex-col gap-6 overflow-hidden rounded-[2rem] border-[3px] border-sky-800/50 bg-sky-100/35 p-3 shadow-[0_12px_40px_rgba(56,189,248,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl backdrop-saturate-150 sm:p-4"
      aria-label="Configuración de materias"
    >
      <div className="mx-auto w-fit rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] sm:text-[11px]">
        Configuración de materias
      </div>

      <div className="relative z-[1] flex flex-col gap-4">
        <div className="rounded-3xl border border-amber-400/50 bg-amber-100/80 px-4 py-3 text-center text-xs font-bold text-amber-950 shadow-[inset_0_2px_0_rgba(255,255,255,0.6)]">
          Este cambio solo modifica cómo se muestra la materia. No cambia la
          tabla ni las calificaciones.
        </div>

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
            className="w-full rounded-2xl border border-white/70 bg-white/90 px-4 py-2.5 text-xs font-bold text-sky-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-sky-400/50"
          />
        </div>

        {mensaje && (
          <p
            role="status"
            className={`text-center text-xs font-semibold ${
              mensaje.ok ? "text-sky-900" : "text-red-700"
            }`}
          >
            {mensaje.texto}
          </p>
        )}

        {filtradas.length === 0 ? (
          <p className="rounded-3xl border border-white/55 bg-slate-400/25 px-4 py-6 text-center text-sm font-semibold text-slate-600 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
            No se encontraron materias.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtradas.map((m) => {
              const editando = editandoId === m.idInterno;
              return (
                <div
                  key={m.idInterno}
                  className="flex flex-col gap-2 rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md"
                >
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-sky-900">
                    Materia
                  </p>
                  <p className="text-sm font-extrabold uppercase leading-snug tracking-wide text-sky-950">
                    {m.nombreVisible}
                  </p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    ID técnico: {m.idInterno}
                  </p>

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
                        className="w-full rounded-2xl border border-white/70 bg-white/95 px-3 py-2 text-xs font-bold text-sky-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] outline-none focus:ring-2 focus:ring-sky-400/50"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={guardando}
                          onClick={() => void guardar(m)}
                          className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {guardando ? "Guardando…" : "Guardar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditandoId(null);
                            setBorrador("");
                          }}
                          className="rounded-full border border-white/60 bg-white/70 px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-sky-800 transition hover:bg-white/90"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditandoId(m.idInterno);
                        setBorrador(m.nombreVisible);
                        setMensaje(null);
                      }}
                      className="mt-1 w-fit rounded-full border border-sky-700/40 bg-white/80 px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-sky-900 transition hover:bg-white"
                    >
                      Editar nombre
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
