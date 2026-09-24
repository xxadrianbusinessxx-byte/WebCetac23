import { obtenerSpecOpenAPI } from "../openapi.ts";
import { esTablaMateria, PATRON_REGISTRO_FINAL } from "./tablas-sistema.ts";

// Qué tabla NO es materia lo decide `tablas-sistema.ts`: una sola lista, la
// misma que usa el generador y que vigila la regla C15.

/** Nombres de tablas expuestas en PostgREST (OpenAPI). O3: usa caché del spec. */
export async function listarTablasDesdeSupabase(): Promise<string[]> {
  const spec = await obtenerSpecOpenAPI();
  const defs = spec.definitions ?? spec;
  return Object.keys(defs)
    .filter((k) => !k.startsWith("rpc_"))
    .sort((a, b) => a.localeCompare(b, "es"));
}

export async function listarTablasMateriasDesdeSupabase(): Promise<string[]> {
  const todas = await listarTablasDesdeSupabase();
  return todas.filter(esTablaMateria);
}

export async function listarTablasRegistrosDesdeSupabase(): Promise<string[]> {
  const todas = await listarTablasDesdeSupabase();
  return todas.filter((t) => PATRON_REGISTRO_FINAL.test(t));
}

/** Lista completa para carga de archivos (directivo / profesor). */
export async function listarMateriasCompletas(): Promise<string[]> {
  const { MATERIAS_ESCOLAR } = await import("./materias-list.ts");
  const desdeDb = await listarTablasMateriasDesdeSupabase();
  if (desdeDb.length > 0) return desdeDb;
  return [...MATERIAS_ESCOLAR];
}

/** Lista completa de registros finales por grupo. */
export async function listarRegistrosCompletos(): Promise<string[]> {
  const { REGISTROS_ESCOLAR } = await import("./registros-list.ts");
  const desdeDb = await listarTablasRegistrosDesdeSupabase();
  if (desdeDb.length > 0) return desdeDb;
  return [...REGISTROS_ESCOLAR];
}
