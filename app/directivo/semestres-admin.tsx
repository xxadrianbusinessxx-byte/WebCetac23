"use client";

// DESACTIVADO de la UI de /configuracion (ver Bloque 17 de contexto.feliz) — se conserva el código por si se reactiva para otra instalación.
/**
 * C4.16 — Panel del directivo para administrar la oferta por semestre.
 *
 * - La autorización real (rol directivo) la validan las Server Actions.
 * - "sin fila en academico_semestres = semestre ACTIVO por default": la UI lo
 *   muestra como estado default y NO crea filas automáticamente.
 * - Activar/desactivar = UPSERT administrativo (nunca DELETE; se conserva
 *   historial). Desactivar solo controla la visualización/operación del
 *   semestre; no borra materias, grupo_materias, grupos ni inscripciones.
 * - La relación grado → semestre es fija (1RO→1 … 6TO→6); no hay una segunda
 *   fuente de verdad.
 */
import { useEffect, useState } from "react";
import {
  actionActivarSemestre,
  actionDesactivarSemestre,
  actionListarSemestresOferta,
} from "@/app/actions/semestres";
import type { SemestreOfertaListado } from "@/lib/escolar/semestres";

const ORDINALES = ["", "1°", "2°", "3°", "4°", "5°", "6°"];

export function SemestresOfertaAdmin() {
  const [periodos, setPeriodos] = useState<SemestreOfertaListado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState<{
    tipo: "ok" | "err";
    texto: string;
  } | null>(null);

  const recargar = async () => {
    setCargando(true);
    const r = await actionListarSemestresOferta();
    if ("ok" in r && r.ok) {
      setPeriodos(r.periodos);
    } else if ("error" in r) {
      setMensaje({ tipo: "err", texto: r.error });
    }
    setCargando(false);
  };

  useEffect(() => {
    void recargar();
  }, []);

  const cambiar = async (item: SemestreOfertaListado, activo: boolean) => {
    const r = activo
      ? await actionActivarSemestre(item.periodoId, item.semestre)
      : await actionDesactivarSemestre(item.periodoId, item.semestre);
    setMensaje(
      r.ok
        ? { tipo: "ok", texto: r.mensaje }
        : { tipo: "err", texto: r.error },
    );
    await recargar();
  };

  return (
    <div className="mt-6 w-full rounded-[1.5rem] border border-white/45 bg-slate-500/20 p-5 shadow-[inset_0_3px_12px_rgba(0,0,0,0.06)] backdrop-blur-sm">
      <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-800">
        Oferta por semestre (C4.14/16)
      </h2>
      <p className="mt-1 text-xs font-semibold text-slate-600">
        Desactivar un semestre oculta su oferta al alumno pero NO borra
        materias, grupos ni inscripciones. «Sin configurar» = ACTIVO por
        default (no se crean filas automáticamente).
      </p>

      {mensaje && (
        <p
          className={`mt-3 rounded-xl px-3 py-2 text-xs font-bold ${
            mensaje.tipo === "ok"
              ? "bg-emerald-500/15 text-emerald-800"
              : "bg-rose-500/15 text-rose-800"
          }`}
        >
          {mensaje.texto}
        </p>
      )}

      {cargando ? (
        <p className="mt-4 text-xs font-semibold text-slate-600">
          Cargando…
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead>
              <tr className="border-b border-white/60 text-[10px] uppercase tracking-wide text-slate-500">
                <th className="py-1 pr-3 font-extrabold">Periodo</th>
                <th className="py-1 pr-3 font-extrabold">Semestre</th>
                <th className="py-1 pr-3 font-extrabold">Grado</th>
                <th className="py-1 pr-3 font-extrabold">Estado</th>
                <th className="py-1 font-extrabold">Acción</th>
              </tr>
            </thead>
            <tbody>
              {periodos.map((p) => (
                <tr
                  key={`${p.periodoId}-${p.semestre}`}
                  className="border-b border-white/40"
                >
                  <td className="py-2 pr-3 font-bold text-slate-800">
                    {p.periodoNombre}
                  </td>
                  <td className="py-2 pr-3 font-bold text-slate-800">
                    {ORDINALES[p.semestre] ?? p.semestre}
                  </td>
                  <td className="py-2 pr-3 font-semibold text-slate-700">
                    {p.grado}
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                        p.activo
                          ? "bg-emerald-500/20 text-emerald-800"
                          : "bg-rose-500/20 text-rose-800"
                      }`}
                    >
                      {p.activo
                        ? p.configurado
                          ? "ACTIVO"
                          : "ACTIVO (default)"
                        : "INACTIVO"}
                    </span>
                  </td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => void cambiar(p, !p.activo)}
                      className={`rounded-full border border-white/70 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] transition hover:brightness-105 ${
                        p.activo
                          ? "bg-linear-to-b from-rose-400 via-rose-500 to-rose-600"
                          : "bg-linear-to-b from-emerald-400 via-emerald-500 to-emerald-600"
                      }`}
                    >
                      {p.activo ? "Desactivar" : "Activar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {periodos.length === 0 && (
            <p className="mt-2 text-xs font-semibold text-slate-600">
              No hay periodos activos configurados.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
