"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  actionCambiarCredencialesTutor,
  actionObtenerDatosTutor,
} from "@/app/actions/tutores";
import { actionObtenerContextoAlumnoParaTutor } from "@/app/actions/asistencias";
import { CalendarioAsistenciaAlumno } from "@/app/components/calendario-asistencia-alumno";
import type { PortalSessionPayload } from "@/lib/auth/types";

import { FrutigerBackdrop } from "../components/frutiger-backdrop";
import { GlossyNavPill } from "../components/glossy-nav-pill";
import { GlossyPersonIcon } from "../components/glossy-person-icon";
import { nombreCompletoTutor, type TutorRow } from "@/lib/escolar/tutores-types";


function PanelTab({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] sm:text-[11px] ${className}`}
    >
      {children}
    </span>
  );
}

function GreyActionPill({
  children,
  className = "",
  onClick,
  type = "button",
  disabled,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35),0_3px_10px_rgba(2,6,23,0.12)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {children}
    </button>
  );
}

type Props = {
  sesion: PortalSessionPayload | null;
};

export function TutorClient({ sesion }: Props) {
  const nombre = sesion?.nombre ?? sesion?.matricula ?? "Tutor";
  const [tutor, setTutor] = useState<TutorRow | null>(null);
  const [curps, setCurps] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  // Alumno seleccionado para ver su asistencia.
  const [curpSeleccionada, setCurpSeleccionada] = useState("");
  const [contextoAlumno, setContextoAlumno] = useState<{
    curp: string;
    nombre: string;
    grado: string;
    grupo: string;
    carrera: string;
  } | null>(null);
  const [cargandoContexto, setCargandoContexto] = useState(false);


  // Formulario de cambio de credenciales.
  const [usuario, setUsuario] = useState("");
  const [contraseña, setContraseña] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    const datos = await actionObtenerDatosTutor();
    setCargando(false);
    if (!datos) {
      setError("No se pudieron cargar tus datos de tutor.");
      return;
    }
    setTutor(datos.tutor);
    setCurps(datos.curps);
    setUsuario(datos.tutor.usuario ?? "");
  }, []);

  useEffect(() => {
    void cargarDatos();
  }, [cargarDatos]);

  // Al seleccionar un alumno, cargar su contexto (grado/grupo/carrera/nombre).
  useEffect(() => {
    if (!curpSeleccionada) {
      setContextoAlumno(null);
      return;
    }
    let activo = true;
    setCargandoContexto(true);
    setContextoAlumno(null);
    void actionObtenerContextoAlumnoParaTutor({ curp: curpSeleccionada }).then(
      (res) => {
        if (!activo) return;
        setCargandoContexto(false);
        if (res.ok) setContextoAlumno(res.alumno);
        else setError(res.error);
      },
    );
    return () => {
      activo = false;
    };
  }, [curpSeleccionada]);

  const debeCambiar = tutor?.debe_cambiar_credenciales ?? false;


  async function onGuardarCredenciales() {
    setError(null);
    setMensaje(null);
    if (!usuario.trim()) {
      setError("El usuario no puede estar vacío.");
      return;
    }
    if (contraseña.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (contraseña !== confirmar) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setGuardando(true);
    const res = await actionCambiarCredencialesTutor({
      usuario: usuario.trim(),
      contraseña,
    });
    setGuardando(false);
    if (res.ok) {
      setMensaje("Credenciales actualizadas correctamente.");
      setContraseña("");
      setConfirmar("");
      await cargarDatos();
    } else {
      setError(res.error);
    }
  }

  return (
    <FrutigerBackdrop>
      <div className="relative z-10 mx-auto flex min-h-dvh max-w-5xl flex-col px-4 pb-24 pt-6 sm:px-6 lg:max-w-6xl lg:px-8 lg:pt-8">
        <div className="mb-6 flex h-14 items-center justify-center gap-3 rounded-full border-[3px] border-sky-800/55 bg-sky-200/45 px-3 py-2 shadow-[0_8px_28px_rgba(56,189,248,0.18),inset_0_1px_0_rgba(255,255,255,0.85)] backdrop-blur-xl backdrop-saturate-150 sm:mb-8 sm:h-16 sm:justify-between sm:px-6">
          <GlossyNavPill href="/perfil">Perfil</GlossyNavPill>
          <GlossyNavPill href="/tutor" active>
            Tutor / Padre
          </GlossyNavPill>
        </div>

        <div className="mb-6 flex flex-col items-stretch gap-4 sm:mb-8 sm:flex-row sm:items-center">
          <div className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-[1.75rem] border-[3px] border-sky-900/70 bg-white/75 p-2 shadow-[0_10px_28px_rgba(14,165,233,0.2),inset_0_2px_0_rgba(255,255,255,0.95)] backdrop-blur-md sm:h-32 sm:w-32">
            <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-linear-to-b from-sky-100/90 to-sky-300/50">
              <GlossyPersonIcon
                uid="tutor-main"
                genero="femenino"
                className="h-[82%] w-[82%] drop-shadow-[0_6px_12px_rgba(2,132,199,0.4)]"
              />
              <div
                className="pointer-events-none absolute inset-x-2 top-1 h-[40%] rounded-b-[100%] bg-linear-to-b from-white/60 to-transparent"
                aria-hidden
              />
            </div>
          </div>

          <div className="flex min-h-[4.5rem] min-w-0 flex-1 items-stretch overflow-hidden rounded-full border-[3px] border-sky-900/70 bg-linear-to-r from-sky-900 via-sky-900 to-sky-900/90 shadow-[0_8px_24px_rgba(2,6,23,0.12)] backdrop-blur-sm sm:min-h-[5.5rem]">
            <div className="w-10 shrink-0 bg-sky-950 sm:w-12" aria-hidden />
            <div className="relative flex flex-1 items-center justify-center bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4">
              <span className="text-lg font-extrabold tracking-wide text-white drop-shadow-sm sm:text-xl">
                {nombre}
              </span>
              <div
                className="pointer-events-none absolute inset-x-6 top-1 h-[38%] rounded-b-[100%] bg-linear-to-b from-white/35 to-transparent"
                aria-hidden
              />
            </div>
          </div>
        </div>

        {cargando ? (
          <p className="text-center text-sm font-semibold text-slate-600">
            Cargando…
          </p>
        ) : (
          <div className="relative flex flex-1 flex-col gap-6 overflow-hidden rounded-[2rem] border-[3px] border-sky-800/50 bg-sky-100/35 p-3 shadow-[0_12px_40px_rgba(56,189,248,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl backdrop-saturate-150 sm:p-4">
            <PanelTab className="mx-auto w-fit">Portal del tutor</PanelTab>

            <div className="relative z-[1] flex flex-col gap-4">
              {mensaje && (
                <p
                  className="text-center text-xs font-semibold text-sky-900"
                  role="status"
                >
                  {mensaje}
                </p>
              )}
              {error && (
                <p
                  className="text-center text-xs font-semibold text-red-700"
                  role="alert"
                >
                  {error}
                </p>
              )}

              {/* Cambio forzado de credenciales */}
              {debeCambiar && (
                <div className="rounded-3xl border border-amber-400/60 bg-amber-100/70 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.6)] backdrop-blur-md sm:p-6">
                  <p className="mb-2 text-center text-xs font-extrabold uppercase tracking-wide text-amber-800">
                    Cambia tus credenciales para continuar
                  </p>
                  <p className="mb-4 text-center text-xs font-semibold text-amber-900">
                    Por seguridad, debes definir un usuario y una contraseña
                    propios antes de usar el portal.
                  </p>
                  <div className="flex flex-col gap-3">
                    <input
                      type="text"
                      value={usuario}
                      onChange={(e) => setUsuario(e.target.value)}
                      placeholder="Nuevo usuario"
                      className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white placeholder:text-white/75 shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] outline-none focus:ring-2 focus:ring-sky-400/60"
                    />
                    <input
                      type="password"
                      value={contraseña}
                      onChange={(e) => setContraseña(e.target.value)}
                      placeholder="Nueva contraseña (mínimo 6 caracteres)"
                      className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white placeholder:text-white/75 shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] outline-none focus:ring-2 focus:ring-sky-400/60"
                    />
                    <input
                      type="password"
                      value={confirmar}
                      onChange={(e) => setConfirmar(e.target.value)}
                      placeholder="Confirmar contraseña"
                      className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white placeholder:text-white/75 shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] outline-none focus:ring-2 focus:ring-sky-400/60"
                    />
                    <div className="flex justify-center">
                      <GreyActionPill
                        onClick={onGuardarCredenciales}
                        disabled={guardando}
                      >
                        {guardando ? "Guardando…" : "Guardar credenciales"}
                      </GreyActionPill>
                    </div>
                  </div>
                </div>
              )}

              {/* Datos del tutor */}
              {tutor && (
                <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md sm:p-6">
                  <p className="mb-3 text-center text-xs font-extrabold uppercase tracking-wide text-sky-900">
                    Mis datos
                  </p>
                  <ul className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
                    <li>
                      👤 Nombre: {nombreCompletoTutor(tutor) || "—"}
                    </li>
                    <li>🔑 Clave de tutor: {tutor.clave_tutor}</li>
                    <li>👤 Usuario: {tutor.usuario || "—"}</li>
                    {tutor.telefono && <li>📞 Teléfono: {tutor.telefono}</li>}
                    {tutor.correo && <li>✉️ Correo: {tutor.correo}</li>}
                  </ul>
                </div>
              )}

              {/* Alumnos a cargo */}
              <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md sm:p-6">
                <p className="mb-3 text-center text-xs font-extrabold uppercase tracking-wide text-sky-900">
                  Alumnos a mi cargo ({curps.length})
                </p>
                {curps.length === 0 ? (
                  <p className="text-center text-xs font-semibold text-slate-600">
                    Aún no tienes alumnos vinculados.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {curps.map((curp) => (
                      <li key={curp}>
                        <button
                          type="button"
                          onClick={() => setCurpSeleccionada(curp)}
                          className={`w-full rounded-xl px-3 py-2 text-left text-xs font-semibold transition ${
                            curpSeleccionada === curp
                              ? "border border-sky-500/60 bg-sky-100/90 text-sky-900 shadow-sm"
                              : "bg-white/70 text-slate-700 hover:bg-white/90"
                          }`}
                        >
                          {curp}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Asistencia del alumno seleccionado */}
              {curpSeleccionada && (
                <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md sm:p-6">
                  {cargandoContexto ? (
                    <p className="text-center text-sm font-semibold text-slate-600">
                      Cargando alumno…
                    </p>
                  ) : contextoAlumno ? (
                    <CalendarioAsistenciaAlumno
                      curp={contextoAlumno.curp}
                      grado={contextoAlumno.grado}
                      grupo={contextoAlumno.grupo}
                      carrera={contextoAlumno.carrera || undefined}
                      nombreAlumno={contextoAlumno.nombre}
                      permitirJustificacion
                    />
                  ) : (
                    <p className="text-center text-xs font-semibold text-slate-600">
                      No se pudo cargar el alumno.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </FrutigerBackdrop>
  );
}


