import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PERSONALES_COL_COMENTARIO,
  PERSONALES_ETIQUETA_TITULO_KEYS,
  PERSONALES_ETIQUETA_VALOR_KEYS,
} from "./etiquetas-schema";
import { TABLA_ETIQUETAS_PERSONALES } from "./tables";
import type { EtiquetasPersonalesRow } from "./types";

const SELECT_ETIQUETAS =
  'CURP, GENERO, GRADO, GRUPO, CORREO, CELULAR, "TIPO DE SANGRE", ALERGIAS, LENTES, "ENFERMEDAD CRONICA", "SALUD MENTAL", "NECESIDAD PSICOLOGICA", PESO, TALLA, VACUNACION, CARRERA, EMPTY1, EMPTY2, EMPTY3, EMPTY4, EMPTY5, EMPTY6, "COMENTARIO PERSONAL"';

export async function obtenerEtiquetasPersonales(
  supabase: SupabaseClient,
  curp: string,
): Promise<EtiquetasPersonalesRow | null> {
  const { data, error } = await supabase
    .from(TABLA_ETIQUETAS_PERSONALES)
    .select(SELECT_ETIQUETAS)
    .eq("CURP", curp.trim().toUpperCase())
    .maybeSingle();

  if (error || !data) return null;
  return data as EtiquetasPersonalesRow;
}

export async function actualizarEtiquetasPersonales(
  supabase: SupabaseClient,
  curp: string,
  patch: Partial<EtiquetasPersonalesRow>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from(TABLA_ETIQUETAS_PERSONALES)
    .update(patch)
    .eq("CURP", curp.trim().toUpperCase());

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

const ETIQUETA_DEFAULT = ["Etiqueta 1", "Etiqueta 2", "Etiqueta 3"] as const;

/** Títulos editables (EMPTY1–3). */
export function titulosEtiquetasPersonales(
  row: EtiquetasPersonalesRow | null,
): [string, string, string] {
  if (!row) return [...ETIQUETA_DEFAULT];
  return [
    row.EMPTY1?.trim() || ETIQUETA_DEFAULT[0],
    row.EMPTY2?.trim() || ETIQUETA_DEFAULT[1],
    row.EMPTY3?.trim() || ETIQUETA_DEFAULT[2],
  ];
}

/** Valores de cada etiqueta personal (EMPTY4–6). */
export function valoresEtiquetasPersonales(
  row: EtiquetasPersonalesRow | null,
): [string, string, string] {
  if (!row) return ["", "", ""];
  return [
    row.EMPTY4?.trim() ?? "",
    row.EMPTY5?.trim() ?? "",
    row.EMPTY6?.trim() ?? "",
  ];
}

export function comentarioPersonalDesdeFila(
  row: EtiquetasPersonalesRow | null,
): string {
  return row?.["COMENTARIO PERSONAL"]?.trim() ?? "";
}

export function patchTitulosEtiquetas(
  t1: string,
  t2: string,
  t3: string,
): Pick<EtiquetasPersonalesRow, "EMPTY1" | "EMPTY2" | "EMPTY3"> {
  return { EMPTY1: t1, EMPTY2: t2, EMPTY3: t3 };
}

export function patchValoresEtiquetas(
  v1: string,
  v2: string,
  v3: string,
): Pick<EtiquetasPersonalesRow, "EMPTY4" | "EMPTY5" | "EMPTY6"> {
  return { EMPTY4: v1, EMPTY5: v2, EMPTY6: v3 };
}

export function patchComentarioPersonal(
  texto: string,
): Pick<EtiquetasPersonalesRow, "COMENTARIO PERSONAL"> {
  return { "COMENTARIO PERSONAL": texto };
}

/** @deprecated Usar titulosEtiquetasPersonales */
export function etiquetasEstatusDesdeFila(
  row: EtiquetasPersonalesRow | null,
): [string, string, string] {
  return titulosEtiquetasPersonales(row);
}

/** @deprecated Usar valoresEtiquetasPersonales */
export function etiquetasPersonalesDesdeFila(
  row: EtiquetasPersonalesRow | null,
): [string, string, string] {
  return valoresEtiquetasPersonales(row);
}

/** @deprecated Usar patchTitulosEtiquetas */
export function patchSoloEstatus(
  e1: string,
  e2: string,
  e3: string,
): Pick<EtiquetasPersonalesRow, "EMPTY1" | "EMPTY2" | "EMPTY3"> {
  return patchTitulosEtiquetas(e1, e2, e3);
}

/** @deprecated Usar patchValoresEtiquetas */
export function patchSoloPersonales(
  e4: string,
  e5: string,
  e6: string,
): Pick<EtiquetasPersonalesRow, "EMPTY4" | "EMPTY5" | "EMPTY6"> {
  return patchValoresEtiquetas(e4, e5, e6);
}

export {
  PERSONALES_COL_COMENTARIO,
  PERSONALES_ETIQUETA_TITULO_KEYS,
  PERSONALES_ETIQUETA_VALOR_KEYS,
};
