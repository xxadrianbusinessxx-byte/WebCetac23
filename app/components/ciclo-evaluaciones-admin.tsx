"use client";

import { useCallback, useEffect, useState } from "react";

import {
  actionCrearCicloEscolar,
  actionGuardarEvaluacion,
  actionGuardarRangoCiclo,
  actionListarCiclosConEvaluaciones,
  actionSetActivoCiclo,
  actionSetActivoEvaluacion,
  type CicloEvaluacionListado,
} from "@/app/actions/evaluaciones";

/**
 * FASE CICLO — Panel del directivo: ciclos escolares + periodos de evaluación.
 * - Crear/activar/desactivar ciclo (históricos nunca se borran).
 * - Rango de fechas del ciclo (opcional).
 * - Parciales configurables (cantidad no fija) con inicio y cierre.
 * La autorización real (rol directivo) la validan las Server Actions.
 */

type CicloDraft = { inicio: string; fin: string };

type EvalDraft = {
  key: string;
  id?: string;
  periodoId: string;
  numero: string;
  nombre: string;
  inicio: string;
  fin: string;
  activo: boolean;
};

export function CicloEvaluacionesAdmin() {
  const [ciclos, setCiclos] = useState<CicloEvaluacionListado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "err"; texto: string } | null>(null);

  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoInicio, setNuevoInicio] = useState("");
  const [nuevoFin, setNuevoFin] = useState("");

  const [draftsCiclo, setDraftsCiclo] = useState<Record<string, CicloDraft>>({});
  const [draftsEval, setDraftsEval] = useState<Record<string, EvalDraft>>({});

  const aplicarResultado = useCallback(
    (r: { ok: true; ciclos: CicloEvaluacionListado[] } | { ok: false; error: string }) => {
      setCargando(false);
      if (!r.ok) {
        setMensaje({ tipo: "err", texto: r.error });
        return;
      }
      setCiclos(r.ciclos);
      const cd: Record<string, CicloDraft> = {};
      const ed: Record<string, EvalDraft> = {};
      for (const c of r.ciclos) {
        cd[c.periodo.id] = {
          inicio: c.periodo.fecha_inicio ?? "",
          fin: c.periodo.fecha_fin ?? "",
        };
        for (const ev of c.evaluaciones) {
          ed[ev.id] = {
            key: ev.id,
            id: ev.id,
            periodoId: ev.periodo_id,
            numero: String(ev.numero),
            nombre: ev.nombre,
            inicio: ev.fecha_inicio,
            fin: ev.fecha_fin,
            activo: ev.activo,
          };
        }
      }
      setDraftsCiclo(cd);
      setDraftsEval(ed);
    },
    [],
  );

  const recargar = useCallback(async () => {
    const r = await actionListarCiclosConEvaluaciones();
    aplicarResultado(r);
  }, [aplicarResultado]);

  useEffect(() => {
    let activo = true;
    void actionListarCiclosConEvaluaciones().then((r) => {
      if (!activo) return;
      aplicarResultado(r);
    });
    return () => {
      activo = false;
    };
  }, [aplicarResultado]);

  function avisarRes(r: { ok: boolean; mensaje?: string; error?: string }) {
    setMensaje({
      tipo: r.ok ? "ok" : "err",
      texto: r.ok ? (r.mensaje ?? "") : (r.error ?? ""),
    });
  }

  async function onCreateCiclo() {
    const r = await actionCrearCicloEscolar({
      nombre: nuevoNombre,
      fechaInicio: nuevoInicio || undefined,
      fechaFin: nuevoFin || undefined,
    });
    avisarRes(r);
    if (r.ok) {
      setNuevoNombre("");
      setNuevoInicio("");
      setNuevoFin("");
      await recargar();
    }
  }

  async function onGuardarRango(periodoId: string) {
    const d = draftsCiclo[periodoId];
    if (!d) return;
    const r = await actionGuardarRangoCiclo({
      periodoId,
      fechaInicio: d.inicio || null,
      fechaFin: d.fin || null,
    });
    avisarRes(r);
    if (r.ok) await recargar();
  }

  async function onToggleCiclo(item: CicloEvaluacionListado) {
    const r = await actionSetActivoCiclo(item.periodo.id, !item.periodo.activo);
    avisarRes(r);
    if (r.ok) await recargar();
  }

  function agregarParcial(periodoId: string) {
    const existentes = ciclos.find((c) => c.periodo.id === periodoId)?.evaluaciones ?? [];
    const siguiente = (existentes.reduce((m, e) => Math.max(m, e.numero), 0) ?? 0) + 1;
    const key = `nuevo-${periodoId}-${Date.now()}`;
    setDraftsEval((prev) => ({
      ...prev,
      [key]: {
        key,
        periodoId,
        numero: String(siguiente),
        nombre: `Parcial ${siguiente}`,
        inicio: "",
        fin: "",
        activo: true,
      },
    }));
  }

  function setDraft(key: string, patch: Partial<EvalDraft>) {
    setDraftsEval((prev) => (prev[key] ? { ...prev, [key]: { ...prev[key]!, ...patch } } : prev));
  }

  async function onGuardarParcial(d: EvalDraft) {
    const r = await actionGuardarEvaluacion({
      id: d.id,
      periodoId: d.periodoId,
      numero: d.numero,
      nombre: d.nombre,
      fechaInicio: d.inicio,
      fechaFin: d.fin,
      activo: d.activo,
    });
    avisarRes(r);
    if (r.ok) await recargar();
  }

  async function onToggleParcial(ev: { id: string; periodoId: string; activo: boolean }) {
    const r = await actionSetActivoEvaluacion(ev.periodoId, ev.id, !ev.activo);
    avisarRes(r);
    if (r.ok) await recargar();
  }

  const inputCls =
    "rounded-xl border border-white/70 bg-white/90 px-3 py-2 text-xs font-semibold text-slate-800 outline-none";
  const accionCls =
    "rounded-full border border-white/70 bg-linear-to-b from-sky-500 via-sky-600 to-sky-700 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-white transition hover:brightness-105 disabled:opacity-50";

  return (
    <section
      className="relative mt-6 overflow-hidden rounded-[2rem] border-[3px] border-indigo-800/50 bg-indigo-100/35 p-3 shadow-[0_12px_40px_rgba(129,140,248,0.15)] backdrop-blur-xl backdrop-saturate-150 sm:p-4"
      aria-label="Ciclo escolar y periodos de evaluación"
    >
      <div className="relative z-[1] flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-indigo-900">
            Ciclo escolar y periodos de evaluación
          </h2>
          <span className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-white">
            Fecha → ciclo → parcial
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
          <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-indigo-900">
            Crear ciclo escolar
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <input
              className={inputCls}
              placeholder="Ciclo (ej. 2027-2028)"
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
            />
            <input
              type="date"
              className={inputCls}
              value={nuevoInicio}
              onChange={(e) => setNuevoInicio(e.target.value)}
            />
            <input
              type="date"
              className={inputCls}
              value={nuevoFin}
              onChange={(e) => setNuevoFin(e.target.value)}
            />
            <button
              type="button"
              className={accionCls}
              onClick={() => void onCreateCiclo()}
              disabled={!nuevoNombre.trim()}
            >
              Crear ciclo
            </button>
          </div>
        </div>

        {cargando ? (
          <p className="text-xs font-semibold text-slate-600">Cargando…</p>
        ) : ciclos.length === 0 ? (
          <p className="text-xs font-semibold text-slate-600">
            No hay ciclos registrados.
          </p>
        ) : (
          ciclos.map((item) => {
            const c = item.periodo;
            const draftC = draftsCiclo[c.id] ?? { inicio: "", fin: "" };
            const evalRows = item.evaluaciones
              .map((ev) => draftsEval[ev.id] ?? null)
              .filter((d): d is EvalDraft => Boolean(d));
            const nuevas = Object.values(draftsEval).filter(
              (d) => d.periodoId === c.id && !d.id,
            );
            return (
              <div
                key={c.id}
                className="rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-extrabold uppercase tracking-wide text-indigo-900">
                    {c.nombre}{" "}
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase ${
                        c.activo
                          ? "bg-emerald-200 text-emerald-900"
                          : "bg-red-200 text-red-800"
                      }`}
                    >
                      {c.activo ? "Activo" : "Inactivo"}
                    </span>
                  </p>
                  <button
                    type="button"
                    className={accionCls}
                    onClick={() => void onToggleCiclo(item)}
                  >
                    {c.activo ? "Desactivar ciclo" : "Activar ciclo"}
                  </button>
                </div>
                <p className="mt-1 text-[10px] font-semibold text-slate-600">
                  Rango del ciclo (opcional)
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    className={inputCls}
                    value={draftC.inicio}
                    onChange={(e) =>
                      setDraftsCiclo((prev) => ({
                        ...prev,
                        [c.id]: { ...draftC, inicio: e.target.value },
                      }))
                    }
                  />
                  <input
                    type="date"
                    className={inputCls}
                    value={draftC.fin}
                    onChange={(e) =>
                      setDraftsCiclo((prev) => ({
                        ...prev,
                        [c.id]: { ...draftC, fin: e.target.value },
                      }))
                    }
                  />
                  <button
                    type="button"
                    className={accionCls}
                    onClick={() => void onGuardarRango(c.id)}
                  >
                    Guardar rango
                  </button>
                </div>
                <p className="mt-4 text-[10px] font-extrabold uppercase tracking-wide text-indigo-900">
                  Periodos de evaluación (parciales)
                </p>
                {evalRows.length === 0 && nuevas.length === 0 && (
                  <p className="mt-1 text-[11px] font-semibold text-slate-600">
                    Sin parciales configurados.
                  </p>
                )}
                <div className="mt-2 flex flex-col gap-2">
                  {[...evalRows, ...nuevas].map((d) => (
                    <div
                      key={d.key}
                      className="grid grid-cols-1 gap-2 rounded-2xl border border-white/60 bg-white/60 p-2 sm:grid-cols-[4rem_1fr_1fr_1fr_auto]"
                    >
                      <input
                        type="number"
                        min={1}
                        className={inputCls}
                        value={d.numero}
                        onChange={(e) => setDraft(d.key, { numero: e.target.value })}
                      />
                      <input
                        className={inputCls}
                        value={d.nombre}
                        onChange={(e) => setDraft(d.key, { nombre: e.target.value })}
                        placeholder="Nombre (ej. Parcial 1)"
                      />
                      <input
                        type="date"
                        className={inputCls}
                        value={d.inicio}
                        onChange={(e) => setDraft(d.key, { inicio: e.target.value })}
                      />
                      <input
                        type="date"
                        className={inputCls}
                        value={d.fin}
                        onChange={(e) => setDraft(d.key, { fin: e.target.value })}
                      />
                      <div className="flex flex-wrap items-center gap-1">
                        <button
                          type="button"
                          className={accionCls}
                          onClick={() => void onGuardarParcial(d)}
                        >
                          Guardar
                        </button>
                        {d.id && (
                          <button
                            type="button"
                            className={accionCls}
                            onClick={() =>
                              void onToggleParcial({
                                id: d.id!,
                                periodoId: d.periodoId,
                                activo: d.activo,
                              })
                            }
                          >
                            {d.activo ? "Desactivar" : "Activar"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className={`${accionCls} mt-3`}
                  onClick={() => agregarParcial(c.id)}
                >
                  + Agregar parcial
                </button>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
