import type { SupabaseClient } from "@supabase/supabase-js";
import { archivoCsvAFilas } from "./csv";
import { pareceCurp } from "./buscar-en-filas";
import { nombresCoinciden, normalizarNombre } from "./nombres";
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
  yaExistentes: number;
  omitidos: number;
  omitidosDetalle: string[];
};

export type ErrorSincronizacionAlumnos = {
  ok: false;
  error: string;
};

const TAMANO_LOTE_ALUMNOS = 100;

/**
 * Sincronización INCREMENTAL del roster de alumnos contra la tabla ALUMNOS.

 * SOLO AGREGA alumnos cuyo CURP no exista todavía. NUNCA borra ni reemplaza.
 *
 * Formato esperado del archivo (CSV o Excel): una fila de encabezados con
 * columnas CURP, P_APELLIDO, S_APELLIDO, NOMBRE (el orden no importa).
 * La CLAVE se deriva siempre de los últimos 6 caracteres del CURP.
 *
 * Las filas con CURP inválido/incompleto se reportan como omitidas en el
 * resumen, sin romper el proceso.
 */
export async function sincronizarAlumnosDesdeArchivo(
  supabase: SupabaseClient,
  file: File,
): Promise<ResultadoSincronizacionAlumnos | ErrorSincronizacionAlumnos> {
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

  const idxCurp = encabezados.findIndex(
    (h) => h.trim().toUpperCase() === "CURP",
  );
  const idxP = encabezados.findIndex(
    (h) => h.trim().toUpperCase() === "P_APELLIDO",
  );
  const idxS = encabezados.findIndex(
    (h) => h.trim().toUpperCase() === "S_APELLIDO",
  );
  const idxN = encabezados.findIndex(
    (h) => h.trim().toUpperCase() === "NOMBRE",
  );

  if (idxCurp < 0) {
    return {
      ok: false,
      error: "El archivo debe incluir una columna «CURP».",
    };
  }

  // Traer todos los CURP existentes (una sola consulta ligera, solo esa columna).
  const { data: existentes, error: errExistentes } = await supabase
    .from(TABLA_ALUMNOS)
    .select("CURP")
    .limit(5000);

  if (errExistentes) {
    return {
      ok: false,
      error: `No se pudo leer la tabla ALUMNOS: ${errExistentes.message}`,
    };
  }

  const curpsExistentes = new Set<string>();
  for (const r of existentes ?? []) {
    const c = String(r?.CURP ?? "").trim().toUpperCase();
    if (c) curpsExistentes.add(c);
  }

  const aInsertar: Record<string, string>[] = [];
  const omitidosDetalle: string[] = [];
  let yaExistentes = 0;

  for (const fila of rawDatos) {
    const curp = (fila[idxCurp] ?? "").trim().toUpperCase();
    if (!curp) continue;

    // CURP mexicano válido: 18 caracteres alfanuméricos.
    if (!/^[A-Z0-9]{18}$/.test(curp)) {
      omitidosDetalle.push(`CURP inválido/incompleto: «${curp}»`);
      continue;
    }

    if (curpsExistentes.has(curp)) {
      yaExistentes++;
      continue;
    }

    const pApellido = idxP >= 0 ? (fila[idxP] ?? "").trim() : "";
    const sApellido = idxS >= 0 ? (fila[idxS] ?? "").trim() : "";
    const nombre = idxN >= 0 ? (fila[idxN] ?? "").trim() : "";

    const registro: Record<string, string> = {
      CURP: curp,
      CLAVE: claveDesdeCurp(curp),
    };
    if (pApellido) registro.P_APELLIDO = pApellido;
    if (sApellido) registro.S_APELLIDO = sApellido;
    if (nombre) registro.NOMBRE = nombre;

    aInsertar.push(registro);
  }

  // Insertar en batch únicamente los nuevos.
  for (let i = 0; i < aInsertar.length; i += TAMANO_LOTE_ALUMNOS) {
    const lote = aInsertar.slice(i, i + TAMANO_LOTE_ALUMNOS);
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

  return {
    ok: true,
    agregados: aInsertar.length,
    yaExistentes,
    omitidos: omitidosDetalle.length,
    omitidosDetalle,
  };
}


