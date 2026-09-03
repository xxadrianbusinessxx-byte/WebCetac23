"use client";

import { useEffect, useState } from "react";
import {
  actionGuardarEvaluacion,
  actionListarCiclosConEvaluaciones,
} from "@/app/actions/evaluaciones";

const btn = "rounded-full bg-linear-to-b from-sky-500 via-sky-600 to-sky-700 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-white";

type Ev = { id?: string; numero: string; nombre: string; inicio: string; fin: string };

export function PasoEvaluacion({ periodoId, avisar }: {
  periodoId: string;
  avisar: (ok: boolean, x: string) => void;
}) {
  const [evs, setEvs] = useState<Ev[]>([]);

  async function cargar() {
    const r = await actionListarCiclosConEvaluaciones();
    if (!r.ok) return;
    const ciclo = r.ciclos.find((c) => c.periodo.id === periodoId);
    setEvs((ciclo?.evaluaciones ?? []).map((e) => ({
      id: e.id,
      numero: String(e.numero),
      nombre: e.nombre,
      inicio: e.fecha_inicio,
      fin: e.fecha_fin,
    })));
  }

  useEffect(() => {
    let activo = true;
    void actionListarCiclosConEvaluaciones().then((r) => {
      if (!activo || !r.ok) return;
      const ciclo = r.ciclos.find((c) => c.periodo.id === periodoId);
      setEvs((ciclo?.evaluaciones ?? []).map((e) => ({
        id: e.id,
        numero: String(e.numero),
        nombre: e.nombre,
        inicio: e.fecha_inicio,
        fin: e.fecha_fin,
      })));
    });
    return () => { activo = false; };
  }, [periodoId]);

  async function agregar() {
    const sig = evs.length + 1;
    const r = await actionGuardarEvaluacion({ periodoId, numero: sig, nombre: `Parcial ${sig}`, fechaInicio: "", fechaFin: "" });
    avisar(r.ok, r.ok ? (r.mensaje ?? "Parcial guardado.") : (r.error ?? "Error"));
    if (r.ok) await cargar();
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[10px] font-extrabold uppercase tracking-wide text-indigo-900">
        Paso 4 · Evaluación (parciales del periodo)
      </p>
      {evs.length === 0 ? (
        <p className="text-[11px] font-semibold text-slate-600">Sin parciales configurados.</p>
      ) : (
        <table className="w-full text-left text-[11px]">
          <thead>
            <tr className="text-[10px] uppercase text-slate-500">
              <th className="py-1 pr-2">#</th><th className="py-1 pr-2">Nombre</th><th className="py-1 pr-2">Inicio</th><th className="py-1 pr-2">Fin</th>
            </tr>
          </thead>
          <tbody>
            {evs.map((e) => (
              <tr key={e.id ?? e.nombre} className="border-t border-white/60 text-slate-700">
                <td className="py-1 pr-2">{e.numero}</td><td className="py-1 pr-2">{e.nombre}</td><td className="py-1 pr-2">{e.inicio}</td><td className="py-1 pr-2">{e.fin}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div>
        <button type="button" className={btn} onClick={() => void agregar()}>Agregar parcial</button>
      </div>
    </div>
  );
}
