"use client";

import { useCallback, useEffect, useState } from "react";

import {
  actionClonarContextoAcademico,
  actionListarPeriodosContexto,
  actionVerContextoAcademico,
  type PeriodoSimple,
} from "@/app/actions/contexto-ciclo";
import type { ContextoAcademicoPeriodo } from "@/lib/escolar/contexto-ciclo";

/**
 * FASE CONSOLIDACIÓN — Contexto académico del ciclo.
 * Solución general a «periodo creado sin grupos»: copia la estructura
 * (grupos + materias) desde un ciclo existente reutilizando carreras y
 * materias por ID (sin duplicar catálogo).
 */

export function ContextoAcademicoPanel() {
  const [periodos, setPeriodos] = useState<PeriodoSimple[]>([]);
  const [destinoId, setDestinoId] = useState("");
  const [origenId, setOrigenId] = useState("");
  const [contexto, setContexto] = useState<ContextoAcademicoPeriodo | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "err"; texto: string } | null>(null);
  const [cargando, setCargando] = useState(false);
  const [copiando, setCopiando] = useState(false);

  const aplicarPeriodos = useCallback(
    (r: { ok: true; periodos: PeriodoSimple[] } | { ok: false; error: string }) => {
      if (!r.ok) {
        setMensaje({ tipo: "err", texto: r.error });
        return;
      }
      setPeriodos(r.periodos);
      setDestinoId((prev) => prev || r.periodos[0]?.id || "");
      setOrigenId((prev) => {
        if (prev) return prev;
        return r.periodos[1]?.id ?? r.periodos[0]?.id ?? "";
      });
    },
    [],
  );

  useEffect(() => {
    let activo = true;
    void actionListarPeriodosContexto().then((r) => {
      if (activo) aplicarPeriodos(r);
    });
    return () => {
      activo = false;
    };
  }, [aplicarPeriodos]);

  const aplicarContexto = useCallback(
    (r: { ok: true; contexto: ContextoAcademicoPeriodo | null } | { ok: false; error: string }) => {
      setCargando(false);
      if (!r.ok) {
        setMensaje({ tipo: "err", texto: r.error });
        return;
      }
      setContexto(r.contexto);
    },
    [],
  );

  useEffect(() => {
    if (!destinoId) return;
    let activo = true;
    void actionVerContextoAcademico(destinoId).then((r) => {
      if (activo) aplicarContexto(r);
    });
    return () => {
      activo = false;
    };
  }, [destinoId, aplicarContexto]);

  async function onCopiar() {
    if (!destinoId || !origenId || destinoId === origenId) {
      setMensaje({ tipo: "err", texto: "Elige ciclos destino y origen distintos." });
      return;
    }
    setCopiando(true);
    const r = await actionClonarContextoAcademico(destinoId, origenId);
    setCopiando(false);
    if (!r.ok) {
      setMensaje({ tipo: "err", texto: r.error ?? "No se pudo copiar el contexto." });
      return;
    }
    setMensaje({
      tipo: "ok",
      texto: `${r.mensaje ?? ""} Grupos nuevos: ${r.gruposCreados} · ya existentes: ${r.gruposYaExistentes} · materias vinculadas: ${r.materiasVinculadas} · omitidas: ${r.materiasOmitidas}.`,
    });
    const vr = await actionVerContextoAcademico(destinoId);
    aplicarContexto(vr);
  }

  const nombrePeriodo = (id: string) =>
    periodos.find((p) => p.id === id)?.nombre ?? "";

  return (
    <section
      className="relative mt-6 overflow-hidden rounded-[2rem] border-[3px] border-teal-800/50 bg-teal-100/35 p-3 shadow-[0_12px_40px_rgba(45,212,191,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl backdrop-saturate-150 sm:p-4"
      aria-label="Contexto académico del ciclo"
    >
      <div className="relative z-[1] flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-teal-900">
            Contexto académico del ciclo (grupos y materias)
          </h2>
          <span className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-white">
            Copia estructura desde un ciclo existente
          </span>
        </div>

        {mensaje && (
          <p
            className={`rounded-2xl px-4 py-2 text-xs font-bold ${
              mensaje.tipo === "ok"
                ? "bg-emerald-100 text-emerald-900"
                : "bg-red-100 text-red-800"
            }`}
            role="status"
          >
            {mensaje.texto}
          </p>
        )}

        <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
          <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-teal-900">
            Ciclo nuevo (destino)
          </p>
          <select
            value={destinoId}
            onChange={(e) => setDestinoId(e.target.value)}
            className="w-full rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white outline-none"
            aria-label="Ciclo destino"
          >
            {periodos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} {p.activo ? "(activo)" : "(inactivo)"}
              </option>
            ))}
          </select>

          {cargando ? (
            <p className="mt-2 text-xs font-semibold text-slate-600">Cargando contexto…</p>
          ) : contexto ? (
            <div className="mt-3">
              <p className="text-[11px] font-bold text-teal-900">
                {contexto.periodoNombre} — {contexto.grupos.length} grupos
              </p>
              {contexto.grupos.length === 0 ? (
                <p className="mt-1 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
                  Este ciclo aún no tiene grupos. Usa «Copiar desde otro ciclo»
                  o la carga académica/roster.
                </p>
              ) : (
                <ul className="mt-1 max-h-40 overflow-y-auto rounded-xl bg-white/60 p-2 text-[11px] font-semibold text-slate-700">
                  {contexto.grupos.map((g) => (
                    <li key={g.id}>
                      {g.grado} {g.grupo}
                      {g.carreraClave ? ` · ${g.carreraClave}` : " · tronco común"} —{" "}
                      {g.materiasActivas} materia(s)
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="mt-2 text-[11px] font-semibold text-slate-600">
              Selecciona un ciclo para ver su contexto.
            </p>
          )}
        </div>

        <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
          <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-teal-900">
            Copiar estructura desde (origen)
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={origenId}
              onChange={(e) => setOrigenId(e.target.value)}
              className="flex-1 rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white outline-none"
              aria-label="Ciclo origen"
            >
              {periodos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} {p.activo ? "(activo)" : "(inactivo)"}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={copiando || !destinoId || !origenId || destinoId === origenId}
              onClick={() => void onCopiar()}
              className="rounded-full border border-white/70 bg-linear-to-b from-teal-500 via-teal-600 to-teal-700 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-white transition hover:brightness-105 disabled:opacity-50"
            >
              {copiando ? "Copiando…" : "Copiar grupos y materias"}
            </button>
          </div>
          <p className="mt-2 text-[11px] font-semibold text-slate-600">
            Desde «{nombrePeriodo(origenId)}» hacia «{nombrePeriodo(destinoId)}»
            reutilizando carreras y materias existentes (sin duplicar el catálogo).
          </p>
        </div>
      </div>
    </section>
  );
}
