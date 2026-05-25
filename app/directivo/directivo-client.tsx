"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  actionBuscarAlumnoPorNombre,
  actionEnviarComentarioAlumno,
  actionSubirMateriaExcel,
  actionSubirRegistroExcel,
} from "@/app/actions/escolar";
import { actionPublicarNoticiaInicio } from "@/app/actions/noticias";
import { fetchAppJson } from "@/lib/client/fetch-app";
import { useCargaUnica } from "@/lib/client/use-carga-unica";
import type { NoticiaInicioSlot } from "@/lib/cloudinary/noticias";
import { asegurarHttps } from "@/lib/urls/seguras";
import { prepararFormDataImagen } from "@/lib/imagen/form-data-cliente";
import {
  archivoAPreviewDataUrl,
  revocarPreviewSiBlob,
} from "@/lib/imagen/preview-cliente";
import { MateriaScrollPicker } from "@/app/components/materia-scroll-picker";
import { MateriaTablaVistaPanel } from "@/app/components/materia-tabla-vista";
import { COMENTARIO_MAX_LENGTH } from "@/lib/escolar/tables";
import type { MateriaTablaVista } from "@/lib/escolar/types";
import type { PortalSessionPayload } from "@/lib/auth/types";
import { ImagenEager } from "../components/imagen-eager";
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

type Props = {
  sesion: PortalSessionPayload | null;
  materias: readonly string[];
  registros: readonly string[];
};

export function DirectivoClient({ sesion, materias, registros }: Props) {
  const router = useRouter();
  const [materiaSeleccionada, setMateriaSeleccionada] = useState<string>(
    materias[0] ?? "",
  );
  const [registroSeleccionado, setRegistroSeleccionado] = useState<string>(
    registros[0] ?? "",
  );
  const [vistaRegistro, setVistaRegistro] = useState<MateriaTablaVista | null>(
    null,
  );
  const [cargandoVistaRegistro, setCargandoVistaRegistro] = useState(false);
  const [archivoRegistro, setArchivoRegistro] = useState<File | null>(null);
  const [subiendoRegistro, setSubiendoRegistro] = useState(false);
  const [mensajeRegistro, setMensajeRegistro] = useState<string | null>(null);
  const [vistaMateria, setVistaMateria] = useState<MateriaTablaVista | null>(
    null,
  );
  const [cargandoVista, setCargandoVista] = useState(false);
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
  const [slotNoticia, setSlotNoticia] = useState<NoticiaInicioSlot>(1);
  const [previewNoticia, setPreviewNoticia] = useState<string | null>(null);
  const [publicandoNoticia, setPublicandoNoticia] = useState(false);
  const [mensajePublicacion, setMensajePublicacion] = useState<string | null>(
    null,
  );
  const [busquedaAlumno, setBusquedaAlumno] = useState("");
  const inputCalificacionesRef = useRef<HTMLInputElement>(null);
  const inputRegistroRef = useRef<HTMLInputElement>(null);
  const inputPublicacionRef = useRef<HTMLInputElement>(null);
  const vistaMateriaSeqRef = useRef(0);
  const vistaRegistroSeqRef = useRef(0);

  const nombreDirectivo = sesion?.nombre ?? sesion?.matricula ?? "Directivo";

  const refrescarVista = useCallback(async (nombre: string) => {
    if (!nombre.trim()) return;
    const seq = ++vistaMateriaSeqRef.current;
    setCargandoVista(true);
    try {
      const params = new URLSearchParams({ nombre });
      const vista = await fetchAppJson<MateriaTablaVista | null>(
        `/api/vista-materia?${params}`,
      );
      if (vistaMateriaSeqRef.current !== seq) return;
      setVistaMateria(vista);
    } catch (e) {
      if (vistaMateriaSeqRef.current !== seq) return;
      setVistaMateria(null);
      setMensajeArchivo(
        e instanceof Error ? e.message : "No se pudo cargar la vista de materia.",
      );
    } finally {
      if (vistaMateriaSeqRef.current === seq) setCargandoVista(false);
    }
  }, []);

  useEffect(() => {
    if (materiaSeleccionada) void refrescarVista(materiaSeleccionada);
    return () => {
      vistaMateriaSeqRef.current += 1;
    };
  }, [materiaSeleccionada, refrescarVista]);

  const refrescarVistaRegistro = useCallback(async (nombre: string) => {
    if (!nombre.trim()) return;
    const seq = ++vistaRegistroSeqRef.current;
    setCargandoVistaRegistro(true);
    try {
      const params = new URLSearchParams({ nombre });
      const vista = await fetchAppJson<MateriaTablaVista | null>(
        `/api/vista-registro?${params}`,
      );
      if (vistaRegistroSeqRef.current !== seq) return;
      setVistaRegistro(vista);
    } catch (e) {
      if (vistaRegistroSeqRef.current !== seq) return;
      setVistaRegistro(null);
      setMensajeRegistro(
        e instanceof Error ? e.message : "No se pudo cargar el registro.",
      );
    } finally {
      if (vistaRegistroSeqRef.current === seq) setCargandoVistaRegistro(false);
    }
  }, []);

  useEffect(() => {
    if (registroSeleccionado) void refrescarVistaRegistro(registroSeleccionado);
    return () => {
      vistaRegistroSeqRef.current += 1;
    };
  }, [registroSeleccionado, refrescarVistaRegistro]);

  const {
    datos: urlsNoticias,
    cargando: cargandoNoticias,
    error: errorNoticias,
    recargar: recargarNoticias,
  } = useCargaUnica(
    `noticias-slot-${slotNoticia}`,
    () =>
      fetchAppJson<Record<NoticiaInicioSlot, string | null>>(
        "/api/noticias-inicio",
      ),
    true,
  );

  useEffect(() => {
    if (!urlsNoticias || archivoPublicacion) return;
    const remota = asegurarHttps(urlsNoticias[slotNoticia]);
    if (remota) setPreviewNoticia(remota);
  }, [urlsNoticias, slotNoticia, archivoPublicacion]);

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

  function onRegistroElegido(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setArchivoRegistro(file);
    setMensajeRegistro(file ? `Archivo listo: ${file.name}` : null);
    event.target.value = "";
  }

  async function onSubirRegistro() {
    if (!archivoRegistro) {
      inputRegistroRef.current?.click();
      return;
    }
    setSubiendoRegistro(true);
    setMensajeRegistro(null);
    const formData = new FormData();
    formData.set("archivo", archivoRegistro);
    const resultado = await actionSubirRegistroExcel(
      registroSeleccionado,
      formData,
    );
    setSubiendoRegistro(false);
    if (resultado.ok) {
      setMensajeRegistro(
        `Registro «${registroSeleccionado}» reemplazado (${resultado.filas} filas).`,
      );
      setArchivoRegistro(null);
      void refrescarVistaRegistro(registroSeleccionado);
    } else {
      setMensajeRegistro(resultado.error);
    }
  }

  async function onSubirExcel() {
    if (!archivoSeleccionado) {
      abrirSelectorCalificaciones();
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

  async function onPublicacionElegida(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0] ?? null;
    setArchivoPublicacion(file);
    revocarPreviewSiBlob(previewNoticia);
    if (!file) {
      setPreviewNoticia(null);
      setMensajePublicacion(null);
      event.target.value = "";
      return;
    }
    try {
      setPreviewNoticia(await archivoAPreviewDataUrl(file));
      setMensajePublicacion(`Listo para publicar en evento ${slotNoticia}`);
    } catch (e) {
      setPreviewNoticia(null);
      setMensajePublicacion(
        e instanceof Error ? e.message : "No se pudo previsualizar.",
      );
    }
    event.target.value = "";
  }

  async function onPublicar() {
    if (!archivoPublicacion) {
      inputPublicacionRef.current?.click();
      return;
    }
    setPublicandoNoticia(true);
    setMensajePublicacion(null);
    const fd = prepararFormDataImagen(archivoPublicacion);
    const r = await actionPublicarNoticiaInicio(slotNoticia, fd);
    setPublicandoNoticia(false);
    if (r.ok) {
      setMensajePublicacion(
        `Noticia publicada en inicio de sesión (evento ${slotNoticia}) vía Cloudinary.`,
      );
      setArchivoPublicacion(null);
      revocarPreviewSiBlob(previewNoticia);
      setPreviewNoticia(asegurarHttps(r.url));
      recargarNoticias();
    } else {
      setMensajePublicacion(r.error);
    }
  }

  async function onEnviarComentario() {
    if (!alumnoNombre.trim() || !comentario.trim()) return;
    const resultado = await actionEnviarComentarioAlumno(
      alumnoNombre,
      comentario,
      nombreDirectivo,
    );
    if (resultado.ok) {
      setComentario("");
      setMensajeComentario(
        `Comentario guardado en COMENTARIOS para ${alumnoNombre.trim()}.`,
      );
    } else {
      setMensajeComentario(resultado.error);
    }
  }

  async function onEntrarPerfilAlumno() {
    if (!busquedaAlumno.trim()) return;
    const alumno = await actionBuscarAlumnoPorNombre(busquedaAlumno.trim());
    if (!alumno) {
      setMensajeComentario("No se encontró al alumno.");
      return;
    }
    const params = new URLSearchParams({
      modo: "directivo",
      curp: alumno.CURP,
      desde: "directivo",
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
                {nombreDirectivo}
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
          <PanelTab className="mx-auto w-fit">
            Sube calificaciones por materia (Excel o CSV)
          </PanelTab>
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
              <PreviewPanel className="min-h-[200px] sm:min-h-[240px]">
                {cargandoVista ? (
                  <p>Cargando…</p>
                ) : (
                  <MateriaTablaVistaPanel
                    vista={vistaMateria}
                    materiaNombre={materiaSeleccionada}
                  />
                )}
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
                    className={`text-xs font-semibold ${mensajeArchivo.includes("reemplazado") ? "text-sky-900" : "text-red-700"}`}
                    role="status"
                  >
                    {mensajeArchivo}
                  </p>
                )}
              </div>

              <input
                ref={inputCalificacionesRef}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv"
                className="sr-only"
                onChange={onCalificacionesElegidas}
                aria-label="Seleccionar archivo de calificaciones"
              />
            </div>
          </div>
        </div>

        {/* Registros de calificaciones finales por grupo */}
        <div className="relative mt-6 flex flex-1 flex-col gap-6 overflow-hidden rounded-[2rem] border-[3px] border-sky-800/50 bg-sky-100/35 p-3 shadow-[0_12px_40px_rgba(56,189,248,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl backdrop-saturate-150 sm:p-4">
          <PanelTab className="mx-auto w-fit">
            Sube el registro de calificaciones finales del grupo
          </PanelTab>
          <div className="relative z-[1] flex flex-col gap-4">
            <div className="flex flex-wrap gap-2 rounded-full border border-white/60 bg-white/55 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-sm">
              <MateriaScrollPicker
                materias={registros}
                seleccionada={registroSeleccionado}
                onSeleccionar={setRegistroSeleccionado}
              />
            </div>
            <div className="flex min-h-[200px] flex-col rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md sm:min-h-[260px] sm:p-6">
              <PreviewPanel className="min-h-[160px] sm:min-h-[200px]">
                {cargandoVistaRegistro ? (
                  <p>Cargando…</p>
                ) : (
                  <MateriaTablaVistaPanel
                    vista={vistaRegistro}
                    materiaNombre={registroSeleccionado}
                  />
                )}
              </PreviewPanel>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <GreyActionPill
                  onClick={onSubirRegistro}
                  className={subiendoRegistro ? "opacity-70" : ""}
                >
                  {subiendoRegistro
                    ? "Subiendo…"
                    : archivoRegistro
                      ? "Subir y reemplazar registro"
                      : "Cargar Excel del registro"}
                </GreyActionPill>
                {mensajeRegistro && (
                  <p
                    className={`text-xs font-semibold ${mensajeRegistro.includes("reemplazado") ? "text-sky-900" : "text-red-700"}`}
                    role="status"
                  >
                    {mensajeRegistro}
                  </p>
                )}
              </div>
              <input
                ref={inputRegistroRef}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv"
                className="sr-only"
                onChange={onRegistroElegido}
                aria-label="Seleccionar registro de calificaciones finales"
              />
            </div>
          </div>
        </div>

        {/* Comentarios a alumnos */}
        <section
          className="relative mt-6 overflow-hidden rounded-[2rem] border-[3px] border-sky-800/50 bg-sky-100/35 p-3 shadow-[0_12px_40px_rgba(56,189,248,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl backdrop-saturate-150 sm:p-4"
          aria-label="Comentarios a alumnos"
        >
          <PanelTab className="mx-auto mb-2 w-fit">
            Envía un comentario a un alumno por nombre
          </PanelTab>
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
          </div>

          <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md sm:p-6">
            <label className="sr-only" htmlFor="dir-comentario-alumno">
              Comentario para el alumno
            </label>
            <textarea
              id="dir-comentario-alumno"
              value={comentario}
              onChange={(e) =>
                setComentario(e.target.value.slice(0, COMENTARIO_MAX_LENGTH))
              }
              maxLength={COMENTARIO_MAX_LENGTH}
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
            <PanelTab className="mx-auto mb-2 w-fit">
              Sube la próxima noticia para la pantalla de inicio
            </PanelTab>
            <div className="relative z-[1] flex flex-wrap items-center gap-2 px-1 pb-2">
              <GreyActionPill onClick={() => inputPublicacionRef.current?.click()}>
                Subir imagen
              </GreyActionPill>
              <GreyActionPill onClick={onPublicar} disabled={publicandoNoticia}>
                {publicandoNoticia ? "Publicando…" : "Publicar"}
              </GreyActionPill>
              <div className="flex gap-1 rounded-full border border-white/60 bg-white/50 p-1">
                {([1, 2] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSlotNoticia(n)}
                    className={`rounded-full px-3 py-1 text-[10px] font-extrabold uppercase ${
                      slotNoticia === n ? "bg-sky-800 text-white" : "text-sky-900"
                    }`}
                  >
                    Evento {n}
                  </button>
                ))}
              </div>
            </div>
            <p className="relative z-[1] px-2 pb-2 text-center text-[10px] font-semibold text-sky-900/90">
              Noticias en la pantalla de inicio de sesión (Cloudinary, cetac23)
            </p>
            <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
              <PreviewPanel className="min-h-[160px] overflow-hidden p-2">
                {previewNoticia ? (
                  <ImagenEager
                    src={previewNoticia}
                    alt="Vista previa noticia"
                    decoding="sync"
                    className="max-h-[200px] w-full rounded-xl object-contain"
                  />
                ) : (
                  <>Vista previa — evento {slotNoticia}</>
                )}
              </PreviewPanel>
              {(cargandoNoticias || mensajePublicacion || errorNoticias) && (
                <p className="mt-2 text-center text-xs font-semibold text-sky-900">
                  {cargandoNoticias
                    ? "Cargando vista previa…"
                    : (mensajePublicacion ?? errorNoticias)}
                </p>
              )}
            </div>
            <input
              ref={inputPublicacionRef}
              type="file"
              accept="image/*"
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
