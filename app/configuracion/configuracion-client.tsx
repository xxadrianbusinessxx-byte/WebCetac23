"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import {
  actionPrevisualizarSincronizacionAlumnos,
  actionSincronizarAlumnosDesdeArchivo,
} from "@/app/actions/escolar";
import {
  actionAplicarCargaAcademica,
  actionPrevisualizarCargaAcademica,
} from "@/app/actions/carga-academica";
import { actionImportarEtiquetasGlobal } from "@/app/actions/etiquetas-dinamicas";
import type {
  PreviewCargaAcademica,
  ResultadoAplicarCarga,
} from "@/lib/escolar/carga-academica";

import type { PortalSessionPayload } from "@/lib/auth/types";
import { archivoCsvAFilas } from "@/lib/escolar/csv";
import {
  detectarColumnasRoster,
  type CampoRoster,
  type MapeoRoster,
} from "@/lib/escolar/mapeo-columnas";

import { CalendarioEscolarPanel } from "../components/calendario-escolar-panel";
import { CicloEvaluacionesAdmin } from "../components/ciclo-evaluaciones-admin";
import { ContextoAcademicoPanel } from "../components/contexto-academico-panel";
import { HorarioEscolarPanel } from "../components/horario-escolar-panel";
import { FrutigerBackdrop } from "../components/frutiger-backdrop";
import { GlossyPersonIcon } from "../components/glossy-person-icon";
import { TutoresPanel } from "../components/tutores-panel";


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

type Props = {
  sesion: PortalSessionPayload | null;
  /** Periodos activos disponibles para el contexto académico de la carga. */
  periodos: string[];
};

type Resultado =
  | {
      ok: true;
      agregados: number;
      completados: number;
      yaExistentesSinCambios: number;
      omitidos: number;
      omitidosDetalle: string[];
      duplicados: number;
      completadosDetalle: string[];
    }
  | { ok: false; error: string };


const CAMPOS_ROSTER: { campo: CampoRoster; etiqueta: string }[] = [
  { campo: "curp", etiqueta: "CURP" },
  { campo: "pApellido", etiqueta: "Apellido paterno" },
  { campo: "sApellido", etiqueta: "Apellido materno" },
  { campo: "nombre", etiqueta: "Nombre(s)" },
  { campo: "grado", etiqueta: "Grado (opcional)" },
  { campo: "grupo", etiqueta: "Grupo (opcional)" },
  { campo: "carrera", etiqueta: "Carrera (opcional)" },
];

export function ConfiguracionClient({ sesion, periodos }: Props) {
  const nombre = sesion?.nombre ?? sesion?.matricula ?? "Directivo";
  const [archivo, setArchivo] = useState<File | null>(null);
  const [encabezados, setEncabezados] = useState<string[]>([]);
  const [filasDatos, setFilasDatos] = useState<string[][]>([]);
  const [mapeo, setMapeo] = useState<MapeoRoster | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [previsualizando, setPrevisualizando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [preview, setPreview] = useState<Resultado | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // --- Carga académica (C3.1) ---
  const [contexto, setContexto] = useState({ periodoNombre: "", grado: "", grupo: "", carrera: "" });
  const [previewAcademica, setPreviewAcademica] = useState<PreviewCargaAcademica | null>(null);
  const [resultadoAcademica, setResultadoAcademica] = useState<ResultadoAplicarCarga | null>(null);
  const [previsualizandoAcademica, setPrevisualizandoAcademica] = useState(false);
  const [aplicandoAcademica, setAplicandoAcademica] = useState(false);
  const [confirmadoAcademica, setConfirmadoAcademica] = useState(false);

  // --- Importación masiva de etiquetas (FASE 2, solo directivo) ---
  type ResumenImportacionEtiquetas = {
    procesados: number;
    actualizados: number;
    omitidos: number;
    alumnosNoEncontrados: string[];
    errores: string[];
    duplicadosCurp: string[];
  };
  const [archivoEtiquetas, setArchivoEtiquetas] = useState<File | null>(null);
  const [importandoEtiquetas, setImportandoEtiquetas] = useState(false);
  const [resumenEtiquetas, setResumenEtiquetas] =
    useState<ResumenImportacionEtiquetas | null>(null);
  const [errorEtiquetas, setErrorEtiquetas] = useState<string | null>(null);

  async function onImportarEtiquetas() {
    if (!archivoEtiquetas) {
      setErrorEtiquetas("Selecciona un archivo Excel.");
      return;
    }
    setImportandoEtiquetas(true);
    setErrorEtiquetas(null);
    setResumenEtiquetas(null);
    const fd = new FormData();
    fd.set("archivo", archivoEtiquetas);
    const r = await actionImportarEtiquetasGlobal(fd);
    setImportandoEtiquetas(false);
    if (r.ok) setResumenEtiquetas(r.resumen);
    else setErrorEtiquetas(r.error);
  }

  async function onArchivoElegido(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setResultado(null);
    setPreview(null);
    setMensaje(null);
    setMapeo(null);
    setEncabezados([]);
    setFilasDatos([]);
    event.target.value = "";

    if (!file) {
      setArchivo(null);
      return;
    }

    setArchivo(file);
    setMensaje(`Leyendo «${file.name}»…`);

    try {
      const parsed = await archivoCsvAFilas(file);
      const filas = parsed.filas.filter((fila) =>
        fila.some((c) => (c ?? "").trim() !== ""),
      );
      if (filas.length < 1) {
        setMensaje("El archivo está vacío o no se pudo leer.");
        return;
      }
      const head = filas[0].map((h, i) => (h ?? "").trim() || `Col ${i + 1}`);
      setEncabezados(head);
      setFilasDatos(filas.slice(1));
      const detectado = detectarColumnasRoster(head);
      setMapeo(detectado);
      setMensaje(
        `Archivo listo: ${file.name}. Revisa el mapeo de columnas y previsualiza antes de sincronizar.`,
      );
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "No se pudo leer el archivo.";
      setMensaje(msg);
    }
  }


  function onCambiarCampo(campo: CampoRoster, indice: number) {
    if (!mapeo) return;
    setMapeo((prev) => {
      if (!prev) return prev;
      const siguiente: MapeoRoster = { ...prev, [campo]: indice };
      // Evitar que dos campos usen la misma columna.
      for (const c of CAMPOS_ROSTER.map((x) => x.campo)) {
        if (c === campo) continue;
        if (siguiente[c] === indice) siguiente[c] = -1;
      }
      return siguiente;
    });
  }

  function mapeoCompleto(): boolean {
    if (!mapeo) return false;
    return mapeo.curp >= 0;
  }

  async function onPrevisualizar() {
    if (!archivo) return;
    if (!mapeo || !mapeoCompleto()) {
      setMensaje("Asigna la columna CURP antes de previsualizar.");
      return;
    }
    setPrevisualizando(true);
    setMensaje(null);
    setPreview(null);
    const fd = new FormData();
    fd.set("archivo", archivo);
    fd.set("mapeo", JSON.stringify(mapeo));
    const res = await actionPrevisualizarSincronizacionAlumnos(fd);
    setPrevisualizando(false);
    if (res.ok) {
      setPreview(res);
      setMensaje(
        "Previsualización lista. Revisa el resumen y confirma para sincronizar.",
      );
    } else {
      setPreview(res);
      setMensaje(res.error);
    }
  }

  async function onSincronizar() {
    if (!archivo) {
      inputRef.current?.click();
      return;
    }
    if (!mapeo || !mapeoCompleto()) {
      setMensaje("Asigna la columna CURP antes de sincronizar.");
      return;
    }
    setSincronizando(true);
    setMensaje(null);
    setResultado(null);
    setPreview(null);
    const fd = new FormData();
    fd.set("archivo", archivo);
    fd.set("mapeo", JSON.stringify(mapeo));
    const res = await actionSincronizarAlumnosDesdeArchivo(fd);
    setSincronizando(false);
    if (res.ok) {
      setResultado(res);
      setMensaje(
        `Sincronización completada: ${res.agregados} alumno(s) agregado(s).`,
      );
      setArchivo(null);
      setMapeo(null);
      setEncabezados([]);
      setFilasDatos([]);
    } else {
      setResultado(res);
      setMensaje(res.error);
    }
  }


  // --- Carga académica (C3.1): preview y aplicación ---

  async function onPrevisualizarAcademica() {
    if (!archivo) return;
    if (!mapeo || !mapeoCompleto()) {
      setMensaje("Asigna la columna CURP antes de previsualizar la carga académica.");
      return;
    }
    if (!contexto.periodoNombre.trim()) {
      setMensaje("Selecciona un periodo para la carga académica.");
      return;
    }
    setPrevisualizandoAcademica(true);
    setPreviewAcademica(null);
    setResultadoAcademica(null);
    setConfirmadoAcademica(false);
    setMensaje(null);
    const fd = new FormData();
    fd.set("archivo", archivo);
    fd.set("mapeo", JSON.stringify(mapeo));
    fd.set("periodoNombre", contexto.periodoNombre.trim());
    if (contexto.grado.trim()) fd.set("grado", contexto.grado.trim());
    if (contexto.grupo.trim()) fd.set("grupo", contexto.grupo.trim());
    if (contexto.carrera.trim()) fd.set("carrera", contexto.carrera.trim());
    const res = await actionPrevisualizarCargaAcademica(fd);
    setPrevisualizandoAcademica(false);
    setPreviewAcademica(res);
  }

  async function onAplicarAcademica() {
    if (!archivo || !previewAcademica?.ok) return;
    if (!confirmadoAcademica) {
      setMensaje("Confirma explícitamente antes de aplicar la carga académica.");
      return;
    }
    if (previewAcademica.bloqueaEscritura) {
      setMensaje("La carga tiene estados que bloquean la escritura. No se aplicará nada.");
      return;
    }
    setAplicandoAcademica(true);
    setResultadoAcademica(null);
    const fd = new FormData();
    fd.set("archivo", archivo);
    fd.set("mapeo", JSON.stringify(previewAcademica.mapeo));
    fd.set("periodoNombre", contexto.periodoNombre.trim());
    if (contexto.grado.trim()) fd.set("grado", contexto.grado.trim());
    if (contexto.grupo.trim()) fd.set("grupo", contexto.grupo.trim());
    if (contexto.carrera.trim()) fd.set("carrera", contexto.carrera.trim());
    const res = await actionAplicarCargaAcademica(fd);
    setAplicandoAcademica(false);
    setResultadoAcademica(res);
    setConfirmadoAcademica(false);
  }


  return (
    <FrutigerBackdrop>
      <div className="relative z-10 mx-auto flex min-h-dvh max-w-5xl flex-col px-4 pb-24 pt-6 sm:px-6 lg:max-w-6xl lg:px-8 lg:pt-8">
        <div className="mb-6 flex flex-col items-stretch gap-4 sm:mb-8 sm:flex-row sm:items-center">
          <div className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-[1.75rem] border-[3px] border-sky-900/70 bg-white/75 p-2 shadow-[0_10px_28px_rgba(14,165,233,0.2),inset_0_2px_0_rgba(255,255,255,0.95)] backdrop-blur-md sm:h-32 sm:w-32">
            <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-linear-to-b from-sky-100/90 to-sky-300/50">
              <GlossyPersonIcon
                uid="configuracion-main"
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

        {/* Sincronización del roster de alumnos */}
        <div className="relative flex flex-1 flex-col gap-6 overflow-hidden rounded-[2rem] border-[3px] border-sky-800/50 bg-sky-100/35 p-3 shadow-[0_12px_40px_rgba(56,189,248,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl backdrop-saturate-150 sm:p-4">
          <PanelTab className="mx-auto w-fit">
            Sincronizar roster de alumnos (solo agrega nuevos)
          </PanelTab>
          <div
            className="pointer-events-none absolute inset-0 z-0 rounded-[2rem] opacity-[0.12]"
            aria-hidden
            style={{
              backgroundImage: `radial-gradient(circle at 20% 30%, white 0%, transparent 45%), radial-gradient(circle at 80% 70%, #7dd3fc 0%, transparent 40%)`,
            }}
          />

          <div className="relative z-[1] flex flex-col gap-4">
            <div className="flex min-h-[120px] flex-col rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md sm:p-6">
              <p className="mb-3 text-center text-xs font-semibold text-slate-700">
                Sube el archivo (CSV o Excel) con el roster completo de
                estudiantes. Debe incluir una columna{" "}
                <span className="font-extrabold text-sky-900">CURP</span> y,
                opcionalmente,{" "}
                <span className="font-extrabold text-sky-900">P_APELLIDO</span>,{" "}
                <span className="font-extrabold text-sky-900">S_APELLIDO</span> y{" "}
                <span className="font-extrabold text-sky-900">NOMBRE</span>.
                Solo se <span className="font-extrabold text-emerald-700">AGREGAN</span>{" "}
                alumnos cuyo CURP aún no exista; no se borra ni reemplaza nada.
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <GreyActionPill
                  onClick={onSincronizar}
                  className={sincronizando ? "opacity-70" : ""}
                >
                  {sincronizando
                    ? "Sincronizando…"
                    : archivo
                      ? "Sincronizar y agregar"
                      : "Cargar archivo de alumnos"}
                </GreyActionPill>
                {mensaje && (
                  <p
                    className={`text-xs font-semibold ${resultado?.ok ? "text-sky-900" : "text-red-700"}`}
                    role="status"
                  >
                    {mensaje}
                  </p>
                )}
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv"
                className="sr-only"
                onChange={onArchivoElegido}
                aria-label="Seleccionar archivo del roster de alumnos"
              />
            </div>

            {/* Etapa de mapeo de columnas */}
            {archivo && encabezados.length > 0 && mapeo && (
              <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md sm:p-6">
                <p className="mb-3 text-center text-xs font-extrabold uppercase tracking-wide text-sky-900">
                  Mapeo de columnas
                </p>
                <p className="mb-4 text-center text-xs font-semibold text-slate-700">
                  Confirma qué columna del archivo corresponde a cada campo. La
                  columna CURP es obligatoria.
                </p>
                <div className="flex flex-col gap-3">
                  {CAMPOS_ROSTER.map(({ campo, etiqueta }) => (
                    <label
                      key={campo}
                      className="flex flex-col gap-1 rounded-2xl border border-white/50 bg-white/50 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="text-xs font-extrabold uppercase tracking-wide text-slate-700">
                        {etiqueta}
                        {campo === "curp" && (
                          <span className="ml-1 text-red-600">*</span>
                        )}
                      </span>
                      <select
                        value={mapeo[campo]}
                        onChange={(e) =>
                          onCambiarCampo(campo, Number(e.target.value))
                        }
                        className="rounded-xl border border-sky-800/40 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-inner outline-none focus:border-sky-600"
                      >
                        <option value={-1}>— No usar —</option>
                        {encabezados.map((enc, i) => (
                          <option key={i} value={i}>
                            {enc}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                {!mapeoCompleto() && (
                  <p className="mt-3 text-center text-xs font-bold text-red-700">
                    Asigna la columna CURP para poder sincronizar.
                  </p>
                )}

                {/* Preview real de las primeras filas del archivo */}
                {filasDatos.length > 0 && (
                  <div className="mt-4 rounded-2xl border border-white/50 bg-white/50 p-3">
                    <p className="mb-2 text-center text-[10px] font-extrabold uppercase tracking-wide text-sky-900">
                      Vista previa del archivo ({filasDatos.length} fila(s) de
                      datos)
                    </p>
                    <div className="max-h-44 overflow-auto rounded-xl bg-white/70 p-2">
                      <table className="w-full text-left text-[11px] font-semibold text-slate-700">
                        <thead>
                          <tr>
                            {encabezados.map((enc, i) => (
                              <th
                                key={i}
                                className="sticky top-0 bg-sky-100 px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-sky-900"
                              >
                                {enc}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filasDatos.slice(0, 5).map((fila, fi) => (
                            <tr key={fi} className="border-t border-sky-100">
                              {encabezados.map((_, ci) => (
                                <td key={ci} className="px-2 py-1">
                                  {fila[ci] ?? ""}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-center">
                  <GreyActionPill
                    onClick={onPrevisualizar}
                    disabled={!mapeoCompleto() || previsualizando}
                    className={previsualizando ? "opacity-70" : ""}
                  >
                    {previsualizando
                      ? "Previsualizando…"
                      : "Previsualizar resultado"}
                  </GreyActionPill>
                </div>
              </div>
            )}


            {/* Preview del resultado (antes de confirmar) */}
            {preview?.ok && (
              <div className="rounded-3xl border border-sky-400/50 bg-sky-100/70 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.6)] backdrop-blur-md">
                <p className="mb-2 text-center text-[10px] font-extrabold uppercase tracking-wide text-sky-900">
                  Previsualización (aún no se guarda nada)
                </p>
                <ul className="flex flex-col gap-1 text-sm font-semibold text-sky-900">
                  <li>➕ Se agregarán: {preview.agregados}</li>
                  <li>✏️ Se completarán campos vacíos: {preview.completados}</li>
                  <li>⏭️ Ya existentes (sin cambios): {preview.yaExistentesSinCambios}</li>
                  <li>⚠️ Omitidos: {preview.omitidos}</li>
                  <li>🔁 Duplicados en el archivo: {preview.duplicados}</li>
                </ul>
                {preview.completadosDetalle.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-extrabold uppercase tracking-wide text-sky-900">
                      Ver detalle de campos a completar
                    </summary>
                    <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto rounded-xl bg-white/60 p-2 text-xs font-semibold text-slate-700">
                      {preview.completadosDetalle.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {preview.omitidosDetalle.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-extrabold uppercase tracking-wide text-sky-900">
                      Ver detalle de omitidos
                    </summary>
                    <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto rounded-xl bg-white/60 p-2 text-xs font-semibold text-slate-700">
                      {preview.omitidosDetalle.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}

            {resultado?.ok && (
              <div className="rounded-3xl border border-emerald-400/50 bg-emerald-100/70 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.6)] backdrop-blur-md">
                <p className="mb-2 text-center text-[10px] font-extrabold uppercase tracking-wide text-emerald-800">
                  Resumen de la sincronización
                </p>
                <ul className="flex flex-col gap-1 text-sm font-semibold text-emerald-900">
                  <li>✅ Alumnos agregados: {resultado.agregados}</li>
                  <li>✏️ Campos completados en existentes: {resultado.completados}</li>
                  <li>⏭️ Ya existentes (sin cambios): {resultado.yaExistentesSinCambios}</li>
                  <li>⚠️ Omitidos: {resultado.omitidos}</li>
                  <li>🔁 Duplicados en el archivo: {resultado.duplicados}</li>
                </ul>
                {resultado.completadosDetalle.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-extrabold uppercase tracking-wide text-emerald-800">
                      Ver detalle de campos completados
                    </summary>
                    <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto rounded-xl bg-white/60 p-2 text-xs font-semibold text-slate-700">
                      {resultado.completadosDetalle.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {resultado.omitidosDetalle.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-extrabold uppercase tracking-wide text-emerald-800">
                      Ver detalle de omitidos
                    </summary>
                    <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto rounded-xl bg-white/60 p-2 text-xs font-semibold text-slate-700">
                      {resultado.omitidosDetalle.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}

            {/* Carga académica (C3.1) — ALUMNOS + PERTENENCIA */}
            {archivo && mapeo && (
              <div className="rounded-3xl border border-violet-400/50 bg-violet-100/60 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.6)] backdrop-blur-md sm:p-6">
                <p className="mb-3 text-center text-xs font-extrabold uppercase tracking-wide text-violet-900">
                  Carga académica (pertenencia opcional)
                </p>
                <p className="mb-3 text-center text-xs font-semibold text-slate-700">
                  Si el archivo incluye columnas GRADO/GRUPO/CARRERA, asígnalas en
                  el mapeo de arriba. Si no las incluye, selecciona el contexto
                  académico (periodo + grado + grupo) que se aplicará a las filas.
                </p>

                {/* Contexto académico */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <label className="flex flex-col gap-1 rounded-xl border border-white/50 bg-white/50 p-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-600">
                      Periodo *
                    </span>
                    <select
                      value={contexto.periodoNombre}
                      onChange={(e) =>
                        setContexto((p) => ({ ...p, periodoNombre: e.target.value }))
                      }
                      className="rounded-lg border border-violet-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800"
                    >
                      <option value="">— Seleccionar —</option>
                      {periodos.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 rounded-xl border border-white/50 bg-white/50 p-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-600">
                      Grado
                    </span>
                    <input
                      value={contexto.grado}
                      onChange={(e) =>
                        setContexto((p) => ({ ...p, grado: e.target.value }))
                      }
                      placeholder="ej. 2DO"
                      className="rounded-lg border border-violet-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800"
                    />
                  </label>
                  <label className="flex flex-col gap-1 rounded-xl border border-white/50 bg-white/50 p-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-600">
                      Grupo
                    </span>
                    <input
                      value={contexto.grupo}
                      onChange={(e) =>
                        setContexto((p) => ({ ...p, grupo: e.target.value }))
                      }
                      placeholder="ej. A"
                      className="rounded-lg border border-violet-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800"
                    />
                  </label>
                  <label className="flex flex-col gap-1 rounded-xl border border-white/50 bg-white/50 p-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-600">
                      Carrera
                    </span>
                    <input
                      value={contexto.carrera}
                      onChange={(e) =>
                        setContexto((p) => ({ ...p, carrera: e.target.value }))
                      }
                      placeholder="ej. RH (opcional)"
                      className="rounded-lg border border-violet-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800"
                    />
                  </label>
                </div>

                <div className="mt-3 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
                  <GreyActionPill
                    onClick={onPrevisualizarAcademica}
                    disabled={
                      !mapeoCompleto() ||
                      previsualizandoAcademica ||
                      !contexto.periodoNombre.trim()
                    }
                    className={previsualizandoAcademica ? "opacity-70" : ""}
                  >
                    {previsualizandoAcademica
                      ? "Previsualizando…"
                      : "Previsualizar carga académica"}
                  </GreyActionPill>
                </div>

                {/* Resultado de la preview académica */}
                {previewAcademica && (
                  <div className="mt-4 rounded-2xl border border-white/50 bg-white/55 p-3">
                    {previewAcademica.ok ? (
                      <>
                        <p className="mb-2 text-center text-[10px] font-extrabold uppercase tracking-wide text-sky-900">
                          Resumen — periodo {previewAcademica.periodoUtilizado ?? "—"}
                        </p>
                        <div className="grid gap-2 text-xs font-semibold text-slate-700 sm:grid-cols-2">
                          <div className="rounded-xl bg-sky-50 p-2">
                            <p className="font-extrabold text-sky-900">ALUMNOS</p>
                            <ul>
                              <li>Filas: {previewAcademica.alumnos.totalFilas}</li>
                              <li>
                                CURP válidas: {previewAcademica.alumnos.curpsValidas} ·
                                ausentes: {previewAcademica.alumnos.curpsAusentes} ·
                                duplicadas: {previewAcademica.alumnos.curpsDuplicadas}
                              </li>
                              <li>
                                Nuevos: {previewAcademica.alumnos.alumnosNuevos} ·
                                existentes: {previewAcademica.alumnos.alumnosExistentes} ·
                                sin cambios: {previewAcademica.alumnos.alumnosSinCambios} ·
                                completan campos: {previewAcademica.alumnos.camposCompletados}
                              </li>
                            </ul>
                          </div>
                          <div className="rounded-xl bg-violet-50 p-2">
                            <p className="font-extrabold text-violet-900">ACADÉMICO</p>
                            <ul>
                              <li>
                                Nuevas inscripciones: {previewAcademica.academico.nuevasInscripciones} ·
                                sin cambio: {previewAcademica.academico.sinCambio}
                              </li>
                              <li>
                                Cambios de grupo: {previewAcademica.academico.cambiosDeGrupo} ·
                                sin datos académicos: {previewAcademica.academico.sinDatosAcademicos}
                              </li>
                              <li>
                                Grupos inexistentes: {previewAcademica.academico.gruposInexistentes} ·
                                ambiguos: {previewAcademica.academico.ambiguos} ·
                                conflictos: {previewAcademica.academico.conflictosAcademicos}
                              </li>
                            </ul>
                          </div>
                        </div>

                        {previewAcademica.detalle.filter((d) => d.estado === "CAMBIO_DE_GRUPO").length > 0 && (
                          <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-2">
                            <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wide text-amber-800">
                              Cambios de grupo ({previewAcademica.academico.cambiosDeGrupo}) —
                              conservan historial
                            </p>
                            <ul className="max-h-32 overflow-y-auto text-xs font-semibold text-amber-900">
                              {previewAcademica.detalle
                                .filter((d) => d.estado === "CAMBIO_DE_GRUPO")
                                .slice(0, 40)
                                .map((d) => (
                                  <li key={d.curp}>
                                    {d.curp} → {d.gradoNormalizado} {d.grupoNormalizado}{" "}
                                    {d.carreraNormalizada || "(sin carrera)"}
                                    {d.grupoActualId ? ` (actual: ${d.grupoActualId.slice(0, 8)}…)` : ""}
                                  </li>
                                ))}
                            </ul>
                          </div>
                        )}
                        {previewAcademica.bloqueaEscritura && (
                          <p className="mt-3 text-center text-xs font-extrabold text-red-700">
                            ⛔ La carga tiene estados que bloquean la escritura (ambiguos,
                            grupos inexistentes o conflictos). No se aplicará nada.
                          </p>
                        )}
                        <label className="mt-3 flex items-start gap-2 rounded-xl border border-sky-300 bg-sky-50 p-2 text-xs font-semibold text-slate-700">
                          <input
                            type="checkbox"
                            checked={confirmadoAcademica}
                            onChange={(e) => setConfirmadoAcademica(e.target.checked)}
                            className="mt-0.5"
                          />
                          Confirmo que revisé la previsualización y autorizo aplicar
                          (ALUMNOS + inscripciones válidas). Los cambios de grupo
                          conservan historial; no se elimina nada.
                        </label>
                        <div className="mt-3 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
                          <GreyActionPill
                            onClick={onAplicarAcademica}
                            disabled={
                              !previewAcademica.ok ||
                              previewAcademica.bloqueaEscritura ||
                              !confirmadoAcademica ||
                              aplicandoAcademica
                            }
                            className={aplicandoAcademica ? "opacity-70" : ""}
                          >
                            {aplicandoAcademica ? "Aplicando…" : "Confirmar y aplicar"}
                          </GreyActionPill>
                        </div>
                        {resultadoAcademica && (
                          <div className="mt-3 rounded-2xl border border-emerald-400/50 bg-emerald-100/70 p-3">
                            {resultadoAcademica.ok ? (
                              <>
                                <p className="mb-1 text-center text-[10px] font-extrabold uppercase tracking-wide text-emerald-800">
                                  Carga académica aplicada
                                </p>
                                <ul className="text-xs font-semibold text-emerald-900">
                                  <li>
                                    Alumnos: +{resultadoAcademica.alumnos.agregados} ·
                                    completados {resultadoAcademica.alumnos.completados} ·
                                    omitidos {resultadoAcademica.alumnos.omitidos}
                                  </li>
                                  <li>
                                    Inscripciones nuevas: {resultadoAcademica.inscripciones.nuevas} ·
                                    cambios de grupo: {resultadoAcademica.inscripciones.cambiosDeGrupo} ·
                                    errores: {resultadoAcademica.inscripciones.errores}
                                  </li>
                                </ul>
                              </>
                            ) : (
                              <p className="text-center text-xs font-bold text-red-700">
                                {resultadoAcademica.error}
                              </p>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-center text-xs font-bold text-red-700">
                        {previewAcademica.error}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>

        {/* Horario escolar (FASE HORARIO) */}
        <HorarioEscolarPanel />

        {/* Ciclo escolar y periodos de evaluación (FASE CICLO) */}
        <CicloEvaluacionesAdmin />

        {/* Contexto académico del ciclo (grupos y materias) */}
        <ContextoAcademicoPanel />

        {/* Calendario escolar */}
        <CalendarioEscolarPanel />

        {/* Tutores / Padres */}
        <TutoresPanel />

        {/* Importación masiva de etiquetas (FASE 2, solo directivo) */}
        <section
          className="relative mt-6 overflow-hidden rounded-[2rem] border-[3px] border-emerald-800/50 bg-emerald-100/35 p-3 shadow-[0_12px_40px_rgba(16,185,129,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl backdrop-saturate-150 sm:p-4"
          aria-label="Importar etiquetas personales en masa"
        >
          <div className="relative z-[1] flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-emerald-900">
                Importar etiquetas personales (masivo)
              </h2>
              <PanelTab className="mx-auto w-fit">
                Excel con CURP + columnas de etiquetas
              </PanelTab>
            </div>

            <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md sm:p-6">
              <p className="mb-3 text-center text-xs font-semibold text-slate-700">
                Sube un archivo{" "}
                <span className="font-extrabold text-emerald-800">
                  Excel (.xlsx / .xls)
                </span>{" "}
                con una columna{" "}
                <span className="font-extrabold text-emerald-800">CURP</span> y,
                en el resto de columnas, los títulos de etiquetas (ej.
                «Deporte», «Pasatiempo»). Cada fila reemplaza el conjunto de
                etiquetas de ese alumno. Los errores por fila no detienen el
                archivo.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => {
                    setArchivoEtiquetas(e.target.files?.[0] ?? null);
                    setErrorEtiquetas(null);
                    setResumenEtiquetas(null);
                  }}
                  aria-label="Seleccionar Excel de etiquetas"
                  className="max-w-xs rounded-xl border border-white/70 bg-white/90 px-3 py-2 text-xs font-semibold text-slate-800 shadow-inner outline-none"
                />
                <GreyActionPill
                  onClick={() => void onImportarEtiquetas()}
                  disabled={importandoEtiquetas || !archivoEtiquetas}
                  className={importandoEtiquetas ? "opacity-70" : ""}
                >
                  {importandoEtiquetas ? "Importando…" : "Importar etiquetas"}
                </GreyActionPill>
              </div>

              {errorEtiquetas && (
                <p
                  className="mt-3 text-center text-xs font-semibold text-red-700"
                  role="alert"
                >
                  {errorEtiquetas}
                </p>
              )}

              {resumenEtiquetas && (
                <div className="mt-3 rounded-2xl border border-emerald-400/50 bg-emerald-100/70 p-3">
                  <p className="mb-2 text-center text-[10px] font-extrabold uppercase tracking-wide text-emerald-800">
                    Resumen de la importación
                  </p>
                  <ul className="flex flex-col gap-1 text-xs font-semibold text-emerald-900">
                    <li>✅ Alumnos procesados: {resumenEtiquetas.procesados}</li>
                    <li>✏️ Actualizados: {resumenEtiquetas.actualizados}</li>
                    <li>⏭️ Omitidos: {resumenEtiquetas.omitidos}</li>
                    {resumenEtiquetas.alumnosNoEncontrados.length > 0 && (
                      <li className="text-red-700">
                        No encontrados: {resumenEtiquetas.alumnosNoEncontrados.length} —{" "}
                        {resumenEtiquetas.alumnosNoEncontrados.slice(0, 10).join(", ")}
                        {resumenEtiquetas.alumnosNoEncontrados.length > 10 ? "…" : ""}
                      </li>
                    )}
                    {resumenEtiquetas.duplicadosCurp.length > 0 && (
                      <li className="text-amber-700">
                        CURP duplicadas en el archivo:{" "}
                        {resumenEtiquetas.duplicadosCurp.length}
                      </li>
                    )}
                    {resumenEtiquetas.errores.length > 0 && (
                      <li className="text-red-700">
                        Errores: {resumenEtiquetas.errores.length}
                      </li>
                    )}
                  </ul>
                  {resumenEtiquetas.errores.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[10px] font-extrabold uppercase tracking-wide text-emerald-800">
                        Ver errores
                      </summary>
                      <ul className="mt-1 max-h-32 overflow-y-auto rounded-xl bg-white/60 p-2 text-[11px] font-semibold text-slate-700">
                        {resumenEtiquetas.errores.slice(0, 40).map((e, i) => (
                          <li key={i}>{e}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </FrutigerBackdrop>
  );
}


