/**
 * O3 — Caché del spec OpenAPI de PostgREST.
 *
 * El spec (~681 KB) se descarga una sola vez por ventana TTL (60 s) en lugar
 * de en cada operación de esquema/columnas/listado de tablas. Se invalida
 * explícitamente tras operaciones DDL (`escolar_sync_columns` /
 * `escolar_agregar_columnas`), que son las únicas que cambian el esquema
 * dinámico en la aplicación.
 *
 * Comportamiento:
 *  - Primera petición: descarga el spec (sin caché de Next, `no-store`).
 *  - Peticiones dentro del TTL: reutilizan el objeto parseado en memoria.
 *  - Al expirar: la siguiente petición vuelve a descargar.
 *  - `invalidarCacheOpenAPI()` tras un DDL: la siguiente petición obtiene el
 *    spec actualizado.
 *
 * LIMITACIÓN documentada: caché en memoria por instancia serverless. La
 * invalidación es local a la instancia que ejecutó el DDL; en el resto de
 * instancias el TTL (60 s) acota la obsolescencia. No requiere dependencias
 * nuevas ni almacén externo (arquitectura actual).
 *
 * SOLO SERVIDOR: contiene `process.env` y `fetch`; no importar desde
 * Client Components.
 */

type SpecOpenAPI = {
  definitions?: Record<string, { properties?: Record<string, unknown> }>;
};

let specCache: { spec: SpecOpenAPI; expiresAt: number } | null = null;

const TTL_OPENAPI_MS = 60_000;

function leerEnvSupabase(): { urlBase: string; key: string } | null {
  const urlBase = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!urlBase || !key) return null;
  return { urlBase, key };
}

/** Descarga (o reutiliza) el spec OpenAPI de PostgREST. Devuelve {} si falla. */
export async function obtenerSpecOpenAPI(): Promise<SpecOpenAPI> {
  const now = Date.now();
  if (specCache && specCache.expiresAt > now) {
    return specCache.spec;
  }

  const cfg = leerEnvSupabase();
  if (!cfg) return {};

  const r = await fetch(`${cfg.urlBase}/rest/v1/`, {
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
    },
    cache: "no-store",
  });
  if (!r.ok) {
    // No se guarda caché en caso de fallo: el siguiente intento reintenta.
    return {};
  }

  const spec = (await r.json()) as SpecOpenAPI;
  specCache = { spec, expiresAt: now + TTL_OPENAPI_MS };
  return spec;
}

/** Invalida la caché del spec (tras cambios de esquema/DDL). */
export function invalidarCacheOpenAPI(): void {
  specCache = null;
}
