"use client";

import { useEffect, useState } from "react";
import {
  actionBuscarAlumnosInscripcion,
  actionInscribirAlumnoEnCiclo,
  actionListarGruposPeriodo,
} from "@/app/actions/inscripciones-admin";

const input = "rounded-xl border border-white/70 bg-white/90 px-3 py-2 text-xs font-semibold text-slate-800";
const btn = "rounded-full bg-linear-to-b from-emerald-500 via-emerald-600 to-emerald-700 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-white";

type Grupo = { id: string; grado: string; grupo: string; carreraClave: string };

export function PasoAlumnos({ periodoId, avisar }: {
  periodoId: string;
  avisar: (ok: boolean, x: string) => void;
}) {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [res, setRes] = useState<Array<{ curp: string; nombre: string }>>([]);
  const [curp, setCurp] = useState("");
  const [grupoId, setGrupoId] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    void actionListarGruposPeriodo(periodoId).then((r) => { if (r.ok) setGrupos(r.grupos); });
  }, [periodoId]);

  async function buscar() {
    const r = await actionBuscarAlumnosInscripcion(busqueda);
    if (!r.ok) { setErr(r.error); setRes([]); return; }
    setErr("");
    setRes(r.alumnos);
    if (r.alumnos.length === 1) setCurp(r.alumnos[0]!.curp);
  }

  async function inscribir() {
    if (!curp || !grupoId) { setErr("Selecciona alumno y grupo."); return; }
    const r = await actionInscribirAlumnoEnCiclo({ curp, grupoId, periodoId });
    avisar(r.ok, r.ok ? (r.mensaje ?? "Inscripción registrada.") : (r.error ?? "Error"));
    if (r.ok) { setRes([]); setCurp(""); setErr(""); }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[10px] font-extrabold uppercase tracking-wide text-indigo-900">
        Paso 3 · Alumnos e inscripciones del periodo
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${input} min-w-[12rem] flex-1`} placeholder="Buscar CURP o nombre (padrón global ALUMNOS)" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <button type="button" className={btn} onClick={() => void buscar()}>Buscar</button>
      </div>
      {res.length > 0 && (
        <div className="flex max-h-32 flex-col gap-1 overflow-y-auto rounded-xl bg-white/80 p-1">
          {res.map((a) => (
            <button key={a.curp} type="button"
              className={`rounded-lg px-2 py-1 text-left text-[10px] font-semibold ${curp === a.curp ? "bg-sky-200 text-sky-900" : "bg-white text-slate-700 hover:bg-sky-100"}`}
              onClick={() => setCurp(a.curp)}>
              {a.curp} — {a.nombre}
            </button>
          ))}
        </div>
      )}
      {curp && <p className="text-[10px] font-bold text-slate-700">CURP: {curp}</p>}
      <select className={input} value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
        <option value="">Grupo destino…</option>
        {grupos.map((g) => <option key={g.id} value={g.id}>{g.grado} {g.grupo}{g.carreraClave ? ` · ${g.carreraClave}` : " · sin carrera"}</option>)}
      </select>
      <button type="button" className={btn} disabled={!curp || !grupoId} onClick={() => void inscribir()}>
        Registrar inscripción en este periodo
      </button>
      {err && <p className="text-[10px] font-bold text-red-700">{err}</p>}
      <p className="text-[10px] font-semibold text-slate-600">
        BORRADOR → inscripción preparada (activo=false). OPERATIVO → activa. La importación masiva por Excel usa la carga académica con preview.
      </p>
    </div>
  );
}
