"use client";

import { useEffect, useState } from "react";
import {
  actionGuardarEvaluacion,
  actionListarCiclosConEvaluaciones,
  actionSetActivoEvaluacion,
} from "@/app/actions/evaluaciones";

const input = "rounded-lg border border-white/70 bg-white/90 px-2 py-1 text-xs font-semibold text-slate-700";
const btn = "rounded-full bg-sky-600 px-3 py-1.5 text-[10px] font-extrabold uppercase text-white disabled:opacity-50";

type Ev = { id?: string; numero: number; nombre: string; inicio: string; fin: string; activo: boolean };

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
      numero: Number(e.numero),
      nombre: e.nombre,
      inicio: e.fecha_inicio,
      fin: e.fecha_fin,
      activo: e.activo !== false,
    })));
  }

  useEffect(() => {
    let activo = true;
    void actionListarCiclosConEvaluaciones().then((r) => {
      if (!activo || !r.ok) return;
      const ciclo = r.ciclos.find((c) => c.periodo.id === periodoId);
      setEvs((ciclo?.evaluaciones ?? []).map((e) => ({
        id: e.id,
        numero: Number(e.numero),
        nombre: e.nombre,
        inicio: e.fecha_inicio,
        fin: e.fecha_fin,
        activo: e.activo !== false,
      })));
    });
    return () => { activo = false; };
  }, [periodoId]);

  function cambiar(id: string | undefined, campo: keyof Ev, valor: string | boolean) {
    setEvs((prev) => prev.map((e) => (e.id === id ? { ...e, [campo]: valor } : e)));
  }

  async function agregar() {
    const sig = evs.length + 1;
    const r = await actionGuardarEvaluacion({ periodoId, numero: sig, nombre: `Parcial ${sig}`, fechaInicio: "", fechaFin: "" });
    avisar(r.ok, r.ok ? (r.mensaje ?? "Parcial creado.") : (r.error ?? "Error"));
    if (r.ok) await cargar();
  }

  async function guardarFila(e: Ev) {
    if (!e.id || !e.nombre.trim()) return;
    const r = await actionGuardarEvaluacion({
      id: e.id,
      periodoId,
      numero: e.numero,
      nombre: e.nombre.trim(),
      fechaInicio: e.inicio || "",
      fechaFin: e.fin || "",
    });
    avisar(r.ok, r.ok ? (r.mensaje ?? "Parcial actualizado.") : (r.error ?? "Error"));
    if (r.ok) await cargar();
  }

  async function desactivar(e: Ev) {
    if (!e.id) return;
    const r = await actionSetActivoEvaluacion(periodoId, e.id, false);
    avisar(r.ok, r.ok ? (r.mensaje ?? "Parcial desactivado.") : (r.error ?? "Error"));
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
              <th className="py-1 pr-2">#</th><th className="py-1 pr-2">Nombre</th>
              <th className="py-1 pr-2">Inicio</th><th className="py-1 pr-2">Fin</th>
              <th className="py-1 pr-2">Estado</th><th className="py-1 pr-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {evs.map((e) => (
              <tr key={e.id ?? e.nombre} className="border-t border-white/60 text-slate-700">
                <td className="py-1 pr-2">{e.numero}</td>
                <td className="py-1 pr-2">
                  <input className={input} value={e.nombre} disabled={!e.id || !e.activo}
                    onChange={(ev) => cambiar(e.id, "nombre", ev.target.value)} />
                </td>
                <td className="py-1 pr-2">
                  <input type="date" className={input} value={e.inicio} disabled={!e.id || !e.activo}
                    onChange={(ev) => cambiar(e.id, "inicio", ev.target.value)} />
                </td>
                <td className="py-1 pr-2">
                  <input type="date" className={input} value={e.fin} disabled={!e.id || !e.activo}
                    onChange={(ev) => cambiar(e.id, "fin", ev.target.value)} />
                </td>
                <td className="py-1 pr-2">{e.activo ? "activo" : "inactivo"}</td>
                <td className="flex gap-1 py-1 pr-2">
                  <button type="button" className={btn} disabled={!e.id || !e.activo}
                    onClick={() => void guardarFila(e)}>Guardar</button>
                  {e.id && e.activo && (
                    <button type="button" className={`${btn} !bg-slate-500`}
                      onClick={() => void desactivar(e)}>Desactivar</button>
                  )}
                </td>
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

