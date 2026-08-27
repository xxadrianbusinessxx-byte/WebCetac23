import type { SupabaseClient } from "@supabase/supabase-js";
import { contenidoTextoAVista } from "./contenido-tabla";
import { parseCsvTexto } from "./csv";
import {
  filasDbAVistaDirecta,
  listarColumnasTabla,
  prepararYConstruirFilas,
  type FilaInsertDirecta,
} from "./excel-a-registros";
import type { MateriaTablaVista } from "./types";

export const MARCA_FILA_HOJA_COMPLETA = "__HOJA__";

type FilaHojaDb = Record<string, unknown>;

/** Lectura de tablas antiguas que guardaban el resto en `datos` (jsonb). */
function filasDbDatosJsonAVista(filas: FilaHojaDb[]): MateriaTablaVista | null {
  const dataRows = filas.filter((r) => {
    const n = String(r.alumno_nombre ?? "").trim();
    return n && n !== MARCA_FILA_HOJA_COMPLETA;
  });
  if (!dataRows.length) return null;

  const keys = new Set<string>();
  for (const r of dataRows) {
    const d = r.datos;
    if (d && typeof d === "object" && !Array.isArray(d)) {
      Object.keys(d as Record<string, unknown>).forEach((k) => keys.add(k));
    } else if (typeof d === "string" && d.trim().startsWith("{")) {
      try {
        const o = JSON.parse(d) as Record<string, unknown>;
        Object.keys(o).forEach((k) => keys.add(k));
      } catch {
        /* no es JSON */
      }
    }
  }
  if (!keys.size) return null;

  const cols = [...keys];
  const encabezados = ["Alumno", ...cols];
  const filasVista = dataRows.map((r) => {
    let obj: Record<string, unknown> = {};
    const d = r.datos;
    if (d && typeof d === "object" && !Array.isArray(d)) {
      obj = d as Record<string, unknown>;
    } else if (typeof d === "string") {
      try {
        obj = JSON.parse(d) as Record<string, unknown>;
      } catch {
        obj = {};
      }
    }
    return [
      String(r.alumno_nombre ?? "").trim(),
      ...cols.map((c) => String(obj[c] ?? "").trim()),
    ];
  });

  return { encabezados, filas: filasVista };
}

const TAMANO_LOTE = 100;

async function vaciarTabla(
  supabase: SupabaseClient,
  tabla: string,
): Promise<string | null> {
  const { error } = await supabase.from(tabla).delete().gte("id", 0);
  if (!error) return null;
  const { error: e2 } = await supabase.from(tabla).delete().not("id", "is", null);
  return e2?.message ?? null;
}

export async function leerHojaDesdeTabla(
  supabase: SupabaseClient,
  nombreTabla: string,
): Promise<MateriaTablaVista | null> {
  const tabla = nombreTabla.trim();
  if (!tabla) return null;

  const columnasDb = await listarColumnasTabla(tabla);
  const { data, error } = await supabase.from(tabla).select("*");
  if (error || !data?.length) return null;

  const filas = data as FilaHojaDb[];

  const legacy = filas.find(
    (r) => String(r.alumno_nombre ?? "").trim() === MARCA_FILA_HOJA_COMPLETA,
  );
  if (legacy?.datos && String(legacy.datos).trim()) {
    return contenidoTextoAVista(String(legacy.datos));
  }

  const vistaDirecta = filasDbAVistaDirecta(filas, columnasDb);
  if (vistaDirecta) return vistaDirecta;

  const vistaDatosJson = filasDbDatosJsonAVista(filas);
  if (vistaDatosJson) return vistaDatosJson;

  const legacyContenido = filas.find((r) => r.contenido);
  if (legacyContenido?.contenido) {
    return contenidoTextoAVista(String(legacyContenido.contenido));
  }

  return null;
}

export async function reemplazarHojaEnTabla(
  supabase: SupabaseClient,
  nombreTabla: string,
  matriz: string[][],
  csvTexto?: string,
): Promise<{ ok: true; filas: number } | { ok: false; error: string }> {
  const tabla = nombreTabla.trim();
  if (!tabla) return { ok: false, error: "Selecciona una tabla en la lista." };

  const texto = (csvTexto ?? "").trim();
  const m = matriz.length > 0 ? matriz : texto ? parseCsvTexto(texto) : [];

  if (!m.length) {
    return { ok: false, error: "El archivo está vacío." };
  }

  const preparado = await prepararYConstruirFilas(supabase, tabla, m);
  if (!preparado.ok) return preparado;

  const errVaciar = await vaciarTabla(supabase, tabla);
  if (errVaciar) {
    return {
      ok: false,
      error: `No se pudo vaciar «${tabla}»: ${errVaciar}`,
    };
  }

  const { filas } = preparado;

  const errInsertar = await insertarFilasConReintento(supabase, tabla, filas);
  if (errInsertar) {
    return {
      ok: false,
      error: `Error al guardar en «${tabla}»: ${errInsertar}`,
    };
  }

  return { ok: true, filas: preparado.count };
}

/** ¿El error de PostgREST indica caché de esquema sin recargar? */
function esErrorCacheEsquema(mensaje: string): boolean {
  return (
    /in the schema cache/i.test(mensaje) ||
    /could not find the .* column of .* in the schema cache/i.test(mensaje)
  );
}

const ESPERA_REINTENTO_MS = 1200;
const MAX_REINTENTOS = 2;

/**
 * C4.23 — Reintento controlado de la inserción por lotes.
 *
 * La RPC `escolar_sync_columns` crea/elimina columnas dinámicamente; si su
 * `NOTIFY pgrst, 'reload schema'` aún no llegó (o el despliegue de PostgREST
 * no lo procesó), el primer INSERT a una columna nueva falla con
 * "Could not find the '<col>' column ... in the schema cache". En ese caso se
 * espera un instante y se reintenta desde el lote siguiente al último exitoso
 * (nunca re-inserta lotes ya confirmados).
 */
async function insertarFilasConReintento(
  supabase: SupabaseClient,
  tabla: string,
  filas: FilaInsertDirecta[],
): Promise<string | null> {
  const totalLotes = Math.ceil(filas.length / TAMANO_LOTE);
  let desde = 0;
  for (let intento = 0; intento <= MAX_REINTENTOS; intento++) {
    const errores: string[] = [];
    for (let li = desde; li < totalLotes; li++) {
      const lote = filas.slice(li * TAMANO_LOTE, (li + 1) * TAMANO_LOTE);
      const { error } = await supabase.from(tabla).insert(lote);
      if (error) {
        errores.push(error.message);
        desde = li;
        break;
      }
      desde = li + 1;
    }
    if (errores.length === 0) return null;
    const esCache = errores.some((m) => esErrorCacheEsquema(m));
    if (!esCache || intento === MAX_REINTENTOS) {
      return errores[0] ?? "Error al insertar los registros.";
    }
    await new Promise((resolver) => setTimeout(resolver, ESPERA_REINTENTO_MS));
  }
  return "Error al insertar los registros.";
}
