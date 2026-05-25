import {
  TABLA_ALUMNOS,
  TABLA_COMENTARIOS,
  TABLA_COMENTARIOS_PROFESORES,
  TABLA_ETIQUETAS_PERSONALES,
  TABLA_ETIQUETAS_STATUS,
  TABLA_PROFESORES,
} from "./tables";

const TABLAS_SISTEMA = new Set([
  TABLA_ALUMNOS,
  TABLA_PROFESORES,
  TABLA_COMENTARIOS,
  TABLA_COMENTARIOS_PROFESORES,
  TABLA_ETIQUETAS_PERSONALES,
  TABLA_ETIQUETAS_STATUS,
  "BOLETA",
  "mensajes_chat",
]);

function leerEnvSupabase(): { urlBase: string; key: string } | null {
  const urlBase = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!urlBase || !key) return null;
  return { urlBase, key };
}

/** Nombres de tablas expuestas en PostgREST (OpenAPI). */
export async function listarTablasDesdeSupabase(): Promise<string[]> {
  const cfg = leerEnvSupabase();
  if (!cfg) return [];

  const r = await fetch(`${cfg.urlBase}/rest/v1/`, {
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
    },
    cache: "no-store",
  });

  if (!r.ok) return [];

  const spec = (await r.json()) as { definitions?: Record<string, unknown> };
  const defs = spec.definitions ?? spec;
  return Object.keys(defs)
    .filter((k) => !k.startsWith("rpc_"))
    .sort((a, b) => a.localeCompare(b, "es"));
}

export async function listarTablasMateriasDesdeSupabase(): Promise<string[]> {
  const todas = await listarTablasDesdeSupabase();
  return todas.filter(
    (t) =>
      !TABLAS_SISTEMA.has(t) &&
      !/REGISTRO DE CALIFICACIONES FINALES/i.test(t),
  );
}

export async function listarTablasRegistrosDesdeSupabase(): Promise<string[]> {
  const todas = await listarTablasDesdeSupabase();
  return todas.filter((t) => /REGISTRO DE CALIFICACIONES FINALES/i.test(t));
}

/** Lista completa para carga de archivos (directivo / profesor). */
export async function listarMateriasCompletas(): Promise<string[]> {
  const { MATERIAS_ESCOLAR } = await import("./materias-list");
  const desdeDb = await listarTablasMateriasDesdeSupabase();
  if (desdeDb.length > 0) return desdeDb;
  return [...MATERIAS_ESCOLAR];
}

/** Lista completa de registros finales por grupo. */
export async function listarRegistrosCompletos(): Promise<string[]> {
  const { REGISTROS_ESCOLAR } = await import("./registros-list");
  const desdeDb = await listarTablasRegistrosDesdeSupabase();
  if (desdeDb.length > 0) return desdeDb;
  return [...REGISTROS_ESCOLAR];
}
