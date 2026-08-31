import type { SupabaseClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { obtenerAlumnosDelGrupo } from "./asistencias";
import { archivoCsvAFilas } from "./csv";
import { leerHojaDesdeTabla, reemplazarHojaEnTabla } from "./hoja-tabla";
import type { MateriaTablaVista } from "./types";

/**
 * Cada tabla en Supabase (ej. «1RO A CIENCIAS SOCIALES») es el archivo de esa materia.
 * Al subir Excel/CSV: fila 0 = encabezados → columnas en Supabase; cada fila = un registro directo.
 */
export async function reemplazarContenidoMateriaDesdeArchivo(
  supabase: SupabaseClient,
  nombreMateria: string,
  file: File,
): Promise<{ ok: true; filas: number } | { ok: false; error: string }> {
  try {
    const { filas, csvTexto } = await archivoCsvAFilas(file);
    return reemplazarContenidoMateria(supabase, nombreMateria, filas, csvTexto);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo leer el archivo.";
    return { ok: false, error: msg };
  }
}

export async function reemplazarContenidoMateria(
  supabase: SupabaseClient,
  nombreMateria: string,
  filas: string[][],
  csvTexto?: string,
): Promise<{ ok: true; filas: number } | { ok: false; error: string }> {
  return reemplazarHojaEnTabla(supabase, nombreMateria, filas, csvTexto);
}

export async function obtenerVistaMateria(
  supabase: SupabaseClient,
  nombreMateria: string,
): Promise<MateriaTablaVista | null> {
  return leerHojaDesdeTabla(supabase, nombreMateria);
}

export type ResultadoPlantillaMateriaXlsx =
  | {
      ok: true;
      /** Contenido binario del .xlsx en base64 (para descargar en el cliente). */
      base64: string;
      nombreArchivo: string;
      alumnos: number;
    }
  | { ok: false; error: string };

/**
 * BLOQUE 9 (PIEZA 2) — Genera una plantilla .xlsx de MATERIA para un
 * grado/grupo/carrera: columnas CURP | NOMBRE a partir de
 * `obtenerAlumnosDelGrupo` (lib/escolar/asistencias.ts), que ya maneja
 * catálogo + fallback legacy y paginación. NO reinventa esa lógica.
 *
 * Solo se usa desde Server Actions (servidor); no toca tablas de materia.
 */
export async function generarPlantillaMateriaXlsx(
  supabase: SupabaseClient,
  grado: string,
  grupo: string,
  carrera: string,
): Promise<ResultadoPlantillaMateriaXlsx> {
  const alumnos = await obtenerAlumnosDelGrupo(supabase, grado, grupo, carrera);
  if (alumnos.length === 0) {
    return {
      ok: false,
      error: `No hay alumnos en ${grado} · grupo ${grupo}${carrera ? ` · ${carrera}` : ""}.`,
    };
  }

  const filas = alumnos.map((a) => ({ CURP: a.curp, NOMBRE: a.nombre }));
  const hoja = XLSX.utils.json_to_sheet(filas);
  hoja["!cols"] = [{ wch: 20 }, { wch: 60 }];
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Alumnos");

  const buffer = XLSX.write(libro, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const base = [grado, grupo, carrera].filter(Boolean).join("-").replace(/\s+/g, "-");
  return {
    ok: true,
    base64: buffer.toString("base64"),
    nombreArchivo: `plantilla-materia-${base || "grupo"}.xlsx`,
    alumnos: alumnos.length,
  };
}
