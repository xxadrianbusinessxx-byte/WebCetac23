"use client";

/**
 * roster-alumnos-panel.tsx — sincronización del roster de alumnos y carga
 * académica.
 *
 * EXTRAÍDO de `app/configuracion/configuracion-client.tsx` (Fase 9). Vivía
 * escrito en línea dentro de esas 938 líneas, y por eso el shell Océano no
 * podía ofrecerlo: no había componente que montar.
 *
 * ── Por qué roster y carga académica van JUNTOS ───────────────────────────
 * Parecen dos cosas y en el menú del diseño figuran por separado, pero
 * comparten el MISMO archivo subido y el MISMO mapeo de columnas: se sube un
 * CSV una vez, se dice qué columna es cada campo, y desde ahí se puede
 * sincronizar el roster o aplicar la pertenencia académica. Separarlos
 * obligaría a duplicar el estado del archivo o a levantarlo a un padre, y eso
 * cambia comportamiento. Van juntos porque son un solo flujo.
 *
 * La lógica NO cambió: mismas actions, mismo previsualizar→confirmar (el
 * preview no escribe), mismas validaciones. Solo cambia dónde vive y que su
 * envoltorio usa los tokens del tema oscuro.
 */
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
import type {
  PreviewCargaAcademica,
  ResultadoAplicarCarga,
} from "@/lib/escolar/catalogo/carga-academica";
import { archivoCsvAFilas } from "@/lib/escolar/csv";
import {
  detectarColumnasRoster,
  type CampoRoster,
  type MapeoRoster,
} from "@/lib/escolar/materia/mapeo-columnas";

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
      className={`rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
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
      className={`rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] sm:text-[11px] ${className}`}
    >
      {children}
    </span>
  );
}
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

export function RosterAlumnosPanel({ periodos }: { periodos: string[] }) {
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
        <div className="relative flex flex-1 flex-col gap-6 overflow-hidden rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-3 sm:p-4">
          <PanelTab className="mx-auto w-fit">
            Sincronizar roster de alumnos (solo agrega nuevos)
          </PanelTab>
          <div
            className="pointer-events-none absolute inset-0 z-0 rounded-2xl opacity-[0.12]"
            aria-hidden
            style={{
              backgroundImage: `radial-gradient(circle at 20% 30%, white 0%, transparent 45%), radial-gradient(circle at 80% 70%, #7dd3fc 0%, transparent 40%)`,
            }}
          />

          <div className="relative z-[1] flex flex-col gap-4">
            <div className="flex min-h-[120px] flex-col rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-4 sm:p-6">
              <p className="mb-3 text-center text-xs font-semibold text-[var(--oc-muted)]">
                Sube el archivo (CSV o Excel) con el roster completo de
                estudiantes. Debe incluir una columna{" "}
                <span className="font-extrabold text-[var(--oc-text)]">CURP</span> y,
                opcionalmente,{" "}
                <span className="font-extrabold text-[var(--oc-text)]">P_APELLIDO</span>,{" "}
                <span className="font-extrabold text-[var(--oc-text)]">S_APELLIDO</span> y{" "}
                <span className="font-extrabold text-[var(--oc-text)]">NOMBRE</span>.
                Solo se <span className="font-extrabold text-[var(--oc-ok)]">AGREGAN</span>{" "}
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
                    className={`text-xs font-semibold ${resultado?.ok ? "text-[var(--oc-text)]" : "text-[var(--oc-alert-text)]"}`}
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
              <div className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-4 sm:p-6">
                <p className="mb-3 text-center text-xs font-extrabold uppercase tracking-wide text-[var(--oc-text)]">
                  Mapeo de columnas
                </p>
                <p className="mb-4 text-center text-xs font-semibold text-[var(--oc-muted)]">
                  Confirma qué columna del archivo corresponde a cada campo. La
                  columna CURP es obligatoria.
                </p>
                <div className="flex flex-col gap-3">
                  {CAMPOS_ROSTER.map(({ campo, etiqueta }) => (
                    <label
                      key={campo}
                      className="flex flex-col gap-1 rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-input)] p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="text-xs font-extrabold uppercase tracking-wide text-[var(--oc-muted)]">
                        {etiqueta}
                        {campo === "curp" && (
                          <span className="ml-1 text-[var(--oc-alert-text)]">*</span>
                        )}
                      </span>
                      <select
                        value={mapeo[campo]}
                        onChange={(e) =>
                          onCambiarCampo(campo, Number(e.target.value))
                        }
                        className="rounded-xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-3 py-2 text-xs font-semibold text-[var(--oc-muted)] outline-none focus:border-[var(--oc-border)]"
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
                  <p className="mt-3 text-center text-xs font-bold text-[var(--oc-alert-text)]">
                    Asigna la columna CURP para poder sincronizar.
                  </p>
                )}

                {/* Preview real de las primeras filas del archivo */}
                {filasDatos.length > 0 && (
                  <div className="mt-4 rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-input)] p-3">
                    <p className="mb-2 text-center text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-text)]">
                      Vista previa del archivo ({filasDatos.length} fila(s) de
                      datos)
                    </p>
                    <div className="max-h-44 overflow-auto rounded-xl bg-[var(--oc-input)] p-2">
                      <table className="w-full text-left text-[11px] font-semibold text-[var(--oc-muted)]">
                        <thead>
                          <tr>
                            {encabezados.map((enc, i) => (
                              <th
                                key={i}
                                className="sticky top-0 bg-[var(--oc-surface)] px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-text)]"
                              >
                                {enc}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filasDatos.slice(0, 5).map((fila, fi) => (
                            <tr key={fi} className="border-t border-[var(--oc-border)]">
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
              <div className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-4 ">
                <p className="mb-2 text-center text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-text)]">
                  Previsualización (aún no se guarda nada)
                </p>
                <ul className="flex flex-col gap-1 text-sm font-semibold text-[var(--oc-text)]">
                  <li>➕ Se agregarán: {preview.agregados}</li>
                  <li>✏️ Se completarán campos vacíos: {preview.completados}</li>
                  <li>⏭️ Ya existentes (sin cambios): {preview.yaExistentesSinCambios}</li>
                  <li>⚠️ Omitidos: {preview.omitidos}</li>
                  <li>🔁 Duplicados en el archivo: {preview.duplicados}</li>
                </ul>
                {preview.completadosDetalle.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-extrabold uppercase tracking-wide text-[var(--oc-text)]">
                      Ver detalle de campos a completar
                    </summary>
                    <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto rounded-xl bg-[var(--oc-input)] p-2 text-xs font-semibold text-[var(--oc-muted)]">
                      {preview.completadosDetalle.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {preview.omitidosDetalle.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-extrabold uppercase tracking-wide text-[var(--oc-text)]">
                      Ver detalle de omitidos
                    </summary>
                    <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto rounded-xl bg-[var(--oc-input)] p-2 text-xs font-semibold text-[var(--oc-muted)]">
                      {preview.omitidosDetalle.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}

            {resultado?.ok && (
              <div className="rounded-2xl border border-[var(--oc-ok)]/50 bg-[var(--oc-ok)]/15 p-4 ">
                <p className="mb-2 text-center text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-ok)]">
                  Resumen de la sincronización
                </p>
                <ul className="flex flex-col gap-1 text-sm font-semibold text-[var(--oc-ok)]">
                  <li>✅ Alumnos agregados: {resultado.agregados}</li>
                  <li>✏️ Campos completados en existentes: {resultado.completados}</li>
                  <li>⏭️ Ya existentes (sin cambios): {resultado.yaExistentesSinCambios}</li>
                  <li>⚠️ Omitidos: {resultado.omitidos}</li>
                  <li>🔁 Duplicados en el archivo: {resultado.duplicados}</li>
                </ul>
                {resultado.completadosDetalle.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-extrabold uppercase tracking-wide text-[var(--oc-ok)]">
                      Ver detalle de campos completados
                    </summary>
                    <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto rounded-xl bg-[var(--oc-input)] p-2 text-xs font-semibold text-[var(--oc-muted)]">
                      {resultado.completadosDetalle.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {resultado.omitidosDetalle.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-extrabold uppercase tracking-wide text-[var(--oc-ok)]">
                      Ver detalle de omitidos
                    </summary>
                    <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto rounded-xl bg-[var(--oc-input)] p-2 text-xs font-semibold text-[var(--oc-muted)]">
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
              <div className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-4 sm:p-6">
                <p className="mb-3 text-center text-xs font-extrabold uppercase tracking-wide text-[var(--oc-text)]">
                  Carga académica (pertenencia opcional)
                </p>
                <p className="mb-3 text-center text-xs font-semibold text-[var(--oc-muted)]">
                  Si el archivo incluye columnas GRADO/GRUPO/CARRERA, asígnalas en
                  el mapeo de arriba. Si no las incluye, selecciona el contexto
                  académico (periodo + grado + grupo) que se aplicará a las filas.
                </p>

                {/* Contexto académico */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <label className="flex flex-col gap-1 rounded-xl border border-[var(--oc-border)] bg-[var(--oc-input)] p-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-muted)]">
                      Periodo *
                    </span>
                    <select
                      value={contexto.periodoNombre}
                      onChange={(e) =>
                        setContexto((p) => ({ ...p, periodoNombre: e.target.value }))
                      }
                      className="rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] px-2 py-1 text-xs font-semibold text-[var(--oc-muted)]"
                    >
                      <option value="">— Seleccionar —</option>
                      {periodos.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 rounded-xl border border-[var(--oc-border)] bg-[var(--oc-input)] p-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-muted)]">
                      Grado
                    </span>
                    <input
                      value={contexto.grado}
                      onChange={(e) =>
                        setContexto((p) => ({ ...p, grado: e.target.value }))
                      }
                      placeholder="ej. 2DO"
                      className="rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] px-2 py-1 text-xs font-semibold text-[var(--oc-muted)]"
                    />
                  </label>
                  <label className="flex flex-col gap-1 rounded-xl border border-[var(--oc-border)] bg-[var(--oc-input)] p-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-muted)]">
                      Grupo
                    </span>
                    <input
                      value={contexto.grupo}
                      onChange={(e) =>
                        setContexto((p) => ({ ...p, grupo: e.target.value }))
                      }
                      placeholder="ej. A"
                      className="rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] px-2 py-1 text-xs font-semibold text-[var(--oc-muted)]"
                    />
                  </label>
                  <label className="flex flex-col gap-1 rounded-xl border border-[var(--oc-border)] bg-[var(--oc-input)] p-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-muted)]">
                      Carrera
                    </span>
                    <input
                      value={contexto.carrera}
                      onChange={(e) =>
                        setContexto((p) => ({ ...p, carrera: e.target.value }))
                      }
                      placeholder="ej. RH (opcional)"
                      className="rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] px-2 py-1 text-xs font-semibold text-[var(--oc-muted)]"
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
                  <div className="mt-4 rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-input)] p-3">
                    {previewAcademica.ok ? (
                      <>
                        <p className="mb-2 text-center text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-text)]">
                          Resumen — periodo {previewAcademica.periodoUtilizado ?? "—"}
                        </p>
                        <div className="grid gap-2 text-xs font-semibold text-[var(--oc-muted)] sm:grid-cols-2">
                          <div className="rounded-xl bg-[var(--oc-surface)] p-2">
                            <p className="font-extrabold text-[var(--oc-text)]">ALUMNOS</p>
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
                          <div className="rounded-xl bg-[var(--oc-surface)] p-2">
                            <p className="font-extrabold text-[var(--oc-text)]">ACADÉMICO</p>
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
                          <div className="mt-3 rounded-xl border border-[var(--oc-alert)]/40 bg-[var(--oc-alert)]/15 p-2">
                            <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-alert-text)]">
                              Cambios de grupo ({previewAcademica.academico.cambiosDeGrupo}) —
                              conservan historial
                            </p>
                            <ul className="max-h-32 overflow-y-auto text-xs font-semibold text-[var(--oc-alert-text)]">
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
                          <p className="mt-3 text-center text-xs font-extrabold text-[var(--oc-alert-text)]">
                            ⛔ La carga tiene estados que bloquean la escritura (ambiguos,
                            grupos inexistentes o conflictos). No se aplicará nada.
                          </p>
                        )}
                        <label className="mt-3 flex items-start gap-2 rounded-xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-2 text-xs font-semibold text-[var(--oc-muted)]">
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
                          <div className="mt-3 rounded-2xl border border-[var(--oc-ok)]/50 bg-[var(--oc-ok)]/15 p-3">
                            {resultadoAcademica.ok ? (
                              <>
                                <p className="mb-1 text-center text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-ok)]">
                                  Carga académica aplicada
                                </p>
                                <ul className="text-xs font-semibold text-[var(--oc-ok)]">
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
                              <p className="text-center text-xs font-bold text-[var(--oc-alert-text)]">
                                {resultadoAcademica.error}
                              </p>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-center text-xs font-bold text-[var(--oc-alert-text)]">
                        {previewAcademica.error}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
  );
}
