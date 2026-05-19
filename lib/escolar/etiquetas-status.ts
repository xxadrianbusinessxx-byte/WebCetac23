import type { SupabaseClient } from "@supabase/supabase-js";
import { nombreCompletoAlumno } from "./alumnos";
import {
  STATUS_COL_CURP,
  STATUS_FILAS_MATERIAS,
  STATUS_FILAS_PROMEDIO,
  STATUS_TODAS_COLUMNAS_DATO,
} from "./etiquetas-schema";
import { TABLA_ETIQUETAS_STATUS } from "./tables";
import type { AlumnoRow } from "./types";

export type EtiquetasStatusRow = Record<string, string | number | null | undefined>;

export type VistaEstatusAlumno = {
  promedios: Record<(typeof STATUS_FILAS_PROMEDIO)[number], string>;
  materias: Record<(typeof STATUS_FILAS_MATERIAS)[number], string>;
};

function quoteCol(nombre: string): string {
  return /[^a-zA-Z0-9_]/.test(nombre) ? `"${nombre}"` : nombre;
}

function buildSelectStatus(): string {
  const cols = [STATUS_COL_CURP, ...STATUS_TODAS_COLUMNAS_DATO].map(quoteCol);
  return cols.join(", ");
}

function celdaAString(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function parseNumeroPromedio(v: unknown): number | null {
  const t = celdaAString(v).replace(",", ".");
  if (!t) return null;
  const n = Number.parseFloat(t);
  if (Number.isNaN(n) || n < 0 || n > 10) return null;
  return n;
}

/** Promedio principal para alumnos estrella (columna Promedio o el más alto del ciclo). */
export function promedioDesdeFilaStatus(row: EtiquetasStatusRow | null): number {
  if (!row) return 0;
  const principal = parseNumeroPromedio(row[STATUS_FILAS_PROMEDIO[0]]);
  if (principal != null) return principal;

  let mejor = 0;
  for (const col of STATUS_FILAS_PROMEDIO) {
    const n = parseNumeroPromedio(row[col]);
    if (n != null && n > mejor) mejor = n;
  }
  return mejor;
}

export function vistaEstatusDesdeFila(
  row: EtiquetasStatusRow | null,
): VistaEstatusAlumno {
  const promedios = {} as VistaEstatusAlumno["promedios"];
  const materias = {} as VistaEstatusAlumno["materias"];

  for (const k of STATUS_FILAS_PROMEDIO) {
    promedios[k] = celdaAString(row?.[k]) || "—";
  }
  for (const k of STATUS_FILAS_MATERIAS) {
    materias[k] = celdaAString(row?.[k]) || "—";
  }
  return { promedios, materias };
}

export async function obtenerEtiquetasStatusPorCurp(
  supabase: SupabaseClient,
  curp: string,
): Promise<EtiquetasStatusRow | null> {
  const curpU = curp.trim().toUpperCase();
  const select = buildSelectStatus();

  const { data, error } = await supabase
    .from(TABLA_ETIQUETAS_STATUS)
    .select(select)
    .eq(STATUS_COL_CURP, curpU)
    .maybeSingle();

  if (!error && data) return data as unknown as EtiquetasStatusRow;

  const { data: todas, error: err2 } = await supabase
    .from(TABLA_ETIQUETAS_STATUS)
    .select("*")
    .limit(5000);

  if (err2 || !todas?.length) return null;

  for (const fila of todas as unknown as EtiquetasStatusRow[]) {
    const curpFila = celdaAString(fila[STATUS_COL_CURP] ?? fila.curp).toUpperCase();
    if (curpFila === curpU) return fila;
  }
  return null;
}

export async function listarEtiquetasStatus(
  supabase: SupabaseClient,
): Promise<EtiquetasStatusRow[]> {
  const select = buildSelectStatus();
  const { data, error } = await supabase
    .from(TABLA_ETIQUETAS_STATUS)
    .select(select)
    .limit(5000);

  if (!error && data?.length) return data as unknown as EtiquetasStatusRow[];

  const { data: todas, error: err2 } = await supabase
    .from(TABLA_ETIQUETAS_STATUS)
    .select("*")
    .limit(5000);

  if (err2 || !todas?.length) return [];
  return todas as unknown as EtiquetasStatusRow[];
}

export type AlumnoEstrella = {
  alumno: AlumnoRow;
  promedio: number;
  nombre: string;
};

export async function listarAlumnosEstrellaDesdeStatus(
  supabase: SupabaseClient,
  alumnos: AlumnoRow[],
  limite = 4,
): Promise<AlumnoEstrella[]> {
  const filasStatus = await listarEtiquetasStatus(supabase);
  const porCurp = new Map<string, EtiquetasStatusRow>();

  for (const fila of filasStatus) {
    const curp = celdaAString(fila[STATUS_COL_CURP] ?? fila.curp).toUpperCase();
    if (curp) porCurp.set(curp, fila);
  }

  const resultado: AlumnoEstrella[] = [];

  for (const alumno of alumnos) {
    const fila = porCurp.get(alumno.CURP.trim().toUpperCase());
    const promedio = promedioDesdeFilaStatus(fila ?? null);
    if (promedio <= 0) continue;
    resultado.push({
      alumno,
      promedio,
      nombre: nombreCompletoAlumno(alumno),
    });
  }

  resultado.sort((a, b) => b.promedio - a.promedio);
  return resultado.slice(0, limite);
}
