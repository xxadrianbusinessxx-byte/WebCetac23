import type { SupabaseClient } from "@supabase/supabase-js";

const COLUMNAS_SISTEMA = new Set([
  "id",
  "alumno_nombre",
  "actualizado",
  "datos",
  "contenido",
]);

function leerEnvSupabase(): { urlBase: string; key: string } | null {
  const urlBase = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!urlBase || !key) return null;
  return { urlBase, key };
}

/** Nombres de columnas actuales de una tabla (OpenAPI / PostgREST). */
export async function listarColumnasTabla(
  nombreTabla: string,
): Promise<string[]> {
  const cfg = leerEnvSupabase();
  if (!cfg) return ["id", "alumno_nombre", "datos", "actualizado"];

  const r = await fetch(`${cfg.urlBase}/rest/v1/`, {
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
    },
    cache: "no-store",
  });

  if (!r.ok) return ["id", "alumno_nombre", "datos", "actualizado"];

  const spec = (await r.json()) as {
    definitions?: Record<string, { properties?: Record<string, unknown> }>;
  };
  const props = spec.definitions?.[nombreTabla.trim()]?.properties;
  if (!props) return ["id", "alumno_nombre", "datos", "actualizado"];
  return Object.keys(props);
}

/**
 * Sincroniza columnas del Excel: agrega las nuevas y elimina en Supabase las que ya no vienen.
 * Siempre conserva id y alumno_nombre (y actualizado/datos legacy).
 * Requiere escolar_sync_columns actualizada en SQL Editor.
 */
export async function sincronizarColumnasTabla(
  supabase: SupabaseClient,
  nombreTabla: string,
  columnasExcel: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cols = [
    "alumno_nombre",
    ...columnasExcel.filter((c) => {
      const t = c.trim();
      return t && !COLUMNAS_SISTEMA.has(t.toLowerCase());
    }),
  ];

  const unicas = [...new Set(cols.map((c) => c.trim()).filter(Boolean))];

  const { error } = await supabase.rpc("escolar_sync_columns", {
    nombre_tabla: nombreTabla.trim(),
    nombres_columnas: unicas,
  });

  if (error) {
    if (
      error.message.includes("Could not find the function") ||
      error.code === "PGRST202"
    ) {
      return {
        ok: false,
        error:
          "Falta la función escolar_sync_columns en Supabase. Ejecuta el archivo supabase/escolar_sync_columns.sql en el SQL Editor.",
      };
    }
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

/** Columnas de datos para vista (orden de la tabla en Supabase, sin id/actualizado/datos). */
export function columnasParaVista(columnasDb: string[]): string[] {
  return columnasDb.filter((c) => !COLUMNAS_SISTEMA.has(c.toLowerCase()));
}

/** Si OpenAPI falla en producción, deduce columnas desde las filas devueltas por PostgREST. */
export function columnasDesdeFilasDb(
  columnasOpenApi: string[],
  filas: Record<string, unknown>[],
): string[] {
  const desdeApi = columnasParaVista(columnasOpenApi);
  if (desdeApi.length > 1) return desdeApi;

  const keys = new Set<string>();
  for (const row of filas.slice(0, 8)) {
    for (const k of Object.keys(row)) {
      if (!COLUMNAS_SISTEMA.has(k.toLowerCase())) keys.add(k);
    }
  }
  return keys.size ? [...keys] : desdeApi;
}
