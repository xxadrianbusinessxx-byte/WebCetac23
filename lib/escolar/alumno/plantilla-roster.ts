import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { matrizAXlsxBase64 } from "../exportar-xlsx.ts";
import { ENCABEZADOS_PLANTILLA_ROSTER, filaPlantillaRoster } from "./plantilla-roster-puro.ts";
import { leerRosterDelCiclo } from "./roster-ciclo.ts";
import { nombreDeFila } from "./roster-ciclo-puro.ts";

/**
 * plantilla-roster.ts — descarga del roster ACTUAL como plantilla rellenable.
 * 2026-10-25.
 *
 * Para qué. La carga masiva nunca trajo el número de control: 356 de los 357
 * alumnos del ciclo no lo tienen, y sin él no se emite la constancia. Capturar
 * 356 a mano, uno por uno, no es trabajo que se le pueda pedir a nadie. Esto
 * baja el roster tal como está —con su grado, grupo y carrera para poder
 * identificar a cada quien— para rellenar lo que falte en una hoja y volver a
 * subirlo por la MISMA carga de siempre.
 *
 * Por eso los encabezados NO son decorativos: son exactamente los alias que
 * `mapeo-columnas.ts` reconoce. Bajar, rellenar y subir no necesita mapear
 * nada a mano, y eso es lo que hace que el viaje de ida y vuelta funcione.
 *
 * El padrón NO se lee aquí: lo da `roster-ciclo.ts`, que es la misma lectura
 * que usa la pantalla del rol Servicio Escolar. Dos consultas al mismo padrón
 * acabarían diciendo cosas distintas del mismo ciclo (R6).
 *
 * Solo lectura: este módulo no escribe nada.
 */

export type PlantillaRoster = {
  ok: true;
  base64: string;
  nombreArchivo: string;
  /** Cuántos alumnos lleva la hoja. */
  alumnos: number;
  /** De ellos, cuántos van con el número de control vacío (lo que hay que rellenar). */
  sinNumeroControl: number;
  ciclo: string | null;
};

export type ErrorPlantillaRoster = { ok: false; error: string };

/** Arma la hoja con el roster activo del ciclo operativo. */
export async function generarPlantillaRoster(
  supabase: SupabaseClient,
): Promise<PlantillaRoster | ErrorPlantillaRoster> {
  const roster = await leerRosterDelCiclo(supabase);
  if (!roster.ok) return { ok: false, error: roster.error };

  // Por apellido: es el orden en que se revisa una lista escolar en papel.
  const ordenadas = [...roster.filas].sort((a, b) =>
    nombreDeFila(a).localeCompare(nombreDeFila(b), "es"),
  );

  const filas: string[][] = [[...ENCABEZADOS_PLANTILLA_ROSTER]];
  let sinNumeroControl = 0;
  for (const f of ordenadas) {
    if (!f.numeroControl) sinNumeroControl++;
    filas.push(filaPlantillaRoster(f));
  }

  const base64 = matrizAXlsxBase64(filas, "Roster", [20, 20, 20, 24, 18, 10, 10, 14]);
  const sufijo = (roster.ciclo ?? "ciclo").replace(/[^\w-]+/g, "-");
  return {
    ok: true,
    base64,
    nombreArchivo: `roster-${sufijo}.xlsx`,
    alumnos: ordenadas.length,
    sinNumeroControl,
    ciclo: roster.ciclo,
  };
}
