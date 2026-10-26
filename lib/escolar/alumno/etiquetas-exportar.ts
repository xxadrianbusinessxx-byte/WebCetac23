import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { matrizAXlsxBase64 } from "../exportar-xlsx.ts";
import { TABLA_ETIQUETAS_PERSONALES } from "../tables.ts";
import {
  camposDeHoja,
  celdasConDato,
  encabezadosDeHoja,
  filaDeHoja,
  nombreArchivoHoja,
  rotuloHoja,
  type HojaAlumnado,
} from "./etiquetas-exportar-puro.ts";
import { leerRosterDelCiclo } from "./roster-ciclo.ts";
import { nombreDeFila } from "./roster-ciclo-puro.ts";

/**
 * etiquetas-exportar.ts — baja a `.xlsx` lo guardado en `ETIQUETAS PERSONALES`
 * para los alumnos del ciclo. 2026-10-25.
 *
 * Hasta hoy esa tabla solo entraba (`importar-etiquetas.ts`) y no salía: lo que
 * alguien capturaba no se podía revisar fuera de la pantalla, de uno en uno.
 *
 * Recorre el PADRÓN, no la tabla: así el que no tenga ficha sale igual, con sus
 * celdas vacías. Es justo lo que hace falta ver —quién falta— y es la razón de
 * que el rol Servicio Escolar exista.
 *
 * Solo lectura.
 */

export type HojaDescargada = {
  ok: true;
  base64: string;
  nombreArchivo: string;
  hoja: HojaAlumnado;
  alumnos: number;
  /** Alumnos del padrón que no tienen NI UN dato guardado en esta hoja. */
  sinFicha: number;
  ciclo: string | null;
};

export type ErrorHoja = { ok: false; error: string };

/** Tamaño de lote al pedir las fichas por CURP: el mismo criterio del padrón. */
const TAMANO_LOTE = 100;

export async function generarHojaAlumnado(
  supabase: SupabaseClient,
  hoja: HojaAlumnado,
): Promise<HojaDescargada | ErrorHoja> {
  const roster = await leerRosterDelCiclo(supabase);
  if (!roster.ok) return { ok: false, error: roster.error };

  const curps = roster.filas.map((f) => f.curp);
  const fichaPorCurp = new Map<string, Record<string, unknown>>();
  const columnas = ["CURP", ...camposDeHoja(hoja)];

  for (let i = 0; i < curps.length; i += TAMANO_LOTE) {
    const lote = curps.slice(i, i + TAMANO_LOTE);
    const { data, error } = await supabase
      .from(TABLA_ETIQUETAS_PERSONALES)
      // Los nombres llevan espacios («TIPO DE SANGRE»): PostgREST los acepta
      // entrecomillados dentro del select.
      .select(columnas.map((c) => (c.includes(" ") ? `"${c}"` : c)).join(","))
      .in("CURP", lote);
    if (error) return { ok: false, error: `No se pudieron leer las etiquetas: ${error.message}` };
    for (const f of (data ?? []) as unknown as Record<string, unknown>[]) {
      const curp = String(f.CURP ?? "").trim().toUpperCase();
      if (curp) fichaPorCurp.set(curp, f);
    }
  }

  // Por apellido, como la lista escolar en papel.
  const ordenadas = [...roster.filas].sort((a, b) =>
    nombreDeFila(a).localeCompare(nombreDeFila(b), "es"),
  );

  const cuerpo: string[][] = [];
  let sinFicha = 0;
  for (const f of ordenadas) {
    const ficha = fichaPorCurp.get(f.curp);
    const fila = filaDeHoja(
      hoja,
      {
        curp: f.curp,
        alumno: nombreDeFila(f),
        numeroControl: f.numeroControl,
        grado: f.grado,
        grupo: f.grupo,
        carrera: f.carrera,
      },
      ficha,
    );
    if (celdasConDato(hoja, [fila]) === 0) sinFicha++;
    cuerpo.push(fila);
  }

  const filas = [encabezadosDeHoja(hoja), ...cuerpo];
  const base64 = matrizAXlsxBase64(filas, rotuloHoja(hoja), [
    20, 28, 18, 10, 10, 14, ...columnas.slice(1).map(() => 18),
  ]);

  return {
    ok: true,
    base64,
    hoja,
    nombreArchivo: nombreArchivoHoja(hoja, roster.ciclo),
    alumnos: cuerpo.length,
    sinFicha,
    ciclo: roster.ciclo,
  };
}
