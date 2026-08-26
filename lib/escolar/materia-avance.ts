/**
 * ACTUALIZACIÓN INCREMENTAL DE CALIFICACIONES — BLOQUE 7C.2
 *
 * Operación «Actualizar / agregar avance»: permite al profesor subir un
 * Excel PARCIAL que:
 *   - modifica SOLO las columnas presentes en el archivo;
 *   - conserva las columnas ausentes (NO elimina);
 *   - actualiza alumnos existentes (CURP / nombre normalizado) sin duplicar;
 *   - agrega alumnos nuevos;
 *   - conserva alumnos ausentes.
 *
 * PRINCIPIO:
 *   La cadena de escritura existente (reemplazo completo) NO se toca. Esta
 *   capa es un flujo NUEVO y separado, con funciones PURAS (testeables) y una
 *   función de persistencia que recibe el cliente Supabase.
 *
 * FÍSICO vs NORMALIZADO:
 *   Se respeta la separación de 7C.1: el nombre físico exacto manda; la
 *   normalización solo se usa para comparar (p. ej. no crear «Calificación
 *   final» si ya existe «CALIFICACION FINAL»).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { filaCoincideAlumno, type CriterioAlumnoEnFila } from "./buscar-en-filas";
import { archivoCsvAFilas } from "./csv";
import { matrizAFilasDirectas } from "./excel-a-registros";
import { obtenerMapeoColumnasMateria } from "./mapeo-columnas-materia";
import { normalizarNombre } from "./nombres";

export type FilaExistente = Record<string, unknown>;
export type FilaAvance = Record<string, string>;

export type PlanificacionAvance = {
  /** id de la fila existente → columnas a actualizar (solo las del avance). */
  updates: { id: string | number; columnas: Record<string, string> }[];
  /** Filas de alumnos nuevos (incluyen alumno_nombre + columnas del avance). */
  inserts: Record<string, string>[];
  alumnosActualizados: number;
  alumnosNuevos: number;
};

function filaExistenteACeldas(fila: FilaExistente): string[] {
  return Object.values(fila).map((v) =>
    v == null ? "" : String(v).trim(),
  );
}

/**
 * Resuelve un encabezado del avance a la columna física EXISTENTE de la tabla:
 *   1) coincidencia exacta;
 *   2) si no, coincidencia normalizada ÚNICA → usa la física existente
 *      (evita crear «Calificación final» si existe «CALIFICACION FINAL»);
 *   3) si no hay (o es ambigua) → devuelve el encabezado tal cual
 *      (se creará como columna nueva por `escolar_agregar_columnas`).
 */
export function resolverEncabezadoAColumnaExistente(
  encabezado: string,
  columnasTabla: readonly string[],
): string {
  const exacta = columnasTabla.find((c) => c === encabezado);
  if (exacta) return exacta;

  const n = normalizarNombre(encabezado);
  const unicas = columnasTabla.filter((c) => normalizarNombre(c) === n);
  return unicas.length === 1 ? unicas[0]! : encabezado;
}

/**
 * Columnas del avance que NO existen (ni exacta ni normalizada única) en la
 * tabla actual → deben agregarse con `escolar_agregar_columnas`.
 */
export function columnasFaltantes(
  columnasTabla: readonly string[],
  encabezadosAvance: readonly string[],
): string[] {
  const faltantes: string[] = [];
  for (const h of encabezadosAvance) {
    const resuelta = resolverEncabezadoAColumnaExistente(h, columnasTabla);
    if (resuelta !== h) continue; // ya existe (exacta o normalizada única)
    if (columnasTabla.includes(h)) continue; // exacta
    faltantes.push(h);
  }
  return faltantes;
}

/**
 * Planifica la actualización incremental (pura):
 *   - para cada fila del avance localiza al alumno en las filas existentes
 *     usando la lógica de `buscar-en-filas` (CURP primero, nombre normalizado);
 *   - si existe → UPDATE (solo las columnas presentes en el avance);
 *   - si no existe → INSERT (alumno nuevo).
 * Los alumnos y columnas que no aparecen en el avance NO se tocan.
 * Varias filas del MISMO alumno en el avance se fusionan (nunca se duplican).
 */
export function planificarActualizacionAvance(
  filasExistentes: readonly FilaExistente[],
  filasAvance: readonly Record<string, string>[],
  columnaCurp: string | null,
): PlanificacionAvance {
  const updatePorIndice = new Map<number, Record<string, string>>();
  const insertPorNombre = new Map<string, Record<string, string>>();

  for (const filaAvance of filasAvance) {
    const criterio: CriterioAlumnoEnFila = {
      curp: columnaCurp ? (filaAvance[columnaCurp] ?? "") || null : null,
      nombreCompleto: filaAvance.alumno_nombre ?? "",
    };

    let idx = -1;
    for (let i = 0; i < filasExistentes.length; i++) {
      if (filaCoincideAlumno(filaExistenteACeldas(filasExistentes[i]!), criterio)) {
        idx = i;
        break;
      }
    }

    const columnas: Record<string, string> = {};
    for (const [k, v] of Object.entries(filaAvance)) {
      if (k === "alumno_nombre") continue;
      columnas[k] = v;
    }

    if (idx >= 0) {
      // Alumno existente: fusiona en su UPDATE (varias filas del mismo alumno
      // en el avance → un solo UPDATE; la última gana). Nunca se duplica.
      const previas = updatePorIndice.get(idx) ?? {};
      updatePorIndice.set(idx, { ...previas, ...columnas });
    } else {
      // Alumno nuevo: fusionar por nombre normalizado para no duplicar.
      const key = normalizarNombre(filaAvance.alumno_nombre ?? "");
      const previas = insertPorNombre.get(key) ?? {};
      insertPorNombre.set(key, { ...previas, ...filaAvance });
    }
  }

  const updates: { id: string | number; columnas: Record<string, string> }[] = [];
  for (const [idx, columnas] of updatePorIndice.entries()) {
    const id = filasExistentes[idx]!.id;
    if (typeof id === "string" || typeof id === "number") {
      updates.push({ id, columnas });
    }
  }
  const inserts = [...insertPorNombre.values()];

  return {
    updates,
    inserts,
    alumnosActualizados: updates.length,
    alumnosNuevos: inserts.length,
  };
}

export type ResultadoActualizacionMateria =
  | {
      ok: true;
      actualizados: number;
      nuevos: number;
      columnasAgregadas: number;
    }
  | { ok: false; error: string };

/** Renombra las claves de una fila según el mapa encabezado→físico. */
function remapearClaves(
  fila: Record<string, string>,
  mapa: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fila)) {
    out[mapa[k] ?? k] = v;
  }
  return out;
}

/** Columnas físicas conocidas = unión de las claves de las filas existentes. */
function columnasUnion(filas: readonly FilaExistente[]): string[] {
  const set = new Set<string>();
  for (const f of filas) {
    for (const k of Object.keys(f)) set.add(k);
  }
  return [...set];
}

/**
 * Modo «Actualizar / agregar avance» (BLOQUE 7C.2):
 *   - agrega SOLO las columnas faltantes (RPC `escolar_agregar_columnas`);
 *   - actualiza filas existentes (localiza por CURP/nombre normalizado);
 *   - inserta alumnos nuevos;
 *   - conserva columnas y alumnos que no aparecen en el archivo.
 *
 * NO modifica la cadena de reemplazo completo (actionSubirMateriaExcel).
 */
export async function actualizarMateriaDesdeArchivo(
  supabase: SupabaseClient,
  idInterno: string,
  file: File,
): Promise<ResultadoActualizacionMateria> {
  try {
    const { filas } = await archivoCsvAFilas(file);
    const { columnasSupabase, filas: filasDirectas } =
      matrizAFilasDirectas(filas);
    if (!filasDirectas.length) {
      return { ok: false, error: "No hay filas de datos en el archivo." };
    }

    const tabla = idInterno.trim();

    // 1) Filas existentes y columnas físicas conocidas.
    const { data: existentes, error: errEx } = await supabase
      .from(tabla)
      .select("*");
    if (errEx) return { ok: false, error: errEx.message };
    const filasExistentes = (existentes ?? []) as FilaExistente[];

    // 2) Agregar solo columnas faltantes (sin eliminar ninguna).
    const columnasTabla = columnasUnion(filasExistentes);
    const faltantes = columnasFaltantes(columnasTabla, columnasSupabase);
    if (faltantes.length > 0) {
      const { error: errAdd } = await supabase.rpc("escolar_agregar_columnas", {
        nombre_tabla: tabla,
        nombres_columnas: faltantes,
      });
      if (errAdd) return { ok: false, error: errAdd.message };
    }

    // 3) CURP: mapeo 7C guardado, o columna del avance que parezca CURP.
    const mapeo = await obtenerMapeoColumnasMateria(supabase, tabla);
    const columnaCurp =
      mapeo?.columnaCurp ??
      columnasSupabase.find((h) => normalizarNombre(h).includes("CURP")) ??
      null;

    // 4) Resolver encabezados del avance a las columnas físicas existentes
    //    (evita crear «Calificación final» si existe «CALIFICACION FINAL»).
    const encabezadoAFisico: Record<string, string> = {};
    for (const h of columnasSupabase) {
      encabezadoAFisico[h] = resolverEncabezadoAColumnaExistente(h, columnasTabla);
    }
    const filasAvance = filasDirectas.map((f) =>
      remapearClaves(f, encabezadoAFisico),
    );

    // 5) Planificar y aplicar UPDATE/INSERT.
    const plan = planificarActualizacionAvance(
      filasExistentes,
      filasAvance,
      columnaCurp,
    );

    for (const u of plan.updates) {
      const { error: errU } = await supabase
        .from(tabla)
        .update(u.columnas)
        .eq("id", u.id);
      if (errU) {
        return {
          ok: false,
          error: `Error al actualizar en «${tabla}»: ${errU.message}`,
        };
      }
    }

    if (plan.inserts.length > 0) {
      const { error: errI } = await supabase.from(tabla).insert(plan.inserts);
      if (errI) {
        return {
          ok: false,
          error: `Error al guardar en «${tabla}»: ${errI.message}`,
        };
      }
    }

    return {
      ok: true,
      actualizados: plan.alumnosActualizados,
      nuevos: plan.alumnosNuevos,
      columnasAgregadas: faltantes.length,
    };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error ? e.message : "No se pudo actualizar el archivo.",
    };
  }
}

