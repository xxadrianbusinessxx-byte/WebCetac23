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
import { identificarColumnaCalificacion } from "@/lib/escolar/materia/columnas-calificaciones";
import { normalizarNombre } from "@/lib/escolar/nombres";
import {
  aplicarMapeoAVista,
  detectarColisionesEncabezados,
  mapeoDesdeDeteccionAutomatica,
  toggleColumnaEnLista,
  validarMapeoColumnasMateria,
  type MapeoColumnasMateria,
} from "@/lib/escolar/materia/mapeo-columnas-materia";
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
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--oc-text)]">
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
                className={`flex cursor-pointer items-center gap-2 rounded-2xl border px-3 py-2 text-[11px] font-bold uppercase tracking-wide transition ${
                  deshabilitada
                    ? "cursor-not-allowed border-[var(--oc-border)] bg-[var(--oc-surface)] text-[var(--oc-muted)]"
                    : marcada
                      ? "border-[var(--oc-border-active)] bg-[var(--oc-input)] text-[var(--oc-text)]"
                      : "border-[var(--oc-border)] bg-[var(--oc-input)] text-[var(--oc-text)] hover:brightness-110"
                }`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--oc-mint)]"
                  checked={marcada}
                  disabled={deshabilitada}
                  onChange={() => onToggle(col)}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{col}</span>
                  {identificarColumnaCalificacion(col).etiqueta !== col && (
                    <span className="text-[9px] font-semibold normal-case tracking-normal text-[var(--oc-muted)]">
                      {identificarColumnaCalificacion(col).etiqueta}
                    </span>
                  )}
                </span>
                {deshabilitada && (
                  <span className="ml-auto text-[9px] font-semibold normal-case text-[var(--oc-muted)]">
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
      <label className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--oc-text)]">
        {titulo}
      </label>
      <select
        value={valorResuelto}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-3 py-2 text-[11px] font-bold text-[var(--oc-text)] outline-none focus:border-[var(--oc-border-active)]"
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

  // BLOQUE 9 (PIEZA 1) — Pesos OPCIONALES por actividad (promedio ponderado).
  // Si el profesor no toca este paso, `mapeo.pesosActividades` queda null
  // (feature apagada, comportamiento actual sin cambios).
  const sumaPesos = useMemo(() => {
    const pesos = mapeo.pesosActividades ?? {};
    return Object.values(pesos).reduce((a, b) => a + b, 0);
  }, [mapeo.pesosActividades]);

  const pesoInput = useCallback(
    (col: string): string => {
      const v = mapeo.pesosActividades?.[col];
      return v === undefined ? "" : String(v);
    },
    [mapeo.pesosActividades],
  );

  function setPesoActividad(col: string, valor: string) {
    setMapeo((m) => {
      const pesos = { ...(m.pesosActividades ?? {}) };
      const v = Number(valor.trim().replace(",", "."));
      if (valor.trim() === "" || !Number.isFinite(v)) {
        delete pesos[col];
      } else {
        pesos[col] = Math.min(100, Math.max(0, v));
      }
      return {
        ...m,
        pesosActividades: Object.keys(pesos).length > 0 ? pesos : null,
      };
    });
  }

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
    <div className="flex w-full flex-col gap-4 rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-4 sm:p-6">
      <p className="text-center text-sm font-extrabold uppercase tracking-widest text-[var(--oc-text)]">
        Configurar columnas del archivo
      </p>
      <p className="text-center text-xs font-semibold text-[var(--oc-muted)]">
        Archivo: {asistente.archivo.name} · Revisa que cada columna represente
        lo correcto antes de subir.
      </p>

      {/* MODO DE APLICACIÓN (BLOQUE 7C.2) */}
      <div className="flex flex-col gap-2 rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-4">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--oc-text)]">
          ¿Cómo se aplicará este archivo?
        </p>
        <label
          className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-2 transition ${
            modo === "actualizar"
              ? "border-[var(--oc-border-active)] bg-[var(--oc-input)] text-[var(--oc-text)]"
              : "border-[var(--oc-border)] bg-[var(--oc-input)] text-[var(--oc-text)] hover:brightness-110"
          }`}
        >
          <input
            type="radio"
            name="modo-avance"
            className="mt-1 h-4 w-4 accent-[var(--oc-mint)]"
            checked={modo === "actualizar"}
            onChange={() => setModo("actualizar")}
          />
          <span className="flex flex-col">
            <span className="text-[11px] font-extrabold uppercase tracking-wide">
              Actualizar / agregar avance
            </span>
            <span className="text-[10px] font-semibold normal-case text-[var(--oc-muted)]">
              Conserva todo lo existente y solo modifica/agrega lo que trae este
              archivo (recomendado para resubidas por avances).
            </span>
          </span>
        </label>
        <label
          className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-2 transition ${
            modo === "reemplazar"
              ? "border-[var(--oc-alert)]/60 bg-[var(--oc-alert)]/20 text-[var(--oc-alert-text)]"
              : "border-[var(--oc-border)] bg-[var(--oc-input)] text-[var(--oc-text)] hover:brightness-110"
          }`}
        >
          <input
            type="radio"
            name="modo-avance"
            className="mt-1 h-4 w-4 accent-[var(--oc-mint)]"
            checked={modo === "reemplazar"}
            onChange={() => setModo("reemplazar")}
          />
          <span className="flex flex-col">
            <span className="text-[11px] font-extrabold uppercase tracking-wide">
              Reemplazar completamente
            </span>
            <span className="text-[10px] font-semibold normal-case text-[var(--oc-muted)]">
              Borra el contenido actual de la materia y carga este archivo
              completo.
            </span>
          </span>
        </label>
      </div>

      {colisiones.length > 0 && (
        <div className="rounded-2xl border border-[var(--oc-alert)]/40 bg-[var(--oc-alert)]/15 px-4 py-3 text-[11px] font-semibold text-[var(--oc-alert-text)]">
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
      <div className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-4">
        <p className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-[var(--oc-text)]">
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
        <p className="mt-2 text-[10px] font-semibold text-[var(--oc-muted)]">
          Se unirán en el orden seleccionado para identificar al alumno. Puedes
          usar nombre, CURP o ambos. El sistema normaliza mayúsculas, espacios
          y acentos para encontrar al alumno correcto.
        </p>
      </div>

      {/* PASO 2 — CALIFICACIONES */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-4">
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
        <div className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-4">
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
        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-4">
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

      {/* PASO OPCIONAL — PESOS DE ACTIVIDADES (promedio ponderado) */}
      {mapeo.columnasActividades.length > 0 && (
        <div className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-4">
          <p className="mb-1 text-[10px] font-extrabold uppercase tracking-widest text-[var(--oc-text)]">
            Paso opcional · Pesos de actividades (promedio ponderado)
          </p>
          <p className="mb-3 text-[10px] font-semibold text-[var(--oc-muted)]">
            Asigna un porcentaje (0-100) a cada actividad para que el alumno vea
            un «Promedio calculado». Si lo dejas vacío no cambia nada (promedio
            ponderado desactivado). La suma no debe superar 100%.
          </p>
          <ul className="flex flex-col gap-1.5">
            {mapeo.columnasActividades.map((col) => (
              <li
                key={col}
                className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-3 py-2"
              >
                <span className="min-w-0 truncate text-[11px] font-bold uppercase tracking-wide text-[var(--oc-text)]">
                  {col}
                </span>
                <label className="flex shrink-0 items-center gap-1.5">
                  <span className="text-[10px] font-bold text-[var(--oc-muted)]">%</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.5"
                    value={pesoInput(col)}
                    onChange={(e) => setPesoActividad(col, e.target.value)}
                    placeholder="—"
                    className="w-20 rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-3 py-1.5 text-center text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] outline-none focus:border-[var(--oc-border-active)]"
                    aria-label={`Peso de la actividad ${col}`}
                  />
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] font-semibold text-[var(--oc-muted)]">
            Suma de pesos: {sumaPesos}%
            {sumaPesos > 100 && (
              <span className="ml-2 rounded-full border border-[var(--oc-alert)]/40 bg-[var(--oc-alert)]/15 px-2 py-0.5 text-[10px] font-extrabold text-[var(--oc-alert-text)]">
                No puede superar 100%
              </span>
            )}
            {sumaPesos > 0 && sumaPesos <= 100 && (
              <span className="ml-2 rounded-full border border-[var(--oc-ok)]/40 bg-[var(--oc-ok)]/15 px-2 py-0.5 text-[10px] font-extrabold text-[var(--oc-ok)]">
                Promedio ponderado activo
              </span>
            )}
          </p>
        </div>
      )}

      {/* PASO 3 — OCULTAR */}
      <div className="rounded-2xl border border-[var(--oc-alert)]/40 bg-[var(--oc-alert)]/15 p-4">
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
        <p className="mt-2 text-[10px] font-semibold text-[var(--oc-muted)]">
          Estas columnas NO se eliminan de Supabase. Solo se ocultan en la
          vista del alumno; profesor y directivo siguen viéndolas.
        </p>
      </div>

      {/* PASO 4 — VISTA PREVIA */}
      <div className="rounded-2xl border border-[var(--oc-ok)]/40 bg-[var(--oc-ok)]/15 p-4">
        <p className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-[var(--oc-text)]">
          Paso 4 · Así verá las calificaciones el alumno
        </p>
        <MateriaCalificacionesAlumno
          vista={vistaPreview}
          materiaNombre="Vista previa"
          pesosActividades={mapeo.pesosActividades}
        />
      </div>

      {!validacion.ok && (
        <ul className="rounded-2xl border border-[var(--oc-alert)]/40 bg-[var(--oc-alert)]/15 px-4 py-3 text-xs font-semibold text-[var(--oc-alert-text)]">
          {validacion.errores.map((e, i) => (
            <li key={i}>· {e}</li>
          ))}
        </ul>
      )}

      {mensaje && (
        <p
          role="status"
          className={`text-center text-xs font-semibold ${
            mensaje.ok ? "text-[var(--oc-text)]" : "text-[var(--oc-alert-text)]"
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
          className="rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-5 py-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] transition hover:brightness-110 disabled:opacity-60"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void confirmar()}
          disabled={!validacion.ok || guardando}
          className="rounded-full border border-transparent bg-[var(--oc-mint)] px-5 py-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-mint-ink)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {guardando
            ? "Guardando y subiendo…"
            : "Guardar configuración y subir archivo"}
        </button>
      </div>
    </div>
  );
}

