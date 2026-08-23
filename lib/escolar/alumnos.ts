import type { SupabaseClient } from "@supabase/supabase-js";
import { archivoCsvAFilas } from "./csv";
import { pareceCurp } from "./buscar-en-filas";
import { nombresCoinciden, normalizarNombre } from "./nombres";
import {
  detectarColumnasRoster,
  mapeoRosterValido,
  type MapeoRoster,
} from "./mapeo-columnas";
import { TABLA_ALUMNOS } from "./tables";
import type { AlumnoRow } from "./types";


export function nombreCompletoAlumno(row: AlumnoRow): string {
  return [row.NOMBRE, row.P_APELLIDO, row.S_APELLIDO]
    .filter(Boolean)
    .join(" ")
    .trim();
}

/**
 * CLAVE de un alumno = últimos 6 caracteres de su CURP (regla fija del proyecto).
 * Función central: reutilízala en cualquier lugar que necesite derivar la clave
 * desde el CURP en lugar de hardcodear el slice.
 */
export function claveDesdeCurp(curp: string): string {
  const c = curp.trim().toUpperCase();
  if (!c) return "";
  return c.slice(-6);
}


export async function buscarAlumnoPorClave(
  supabase: SupabaseClient,
  clave: string,
): Promise<AlumnoRow | null> {
  const key = clave.trim().toUpperCase();
  if (!key) return null;

  const { data, error } = await supabase
    .from(TABLA_ALUMNOS)
    .select("CURP, P_APELLIDO, S_APELLIDO, NOMBRE, CLAVE")
    .eq("CLAVE", key)
    .maybeSingle();

  if (error || !data) return null;
  return data as AlumnoRow;
}

export async function buscarAlumnoPorCurp(
  supabase: SupabaseClient,
  curp: string,
): Promise<AlumnoRow | null> {
  const key = curp.trim().toUpperCase();
  if (!key) return null;

  const { data, error } = await supabase
    .from(TABLA_ALUMNOS)
    .select("CURP, P_APELLIDO, S_APELLIDO, NOMBRE, CLAVE")
    .eq("CURP", key)
    .maybeSingle();

  if (error || !data) return null;
  return data as AlumnoRow;
}

/** Por nombre completo (coincidencia exacta normalizada). */
export async function buscarAlumnoPorNombre(
  supabase: SupabaseClient,
  nombreCompleto: string,
): Promise<AlumnoRow | null> {
  const q = nombreCompleto.trim();
  if (!q) return null;

  const { data, error } = await supabase
    .from(TABLA_ALUMNOS)
    .select("CURP, P_APELLIDO, S_APELLIDO, NOMBRE, CLAVE")
    .range(0, 4999);

  if (error || !data?.length) return null;

  for (const row of data as AlumnoRow[]) {
    if (nombresCoinciden(nombreCompletoAlumno(row), q)) return row;
  }
  const buscado = normalizarNombre(q);
  for (const row of data as AlumnoRow[]) {
    if (normalizarNombre(nombreCompletoAlumno(row)).includes(buscado)) {
      return row;
    }
  }
  return null;
}

/**
 * CURP primero: si el texto parece CURP, solo busca por CURP.
 * Si no, solo por nombre (sin mezclar ambos criterios).
 */
export async function buscarAlumnoPorTexto(
  supabase: SupabaseClient,
  texto: string,
): Promise<AlumnoRow | null> {
  const t = texto.trim();
  if (!t) return null;
  if (pareceCurp(t)) return buscarAlumnoPorCurp(supabase, t);
  return buscarAlumnoPorNombre(supabase, t);
}

export type ResultadoSincronizacionAlumnos = {
  ok: true;
  agregados: number;
  completados: number;
  yaExistentesSinCambios: number;
  omitidos: number;
  omitidosDetalle: string[];
  duplicados: number;
  completadosDetalle: string[];
};

export type ErrorSincronizacionAlumnos = {
  ok: false;
  error: string;
};

const TAMANO_LOTE_ALUMNOS = 100;
const TAMANO_PAGINA_EXISTENTES = 1000;

/** ¿El valor está vacío (null, undefined, string vacío o solo espacios)? */
function campoVacio(valor: string | null | undefined): boolean {
  if (valor == null) return true;
  return valor.trim() === "";
}

/** Columnas descriptivas del roster que pueden completarse (nunca CURP/CLAVE). */
const CAMPOS_COMPLETABLES = ["NOMBRE", "P_APELLIDO", "S_APELLIDO"] as const;
type CampoCompletable = (typeof CAMPOS_COMPLETABLES)[number];

/** Etiqueta legible de un campo para el detalle de completados. */
const ETIQUETA_CAMPO: Record<CampoCompletable, string> = {
  NOMBRE: "Nombre",
  P_APELLIDO: "Apellido paterno",
  S_APELLIDO: "Apellido materno",
};

/**
 * Trae todos los alumnos existentes (CURP + campos descriptivos) paginando,
 * para no depender del límite por defecto de Supabase (5000) ni hacer una
 * consulta por cada fila del archivo.
 *
 * Exportada para reutilizarla en otros dominios (p. ej. generación masiva de
 * tutores) sin duplicar el patrón de paginación.
 */
export async function traerAlumnosExistentes(
  supabase: SupabaseClient,
): Promise<AlumnoRow[]> {

  const todos: AlumnoRow[] = [];
  let desde = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from(TABLA_ALUMNOS)
      .select("CURP, NOMBRE, P_APELLIDO, S_APELLIDO")
      .range(desde, desde + TAMANO_PAGINA_EXISTENTES - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    todos.push(...(data as AlumnoRow[]));
    if (data.length < TAMANO_PAGINA_EXISTENTES) break;
    desde += TAMANO_PAGINA_EXISTENTES;
  }
  return todos;
}

/** Plan de sincronización calculado (sin ejecutar escrituras). */
type PlanSincronizacion = {
  aInsertar: Record<string, string>[];
  aActualizar: {
    curp: string;
    cambios: Partial<Record<CampoCompletable, string>>;
  }[];
  yaExistentesSinCambios: number;
  omitidosDetalle: string[];
  completadosDetalle: string[];
};

/**
 * Analiza el archivo contra los existentes y devuelve el plan de cambios
 * (qué insertar y qué completar) SIN escribir en Supabase. Reutilizado por la
 * sincronización real y por la previsualización.
 */
async function analizarRoster(
  supabase: SupabaseClient,
  file: File,
  mapeo?: MapeoRoster,
): Promise<{ ok: true; plan: PlanSincronizacion } | { ok: false; error: string }> {
  let filas: string[][];
  try {
    const parsed = await archivoCsvAFilas(file);
    filas = parsed.filas;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo leer el archivo.";
    return { ok: false, error: msg };
  }

  const m = filas.filter((fila) => fila.some((c) => (c ?? "").trim() !== ""));
  if (m.length < 2) {
    return {
      ok: false,
      error: "El archivo está vacío o solo tiene encabezados.",
    };
  }

  const [rawHead, ...rawDatos] = m;
  const encabezados = rawHead.map((h, i) => (h ?? "").trim() || `Col ${i + 1}`);

  // Mapeo explícito (validado) o detección automática por aliases.
  let mapeoFinal: MapeoRoster;
  if (mapeo && mapeoRosterValido(mapeo, encabezados.length)) {
    mapeoFinal = mapeo;
  } else {
    mapeoFinal = detectarColumnasRoster(encabezados);
  }

  const idxCurp = mapeoFinal.curp;
  const idxP = mapeoFinal.pApellido;
  const idxS = mapeoFinal.sApellido;
  const idxN = mapeoFinal.nombre;

  if (idxCurp < 0) {
    return {
      ok: false,
      error: "El archivo debe incluir una columna «CURP».",
    };
  }

  // Traer existentes (CURP + campos descriptivos) paginando.
  let existentes: AlumnoRow[];
  try {
    existentes = await traerAlumnosExistentes(supabase);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo leer la tabla ALUMNOS.";
    return { ok: false, error: `No se pudo leer la tabla ALUMNOS: ${msg}` };
  }

  const porCurp = new Map<string, AlumnoRow>();
  for (const r of existentes) {
    const c = String(r?.CURP ?? "").trim().toUpperCase();
    if (c) porCurp.set(c, r);
  }

  const aInsertar: Record<string, string>[] = [];
  const aActualizar: {
    curp: string;
    cambios: Partial<Record<CampoCompletable, string>>;
  }[] = [];
  const omitidosDetalle: string[] = [];
  const completadosDetalle: string[] = [];
  const curpsVistos = new Set<string>();
  let yaExistentesSinCambios = 0;

  for (const fila of rawDatos) {
    const curp = (fila[idxCurp] ?? "").trim().toUpperCase();
    if (!curp) continue;

    // CURP mexicano válido: 18 caracteres alfanuméricos.
    if (!/^[A-Z0-9]{18}$/.test(curp)) {
      omitidosDetalle.push(`CURP inválido/incompleto: «${curp}»`);
      continue;
    }

    // Evitar duplicados dentro del mismo archivo (procesar una sola vez).
    if (curpsVistos.has(curp)) {
      omitidosDetalle.push(`CURP duplicado en el archivo: «${curp}»`);
      continue;
    }
    curpsVistos.add(curp);

    const pApellido = idxP >= 0 ? (fila[idxP] ?? "").trim() : "";
    const sApellido = idxS >= 0 ? (fila[idxS] ?? "").trim() : "";
    const nombre = idxN >= 0 ? (fila[idxN] ?? "").trim() : "";

    const existente = porCurp.get(curp);

    // CURP inexistente → insertar alumno nuevo.
    if (!existente) {
      const registro: Record<string, string> = {
        CURP: curp,
        CLAVE: claveDesdeCurp(curp),
      };
      if (pApellido) registro.P_APELLIDO = pApellido;
      if (sApellido) registro.S_APELLIDO = sApellido;
      if (nombre) registro.NOMBRE = nombre;
      aInsertar.push(registro);
      continue;
    }

    // CURP existente → completar SOLO campos vacíos, nunca sobrescribir.
    const cambios: Partial<Record<CampoCompletable, string>> = {};
    const camposCompletados: string[] = [];

    if (campoVacio(existente.NOMBRE) && nombre) {
      cambios.NOMBRE = nombre;
      camposCompletados.push(ETIQUETA_CAMPO.NOMBRE);
    }
    if (campoVacio(existente.P_APELLIDO) && pApellido) {
      cambios.P_APELLIDO = pApellido;
      camposCompletados.push(ETIQUETA_CAMPO.P_APELLIDO);
    }
    if (campoVacio(existente.S_APELLIDO) && sApellido) {
      cambios.S_APELLIDO = sApellido;
      camposCompletados.push(ETIQUETA_CAMPO.S_APELLIDO);
    }

    if (Object.keys(cambios).length === 0) {
      yaExistentesSinCambios++;
      continue;
    }

    aActualizar.push({ curp, cambios });
    completadosDetalle.push(
      `CURP ${curp}: ${camposCompletados.join(", ")} completado(s)`,
    );
  }

  return {
    ok: true,
    plan: {
      aInsertar,
      aActualizar,
      yaExistentesSinCambios,
      omitidosDetalle,
      completadosDetalle,
    },
  };
}

/**
 * Previsualiza la sincronización SIN escribir en Supabase. Devuelve el resumen
 * de lo que ocurriría (nuevos, completados, existentes sin cambios, omitidos,
 * duplicados) para mostrarlo antes de confirmar.
 */
export async function previsualizarSincronizacionAlumnos(
  supabase: SupabaseClient,
  file: File,
  mapeo?: MapeoRoster,
): Promise<ResultadoSincronizacionAlumnos | ErrorSincronizacionAlumnos> {
  const analisis = await analizarRoster(supabase, file, mapeo);
  if (!analisis.ok) return analisis;

  const { plan } = analisis;
  return {
    ok: true,
    agregados: plan.aInsertar.length,
    completados: plan.aActualizar.length,
    yaExistentesSinCambios: plan.yaExistentesSinCambios,
    omitidos: plan.omitidosDetalle.length,
    omitidosDetalle: plan.omitidosDetalle,
    duplicados: plan.omitidosDetalle.filter((d) =>
      d.startsWith("CURP duplicado"),
    ).length,
    completadosDetalle: plan.completadosDetalle,
  };
}

/**
 * Sincronización INCREMENTAL del roster de alumnos contra la tabla ALUMNOS.
 *
 * SOLO AGREGA alumnos cuyo CURP no exista todavía y COMPLETA campos vacíos de
 * alumnos existentes. NUNCA borra, reemplaza ni sobrescribe datos existentes.
 *
 * El archivo (CSV o Excel) se parsea con el parser existente (archivoCsvAFilas).
 * El mapeo de columnas puede venir explícito (etapa visual de mapeo) o, si no
 * se provee, se detecta automáticamente por aliases (incluye los nombres
 * exactos CURP, P_APELLIDO, S_APELLIDO, NOMBRE, por lo que los archivos que ya
 * funcionaban siguen funcionando igual).
 *
 * La CLAVE se deriva siempre de los últimos 6 caracteres del CURP y NUNCA se
 * modifica en un alumno existente.
 *
 * Reglas:
 *  - CURP existente con campos vacíos → se completan SOLO esos campos (update
 *    mínimo, jamás sobrescribe un valor ya presente).
 *  - CURP existente con todos los campos llenos → sin cambios.
 *  - CURP inexistente → se inserta.
 *  - CURP inválido/incompleto → se reporta como omitido.
 *  - CURP duplicado dentro del archivo → se procesa una sola vez y el resto se
 *    reporta como duplicado.
 */
export async function sincronizarAlumnosDesdeArchivo(
  supabase: SupabaseClient,
  file: File,
  mapeo?: MapeoRoster,
): Promise<ResultadoSincronizacionAlumnos | ErrorSincronizacionAlumnos> {
  const analisis = await analizarRoster(supabase, file, mapeo);
  if (!analisis.ok) return analisis;

  const { plan } = analisis;

  // Insertar en batch únicamente los nuevos.
  for (let i = 0; i < plan.aInsertar.length; i += TAMANO_LOTE_ALUMNOS) {
    const lote = plan.aInsertar.slice(i, i + TAMANO_LOTE_ALUMNOS);
    const { error: insError } = await supabase
      .from(TABLA_ALUMNOS)
      .insert(lote);
    if (insError) {
      return {
        ok: false,
        error: `Error al guardar en «${TABLA_ALUMNOS}»: ${insError.message}`,
      };
    }
  }

  // Actualizar en batch SOLO los campos vacíos de existentes (update mínimo).
  for (let i = 0; i < plan.aActualizar.length; i += TAMANO_LOTE_ALUMNOS) {
    const lote = plan.aActualizar.slice(i, i + TAMANO_LOTE_ALUMNOS);
    for (const item of lote) {
      const { error: updError } = await supabase
        .from(TABLA_ALUMNOS)
        .update(item.cambios)
        .eq("CURP", item.curp);
      if (updError) {
        return {
          ok: false,
          error: `Error al completar datos en «${TABLA_ALUMNOS}»: ${updError.message}`,
        };
      }
    }
  }

  return {
    ok: true,
    agregados: plan.aInsertar.length,
    completados: plan.aActualizar.length,
    yaExistentesSinCambios: plan.yaExistentesSinCambios,
    omitidos: plan.omitidosDetalle.length,
    omitidosDetalle: plan.omitidosDetalle,
    duplicados: plan.omitidosDetalle.filter((d) =>
      d.startsWith("CURP duplicado"),
    ).length,
    completadosDetalle: plan.completadosDetalle,
  };
}





