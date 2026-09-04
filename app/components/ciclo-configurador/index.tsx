"use client";
import { useEffect, useState } from "react";
import { actionCrearCicloEscolar, actionDetalleCicloAdmin, actionDiagnosticoEliminarCiclo, actionEliminarCiclo, actionListarCiclosAdmin, actionSetActivoCiclo, type CicloAdminListado, type DetalleCicloAdmin } from "@/app/actions/evaluaciones";
import type { DiagnosticoEliminarCiclo } from "@/lib/escolar/eliminar-ciclo";
import { PasoDatos } from "./paso-datos";
import { PasoAcademico } from "./paso-academico";
import { PasoAlumnos } from "./paso-alumnos";
import { PasoEvaluacion } from "./paso-evaluacion";
import { PasoCalendario } from "./paso-calendario";
import { PasoHorario } from "./paso-horario";
import { PasoValidacion } from "./paso-validacion";

const PASOS = [
  { id: "datos", label: "1 · Datos" }, { id: "academico", label: "2 · Académico" },
  { id: "alumnos", label: "3 · Alumnos" }, { id: "evaluacion", label: "4 · Evaluación" },
  { id: "calendario", label: "5 · Calendario" }, { id: "horario", label: "6 · Horario" },
  { id: "validacion", label: "7 · Validación" },
] as const;
type PasoId = (typeof PASOS)[number]["id"];
const input = "rounded-lg border bg-white/90 px-2 py-1.5 text-xs font-semibold text-slate-800";
const btn = "rounded-full bg-sky-600 px-4 py-2 text-[10px] font-extrabold uppercase text-white disabled:opacity-50";

export function CicloConfigurador({ periodoIdInicial }: { periodoIdInicial?: string } = {}) {
  const [ciclos, setCiclos] = useState<CicloAdminListado[]>([]);
  const [periodoId, setPeriodoId] = useState(periodoIdInicial ?? "");
  const [detalle, setDetalle] = useState<DetalleCicloAdmin | null>(null);
  const [paso, setPaso] = useState<PasoId>("datos");
  const [nuevo, setNuevo] = useState("");
  const [msg, setMsg] = useState<{ t: "ok" | "err"; x: string } | null>(null);
  const avisar = (ok: boolean, x: string) => setMsg({ t: ok ? "ok" : "err", x });
  const sel = ciclos.find((c) => c.id === periodoId);

  type CicloAEliminar = {
    id: string;
    nombre: string;
    cargandoDiagnostico: boolean;
    diagnostico: DiagnosticoEliminarCiclo | null;
    error: string | null;
    confirmacion: string;
    trabajando: boolean;
  };
  const [eliminando, setEliminando] = useState<CicloAEliminar | null>(null);

  async function refrescar(preferido?: string) {
    const r = await actionListarCiclosAdmin();
    if (!r.ok) { avisar(false, r.error); return; }
    setCiclos(r.ciclos);
    const op = r.ciclos.find((c) => c.activo);
    const obj = preferido ?? (periodoId && r.ciclos.some((c) => c.id === periodoId) ? periodoId : (op?.id ?? ""));
    setPeriodoId(obj);
    setDetalle(null);
    if (obj) { const d = await actionDetalleCicloAdmin(obj); if (d.ok) setDetalle(d.detalle); }
  }
  useEffect(() => {
    const t = window.setTimeout(() => { void refrescar(); }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refrescarDetalle() {
    if (!periodoId) return;
    const d = await actionDetalleCicloAdmin(periodoId);
    if (d.ok) setDetalle(d.detalle);
  }

  async function seleccionar(id: string) {
    if (!id) return;
    setPeriodoId(id); setDetalle(null);
    const d = await actionDetalleCicloAdmin(id);
    if (!d.ok) { avisar(false, d.error); return; }
    setDetalle(d.detalle);
  }
  async function crear() {
    const r = await actionCrearCicloEscolar({ nombre: nuevo });
    avisar(r.ok, r.ok ? (r.mensaje ?? "Ciclo creado (BORRADOR).") : (r.error ?? "Error"));
    if (r.ok) { setNuevo(""); const a = await actionListarCiclosAdmin(); await refrescar(a.ok ? a.ciclos.find((c) => c.nombre.toUpperCase() === nuevo.trim().toUpperCase())?.id : undefined); }
  }
  async function activar() {
    if (!periodoId) return;
    const r = await actionSetActivoCiclo(periodoId, true);
    avisar(r.ok, r.ok ? (r.mensaje ?? "Ciclo activado.") : (r.error ?? "No se pudo activar."));
    if (r.ok) await refrescar();
  }
  // Misma Server Action que el Paso 7 (actionSetActivoCiclo → setActivoCiclo):
  // NO se duplica la lógica de activación, solo se añade una llamada al endpoint.
  async function activarDesdeLista(id: string) {
    const r = await actionSetActivoCiclo(id, true);
    avisar(r.ok, r.ok ? (r.mensaje ?? "Ciclo activado.") : (r.error ?? "No se pudo activar."));
    if (r.ok) await refrescar(id);
  }

  async function abrirEliminar(id: string, nombre: string) {
    setEliminando({ id, nombre, cargandoDiagnostico: true, diagnostico: null, error: null, confirmacion: "", trabajando: false });
    const d = await actionDiagnosticoEliminarCiclo(id);
    setEliminando((prev) =>
      prev && prev.id === id ? { ...prev, cargandoDiagnostico: false, diagnostico: d } : prev,
    );
  }
  function cerrarEliminar() {
    setEliminando(null);
  }
  async function confirmarEliminar() {
    if (!eliminando || eliminando.trabajando) return;
    setEliminando({ ...eliminando, trabajando: true, error: null });
    const r = await actionEliminarCiclo(eliminando.id, eliminando.confirmacion);
    if (r.ok) {
      avisar(true, r.mensaje ?? "Ciclo eliminado.");
      setEliminando(null);
      await refrescar();
    } else {
      setEliminando({ ...eliminando, trabajando: false, error: r.error });
    }
  }

  function renderEliminarOverlay() {
    if (!eliminando) return null;
    const d = eliminando.diagnostico;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true">
        <div className="w-full max-w-md rounded-2xl border border-white/60 bg-white p-4 text-slate-800 shadow-2xl">
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-rose-700">
            Eliminar ciclo completo
          </p>
          <p className="mt-1 text-sm font-extrabold text-slate-900">{eliminando.nombre}</p>
          {eliminando.cargandoDiagnostico ? (
            <p className="mt-2 text-xs font-semibold text-slate-600">Calculando conteos…</p>
          ) : !d ? (
            <p className="mt-2 text-xs font-semibold text-slate-600">
              {eliminando.error ?? "Sin diagnóstico."}
            </p>
          ) : !d.ok ? (
            <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{d.error}</p>
          ) : (
            <>
              <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-slate-50 p-2 text-[10px] font-semibold text-slate-700 sm:grid-cols-3">
                <span>Grupos: {d.conteos.grupos}</span>
                <span>Grupo-materias: {d.conteos.grupoMaterias}</span>
                <span className={d.conteos.inscripciones > 0 ? "text-red-700" : ""}>Inscripciones: {d.conteos.inscripciones}</span>
                <span>Horario: {d.conteos.horario}</span>
                <span>Parciales: {d.conteos.parciales}</span>
                <span>Calendario: {d.conteos.calendario}</span>
              </div>
              {(d.conteos.semestres > 0 || d.conteos.asignaciones > 0 || d.conteos.clasesImpartidas > 0 || d.conteos.asistenciaAlumnos > 0 || d.conteos.justificaciones > 0) && (
                <p className="mt-1 text-[10px] font-semibold text-slate-500">
                  También se borran: semestres {d.conteos.semestres} · asignaciones {d.conteos.asignaciones} · clases impartidas {d.conteos.clasesImpartidas} · asistencias {d.conteos.asistenciaAlumnos} · justificaciones {d.conteos.justificaciones}.
                </p>
              )}
              {d.bloqueos.length > 0 && (
                <ul className="mt-2 space-y-1 rounded-xl bg-red-50 p-2 text-[10px] font-bold text-red-800">
                  {d.bloqueos.map((b) => <li key={b}>· {b}</li>)}
                </ul>
              )}
              {d.bloqueos.length === 0 && (
                <>
                  <p className="mt-2 text-[10px] font-bold uppercase text-slate-600">Confirmación</p>
                  <input
                    className="mt-1 w-full rounded-xl border border-white/70 bg-white px-3 py-2 text-xs font-bold text-slate-800"
                    placeholder={`Escribe el nombre exacto: ${d.nombre}`}
                    value={eliminando.confirmacion}
                    onChange={(e) => setEliminando({ ...eliminando, confirmacion: e.target.value })}
                  />
                  <p className="mt-1 text-[10px] font-semibold text-slate-500">
                    Acción irreversible: borra el ciclo y todo lo relacionado en una sola transacción (RPC).
                  </p>
                </>
              )}
              {eliminando.error && (
                <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{eliminando.error}</p>
              )}
            </>
          )}
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" className="rounded-full border border-slate-300 bg-white px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-700" onClick={cerrarEliminar} disabled={eliminando.trabajando}>Cancelar</button>
            {d && d.ok && d.bloqueos.length === 0 && (
              <button
                type="button"
                disabled={eliminando.confirmacion.trim().toUpperCase() !== d.nombre || eliminando.trabajando}
                className="rounded-full bg-rose-600 px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-white disabled:opacity-50"
                onClick={() => void confirmarEliminar()}
              >
                {eliminando.trabajando ? "Eliminando…" : "Eliminar ciclo"}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="relative mt-6 rounded-[2rem] border-[3px] border-indigo-800/50 bg-indigo-100/35 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-extrabold uppercase text-indigo-900">Configuración del ciclo</h2>
        {sel && <span className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase ${sel.activo ? "bg-emerald-200 text-emerald-900" : "bg-amber-200 text-amber-900"}`}>{sel.nombre} · {sel.activo ? "OPERATIVO" : "BORRADOR"}</span>}
      </div>
      {msg && <p className={`mt-2 rounded-xl px-3 py-2 text-xs font-bold ${msg.t === "ok" ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-800"}`}>{msg.x}</p>}
      <div className="mt-3 flex flex-col gap-2">
        {ciclos.length === 0 ? (
          <p className="text-[10px] font-bold uppercase text-slate-500">Sin ciclos todavía. Crea el primero abajo.</p>
        ) : (
          <div className="flex max-h-44 flex-col gap-1 overflow-y-auto pr-1">
            {ciclos.map((c) => {
              const esSeleccionado = c.id === periodoId;
              return (
                <div key={c.id} className={`flex items-center justify-between gap-2 rounded-lg border px-2 py-1 text-[10px] font-extrabold uppercase transition ${esSeleccionado ? "border-sky-500 bg-sky-100 text-sky-950" : "border-white/70 bg-white/85 text-slate-700"}`}>
                  <button type="button" className="min-w-0 flex-1 truncate text-left" title={`Seleccionar ${c.nombre}`} onClick={() => void seleccionar(c.id)}>
                    {c.nombre}
                    <span className={`ml-2 inline-block rounded-full px-2 py-0.5 text-[8px] font-extrabold ${c.activo ? "bg-emerald-200 text-emerald-900" : "bg-slate-200 text-slate-600"}`}>{c.activo ? "OPERATIVO" : (c.estado ?? "BORRADOR")}</span>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" disabled={c.activo} title={c.activo ? "Ya es el ciclo operativo actual" : "Activar como OPERATIVO (misma validación del Paso 7)"} className="rounded-full bg-emerald-600 px-3 py-1 text-[9px] font-extrabold uppercase tracking-wide text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40" onClick={() => void activarDesdeLista(c.id)}>
                      {c.activo ? "Operativo" : "Activar"}
                    </button>
                    {!c.activo && (
                      <button type="button" title="Eliminar ciclo completo (doble confirmación)" className="rounded-full bg-rose-600 px-3 py-1 text-[9px] font-extrabold uppercase tracking-wide text-white transition hover:brightness-110" onClick={() => void abrirEliminar(c.id, c.nombre)}>
                        Eliminar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input className={`${input} flex-1`} placeholder="Nuevo" value={nuevo} onChange={(e) => setNuevo(e.target.value)} />
          <button type="button" className={btn} disabled={!nuevo.trim()} onClick={() => void crear()}>Crear (BORRADOR)</button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[11rem_1fr]">
        <nav className="flex flex-wrap gap-1 lg:flex-col">
          {PASOS.map((p) => (
            <button key={p.id} type="button" className={`rounded-lg px-2 py-1.5 text-left text-[10px] font-extrabold uppercase ${paso === p.id ? "bg-indigo-700 text-white" : "bg-white/70 text-indigo-800"}`} onClick={() => setPaso(p.id)}>{p.label}</button>
          ))}
        </nav>
        <div className="min-h-[24rem] rounded-2xl border border-white/60 bg-white/50 p-3">
          {!periodoId ? <p className="text-xs font-semibold text-slate-600">Selecciona o crea un ciclo.</p>
            : paso === "datos" ? <PasoDatos periodoId={periodoId} detalle={detalle} avisar={avisar} />
            : paso === "academico" ? <PasoAcademico periodoId={periodoId} detalle={detalle} avisar={avisar} onCambio={() => void refrescarDetalle()} />
            : paso === "alumnos" ? <PasoAlumnos periodoId={periodoId} avisar={avisar} />
            : paso === "evaluacion" ? <PasoEvaluacion periodoId={periodoId} avisar={avisar} />
            : paso === "calendario" ? <PasoCalendario periodoId={periodoId} nombreCiclo={sel?.nombre ?? ""} />
            : paso === "horario" ? <PasoHorario periodoId={periodoId} />
            : <PasoValidacion periodoId={periodoId} detalle={detalle} onActivar={() => void activar()} />}
        </div>
      </div>
      {renderEliminarOverlay()}
    </section>
  );
}
