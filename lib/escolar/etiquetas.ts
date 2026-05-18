import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ETIQUETAS_ESTATUS_KEYS,
  ETIQUETAS_PERSONALES_KEYS,
  TABLA_ETIQUETAS_PERSONALES,
} from "./tables";
import type { EtiquetasPersonalesRow } from "./types";

const SELECT_ETIQUETAS =
  'CURP, GENERO, GRADO, GRUPO, CORREO, CELULAR, "TIPO DE SANGRE", ALERGIAS, LENTES, "ENFERMEDAD CRONICA", "SALUD MENTAL", "NECESIDAD PSICOLOGICA", PESO, TALLA, VACUNACION, CARRERA, EMPTY1, EMPTY2, EMPTY3, EMPTY4, EMPTY5, EMPTY6';

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

export function etiquetasEstatusDesdeFila(
  row: EtiquetasPersonalesRow | null,
): [string, string, string] {
  if (!row) return ["", "", ""];
  return [
    row.EMPTY1?.trim() || "Etiqueta 1",
    row.EMPTY2?.trim() || "Etiqueta 2",
    row.EMPTY3?.trim() || "Etiqueta 3",
  ];
}

export function etiquetasPersonalesDesdeFila(
  row: EtiquetasPersonalesRow | null,
): [string, string, string] {
  if (!row) return ["", "", ""];
  return [
    row.EMPTY4?.trim() ?? "",
    row.EMPTY5?.trim() ?? "",
    row.EMPTY6?.trim() ?? "",
  ];
}

export function patchSoloEstatus(
  e1: string,
  e2: string,
  e3: string,
): Pick<EtiquetasPersonalesRow, "EMPTY1" | "EMPTY2" | "EMPTY3"> {
  return { EMPTY1: e1, EMPTY2: e2, EMPTY3: e3 };
}

export function patchSoloPersonales(
  e4: string,
  e5: string,
  e6: string,
): Pick<EtiquetasPersonalesRow, "EMPTY4" | "EMPTY5" | "EMPTY6"> {
  return { EMPTY4: e4, EMPTY5: e5, EMPTY6: e6 };
}

export { ETIQUETAS_ESTATUS_KEYS, ETIQUETAS_PERSONALES_KEYS };
