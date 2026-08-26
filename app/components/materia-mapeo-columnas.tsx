"use client";

import { useCallback, useMemo, useState } from "react";
import {
  actionGuardarMapeoColumnasMateria,
  actionObtenerMapeoColumnasMateria,
} from "@/app/actions/materias";
import {
  actionActualizarMateriaExcel,
  actionSubirMateriaExcel,
} from "@/app/actions/escolar";
import { archivoCsvAFilas } from "@/lib/escolar/csv";
import { identificarColumnaCalificacion } from "@/lib/escolar/columnas-calificaciones";
import { normalizarNombre } from "@/lib/escolar/nombres";
import {
  aplicarMapeoAVista,
  detectarColisionesEncabezados,
  mapeoDesdeDeteccionAutomatica,
  toggleColumnaEnLista,
  validarMapeoColumnasMateria,
  type MapeoColumnasMateria,
} from "@/lib/escolar/mapeo-columnas-materia";
import type { MateriaTablaVista } from "@/lib/escolar/types";
import { MateriaCalificacionesAlumno } from "./materia-calificaciones-alumno";

export type AsistenteMapeoColumnas = {
  idInterno: string;
  archivo: File;
  encabezados: string[];
  filasMuestra: string[][];
  mapeoInicial: MapeoColumnasMateria;
};

/**
 * Hook que orquesta el asistente de mapeo:
 *   - `abrir(archivo, idInterno)`: lee el archivo en el cliente (sin subir),
 *     extrae encabezados, pre-rellena el mapeo con la detección automática 7B
 *     (o la configuración guardada si existe) y abre el editor.
 *   - `cerrar()`: descarta el asistente sin subir nada.
 */
export function useMateriaMapeo() {
  const [asistente, setAsistente] = useState<AsistenteMapeoColumnas | null>(
    null,
  );

  const abrir = useCallback(async (archivo: File, idInterno: string) => {
    try {
      const { filas } = await archivoCsvAFilas(archivo);
      const encabezados = (filas[0] ?? []).map((h, i) =>
        h?.trim() ? h.trim() : `Col ${i + 1}`,
      );
      const filasMuestra = filas.slice(1, 4);
      const guardada = await actionObtenerMapeoColumnasMateria(idInterno);
      const mapeoInicial =
        guardada ?? mapeoDesdeDeteccionAutomatica(encabezados);
      setAsistente({ idInterno, archivo, encabezados, filasMuestra, mapeoInicial });
    } catch (e) {
      console.error("No se pudo leer el archivo para configurar columnas:", e);
    }
  }, []);

  const cerrar = useCallback(() => setAsistente(null), []);

  return { asistente, abrir, cerrar };
}

type Mensaje = { ok: boolean; texto: string } | null;

/** Rejilla de checkboxes para seleccionar columnas dentro de una categoría. */
function GrupoCheckboxes({
  titulo,
  columnas,
  seleccionadas,
  onToggle,
  deshabilitarSiUsada,
  usadaEn,
}: {
  titulo: string;
  columnas: readonly string[];
  seleccionadas: string[];
  onToggle: (col: string) => void;
  deshabilitarSiUsada: (col: string) => boolean;
  usadaEn: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-sky-900">
        {titulo}
      </p>
      <ul className="flex flex-col gap-1.5">
        {columnas.map((col) => {
          const marcada = seleccionadas.some(
            (c) => normalizarNombre(c) === normalizarNombre(col),
          );
          const deshabilitada = deshabilitarSiUsada(col);
          return (
            <li key={col}>
              <label
                className={`flex cursor-pointer items-center gap-2 rounded-2xl border px-3 py-2 text-[11px] font-bold uppercase tracking-wide shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition ${
                  deshabilitada
                    ? "cursor-not-allowed border-white/40 bg-white/30 text-slate-400"
                    : marcada
                      ? "border-sky-500/60 bg-sky-100/90 text-sky-900"
                      : "border-white/60 bg-white/70 text-sky-900 hover:bg-white/90"
                }`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-sky-600"
                  checked={marcada}
                  disabled={deshabilitada}
                  onChange={() => onToggle(col)}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{col}</span>
                  {identificarColumnaCalificacion(col).etiqueta !== col && (
                    <span className="text-[9px] font-semibold normal-case tracking-normal text-slate-500">
                      {identificarColumnaCalificacion(col).etiqueta}
                    </span>
                  )}
                </span>
                {deshabilitada && (
                  <span className="ml-auto text-[9px] font-semibold normal-case text-slate-400">
                    asignada a {usadaEn}
                  </span>
                )}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Select único para CURP / Promedio / Calificación final. */
function SelectColumna({
  titulo,
  valor,
  opciones,
  onChange,
}: {
  titulo: string;
  valor: string | null;
  opciones: readonly string[];
  onChange: (valor: string | null) => void;
}) {
  const valorResuelto =
    opciones.find((o) => normalizarNombre(o) === normalizarNombre(valor ?? "")) ??
    valor ??
    "";
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-extrabold uppercase tracking-widest text-sky-900">
        {titulo}
      </label>
      <select
        value={valorResuelto}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded-2xl border border-white/70 bg-white/90 px-3 py-2 text-[11px] font-bold text-sky-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] outline-none focus:ring-2 focus:ring-sky-400/50"
      >
        <option value="">(Ninguna)</option>
        {opciones.map((col) => {
          const etiqueta = identificarColumnaCalificacion(col).etiqueta;
          return (
            <option key={col} value={col}>
              {etiqueta !== col ? `${col} — ${etiqueta}` : col}
            </option>
          );
        })}
      </select>
    </div>
  );
}

/**
 * Asistente de configuración de columnas (BLOQUE 7C).
 * Flujo: leer encabezados → pre-rellenar → profesor ajusta → vista previa →
 * guardar configuración (UPSERT) → subir archivo con la cadena existente.
 */
export function MateriaMapeoColumnas({
  asistente,
  onCancelar,
  onCompletado,
}: {
  asistente: AsistenteMapeoColumnas;
  onCancelar: () => void;
  /** Recibe un detalle del resultado (p. ej. "Avance: 30 actualizados, 1 nuevo"). */
  onCompletado?: (detalle: string) => void;
}) {
  const [mapeo, setMapeo] = useState<MapeoColumnasMateria>(
    () => asistente.mapeoInicial,
  );
  const [modo, setModo] = useState<"actualizar" | "reemplazar">("actualizar");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<Mensaje>(null);

  const validacion = useMemo(
    () => validarMapeoColumnasMateria(mapeo, asistente.encabezados),
    [mapeo, asistente.encabezados],
  );

  const vistaPreview = useMemo(() => {
    const vista: MateriaTablaVista = {
      encabezados: asistente.encabezados,
      filas: asistente.filasMuestra,
    };
    return aplicarMapeoAVista(vista, mapeo, { rol: "alumno" });
  }, [mapeo, asistente.encabezados, asistente.filasMuestra]);

  const colisiones = useMemo(
    () => detectarColisionesEncabezados(asistente.encabezados),
    [asistente.encabezados],
  );

  const columnaUsadaEn = useCallback(
    (col: string, excluir: string): boolean => {
      const n = normalizarNombre(col);
      const listas: [string[], string][] = [
        [mapeo.columnasNombreAlumno, "Nombre del alumno"],
        [mapeo.columnasActividades, "Actividad"],
        [mapeo.columnasParciales, "Parcial"],
        [mapeo.columnasOcultas, "Oculta"],
      ];
      for (const [lista, nombre] of listas) {
        if (nombre === excluir) continue;
        if (lista.some((c) => normalizarNombre(c) === n)) return true;
      }
      if (excluir !== "CURP" && mapeo.columnaCurp && normalizarNombre(mapeo.columnaCurp) === n)
        return true;
      if (excluir !== "Promedio" && mapeo.columnaPromedio && normalizarNombre(mapeo.columnaPromedio) === n)
        return true;
      if (excluir !== "Calificación final" && mapeo.columnaFinal && normalizarNombre(mapeo.columnaFinal) === n)
        return true;
      return false;
    },
    [mapeo],
  );

  const columnasLibres = useCallback(
    (excluir: string): string[] =>
      asistente.encabezados.filter((col) => !columnaUsadaEn(col, excluir)),
    [asistente.encabezados, columnaUsadaEn],
  );

  async function confirmar() {
    if (!validacion.ok) {
      setMensaje({ ok: false, texto: "Revisa la configuración." });
      return;
    }
    setGuardando(true);
    setMensaje(null);

    // 1) Guardar configuración (metadatos, UPSERT).
    const r = await actionGuardarMapeoColumnasMateria(
      asistente.idInterno,
      mapeo,
      asistente.encabezados,
    );
    if (!r.ok) {
      setGuardando(false);
      setMensaje({ ok: false, texto: r.error });
      return;
    }

    // 2) Subir/actualizar el archivo según el modo elegido.
    const formData = new FormData();
    formData.set("archivo", asistente.archivo);

    if (modo === "actualizar") {
      const s = await actionActualizarMateriaExcel(
        asistente.idInterno,
        formData,
      );
      setGuardando(false);
      if (s.ok) {
        onCompletado?.(
          `Avance guardado: ${s.actualizados} actualizado(s), ${s.nuevos} nuevo(s), ${s.columnasAgregadas} columna(s) agregada(s).`,
        );
      } else {
        setMensaje({ ok: false, texto: s.error });
      }
      return;
    }

    const s = await actionSubirMateriaExcel(asistente.idInterno, formData);
    setGuardando(false);

    if (s.ok) {
      onCompletado?.(
        `Contenido reemplazado: ${s.filas} filas cargadas.`,
      );
    } else {
      setMensaje({ ok: false, texto: s.error });
    }
  }

  return (
    <div className="flex w-full flex-col gap-4 rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md sm:p-6">
      <p className="text-center text-sm font-extrabold uppercase tracking-widest text-sky-950">
        Configurar columnas del archivo
      </p>
      <p className="text-center text-xs font-semibold text-slate-600">
        Archivo: {asistente.archivo.name} · Revisa que cada columna represente
        lo correcto antes de subir.
      </p>

      {/* MODO DE APLICACIÓN (BLOQUE 7C.2) */}
      <div className="flex flex-col gap-2 rounded-3xl border border-white/55 bg-sky-100/40 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.6)] backdrop-blur-md">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-sky-900">
          ¿Cómo se aplicará este archivo?
        </p>
        <label
          className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-2 transition ${
            modo === "actualizar"
              ? "border-sky-500/60 bg-sky-100/90 text-sky-900"
              : "border-white/60 bg-white/60 text-sky-900 hover:bg-white/80"
          }`}
        >
          <input
            type="radio"
            name="modo-avance"
            className="mt-1 h-4 w-4 accent-sky-600"
            checked={modo === "actualizar"}
            onChange={() => setModo("actualizar")}
          />
          <span className="flex flex-col">
            <span className="text-[11px] font-extrabold uppercase tracking-wide">
              Actualizar / agregar avance
            </span>
            <span className="text-[10px] font-semibold normal-case text-slate-600">
              Conserva todo lo existente y solo modifica/agrega lo que trae este
              archivo (recomendado para resubidas por avances).
            </span>
          </span>
        </label>
        <label
          className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-2 transition ${
            modo === "reemplazar"
              ? "border-amber-500/60 bg-amber-100/90 text-amber-950"
              : "border-white/60 bg-white/60 text-sky-900 hover:bg-white/80"
          }`}
        >
          <input
            type="radio"
            name="modo-avance"
            className="mt-1 h-4 w-4 accent-amber-600"
            checked={modo === "reemplazar"}
            onChange={() => setModo("reemplazar")}
          />
          <span className="flex flex-col">
            <span className="text-[11px] font-extrabold uppercase tracking-wide">
              Reemplazar completamente
            </span>
            <span className="text-[10px] font-semibold normal-case text-slate-600">
              Borra el contenido actual de la materia y carga este archivo
              completo.
            </span>
          </span>
        </label>
      </div>

      {colisiones.length > 0 && (
        <div className="rounded-2xl border border-amber-400/60 bg-amber-100/80 px-4 py-3 text-[11px] font-semibold text-amber-950 shadow-[inset_0_2px_0_rgba(255,255,255,0.6)]">
          Estas columnas se diferencian únicamente por mayúsculas/tildes y
          pueden resultar ambiguas al mapearlas:{" "}
          {colisiones.map((c, i) => (
            <span key={c.normalizado}>
              {i > 0 ? ", " : ""}
              «{c.grupo.join("» / «")}»
            </span>
          ))}
          . No se fusionan: son columnas físicas distintas.
        </div>
      )}

      {/* PASO 1 — IDENTIFICACIÓN */}
      <div className="rounded-3xl border border-white/55 bg-sky-100/40 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.6)] backdrop-blur-md">
        <p className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-sky-900">
          Paso 1 · Identificación del alumno
        </p>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <GrupoCheckboxes
            titulo="Columnas que forman el nombre"
            columnas={asistente.encabezados}
            seleccionadas={mapeo.columnasNombreAlumno}
            onToggle={(col) =>
              setMapeo((m) => ({
                ...m,
                columnasNombreAlumno: toggleColumnaEnLista(m.columnasNombreAlumno, col),
              }))
            }
            deshabilitarSiUsada={(c) => columnaUsadaEn(c, "Nombre del alumno")}
            usadaEn="otra categoría"
          />
          <SelectColumna
            titulo="CURP"
            valor={mapeo.columnaCurp}
            opciones={columnasLibres("CURP")}
            onChange={(v) => setMapeo((m) => ({ ...m, columnaCurp: v }))}
          />
        </div>
        <p className="mt-2 text-[10px] font-semibold text-slate-600">
          Se unirán en el orden seleccionado para identificar al alumno. Puedes
          usar nombre, CURP o ambos. El sistema normaliza mayúsculas, espacios
          y acentos para encontrar al alumno correcto.
        </p>
      </div>

      {/* PASO 2 — CALIFICACIONES */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-white/55 bg-slate-100/30 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.6)] backdrop-blur-md">
          <GrupoCheckboxes
            titulo="Actividades"
            columnas={asistente.encabezados}
            seleccionadas={mapeo.columnasActividades}
            onToggle={(col) =>
              setMapeo((m) => ({
                ...m,
                columnasActividades: toggleColumnaEnLista(m.columnasActividades, col),
              }))
            }
            deshabilitarSiUsada={(c) => columnaUsadaEn(c, "Actividad")}
            usadaEn="otra categoría"
          />
        </div>
        <div className="rounded-3xl border border-white/55 bg-slate-100/30 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.6)] backdrop-blur-md">
          <GrupoCheckboxes
            titulo="Parciales / evaluaciones"
            columnas={asistente.encabezados}
            seleccionadas={mapeo.columnasParciales}
            onToggle={(col) =>
              setMapeo((m) => ({
                ...m,
                columnasParciales: toggleColumnaEnLista(m.columnasParciales, col),
              }))
            }
            deshabilitarSiUsada={(c) => columnaUsadaEn(c, "Parcial")}
            usadaEn="otra categoría"
          />
        </div>
        <div className="flex flex-col gap-3 rounded-3xl border border-white/55 bg-slate-100/30 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.6)] backdrop-blur-md">
          <SelectColumna
            titulo="Promedio"
            valor={mapeo.columnaPromedio}
            opciones={columnasLibres("Promedio")}
            onChange={(v) => setMapeo((m) => ({ ...m, columnaPromedio: v }))}
          />
          <SelectColumna
            titulo="Calificación final"
            valor={mapeo.columnaFinal}
            opciones={columnasLibres("Calificación final")}
            onChange={(v) => setMapeo((m) => ({ ...m, columnaFinal: v }))}
          />
        </div>
      </div>

      {/* PASO 3 — OCULTAR */}
      <div className="rounded-3xl border border-white/55 bg-amber-100/30 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.6)] backdrop-blur-md">
        <GrupoCheckboxes
          titulo="Columnas que no verá el alumno"
          columnas={asistente.encabezados}
          seleccionadas={mapeo.columnasOcultas}
          onToggle={(col) =>
            setMapeo((m) => ({
              ...m,
              columnasOcultas: toggleColumnaEnLista(m.columnasOcultas, col),
            }))
          }
          deshabilitarSiUsada={(c) => columnaUsadaEn(c, "Oculta")}
          usadaEn="otra categoría"
        />
        <p className="mt-2 text-[10px] font-semibold text-slate-600">
          Estas columnas NO se eliminan de Supabase. Solo se ocultan en la
          vista del alumno; profesor y directivo siguen viéndolas.
        </p>
      </div>

      {/* PASO 4 — VISTA PREVIA */}
      <div className="rounded-3xl border border-white/55 bg-emerald-100/30 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.6)] backdrop-blur-md">
        <p className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-sky-900">
          Paso 4 · Así verá las calificaciones el alumno
        </p>
        <MateriaCalificacionesAlumno
          vista={vistaPreview}
          materiaNombre="Vista previa"
        />
      </div>

      {!validacion.ok && (
        <ul className="rounded-2xl border border-red-300/60 bg-red-50/80 px-4 py-3 text-xs font-semibold text-red-800">
          {validacion.errores.map((e, i) => (
            <li key={i}>· {e}</li>
          ))}
        </ul>
      )}

      {mensaje && (
        <p
          role="status"
          className={`text-center text-xs font-semibold ${
            mensaje.ok ? "text-sky-900" : "text-red-700"
          }`}
        >
          {mensaje.texto}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancelar}
          disabled={guardando}
          className="rounded-full border border-white/60 bg-white/70 px-5 py-2 text-[11px] font-extrabold uppercase tracking-wide text-sky-800 transition hover:bg-white/90 disabled:opacity-60"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void confirmar()}
          disabled={!validacion.ok || guardando}
          className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-5 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {guardando
            ? "Guardando y subiendo…"
            : "Guardar configuración y subir archivo"}
        </button>
      </div>
    </div>
  );
}

