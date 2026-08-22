"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import {
  actionPrevisualizarSincronizacionAlumnos,
  actionSincronizarAlumnosDesdeArchivo,
} from "@/app/actions/escolar";

import type { PortalSessionPayload } from "@/lib/auth/types";
import { archivoCsvAFilas } from "@/lib/escolar/csv";
import {
  detectarColumnasRoster,
  type CampoRoster,
  type MapeoRoster,
} from "@/lib/escolar/mapeo-columnas";

import { CalendarioEscolarPanel } from "../components/calendario-escolar-panel";
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

type Props = {
  sesion: PortalSessionPayload | null;
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
];

export function ConfiguracionClient({ sesion }: Props) {
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


  return (
    <FrutigerBackdrop>
      <div className="relative z-10 mx-auto flex min-h-dvh max-w-5xl flex-col px-4 pb-24 pt-6 sm:px-6 lg:max-w-6xl lg:px-8 lg:pt-8">
        <div className="mb-6 flex h-14 items-center justify-center gap-3 rounded-full border-[3px] border-sky-800/55 bg-sky-200/45 px-3 py-2 shadow-[0_8px_28px_rgba(56,189,248,0.18),inset_0_1px_0_rgba(255,255,255,0.85)] backdrop-blur-xl backdrop-saturate-150 sm:mb-8 sm:h-16 sm:justify-between sm:px-6">
          <GlossyNavPill href="/directivo">Directivo</GlossyNavPill>
          <GlossyNavPill href="/documentos">Documentos</GlossyNavPill>
          <GlossyNavPill href="/chat?origen=directivo">Chat</GlossyNavPill>
          <GlossyNavPill href="/configuracion" active>
            Configuración
          </GlossyNavPill>
        </div>

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

          </div>
        </div>

        {/* Calendario escolar */}
        <CalendarioEscolarPanel />
      </div>
    </FrutigerBackdrop>
  );
}


