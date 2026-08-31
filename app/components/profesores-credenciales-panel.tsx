"use client";

import { useCallback, useEffect, useState } from "react";
import {
  actionCambiarDebeCambiarCredencialesProfesor,
  actionListarProfesoresCredenciales,
  type ProfesorCredencial,
} from "@/app/actions/profesores";

/**
 * BLOQUE 9 (PIEZA 5) — Panel del directivo para FORZAR el cambio de clave de
 * un profesor/directivo puntual (activa/desactiva `debe_cambiar_credenciales`).
 * La identidad es SIEMPRE PROFESORES.ID (validada en la Server Action).
 */
export function ProfesoresCredencialesPanel() {
  const [profesores, setProfesores] = useState<ProfesorCredencial[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardandoId, setGuardandoId] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const r = await actionListarProfesoresCredenciales();
    setCargando(false);
    if (r.ok) setProfesores(r.profesores);
    else setError(r.error);
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  async function toggle(p: ProfesorCredencial) {
    setGuardandoId(p.id);
    setMensaje(null);
    setError(null);
    const r = await actionCambiarDebeCambiarCredencialesProfesor(
      p.id,
      !p.debeCambiarCredenciales,
    );
    setGuardandoId(null);
    if (r.ok) {
      setMensaje(
        `Obligación ${
          !p.debeCambiarCredenciales ? "activada" : "quitada"
        } para ${p.nombre}.`,
      );
      await recargar();
    } else {
      setError(r.error);
    }
  }

  return (
    <section
      className="relative mt-6 overflow-hidden rounded-[2rem] border-[3px] border-sky-800/50 bg-sky-100/35 p-3 shadow-[0_12px_40px_rgba(56,189,248,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl backdrop-saturate-150 sm:p-4"
      aria-label="Forzar cambio de clave de profesores"
    >
      <div className="relative z-[1] flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2 px-1 pb-1">
          <span className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] sm:text-[11px]">
            Forzar cambio de clave (profesores)
          </span>
          {mensaje && (
            <span className="rounded-full border border-emerald-300/60 bg-emerald-50 px-3 py-1 text-[10px] font-extrabold text-emerald-800">
              {mensaje}
            </span>
          )}
        </div>

        <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
          {cargando ? (
            <p className="text-center text-sm font-semibold text-slate-600">
              Cargando profesores…
            </p>
          ) : error ? (
            <p
              className="text-center text-xs font-semibold text-red-700"
              role="alert"
            >
              {error}
            </p>
          ) : profesores.length === 0 ? (
            <p className="text-center text-xs font-semibold text-slate-600">
              Sin profesores.
            </p>
          ) : (
            <ul className="flex max-h-72 flex-col gap-1.5 overflow-auto">
              {profesores.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/60 bg-white/80 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-bold uppercase tracking-wide text-sky-900">
                      {p.nombre}
                    </p>
                    <p className="text-[10px] font-semibold normal-case text-slate-500">
                      ID {p.id} · {p.permisos}
                      {p.debeCambiarCredenciales
                        ? " · debe cambiar clave"
                        : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={guardandoId === p.id}
                    onClick={() => void toggle(p)}
                    className={`rounded-full border border-white/70 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 ${
                      p.debeCambiarCredenciales
                        ? "bg-linear-to-b from-emerald-400 via-emerald-500 to-emerald-600"
                        : "bg-linear-to-b from-slate-400 via-slate-500 to-slate-600"
                    }`}
                  >
                    {guardandoId === p.id
                      ? "Guardando…"
                      : p.debeCambiarCredenciales
                        ? "Quitar obligación"
                        : "Forzar cambio"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="px-1 text-[10px] font-semibold text-slate-600">
          «Forzar cambio» hace que el profesor deba definir una nueva clave en
          su próximo inicio de sesión antes de usar el portal.
        </p>
      </div>
    </section>
  );
}
