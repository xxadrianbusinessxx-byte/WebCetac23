import type { SupabaseClient } from "@supabase/supabase-js";
import { ejecutarActualizarEtiquetasDesdeMaterias } from "./actualizar-etiquetas-materias";
import { contenidoTextoAVista } from "./contenido-tabla";
import { parseCsvTexto } from "./csv";
import {
  filasDbAVistaDirecta,
  listarColumnasTabla,
  prepararYConstruirFilas,
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
const PAUSA_REINTENTO_MS = 500;
const MAX_REINTENTOS_INSERT = 3;

function errorPareceCacheColumnas(mensaje: string): boolean {
  return /schema cache|could not find the '.+' column|column .+ does not exist/i.test(
    mensaje,
  );
}

async function esperar(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function insertarFilasConReintento(
  supabase: SupabaseClient,
  tabla: string,
  filas: Record<string, string>[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  let ultimoError = "";

  for (let intento = 0; intento < MAX_REINTENTOS_INSERT; intento++) {
    if (intento > 0) {
      await esperar(PAUSA_REINTENTO_MS * intento);
      const errVaciar = await vaciarTabla(supabase, tabla);
      if (errVaciar) {
        return {
          ok: false,
          error: `No se pudo reintentar en «${tabla}»: ${errVaciar}`,
        };
      }
    }

    let fallo = false;
    for (let i = 0; i < filas.length; i += TAMANO_LOTE) {
      const lote = filas.slice(i, i + TAMANO_LOTE);
      const { error: insError } = await supabase.from(tabla).insert(lote);
      if (insError) {
        ultimoError = insError.message;
        fallo = true;
        break;
      }
    }

    if (!fallo) return { ok: true };

    if (
      !errorPareceCacheColumnas(ultimoError) ||
      intento === MAX_REINTENTOS_INSERT - 1
    ) {
      return {
        ok: false,
        error: `Error al guardar en «${tabla}»: ${ultimoError}`,
      };
    }
  }

  return {
    ok: false,
    error: `Error al guardar en «${tabla}»: ${ultimoError || "desconocido"}`,
  };
}

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
  const { data, error } = await supabase
    .from(tabla)
    .select("*")
    .order("id", { ascending: true });
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
): Promise<
  | { ok: true; filas: number; advertencia?: string }
  | { ok: false; error: string }
> {
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

  const insertado = await insertarFilasConReintento(supabase, tabla, filas);
  if (!insertado.ok) return insertado;

  const syncEtiquetas = await ejecutarActualizarEtiquetasDesdeMaterias(supabase);

  return {
    ok: true,
    filas: preparado.count,
    advertencia: syncEtiquetas.ok ? undefined : syncEtiquetas.error,
  };
}
