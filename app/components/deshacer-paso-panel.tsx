"use client";

// PROMPT-4/T4 — Deshacer los datos de un paso del configurador (previsualizar →
// confirmar). No borra el ciclo; solo las filas del paso elegido, y SOLO si la
// previsualización no encuentra bloqueos (datos derivados que quedarían
// huérfanos). Capacidad: ciclo.borrar_datos.
import { useEffect, useState } from "react";
import {
  actionConfirmarBorrarPaso,
  actionPrevisualizarBorrarPaso,
} from "@/app/actions/borrar-datos";
import { actionListarCiclosAdmin } from "@/app/actions/evaluaciones";
import type { PreviewBorrarPaso } from "@/lib/escolar/ciclo/borrar-paso";

const PASOS = [
  { id: "academico", etiqueta: "Contexto académico (grupos / materias / semestres)" },
  { id: "calendario", etiqueta: "Calendario del ciclo" },
  { id: "horario", etiqueta: "Horario semanal" },
  { id: "evaluaciones", etiqueta: "Parciales / evaluaciones" },
  { id: "roster", etiqueta: "Roster (inscripciones)" },
] as const;

export function DeshacerPasoPanel() {
  const [ciclos, setCiclos] = useState<
    Array<{ id: string; nombre: string; estado?: string | null }>
  >([]);
  const [cicloId, setCicloId] = useState("");
  const [paso, setPaso] = useState<string>("");
  const [preview, setPreview] = useState<PreviewBorrarPaso | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    void (async () => {
      const r = await actionListarCiclosAdmin();
      if (!activo) return;
      if (r.ok) {
        setCiclos(r.ciclos.map((c) => ({ id: c.id, nombre: c.nombre, estado: c.estado })));
        setCicloId((prev) => prev || r.ciclos[0]?.id || "");
      }
    })();
    return () => {
      activo = false;
    };
  }, []);

  async function previsualizar() {
    if (!cicloId || !paso) return;
    setTrabajando(true);
    setError(null);
    setResultado(null);
    setPreview(null);
    const r = await actionPrevisualizarBorrarPaso(cicloId, paso);
    setTrabajando(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setPreview(r);
  }

  async function confirmar() {
    if (!cicloId || !paso || !preview || !preview.ok) return;
    if (preview.bloqueos.length > 0) return;
    const confirma = window.confirm(
      `¿Borrar el paso «${paso}» del ciclo «${preview.periodoNombre}»?\nSe borrarán ${preview.conteos[preview.paso]} filas. Esta acción no es reversible (pero no toca el ciclo ni los datos derivados).`,
    );
    if (!confirma) return;
    setTrabajando(true);
    setError(null);
    const r = await actionConfirmarBorrarPaso(cicloId, paso);
    setTrabajando(false);
    if (r.ok) {
      setResultado(r.mensaje);
      setPreview(null);
    } else {
      setError(r.error);
    }
  }

  const conteoPaso = preview?.ok ? preview.conteos[preview.paso] : 0;

  return (
    <div className="mt-10 w-full rounded-[1.5rem] border border-white/45 bg-slate-500/20 p-5 shadow-[inset_0_3px_12px_rgba(0,0,0,0.06)] backdrop-blur-sm">
      <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-800">
        Deshacer datos de un paso
      </h2>
      <p className="mt-1 text-xs font-semibold text-slate-600">
        Borra SOLO las filas de un paso del configurador (contexto, calendario,
        horario, evaluaciones o roster), sin borrar el ciclo. Todo con
        previsualización: si el paso arrastra datos derivados, se bloquea y no
        escribe.
      </p>

      {error && (
        <p className="mt-3 rounded-xl bg-rose-500/15 px-3 py-2 text-xs font-bold text-rose-800" role="alert">
          {error}
        </p>
      )}
      {resultado && (
        <p className="mt-3 rounded-xl bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-800" role="status">
          {resultado}
        </p>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-[11px] font-extrabold uppercase tracking-wide text-slate-700">
            Ciclo
          </label>
          <select
            value={cicloId}
            onChange={(e) => {
              setCicloId(e.target.value);
              setPreview(null);
              setResultado(null);
            }}
            className="mt-1 w-full rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-xs font-bold text-slate-800"
          >
            {ciclos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
                {c.estado ? ` (${c.estado})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-extrabold uppercase tracking-wide text-slate-700">
            Paso a deshacer
          </label>
          <select
            value={paso}
            onChange={(e) => {
              setPaso(e.target.value);
              setPreview(null);
              setResultado(null);
            }}
            className="mt-1 w-full rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-xs font-bold text-slate-800"
          >
            <option value="">Seleccionar paso…</option>
            {PASOS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.etiqueta}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="button"
        disabled={trabajando || !cicloId || !paso}
        onClick={() => void previsualizar()}
        className="mt-4 rounded-full border border-white/70 bg-linear-to-b from-sky-400 via-sky-500 to-sky-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white transition hover:brightness-105 disabled:opacity-60"
      >
        {trabajando ? "Previsualizando…" : "Previsualizar borrado"}
      </button>

      {preview && preview.ok && (
        <div className="mt-4 rounded-2xl border border-amber-400/50 bg-amber-100/70 p-4">
          <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-amber-900">
            Previsualización — {preview.periodoNombre} ({preview.estado})
          </p>
          <ul className="flex flex-col gap-1 text-xs font-semibold text-amber-950">
            <li>
              Se borrarán: {conteoPaso} filas del paso «{preview.paso}»
            </li>
            <li>
              Derivados detectados: {preview.conteos.derivados.asignaciones}{" "}
              asignaciones · {preview.conteos.derivados.clasesImpartidas} clases ·{" "}
              {preview.conteos.derivados.asistenciaAlumnos} asistencias ·{" "}
              {preview.conteos.derivados.justificaciones} justificaciones
            </li>
          </ul>
          {preview.bloqueos.length > 0 ? (
            <div className="mt-2 rounded-xl bg-rose-500/15 p-3">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-rose-800">
                Bloqueado — no se borra
              </p>
              <ul className="mt-1 list-disc pl-4 text-xs font-semibold text-rose-900">
                {preview.bloqueos.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          ) : (
            <button
              type="button"
              disabled={trabajando}
              onClick={() => void confirmar()}
              className="mt-3 rounded-full border border-white/70 bg-linear-to-b from-rose-400 via-rose-500 to-rose-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white transition hover:brightness-105 disabled:opacity-60"
            >
              {trabajando ? "Borrando…" : "Confirmar borrado del paso"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
