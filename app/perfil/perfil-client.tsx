"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  actionGuardarComentarioPersonal,
  actionObtenerVistaMateria,
  actionSubirFotoPerfil,
} from "@/app/actions/escolar";
import { actionObtenerMapeoColumnasMateria } from "@/app/actions/materias";
import { actionGuardarCamposPersonales } from "@/app/actions/etiquetas-dinamicas";
import { CalendarioAsistenciaAlumno } from "@/app/components/calendario-asistencia-alumno";
import { HorarioAlumnoResumen } from "@/app/components/horario-alumno-resumen";
import { EtiquetasDinamicasPanel } from "@/app/components/etiquetas-dinamicas-panel";
import { MateriaCalificacionesAlumno } from "@/app/components/materia-calificaciones-alumno";
import { MateriaSelector } from "@/app/components/materia-selector";
import { MateriaTablaVistaPanel } from "@/app/components/materia-tabla-vista";
import { nombreCompletoAlumno } from "@/lib/escolar/alumnos";
import {
  CAMPOS_PERSONALES_PRIMARIOS,
  comentarioPersonalDesdeFila,
} from "@/lib/escolar/etiquetas";
import { informacionPersonalDesdeEtiquetas } from "@/lib/escolar/informacion-personal";
import type { AccesoAlumno } from "@/lib/escolar/acceso-alumno";
import type { AlumnoEtiquetaRow } from "@/lib/escolar/etiquetas-dinamicas";
import type { VistaRegistroAlumno } from "@/lib/escolar/registro-alumno";
import { comprimirImagenSiPosible } from "@/lib/imagen/comprimir";
import { COMENTARIO_MAX_LENGTH } from "@/lib/escolar/tables";
import type {
  AlumnoRow,
  ComentarioRow,
  EtiquetasPersonalesRow,
  MateriaTablaVista,
} from "@/lib/escolar/types";
import type { MateriaConNombreVisible } from "@/lib/escolar/nombres-visibles";
import { FrutigerBackdrop } from "../components/frutiger-backdrop";
import { GlossyPersonIcon } from "../components/glossy-person-icon";
import type { ModoPerfil } from "./page";

type MainTab = "materia" | "estatus" | "comentarios" | "boleta";
type MateriaSub = "asignaturas" | "personal";

function BubblePill({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border border-white/70 bg-white/88 px-3 py-2 text-center text-[10px] font-bold uppercase leading-tight text-sky-900 shadow-[inset_0_2px_0_rgba(255,255,255,0.95),0_2px_8px_rgba(14,165,233,0.12)] sm:text-xs ${className}`}
    >
      {children}
    </span>
  );
}

function MainTabButton({
  id,
  label,
  selected,
  onSelect,
}: {
  id: MainTab;
  label: string;
  selected: boolean;
  onSelect: (id: MainTab) => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={() => onSelect(id)}
      className={`min-w-0 flex-1 rounded-t-2xl border border-b-0 px-2 py-3 text-[10px] font-extrabold uppercase tracking-wide transition sm:px-4 sm:text-xs ${
        selected
          ? "relative z-[1] border-sky-800/25 bg-white/92 text-sky-800 shadow-[inset_0_2px_0_rgba(255,255,255,1),0_-4px_16px_rgba(14,165,233,0.08)]"
          : "border-transparent bg-slate-400/75 text-slate-700 shadow-[inset_0_-2px_0_rgba(0,0,0,0.08)] hover:bg-slate-400/90"
      } ${selected ? "" : "translate-y-px"}`}
    >
      <span
        className={`relative block ${selected ? "before:pointer-events-none before:absolute before:inset-x-1 before:top-0 before:h-[40%] before:rounded-b-[100%] before:bg-linear-to-b before:from-white/55 before:to-transparent" : ""}`}
      >
        {label}
      </span>
    </button>
  );
}

type PerfilDatos = {
  alumno: AlumnoRow | null;
  etiquetas: EtiquetasPersonalesRow | null;
  registro: VistaRegistroAlumno;
  comentarios: ComentarioRow[];
  puedeEditarEtiquetas: boolean;
  fotoPerfilUrl: string | null;
  /** FASE 2 — permisos efectivos calculados en el servidor. */
  acceso: AccesoAlumno | null;
  /** FASE 2 — etiquetas dinámicas (alumno_etiquetas). */
  etiquetasDinamicas: AlumnoEtiquetaRow[];
  /** FASE 2 — contacto del tutor principal (tutores + tutor_alumnos). */
  tutorContacto: {
    nombre: string;
    telefono: string | null;
    correo: string | null;
  } | null;
};

type Props = {
  materias: readonly MateriaConNombreVisible[];
  /** SOLO presentación; la autorización real vive en la Server Action. */
  modo: ModoPerfil;
  urlRegreso: string;
  datos: PerfilDatos;
};

export function PerfilClient({ materias, modo, urlRegreso, datos }: Props) {
  const {
    alumno,
    etiquetas,
    registro,
    comentarios,
    puedeEditarEtiquetas,
    fotoPerfilUrl,
    acceso,
    etiquetasDinamicas,
    tutorContacto,
  } = datos;
  const curp = alumno?.CURP ?? "";
  const nombreMostrar = alumno ? nombreCompletoAlumno(alumno) : "Nombre";
  const [tab, setTab] = useState<MainTab>("materia");
  const [materiaSub, setMateriaSub] = useState<MateriaSub>("asignaturas");
  const [materiaSeleccionada, setMateriaSeleccionada] = useState("");
  const [vistaMateria, setVistaMateria] = useState<MateriaTablaVista | null>(
    null,
  );
  // BLOQUE 9 (PIEZA 1) — pesos opcionales de la materia seleccionada para el
  // «Promedio calculado». null = feature apagada (no se muestra nada nuevo).
  const [pesosMateria, setPesosMateria] = useState<
    Record<string, number> | null
  >(null);
  const [comentarioPersonal, setComentarioPersonal] = useState(() =>
    comentarioPersonalDesdeFila(etiquetas),
  );
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string | null>(fotoPerfilUrl);
  const [fotoRota, setFotoRota] = useState(false);

  // FASE 2 — permisos desde el servidor (nunca se infieren de la UI).
  const puedeEditarDatosPersonales = acceso?.puedeEditarDatosPersonales ?? false;
  const puedeImportarEtiquetas = acceso?.puedeImportarEtiquetas ?? false;
  const puedeSubirFoto = acceso?.puedeSubirFoto ?? false;
  const sinAcceso = !acceso || !acceso.puedeLeer;

  // FASE 2 — campos personales DEFINIDOS (fuente: ETIQUETAS PERSONALES).
  // Edición disponible solo cuando `acceso.puedeEditarDatosPersonales` es
  // verdadero (tutor vinculado o directivo); alumno/maestro solo lectura.
  const [editandoDatos, setEditandoDatos] = useState(false);
  const [datosPersonales, setDatosPersonales] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        CAMPOS_PERSONALES_PRIMARIOS.map((c) => [
          c,
          String(etiquetas?.[c] ?? "").trim(),
        ]),
      ),
  );
  const [guardandoCampos, setGuardandoCampos] = useState(false);

  useEffect(() => {
    // Sincroniza la foto cuando cambia el payload (otro alumno / re-render).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFotoUrl(fotoPerfilUrl);
    setFotoRota(false);
  }, [fotoPerfilUrl]);

  useEffect(() => {
    // Sincroniza el comentario personal editable con el payload del alumno.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setComentarioPersonal(comentarioPersonalDesdeFila(etiquetas));
  }, [etiquetas]);

  useEffect(() => {
    // Sincroniza el formulario de datos personales al cambiar el alumno visto
    // (p. ej. el tutor cambia de hijo).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDatosPersonales(
      Object.fromEntries(
        CAMPOS_PERSONALES_PRIMARIOS.map((c) => [
          c,
          String(etiquetas?.[c] ?? "").trim(),
        ]),
      ),
    );
  }, [etiquetas]);

  const camposPersonales = useMemo(
    () => informacionPersonalDesdeEtiquetas(etiquetas),
    [etiquetas],
  );

  const etiquetaPorClave = useMemo(
    () => Object.fromEntries(camposPersonales.map((c) => [c.clave, c.etiqueta])),
    [camposPersonales],
  );

  const guardarCamposPersonales = async () => {
    if (!curp || !puedeEditarDatosPersonales) return;
    setGuardandoCampos(true);
    setMensaje(null);
    const r = await actionGuardarCamposPersonales(curp, datosPersonales);
    setGuardandoCampos(false);
    if (r.ok) {
      setMensaje("Datos personales guardados.");
      setEditandoDatos(false);
    } else {
      setMensaje(r.error);
    }
  };

  const guardarComentario = async () => {
    if (!curp || !puedeEditarDatosPersonales) return;
    setGuardando(true);
    setMensaje(null);
    const r = await actionGuardarComentarioPersonal(curp, comentarioPersonal);
    setGuardando(false);
    setMensaje(r.ok ? "Comentario guardado." : r.error);
  };

  const onFotoSeleccionada = async (file: File | undefined) => {
    if (!file || !puedeSubirFoto) return;
    setGuardando(true);
    setMensaje(null);
    const comprimida = await comprimirImagenSiPosible(file);
    const fd = new FormData();
    fd.set("archivo", comprimida);
    const r = await actionSubirFotoPerfil(fd, curp || null);
    setGuardando(false);
    if (r.ok) {
      setFotoUrl(r.url);
      setFotoRota(false);
    } else setMensaje(r.error);
  };

  const refrescarMateria = useCallback(async (nombre: string) => {
    const vista = await actionObtenerVistaMateria(nombre);
    setVistaMateria(vista);
  }, []);

  const refrescarPesos = useCallback(async (nombre: string) => {
    const mapeo = await actionObtenerMapeoColumnasMateria(nombre);
    setPesosMateria(mapeo?.pesosActividades ?? null);
  }, []);

  useEffect(() => {
    const primera = materias[0]?.idInterno ?? "";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMateriaSeleccionada((prev) =>
      prev && materias.some((m) => m.idInterno === prev) ? prev : primera,
    );
  }, [materias]);

  useEffect(() => {
    if (materiaSeleccionada) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void refrescarMateria(materiaSeleccionada);
      void refrescarPesos(materiaSeleccionada);
    }
  }, [materiaSeleccionada, refrescarMateria, refrescarPesos]);

  const tieneGrupo = Boolean(
    etiquetas?.GRADO?.trim() && etiquetas?.GRUPO?.trim(),
  );

  // Nombre visible de la materia seleccionada (solo presentación; las
  // acciones siguen usando `materiaSeleccionada` = idInterno real).
  const nombreVisibleSeleccionada =
    materias.find((m) => m.idInterno === materiaSeleccionada)?.nombreVisible ??
    materiaSeleccionada;

  if (sinAcceso) {
    return (
      <FrutigerBackdrop>
        <div className="relative z-10 mx-auto flex min-h-dvh max-w-5xl flex-col items-center justify-center px-4">
          <div className="w-full max-w-md rounded-3xl border border-red-200 bg-red-50/85 p-6 text-center shadow-[inset_0_2px_0_rgba(255,255,255,0.6)] backdrop-blur-md">
            <p className="text-sm font-extrabold uppercase tracking-wide text-red-800">
              Sin acceso
            </p>
            <p className="mt-2 text-xs font-semibold text-red-700">
              No tienes permiso para ver este perfil.
            </p>
            <Link
              href={urlRegreso}
              className="mt-4 inline-block rounded-full border border-red-300 bg-white px-5 py-2 text-[11px] font-extrabold uppercase tracking-wide text-red-800"
            >
              Regresar
            </Link>
          </div>
        </div>
      </FrutigerBackdrop>
    );
  }

  return (
    <FrutigerBackdrop>
      <div className="relative z-10 mx-auto flex min-h-dvh max-w-5xl flex-col px-4 pb-24 pt-6 sm:px-6 lg:max-w-6xl lg:px-8 lg:pt-8">
        {modo !== "alumno" && (
          <div
            className={`mb-4 flex flex-col items-center gap-3 rounded-2xl border px-4 py-3 text-center text-sm font-bold shadow-md ${
              modo === "directivo"
                ? "border-amber-400/60 bg-amber-100/90 text-amber-950"
                : modo === "tutor"
                  ? "border-sky-400/60 bg-sky-100/90 text-sky-950"
                  : "border-slate-400/60 bg-slate-100/90 text-slate-800"
            }`}
          >
            <p>
              {modo === "directivo"
                ? "Modo directivo"
                : modo === "tutor"
                  ? "Modo tutor"
                  : "Modo maestro"}
              {nombreMostrar !== "Nombre" ? `: ${nombreMostrar}` : ""} —{" "}
              {modo === "directivo"
                ? "administración completa (incluye importación de etiquetas)."
                : modo === "tutor"
                  ? "puedes editar las etiquetas y datos personales de este alumno."
                  : "consulta de solo lectura."}
            </p>
            <Link
              href={urlRegreso}
              className="rounded-full border border-current/30 bg-white/90 px-5 py-2 text-[11px] font-extrabold uppercase tracking-wide shadow-sm transition hover:bg-white"
            >
              {urlRegreso === "/directivo"
                ? "Regresar al panel directivo"
                : urlRegreso === "/tutor"
                  ? "Regresar al portal del tutor"
                  : urlRegreso === "/profesor"
                    ? "Regresar al panel del profesor"
                    : "Regresar a mi perfil"}
            </Link>
          </div>
        )}
        {/* Cabecera avatar + nombre */}
        <div className="mb-6 flex flex-col items-stretch gap-4 sm:mb-8 sm:flex-row sm:items-center">
          <div className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-[1.75rem] border-[3px] border-sky-900/70 bg-white/75 p-2 shadow-[0_10px_28px_rgba(14,165,233,0.2),inset_0_2px_0_rgba(255,255,255,0.95)] backdrop-blur-md sm:h-32 sm:w-32">
            <label
              className={`relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-linear-to-b from-sky-100/90 to-sky-300/50 ${puedeSubirFoto ? "cursor-pointer" : ""}`}
            >
              {fotoUrl && !fotoRota ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={fotoUrl}
                  alt=""
                  // FASE 7 (6A-2) — dimensiones explícitas del avatar
                  // (256 px es la transformación de Cloudinary; el CSS
                  // h-full w-full object-cover mantiene el encuadre).
                  width={256}
                  height={256}
                  className="h-full w-full object-cover"
                  onError={() => setFotoRota(true)}
                />
              ) : (
                <GlossyPersonIcon
                  uid={curp || "perfil-main"}
                  genero="masculino"
                  className="h-[82%] w-[82%] drop-shadow-[0_6px_12px_rgba(2,132,199,0.4)]"
                />
              )}
              <div
                className="pointer-events-none absolute inset-x-2 top-1 h-[40%] rounded-b-[100%] bg-linear-to-b from-white/60 to-transparent"
                aria-hidden
              />
              {puedeSubirFoto && (
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) =>
                    void onFotoSeleccionada(e.target.files?.[0])
                  }
                />
              )}
            </label>
          </div>

          <div className="flex min-h-[4.5rem] min-w-0 flex-1 items-stretch overflow-hidden rounded-full border-[3px] border-sky-900/70 bg-linear-to-r from-sky-900 via-sky-900 to-sky-900/90 shadow-[0_8px_24px_rgba(2,6,23,0.12)] backdrop-blur-sm sm:min-h-[5.5rem]">
            <div
              className="w-10 shrink-0 bg-sky-950 sm:w-12"
              aria-hidden
            />
            <div className="relative flex flex-1 items-center justify-center bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4">
              <span className="text-lg font-extrabold tracking-wide text-white drop-shadow-sm sm:text-xl">
                {nombreMostrar}
              </span>
              <div
                className="pointer-events-none absolute inset-x-6 top-1 h-[38%] rounded-b-[100%] bg-linear-to-b from-white/35 to-transparent"
                aria-hidden
              />
            </div>
          </div>
        </div>

        {mensaje && (
          <p className="mb-4 rounded-xl border border-sky-300/60 bg-white/90 px-4 py-2 text-center text-xs font-bold text-sky-900">
            {mensaje}
          </p>
        )}
        {/* Contenedor principal con pestañas */}
        <div className="relative flex flex-1 flex-col overflow-hidden rounded-[2rem] border-[3px] border-sky-800/50 bg-sky-100/35 p-3 shadow-[0_12px_40px_rgba(56,189,248,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl backdrop-saturate-150 sm:p-4">
          <div
            className="pointer-events-none absolute inset-0 z-0 rounded-[2rem] opacity-[0.12]"
            aria-hidden
            style={{
              backgroundImage: `radial-gradient(circle at 20% 30%, white 0%, transparent 45%), radial-gradient(circle at 80% 70%, #7dd3fc 0%, transparent 40%)`,
            }}
          />

          <div
            role="tablist"
            aria-label="Secciones del perfil"
            className="relative z-[1] flex gap-1 px-1 pt-1 sm:gap-2 sm:px-2"
          >
            <MainTabButton
              id="materia"
              label="Materia"
              selected={tab === "materia"}
              onSelect={setTab}
            />
            <MainTabButton
              id="estatus"
              label="Estatus"
              selected={tab === "estatus"}
              onSelect={setTab}
            />
            <MainTabButton
              id="comentarios"
              label="Comentarios"
              selected={tab === "comentarios"}
              onSelect={setTab}
            />
            <MainTabButton
              id="boleta"
              label="Boleta"
              selected={tab === "boleta"}
              onSelect={setTab}
            />
          </div>

          <div
            role="tabpanel"
            className="relative z-[1] mt-0 min-h-[280px] rounded-3xl rounded-tl-none border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md sm:min-h-[360px] sm:p-6 md:min-h-[400px]"
          >
            {tab === "materia" && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setMateriaSub("asignaturas")}
                      className={`rounded-full px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide ${
                        materiaSub === "asignaturas"
                          ? "border border-sky-800/30 bg-white/90 text-sky-900 shadow-md"
                          : "border border-white/50 bg-white/40 text-sky-800"
                      }`}
                    >
                      Vista materias
                    </button>
                    <button
                      type="button"
                      onClick={() => setMateriaSub("personal")}
                      className={`rounded-full px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide ${
                        materiaSub === "personal"
                          ? "border border-sky-800/30 bg-white/90 text-sky-900 shadow-md"
                          : "border border-white/50 bg-white/40 text-sky-800"
                      }`}
                    >
                      Información personal
                    </button>
                  </div>
                </div>

                {materiaSub === "asignaturas" ? (
                  !tieneGrupo || materias.length === 0 ? (
                    <div className="flex min-h-[220px] flex-1 items-center justify-center rounded-[1.5rem] border border-white/45 bg-slate-500/20 px-6 py-16 text-center text-sm font-semibold text-slate-700 shadow-[inset_0_3px_12px_rgba(0,0,0,0.06)] backdrop-blur-sm sm:min-h-[280px]">
                      <p className="max-w-md px-4">
                        {!tieneGrupo
                          ? "Sin inscripción activa en el catálogo. Cuando el directivo registre tu grado, grupo y carrera, verás aquí solo las materias de tu carrera."
                          : "No hay materias cargadas para tu grado, grupo y carrera."}
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4 lg:flex-row">
                      <MateriaSelector
                        materias={materias}
                        seleccionada={materiaSeleccionada}
                        onSeleccionar={setMateriaSeleccionada}
                        iniciarColapsado={materias.length > 30}
                        className="lg:w-80 lg:shrink-0"
                      />
                      <div className="flex min-h-[220px] flex-1 flex-col rounded-[1.5rem] border border-white/45 bg-slate-500/20 px-4 py-6 shadow-[inset_0_3px_12px_rgba(0,0,0,0.06)] backdrop-blur-sm sm:min-h-[280px]">
                        <MateriaCalificacionesAlumno
                          vista={vistaMateria}
                          materiaNombre={nombreVisibleSeleccionada}
                          pesosActividades={pesosMateria}
                        />
                      </div>
                    </div>
                  )
                ) : (
                  <div className="flex flex-col gap-4">
                    {/* Identidad y datos académicos (fuente: catálogo) — solo lectura. */}
                    <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
                      <p className="mb-2 text-center text-[10px] font-extrabold uppercase tracking-wide text-sky-900">
                        Identidad y datos académicos (catálogo)
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <BubblePill>Nombre: {nombreMostrar}</BubblePill>
                        {alumno?.CLAVE ? (
                          <BubblePill>Clave: {alumno.CLAVE}</BubblePill>
                        ) : null}
                        <BubblePill>CURP: {curp || "—"}</BubblePill>
                        {registro.grado || registro.grupo ? (
                          <BubblePill className="border-sky-500/50 bg-sky-100/90 font-extrabold">
                            {registro.grado} · Grupo {registro.grupo}
                            {registro.carrera ? ` · ${registro.carrera}` : ""}
                          </BubblePill>
                        ) : (
                          <BubblePill>Sin inscripción activa en el catálogo</BubblePill>
                        )}
                      </div>
                    </div>

                    {/* Datos personales definidos (campos estructurados, no etiquetas). */}
                    <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-center text-[10px] font-extrabold uppercase tracking-wide text-sky-900">
                          Datos personales
                        </p>
                        {puedeEditarDatosPersonales && !editandoDatos && (
                          <button
                            type="button"
                            onClick={() => setEditandoDatos(true)}
                            className="rounded-full border border-sky-800/40 bg-white/95 px-5 py-1.5 text-[11px] font-extrabold uppercase tracking-wide text-sky-900 shadow-sm hover:bg-white"
                          >
                            Editar
                          </button>
                        )}
                      </div>

                      {!puedeEditarDatosPersonales || !editandoDatos ? (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
                          {camposPersonales.map((c) => (
                            <BubblePill key={c.etiqueta} className="min-h-[2.75rem]">
                              {c.etiqueta}: {c.valor}
                            </BubblePill>
                          ))}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {CAMPOS_PERSONALES_PRIMARIOS.map((campo) => (
                            <label key={campo} className="flex flex-col gap-1">
                              <span className="text-[10px] font-extrabold uppercase tracking-wide text-sky-900">
                                {etiquetaPorClave[campo] ?? campo}
                              </span>
                              <input
                                type="text"
                                value={datosPersonales[campo] ?? ""}
                                onChange={(e) =>
                                  setDatosPersonales((prev) => ({
                                    ...prev,
                                    [campo]: e.target.value,
                                  }))
                                }
                                className="rounded-xl border border-white/70 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-inner outline-none focus:border-sky-600"
                              />
                            </label>
                          ))}
                        </div>
                      )}

                      {puedeEditarDatosPersonales && editandoDatos && (
                        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                          <button
                            type="button"
                            disabled={guardandoCampos}
                            onClick={() => void guardarCamposPersonales()}
                            className="rounded-full border border-sky-800/40 bg-white/95 px-6 py-2 text-[11px] font-extrabold uppercase tracking-wide text-sky-900 shadow-sm disabled:opacity-60"
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            disabled={guardandoCampos}
                            onClick={() => {
                              setEditandoDatos(false);
                              setDatosPersonales(
                                Object.fromEntries(
                                  CAMPOS_PERSONALES_PRIMARIOS.map((c) => [
                                    c,
                                    String(etiquetas?.[c] ?? "").trim(),
                                  ]),
                                ),
                              );
                            }}
                            className="rounded-full border border-white/70 bg-white/85 px-6 py-2 text-[11px] font-extrabold uppercase tracking-wide text-slate-700 hover:bg-white"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </div>
                    {/* Información del tutor (fuente de verdad: tutores + tutor_alumnos). */}
                    <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
                      <p className="mb-2 text-center text-[10px] font-extrabold uppercase tracking-wide text-sky-900">
                        Datos del tutor
                      </p>
                      {tutorContacto ? (
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <BubblePill>Tutor: {tutorContacto.nombre}</BubblePill>
                          <BubblePill>
                            Teléfono: {tutorContacto.telefono || "—"}
                          </BubblePill>
                          <BubblePill>
                            Correo: {tutorContacto.correo || "—"}
                          </BubblePill>
                        </div>
                      ) : (
                        <p className="text-center text-xs font-semibold text-slate-600">
                          Sin tutor vinculado.
                        </p>
                      )}
                    </div>

                    {/* Etiquetas dinámicas (módulo alumno_etiquetas). */}
                    <EtiquetasDinamicasPanel
                      curp={curp}
                      iniciales={etiquetasDinamicas}
                      puedeEditar={puedeEditarEtiquetas}
                      puedeImportar={puedeImportarEtiquetas}
                    />

                    <div className="flex flex-col gap-2">
                      <p className="text-center text-xs font-extrabold uppercase tracking-wide text-sky-900">
                        Comentario personal
                      </p>
                      <textarea
                        value={comentarioPersonal}
                        disabled={!puedeEditarDatosPersonales}
                        maxLength={COMENTARIO_MAX_LENGTH}
                        onChange={(e) =>
                          setComentarioPersonal(
                            e.target.value.slice(0, COMENTARIO_MAX_LENGTH),
                          )
                        }
                        rows={3}
                        className="w-full resize-none rounded-2xl border border-white/70 bg-white/95 px-4 py-3 text-sm font-semibold text-sky-900 disabled:opacity-70"
                        placeholder="Escribe algo sobre ti…"
                      />
                      <p className="text-right text-[10px] font-semibold text-slate-600">
                        {comentarioPersonal.length}/{COMENTARIO_MAX_LENGTH}
                      </p>
                      {puedeEditarDatosPersonales && (
                        <button
                          type="button"
                          disabled={guardando}
                          onClick={() => void guardarComentario()}
                          className="mx-auto rounded-full border border-sky-800/40 bg-white/95 px-6 py-2 text-[11px] font-extrabold uppercase tracking-wide text-sky-900 shadow-sm disabled:opacity-60"
                        >
                          Guardar comentario
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === "estatus" && (
              <div className="flex flex-col gap-4">
                <p className="text-center text-xs font-semibold text-slate-700">
                  Registro de calificaciones finales
                  {registro.nombreTabla ? ` — ${registro.nombreTabla}` : ""}
                </p>
                {(registro.grado || registro.grupo || registro.carrera) && (
                  <p className="text-center text-[11px] font-bold uppercase tracking-wide text-sky-900">
                    {registro.grado} · Grupo {registro.grupo}
                    {registro.carrera ? ` · ${registro.carrera}` : ""}
                  </p>
                )}
                {!tieneGrupo ? (
                  <p className="text-center text-sm font-semibold text-slate-600">
                    Sin inscripción activa en el catálogo. El estatus
                    aparecerá cuando el directivo registre grado, grupo y carrera.
                  </p>
                ) : (
                  <>
                    {registro.mensaje && (
                      <p className="text-center text-xs font-semibold text-amber-900">
                        {registro.mensaje}
                      </p>
                    )}
                    {registro.alumnoEncontrado &&
                      registro.filaAlumnoIndice >= 0 && (
                        <p className="text-center text-[10px] font-bold uppercase tracking-wide text-sky-800">
                          Debajo del encabezado: tu nombre y calificaciones por
                          parcial
                        </p>
                      )}
                    <MateriaTablaVistaPanel
                      vista={
                        registro.filas.length
                          ? {
                              encabezados: registro.encabezados,
                              filas: registro.filas,
                            }
                          : null
                      }
                      materiaNombre={
                        registro.nombreTabla ?? "Registro de calificaciones"
                      }
                      filaDestacada={registro.filaAlumnoIndice}
                    />
                  </>
                )}

                {/* Asistencia del alumno */}
                {tieneGrupo && curp && (
                  <div className="mt-2 flex flex-col gap-4 rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
                    <HorarioAlumnoResumen curp={curp} />
                    <CalendarioAsistenciaAlumno
                      curp={curp}
                      nombreAlumno={nombreMostrar}
                    />
                  </div>
                )}
              </div>
            )}

            {tab === "comentarios" && (
              <ul className="flex flex-col gap-4">
                {comentarios.length === 0 && (
                  <li className="text-center text-sm font-semibold text-slate-600">
                    Sin comentarios en COMENTARIOS.
                  </li>
                )}
                {comentarios.map((c, i) => (
                  <li key={`${c.CURP}-${i}`} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                    <span className="shrink-0 rounded-full border border-white/80 bg-white/95 px-4 py-2 text-center text-[11px] font-extrabold uppercase tracking-wide text-sky-800 sm:min-w-[8.5rem]">
                      Comentario
                    </span>
                    <div className="relative min-h-[3rem] flex-1 rounded-full border border-white/60 bg-slate-400/35 px-4 py-3 text-sm font-bold text-sky-900">
                      {c.COMENTARIO}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {tab === "boleta" && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col items-center gap-1 rounded-[1.5rem] border border-white/60 bg-white/80 px-4 py-4 text-center shadow-[inset_0_2px_0_rgba(255,255,255,0.95)] backdrop-blur-sm">
                  <p className="text-sm font-extrabold uppercase tracking-widest text-sky-950">
                    Boleta de calificaciones
                  </p>
                  <p className="text-xs font-bold uppercase tracking-wide text-sky-800">
                    {nombreMostrar}
                    {alumno?.CLAVE ? ` · Clave ${alumno.CLAVE}` : ""}
                  </p>
                  {(registro.grado || registro.grupo || registro.carrera) && (
                    <p className="text-[11px] font-bold uppercase tracking-wide text-sky-900">
                      {registro.grado} · Grupo {registro.grupo}
                      {registro.carrera ? ` · ${registro.carrera}` : ""}
                    </p>
                  )}
                </div>

                {!tieneGrupo ? (
                  <p className="text-center text-sm font-semibold text-slate-600">
                    Sin inscripción activa en el catálogo. La boleta
                    aparecerá cuando el directivo registre grado, grupo y carrera.
                  </p>
                ) : (
                  <>
                    {registro.mensaje && (
                      <p className="text-center text-xs font-semibold text-amber-900">
                        {registro.mensaje}
                      </p>
                    )}
                    {registro.alumnoEncontrado &&
                      registro.filaAlumnoIndice >= 0 && (
                        <p className="text-center text-[10px] font-bold uppercase tracking-wide text-sky-800">
                          Calificaciones finales del ciclo
                        </p>
                      )}
                    <MateriaTablaVistaPanel
                      vista={
                        registro.filas.length
                          ? {
                              encabezados: registro.encabezados,
                              filas: registro.filas,
                            }
                          : null
                      }
                      materiaNombre={
                        registro.nombreTabla ?? "Registro de calificaciones"
                      }
                      filaDestacada={registro.filaAlumnoIndice}
                    />
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </FrutigerBackdrop>
  );
}
