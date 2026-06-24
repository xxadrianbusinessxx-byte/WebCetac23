"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  actionEnviarComentarioAlumno,
  actionSubirMateriaExcel,
} from "@/app/actions/escolar";
import { fetchAppJson } from "@/lib/client/fetch-app";
import { MateriaScrollPicker } from "@/app/components/materia-scroll-picker";
import { MateriaTablaVistaPanel } from "@/app/components/materia-tabla-vista";
import { COMENTARIO_MAX_LENGTH } from "@/lib/escolar/tables";
import type { MateriaTablaVista } from "@/lib/escolar/types";
import type { PortalSessionPayload } from "@/lib/auth/types";
import { FrutigerBackdrop } from "../components/frutiger-backdrop";
import { GlossyNavPill } from "../components/glossy-nav-pill";
import { GlossyPersonIcon } from "../components/glossy-person-icon";

function GreyActionPill({
  children,
  className = "",
  onClick,
  type = "button",
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={`rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35),0_3px_10px_rgba(2,6,23,0.12)] transition hover:brightness-105 ${className}`}
    >
      {children}
    </button>
  );
}

type Props = {
  sesion: PortalSessionPayload | null;
  materias: readonly string[];
};

export function ProfesorClient({ sesion, materias }: Props) {
  const [materiaSeleccionada, setMateriaSeleccionada] = useState<string>(
    materias[0] ?? "",
  );
  const [vistaMateria, setVistaMateria] = useState<MateriaTablaVista | null>(
    null,
  );
  const [cargandoVista, setCargandoVista] = useState(false);
  const [archivoSeleccionado, setArchivoSeleccionado] = useState<File | null>(
    null,
  );
  const [subiendo, setSubiendo] = useState(false);
  const [mensajeArchivo, setMensajeArchivo] = useState<string | null>(null);
  const [alumnoNombre, setAlumnoNombre] = useState("");
  const [comentario, setComentario] = useState("");
  const [enviandoComentario, setEnviandoComentario] = useState(false);
  const [mensajeComentario, setMensajeComentario] = useState<string | null>(
    null,
  );
  const inputArchivoRef = useRef<HTMLInputElement>(null);
  const vistaSeqRef = useRef(0);

  const nombreProfesor = sesion?.nombre ?? sesion?.matricula ?? "Profesor";

  const refrescarVista = useCallback(async (nombre: string) => {
    if (!nombre.trim()) return;
    const seq = ++vistaSeqRef.current;
    setCargandoVista(true);
    try {
      const params = new URLSearchParams({ nombre });
      const vista = await fetchAppJson<MateriaTablaVista | null>(
        `/api/vista-materia?${params}`,
      );
      if (vistaSeqRef.current !== seq) return;
      setVistaMateria(vista);
    } catch (e) {
      if (vistaSeqRef.current !== seq) return;
      setVistaMateria(null);
      setMensajeArchivo(
        e instanceof Error ? e.message : "No se pudo cargar la vista.",
      );
    } finally {
      if (vistaSeqRef.current === seq) setCargandoVista(false);
    }
  }, []);

  useEffect(() => {
    if (materiaSeleccionada) void refrescarVista(materiaSeleccionada);
    return () => {
      vistaSeqRef.current += 1;
    };
  }, [materiaSeleccionada, refrescarVista]);

  function abrirSelectorArchivo() {
    inputArchivoRef.current?.click();
  }

  function onArchivoElegido(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setArchivoSeleccionado(file);
    setMensajeArchivo(
      file ? `Archivo listo: ${file.name}` : null,
    );
    event.target.value = "";
  }

  async function onSubirExcel() {
    if (!archivoSeleccionado) {
      abrirSelectorArchivo();
      return;
    }

    setSubiendo(true);
    setMensajeArchivo(null);

    const formData = new FormData();
    formData.set("archivo", archivoSeleccionado);

    const resultado = await actionSubirMateriaExcel(
      materiaSeleccionada,
      formData,
    );
    setSubiendo(false);

    if (resultado.ok) {
      setMensajeArchivo(
        `Contenido de ${materiaSeleccionada} reemplazado (${resultado.filas} filas).`,
      );
      setArchivoSeleccionado(null);
      void refrescarVista(materiaSeleccionada);
    } else {
      setMensajeArchivo(resultado.error);
    }
  }

  async function onEnviarComentario() {
    if (!alumnoNombre.trim() || !comentario.trim()) return;
    setEnviandoComentario(true);
    setMensajeComentario(null);
    const resultado = await actionEnviarComentarioAlumno(
      alumnoNombre,
      comentario,
      nombreProfesor,
    );
    setEnviandoComentario(false);
    if (resultado.ok) {
      setComentario("");
      setMensajeComentario("Comentario guardado en COMENTARIOS.");
    } else {
      setMensajeComentario(resultado.error);
    }
  }

  return (
    <FrutigerBackdrop>
      <div className="relative z-10 mx-auto flex min-h-dvh max-w-5xl flex-col px-4 pb-24 pt-6 sm:px-6 lg:max-w-6xl lg:px-8 lg:pt-8">
        <div className="mb-6 flex h-14 items-center justify-center gap-3 rounded-full border-[3px] border-sky-800/55 bg-sky-200/45 px-3 py-2 shadow-[0_8px_28px_rgba(56,189,248,0.18),inset_0_1px_0_rgba(255,255,255,0.85)] backdrop-blur-xl backdrop-saturate-150 sm:mb-8 sm:h-16 sm:justify-between sm:px-6">
          <GlossyNavPill href="/profesor" active>
            Profesor
          </GlossyNavPill>
          <GlossyNavPill href="/chat?origen=profesor">Chat</GlossyNavPill>
        </div>

        <div className="mb-6 flex flex-col items-stretch gap-4 sm:mb-8 sm:flex-row sm:items-center">
          <div className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-[1.75rem] border-[3px] border-sky-900/70 bg-white/75 p-2 shadow-[0_10px_28px_rgba(14,165,233,0.2),inset_0_2px_0_rgba(255,255,255,0.95)] backdrop-blur-md sm:h-32 sm:w-32">
            <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-linear-to-b from-sky-100/90 to-sky-300/50">
              <GlossyPersonIcon
                uid="profesor-main"
                genero="masculino"
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
                {nombreProfesor}
              </span>
              <div
                className="pointer-events-none absolute inset-x-6 top-1 h-[38%] rounded-b-[100%] bg-linear-to-b from-white/35 to-transparent"
                aria-hidden
              />
            </div>
          </div>
        </div>

        <div className="relative flex flex-1 flex-col gap-6 overflow-hidden rounded-[2rem] border-[3px] border-sky-800/50 bg-sky-100/35 p-3 shadow-[0_12px_40px_rgba(56,189,248,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl backdrop-saturate-150 sm:p-4">
          <div
            className="pointer-events-none absolute inset-0 z-0 rounded-[2rem] opacity-[0.12]"
            aria-hidden
            style={{
              backgroundImage: `radial-gradient(circle at 20% 30%, white 0%, transparent 45%), radial-gradient(circle at 80% 70%, #7dd3fc 0%, transparent 40%)`,
            }}
          />

          <div className="relative z-[1] flex flex-col gap-4">
            <div className="flex flex-wrap gap-2 rounded-full border border-white/60 bg-white/55 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-sm">
              <MateriaScrollPicker
                materias={materias}
                seleccionada={materiaSeleccionada}
                onSeleccionar={setMateriaSeleccionada}
              />
            </div>

            <div className="flex min-h-[240px] flex-col rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md sm:min-h-[300px] sm:p-6">
              <div className="flex flex-1 flex-col rounded-[1.5rem] border border-white/45 bg-slate-500/20 px-4 py-6 shadow-[inset_0_3px_12px_rgba(0,0,0,0.06)] backdrop-blur-sm">
                {cargandoVista ? (
                  <p className="text-center text-sm font-semibold text-slate-600">
                    Cargando…
                  </p>
                ) : (
                  <MateriaTablaVistaPanel
                    vista={vistaMateria}
                    materiaNombre={materiaSeleccionada}
                  />
                )}
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <GreyActionPill
                  onClick={onSubirExcel}
                  className={subiendo ? "opacity-70" : ""}
                >
                  {subiendo
                    ? "Subiendo…"
                    : archivoSeleccionado
                      ? "Subir y reemplazar"
                      : "Cargar nuevo Excel"}
                </GreyActionPill>
                {mensajeArchivo && (
                  <p
                    className={`text-xs font-semibold ${mensajeArchivo.includes("reemplazado") ? "text-sky-900" : "text-red-700"}`}
                    role="status"
                  >
                    {mensajeArchivo}
                  </p>
                )}
              </div>

              <input
                ref={inputArchivoRef}
                type="file"
                accept=".csv,.tsv,.xlsx,.xls,text/csv"
                className="sr-only"
                onChange={onArchivoElegido}
                aria-label="Seleccionar archivo de calificaciones"
              />
            </div>
          </div>
        </div>

        <section
          className="relative mt-6 overflow-hidden rounded-[2rem] border-[3px] border-sky-800/50 bg-sky-100/35 p-3 shadow-[0_12px_40px_rgba(56,189,248,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl backdrop-saturate-150 sm:p-4"
          aria-label="Comentarios a alumnos"
        >
          <div className="relative z-[1] flex flex-wrap items-end justify-between gap-2 px-1 pb-2">
            <div className="flex flex-wrap gap-2">
              <label className="sr-only" htmlFor="alumno-nombre">
                Nombre completo del alumno
              </label>
              <input
                id="alumno-nombre"
                type="text"
                value={alumnoNombre}
                onChange={(e) => setAlumnoNombre(e.target.value)}
                placeholder="Nombre completo"
                className="min-w-[10rem] rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white placeholder:text-white/75 shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] outline-none focus:ring-2 focus:ring-sky-400/60"
              />
              <GreyActionPill
                type="button"
                onClick={onEnviarComentario}
                className={enviandoComentario ? "opacity-70" : ""}
              >
                Enviar
              </GreyActionPill>
            </div>
            <span className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] sm:text-[11px]">
              Envía un comentario a un alumno
            </span>
          </div>

          <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md sm:p-6">
            <label className="sr-only" htmlFor="comentario-alumno">
              Comentario para el alumno
            </label>
            <textarea
              id="comentario-alumno"
              value={comentario}
              onChange={(e) =>
                setComentario(e.target.value.slice(0, COMENTARIO_MAX_LENGTH))
              }
              maxLength={COMENTARIO_MAX_LENGTH}
              placeholder="Comparte tu comentario"
              rows={5}
              className="min-h-[140px] w-full resize-y rounded-[1.5rem] border border-white/45 bg-slate-500/20 px-5 py-4 text-sm font-semibold text-slate-700 placeholder:text-slate-600/80 shadow-[inset_0_3px_12px_rgba(0,0,0,0.06)] outline-none backdrop-blur-sm focus:ring-2 focus:ring-sky-400/50"
            />
            <p className="mt-1 text-right text-[10px] font-semibold text-slate-600">
              {comentario.length}/{COMENTARIO_MAX_LENGTH}
            </p>
            {mensajeComentario && (
              <p className="mt-2 text-center text-xs font-semibold text-sky-900">
                {mensajeComentario}
              </p>
            )}
          </div>
        </section>
      </div>
    </FrutigerBackdrop>
  );
}
