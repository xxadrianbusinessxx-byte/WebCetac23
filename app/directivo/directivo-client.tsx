"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { actionSubirCalificacionesMateria } from "@/app/actions/calificaciones";
import { MATERIAS_DEMO } from "@/lib/calificaciones/materias-demo";
import { FrutigerBackdrop } from "../components/frutiger-backdrop";
import { GlossyNavPill } from "../components/glossy-nav-pill";
import { GlossyPersonIcon } from "../components/glossy-person-icon";

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

function PreviewPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex min-h-[120px] flex-1 items-center justify-center rounded-[1.5rem] border border-white/45 bg-slate-500/20 px-4 py-8 text-center text-sm font-semibold text-slate-700 shadow-[inset_0_3px_12px_rgba(0,0,0,0.06)] backdrop-blur-sm ${className}`}
    >
      {children}
    </div>
  );
}

const SESION_DEMO = { matricula: "DIR001", rol: "directivo" as const };

export function DirectivoClient() {
  const router = useRouter();
  const [materiaIndex, setMateriaIndex] = useState(0);
  const [archivoSeleccionado, setArchivoSeleccionado] = useState<File | null>(
    null,
  );
  const [subiendo, setSubiendo] = useState(false);
  const [mensajeArchivo, setMensajeArchivo] = useState<string | null>(null);
  const [mensajeComentario, setMensajeComentario] = useState<string | null>(
    null,
  );
  const [alumnoNombre, setAlumnoNombre] = useState("");
  const [comentario, setComentario] = useState("");
  const [archivoPublicacion, setArchivoPublicacion] = useState<File | null>(
    null,
  );
  const [mensajePublicacion, setMensajePublicacion] = useState<string | null>(
    null,
  );
  const [busquedaAlumno, setBusquedaAlumno] = useState("");
  const inputCalificacionesRef = useRef<HTMLInputElement>(null);
  const inputPublicacionRef = useRef<HTMLInputElement>(null);

  const materia = MATERIAS_DEMO[materiaIndex];

  function abrirSelectorCalificaciones() {
    inputCalificacionesRef.current?.click();
  }

  function onCalificacionesElegidas(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0] ?? null;
    setArchivoSeleccionado(file);
    setMensajeArchivo(file ? `Archivo listo: ${file.name}` : null);
    event.target.value = "";
  }

  async function onSubirExcel() {
    if (!archivoSeleccionado) {
      abrirSelectorCalificaciones();
      return;
    }

    setSubiendo(true);
    setMensajeArchivo(null);

    const formData = new FormData();
    formData.set("matricula", SESION_DEMO.matricula);
    formData.set("rol", SESION_DEMO.rol);
    formData.set("materiaId", materia.id);
    formData.set("archivo", archivoSeleccionado);

    const resultado = await actionSubirCalificacionesMateria(formData);
    setSubiendo(false);

    if (resultado.ok) {
      setMensajeArchivo(
        `Archivo guardado para ${materia.nombre}. Reemplazó el anterior si existía.`,
      );
      setArchivoSeleccionado(null);
    } else {
      setMensajeArchivo(resultado.error);
    }
  }

  function onPublicacionElegida(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setArchivoPublicacion(file);
    setMensajePublicacion(
      file ? `Listo para publicar: ${file.name}` : null,
    );
    event.target.value = "";
  }

  function onPublicar() {
    if (!archivoPublicacion) {
      inputPublicacionRef.current?.click();
      return;
    }
    setMensajePublicacion(
      "Vista previa lista. La publicación en el portal se conectará con Supabase.",
    );
  }

  function onEnviarComentario() {
    if (!alumnoNombre.trim() || !comentario.trim()) return;
    setComentario("");
    setMensajeComentario(
      `Comentario enviado a ${alumnoNombre.trim()} (demo).`,
    );
  }

  function onEntrarPerfilAlumno() {
    if (!busquedaAlumno.trim()) return;
    const params = new URLSearchParams({
      modo: "directivo",
      alumno: busquedaAlumno.trim(),
    });
    router.push(`/perfil?${params.toString()}`);
  }

  return (
    <FrutigerBackdrop>
      <div className="relative z-10 mx-auto flex min-h-dvh max-w-5xl flex-col px-4 pb-24 pt-6 sm:px-6 lg:max-w-6xl lg:px-8 lg:pt-8">
        <div className="mb-6 flex h-14 items-center justify-center gap-3 rounded-full border-[3px] border-sky-800/55 bg-sky-200/45 px-3 py-2 shadow-[0_8px_28px_rgba(56,189,248,0.18),inset_0_1px_0_rgba(255,255,255,0.85)] backdrop-blur-xl backdrop-saturate-150 sm:mb-8 sm:h-16 sm:justify-between sm:px-6">
          <GlossyNavPill href="/directivo" active>
            Directivo
          </GlossyNavPill>
          <GlossyNavPill href="/chat?origen=directivo">Chat</GlossyNavPill>
        </div>

        <div className="mb-6 flex flex-col items-stretch gap-4 sm:mb-8 sm:flex-row sm:items-center">
          <div className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-[1.75rem] border-[3px] border-sky-900/70 bg-white/75 p-2 shadow-[0_10px_28px_rgba(14,165,233,0.2),inset_0_2px_0_rgba(255,255,255,0.95)] backdrop-blur-md sm:h-32 sm:w-32">
            <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-linear-to-b from-sky-100/90 to-sky-300/50">
              <GlossyPersonIcon
                uid="directivo-main"
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
                Directive name
              </span>
              <div
                className="pointer-events-none absolute inset-x-6 top-1 h-[38%] rounded-b-[100%] bg-linear-to-b from-white/35 to-transparent"
                aria-hidden
              />
            </div>
          </div>
        </div>

        {/* Calificaciones por materia */}
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
              {MATERIAS_DEMO.map((m, i) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMateriaIndex(i)}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition ${
                    materiaIndex === i
                      ? "bg-linear-to-b from-sky-500 to-sky-800 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]"
                      : "bg-white/70 text-sky-900 hover:bg-white"
                  }`}
                >
                  {m.nombre}
                </button>
              ))}
            </div>

            <div className="flex min-h-[240px] flex-col rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md sm:min-h-[300px] sm:p-6">
              <PreviewPanel className="min-h-[200px] sm:min-h-[240px]">
                <div>
                  <p>Vista previa de su excel</p>
                  <p className="mt-2 text-xs font-medium text-slate-600/90">
                    {materia.nombre} — edición completa para directivo.
                  </p>
                </div>
              </PreviewPanel>

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
                    className={`text-xs font-semibold ${mensajeArchivo.includes("guardado") ? "text-sky-900" : "text-red-700"}`}
                    role="status"
                  >
                    {mensajeArchivo}
                  </p>
                )}
              </div>

              <input
                ref={inputCalificacionesRef}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                onChange={onCalificacionesElegidas}
                aria-label="Seleccionar archivo de calificaciones"
              />
            </div>
          </div>
        </div>

        {/* Comentarios a alumnos */}
        <section
          className="relative mt-6 overflow-hidden rounded-[2rem] border-[3px] border-sky-800/50 bg-sky-100/35 p-3 shadow-[0_12px_40px_rgba(56,189,248,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl backdrop-saturate-150 sm:p-4"
          aria-label="Comentarios a alumnos"
        >
          <div className="relative z-[1] flex flex-wrap items-end justify-between gap-2 px-1 pb-2">
            <div className="flex flex-wrap gap-2">
              <label className="sr-only" htmlFor="dir-alumno-nombre">
                Nombre completo del alumno
              </label>
              <input
                id="dir-alumno-nombre"
                type="text"
                value={alumnoNombre}
                onChange={(e) => setAlumnoNombre(e.target.value)}
                placeholder="Nombre completo"
                className="min-w-[10rem] rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white placeholder:text-white/75 shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] outline-none focus:ring-2 focus:ring-sky-400/60"
              />
              <GreyActionPill type="button" onClick={onEnviarComentario}>
                Enviar
              </GreyActionPill>
            </div>
            <PanelTab>Envía un comentario a un alumno</PanelTab>
          </div>

          <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md sm:p-6">
            <label className="sr-only" htmlFor="dir-comentario-alumno">
              Comentario para el alumno
            </label>
            <textarea
              id="dir-comentario-alumno"
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Comparte tu comentario"
              rows={4}
              className="min-h-[120px] w-full resize-y rounded-[1.5rem] border border-white/45 bg-slate-500/20 px-5 py-4 text-sm font-semibold text-slate-700 placeholder:text-slate-600/80 shadow-[inset_0_3px_12px_rgba(0,0,0,0.06)] outline-none backdrop-blur-sm focus:ring-2 focus:ring-sky-400/50"
            />
            {mensajeComentario && (
              <p className="mt-2 text-center text-xs font-semibold text-sky-900">
                {mensajeComentario}
              </p>
            )}
          </div>
        </section>

        {/* Publicación + Noticias */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section
            className="relative overflow-hidden rounded-[2rem] border-[3px] border-sky-800/50 bg-sky-100/35 p-3 shadow-[0_12px_40px_rgba(56,189,248,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl backdrop-saturate-150 sm:p-4"
            aria-label="Publicar contenido"
          >
            <div className="relative z-[1] flex flex-wrap gap-2 px-1 pb-2">
              <GreyActionPill onClick={() => inputPublicacionRef.current?.click()}>
                Subir archivo
              </GreyActionPill>
              <GreyActionPill onClick={onPublicar}>Publicar</GreyActionPill>
            </div>
            <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
              <PreviewPanel>
                {archivoPublicacion
                  ? archivoPublicacion.name
                  : "Vista previa"}
              </PreviewPanel>
              {mensajePublicacion && (
                <p className="mt-2 text-center text-xs font-semibold text-sky-900">
                  {mensajePublicacion}
                </p>
              )}
            </div>
            <input
              ref={inputPublicacionRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx"
              className="sr-only"
              onChange={onPublicacionElegida}
              aria-label="Seleccionar archivo para publicar"
            />
          </section>

          <section
            className="relative overflow-hidden rounded-[2rem] border-[3px] border-sky-800/50 bg-sky-100/35 p-3 shadow-[0_12px_40px_rgba(56,189,248,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl backdrop-saturate-150 sm:p-4"
            aria-label="Noticias recientes"
          >
            <div className="relative z-[1] flex justify-center px-1 pb-2">
              <PanelTab>Noticias recientes</PanelTab>
            </div>
            <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
              <PreviewPanel>Vista previa</PreviewPanel>
            </div>
          </section>
        </div>

        {/* Entrar al perfil del alumno */}
        <section
          className="relative mt-6 overflow-hidden rounded-[2rem] border-[3px] border-sky-800/50 bg-sky-900/90 p-4 shadow-[0_12px_40px_rgba(2,6,23,0.2)] sm:p-6"
          aria-label="Acceso al perfil del alumno"
        >
          <div className="relative z-[1] -mt-8 mb-4 flex justify-center sm:-mt-10">
            <PanelTab className="border-sky-700/40 bg-linear-to-b from-slate-500 via-slate-600 to-slate-700 px-6">
              Entrar al perfil del alumno
            </PanelTab>
          </div>

          <div className="flex flex-col items-center gap-6 sm:gap-8">
            <label className="sr-only" htmlFor="busqueda-alumno">
              Nombre completo del alumno
            </label>
            <input
              id="busqueda-alumno"
              type="text"
              value={busquedaAlumno}
              onChange={(e) => setBusquedaAlumno(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onEntrarPerfilAlumno()}
              placeholder="Nombre completo"
              className="w-full max-w-md rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-6 py-3 text-center text-sm font-extrabold uppercase tracking-wide text-white placeholder:text-white/75 shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] outline-none focus:ring-2 focus:ring-sky-300/60"
            />
            <p className="max-w-lg text-center text-xs font-medium text-sky-100/90">
              Como directivo puedes editar contenido sensible del alumno
              (información personal, estatus y boleta).
            </p>
            <div className="flex w-full justify-end">
              <GreyActionPill
                onClick={onEntrarPerfilAlumno}
                disabled={!busquedaAlumno.trim()}
              >
                Entrar
              </GreyActionPill>
            </div>
          </div>
        </section>
      </div>
    </FrutigerBackdrop>
  );
}
