"use client";
import { useEffect, useState } from "react";
import { actionCrearCicloEscolar, actionDetalleCicloAdmin, actionListarCiclosAdmin, actionSetActivoCiclo, type CicloAdminListado, type DetalleCicloAdmin } from "@/app/actions/evaluaciones";
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

  return (
    <section className="relative mt-6 rounded-[2rem] border-[3px] border-indigo-800/50 bg-indigo-100/35 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-extrabold uppercase text-indigo-900">Configuración del ciclo</h2>
        {sel && <span className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase ${sel.activo ? "bg-emerald-200 text-emerald-900" : "bg-amber-200 text-amber-900"}`}>{sel.nombre} · {sel.activo ? "OPERATIVO" : "BORRADOR"}</span>}
      </div>
      {msg && <p className={`mt-2 rounded-xl px-3 py-2 text-xs font-bold ${msg.t === "ok" ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-800"}`}>{msg.x}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select className={input} value={periodoId} onChange={(e) => void seleccionar(e.target.value)}>
          <option value="">Selecciona…</option>
          {ciclos.map((c) => <option key={c.id} value={c.id}>{c.nombre} — {c.activo ? "OPERATIVO" : c.estado}</option>)}
        </select>
        <input className={`${input} flex-1`} placeholder="Nuevo" value={nuevo} onChange={(e) => setNuevo(e.target.value)} />
        <button type="button" className={btn} disabled={!nuevo.trim()} onClick={() => void crear()}>Crear (BORRADOR)</button>
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
            : paso === "academico" ? <PasoAcademico periodoId={periodoId} detalle={detalle} avisar={avisar} />
            : paso === "alumnos" ? <PasoAlumnos periodoId={periodoId} avisar={avisar} />
            : paso === "evaluacion" ? <PasoEvaluacion periodoId={periodoId} avisar={avisar} />
            : paso === "calendario" ? <PasoCalendario periodoId={periodoId} nombreCiclo={sel?.nombre ?? ""} />
            : paso === "horario" ? <PasoHorario periodoId={periodoId} />
            : <PasoValidacion periodoId={periodoId} detalle={detalle} onActivar={() => void activar()} />}
        </div>
      </div>
    </section>
  );
}
