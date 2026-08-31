"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  actionBuscarAlumnoPorNombre,
  actionEnviarComentarioAlumno,
  actionObtenerVistaMateria,
  actionObtenerVistaRegistro,
  actionSubirEtiquetasStatus,
  actionSubirMateriaExcel,
  actionSubirRegistroExcel,
} from "@/app/actions/escolar";
import {
  MateriaMapeoColumnas,
  useMateriaMapeo,
} from "@/app/components/materia-mapeo-columnas";
import { MateriaSelector } from "@/app/components/materia-selector";
import { MateriasConfigPanel } from "@/app/components/materias-config-panel";
import { MateriaTablaVistaPanel } from "@/app/components/materia-tabla-vista";
import { JustificacionesAdmin } from "./justificaciones-admin";
import { actionCambiarClaveProfesor } from "@/app/actions/profesores";
import { ProfesoresCredencialesPanel } from "@/app/components/profesores-credenciales-panel";
import { COMENTARIO_MAX_LENGTH } from "@/lib/escolar/tables";
import type { MateriaTablaVista } from "@/lib/escolar/types";
import { materiasConNombreVisible } from "@/lib/escolar/nombres-visibles";
import type { MateriaConNombreVisible } from "@/lib/escolar/nombres-visibles";
import type { PortalSessionPayload } from "@/lib/auth/types";
import { FrutigerBackdrop } from "../components/frutiger-backdrop";
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
  materias: readonly MateriaConNombreVisible[];
  registros: readonly string[];
};

export function DirectivoClient({ sesion, materias, registros }: Props) {
  const router = useRouter();
  const [materiaSeleccionada, setMateriaSeleccionada] = useState<string>(
    materias[0]?.idInterno ?? "",
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
  const [mensajeArchivo, setMensajeArchivo] = useState<string | null>(null);
  const { asistente, abrir, cerrar } = useMateriaMapeo();
  const [mensajeComentario, setMensajeComentario] = useState<string | null>(
    null,
  );
  const [alumnoNombre, setAlumnoNombre] = useState("");
  const [comentario, setComentario] = useState("");
  const [busquedaAlumno, setBusquedaAlumno] = useState("");
  const [archivoStatus, setArchivoStatus] = useState<File | null>(null);
  const [subiendoStatus, setSubiendoStatus] = useState(false);
  const [mensajeStatus, setMensajeStatus] = useState<string | null>(null);
  const inputCalificacionesRef = useRef<HTMLInputElement>(null);
  const inputRegistroRef = useRef<HTMLInputElement>(null);
  const inputStatusRef = useRef<HTMLInputElement>(null);
  // BLOQUE 9 (PIEZA 5) — cambio forzado de clave (texto plano, mismo formato).
  const [nuevaClave, setNuevaClave] = useState("");
  const [confirmarClave, setConfirmarClave] = useState("");
  const [guardandoClave, setGuardandoClave] = useState(false);
  const [mensajeClave, setMensajeClave] = useState<string | null>(null);

  const nombreDirectivo = sesion?.nombre ?? sesion?.matricula ?? "Directivo";
  const debeCambiar = sesion?.debeCambiarCredenciales === true;

  async function onGuardarClave() {
    setMensajeClave(null);
    if (nuevaClave.trim().length < 6) {
      setMensajeClave("La nueva clave debe tener al menos 6 caracteres.");
      return;
    }
    if (nuevaClave !== confirmarClave) {
      setMensajeClave("Las claves no coinciden.");
      return;
    }
    setGuardandoClave(true);
    const r = await actionCambiarClaveProfesor(nuevaClave);
    setGuardandoClave(false);
    if (r.ok) {
      router.refresh();
    } else {
      setMensajeClave(r.error);
    }
  }

  // Registros de calificaciones finales (sin aliases): nombre visible =
  // nombre técnico (fallback). Se reutiliza el mismo selector.
  const registrosOpciones = materiasConNombreVisible(registros, new Map());

  // Nombre visible de la materia seleccionada (solo presentación; las
  // acciones siguen usando `materiaSeleccionada` = idInterno real).
  const nombreVisibleSeleccionada =
    materias.find((m) => m.idInterno === materiaSeleccionada)?.nombreVisible ??
    materiaSeleccionada;

  const refrescarVista = useCallback(async (nombre: string) => {
    setCargandoVista(true);
    const vista = await actionObtenerVistaMateria(nombre);
    setVistaMateria(vista);
    setCargandoVista(false);
  }, []);

  useEffect(() => {
    if (materiaSeleccionada) void refrescarVista(materiaSeleccionada);
  }, [materiaSeleccionada, refrescarVista]);

  const refrescarVistaRegistro = useCallback(async (nombre: string) => {
    setCargandoVistaRegistro(true);
    const vista = await actionObtenerVistaRegistro(nombre);
    setVistaRegistro(vista);
    setCargandoVistaRegistro(false);
  }, []);

  useEffect(() => {
    if (registroSeleccionado) void refrescarVistaRegistro(registroSeleccionado);
  }, [registroSeleccionado, refrescarVistaRegistro]);

  function abrirSelectorCalificaciones() {
    inputCalificacionesRef.current?.click();
  }

  function onCalificacionesElegidas(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (file && materiaSeleccionada) void abrir(file, materiaSeleccionada);
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

  function onStatusElegido(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setArchivoStatus(file);
    setMensajeStatus(file ? `Archivo listo: ${file.name}` : null);
    event.target.value = "";
  }

  async function onSubirStatus() {
    if (!archivoStatus) {
      inputStatusRef.current?.click();
      return;
    }
    setSubiendoStatus(true);
    setMensajeStatus(null);
    const formData = new FormData();
    formData.set("archivo", archivoStatus);
    const resultado = await actionSubirEtiquetasStatus(formData);
    setSubiendoStatus(false);
    if (resultado.ok) {
      setMensajeStatus(
        `ETIQUETAS (STATUS) reemplazadas (${resultado.filas} filas).`,
      );
      setArchivoStatus(null);
    } else {
      setMensajeStatus(resultado.error);
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

        {debeCambiar ? (
          <div className="relative z-10 flex flex-1 flex-col items-center justify-center">
            <div className="w-full max-w-md rounded-3xl border border-amber-400/60 bg-amber-100/70 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.6)] backdrop-blur-md sm:p-6">
              <p className="mb-2 text-center text-xs font-extrabold uppercase tracking-wide text-amber-800">
                Cambia tu clave para continuar
              </p>
              <p className="mb-4 text-center text-xs font-semibold text-amber-900">
                La administración te pidió definir una nueva clave antes de
                usar el portal.
              </p>
              <div className="flex flex-col gap-3">
                <input
                  type="password"
                  value={nuevaClave}
                  onChange={(e) => setNuevaClave(e.target.value)}
                  placeholder="Nueva clave (mínimo 6 caracteres)"
                  className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white placeholder:text-white/75 shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] outline-none focus:ring-2 focus:ring-sky-400/60"
                />
                <input
                  type="password"
                  value={confirmarClave}
                  onChange={(e) => setConfirmarClave(e.target.value)}
                  placeholder="Confirmar clave"
                  className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white placeholder:text-white/75 shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] outline-none focus:ring-2 focus:ring-sky-400/60"
                />
                <div className="flex justify-center">
                  <GreyActionPill
                    onClick={() => void onGuardarClave()}
                    disabled={guardandoClave}
                  >
                    {guardandoClave ? "Guardando…" : "Guardar clave"}
                  </GreyActionPill>
                </div>
              </div>
              {mensajeClave && (
                <p
                  className="mt-3 text-center text-xs font-semibold text-red-700"
                  role="alert"
                >
                  {mensajeClave}
                </p>
              )}
            </div>
          </div>
        ) : (
          <>
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

          {asistente ? (
            <MateriaMapeoColumnas
              asistente={asistente}
              onCancelar={cerrar}
              onCompletado={(detalle) => {
                setMensajeArchivo(
                  detalle ?? "Calificaciones guardadas correctamente.",
                );
                cerrar();
                void refrescarVista(materiaSeleccionada);
              }}
            />
          ) : (
            <div className="relative z-[1] flex flex-col gap-4 lg:flex-row">
              <MateriaSelector
                materias={materias}
                seleccionada={materiaSeleccionada}
                onSeleccionar={setMateriaSeleccionada}
                mostrarIdTecnico
                className="lg:w-80 lg:shrink-0"
              />

              <div className="flex min-h-[240px] flex-1 flex-col rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md sm:min-h-[300px] sm:p-6">
                <PreviewPanel className="min-h-[200px] sm:min-h-[240px]">
                  {cargandoVista ? (
                    <p>Cargando…</p>
                  ) : (
                    <MateriaTablaVistaPanel
                      vista={vistaMateria}
                      materiaNombre={nombreVisibleSeleccionada}
                      mostrarDetalleColumnas
                    />
                  )}
                </PreviewPanel>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <GreyActionPill onClick={abrirSelectorCalificaciones}>
                    Cargar nuevo Excel
                  </GreyActionPill>
                  {mensajeArchivo && (
                    <p
                      className={`text-xs font-semibold ${
                        mensajeArchivo.includes("correctamente")
                          ? "text-sky-900"
                          : "text-red-700"
                      }`}
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
          )}
        </div>

        {/* Registros de calificaciones finales por grupo */}
        <div className="relative mt-6 flex flex-1 flex-col gap-6 overflow-hidden rounded-[2rem] border-[3px] border-sky-800/50 bg-sky-100/35 p-3 shadow-[0_12px_40px_rgba(56,189,248,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl backdrop-saturate-150 sm:p-4">
          <PanelTab className="mx-auto w-fit">
            Sube el registro de calificaciones finales del grupo
          </PanelTab>
          <div className="relative z-[1] flex flex-col gap-4">
            <MateriaSelector
              materias={registrosOpciones}
              seleccionada={registroSeleccionado}
              onSeleccionar={setRegistroSeleccionado}
              titulo="Registros"
              buscarPlaceholder="Buscar registro…"
            />
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

        <MateriasConfigPanel materias={materias} />

        {/* ETIQUETAS (STATUS) */}
        <div className="relative mt-6 flex flex-1 flex-col gap-6 overflow-hidden rounded-[2rem] border-[3px] border-sky-800/50 bg-sky-100/35 p-3 shadow-[0_12px_40px_rgba(56,189,248,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl backdrop-saturate-150 sm:p-4">
          <PanelTab className="mx-auto w-fit">
            Sube ETIQUETAS (STATUS) — promedios y materias por alumno
          </PanelTab>
          <div className="relative z-[1] flex flex-col gap-4">
            <div className="flex min-h-[120px] flex-col rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md sm:p-6">
              <p className="mb-3 text-center text-xs font-semibold text-slate-700">
                El archivo debe incluir una columna «CURP» y las columnas de
                promedios y materias. Reemplaza todo el contenido de la tabla.
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <GreyActionPill
                  onClick={onSubirStatus}
                  className={subiendoStatus ? "opacity-70" : ""}
                >
                  {subiendoStatus
                    ? "Subiendo…"
                    : archivoStatus
                      ? "Subir y reemplazar STATUS"
                      : "Cargar Excel/CSV de STATUS"}
                </GreyActionPill>
                {mensajeStatus && (
                  <p
                    className={`text-xs font-semibold ${mensajeStatus.includes("reemplazadas") ? "text-sky-900" : "text-red-700"}`}
                    role="status"
                  >
                    {mensajeStatus}
                  </p>
                )}
              </div>
              <input
                ref={inputStatusRef}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv"
                className="sr-only"
                onChange={onStatusElegido}
                aria-label="Seleccionar archivo de ETIQUETAS (STATUS)"
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

        {/* Justificaciones de asistencia (panel administrativo) */}
        <section
          className="relative mt-6 overflow-hidden rounded-[2rem] border-[3px] border-sky-800/50 bg-sky-100/35 p-1 shadow-[0_12px_40px_rgba(56,189,248,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl backdrop-saturate-150"
          aria-label="Justificaciones pendientes"
        >
          <JustificacionesAdmin />
        </section>

        {/* BLOQUE 9 (PIEZA 5) — Forzar cambio de clave por profesor. */}
        <ProfesoresCredencialesPanel />

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
          </>
        )}
      </div>
    </FrutigerBackdrop>
  );
}
