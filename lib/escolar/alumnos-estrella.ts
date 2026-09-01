import type { SupabaseClient } from "@supabase/supabase-js";
import { TABLA_ALUMNOS } from "./tables";
import type { AlumnoRow } from "./types";
import {
  listarEtiquetasStatus,
  promedioDesdeFilaStatus,
  type AlumnoEstrella,
} from "./etiquetas-status";
import { STATUS_COL_CURP } from "./etiquetas-schema";
import { nombreCompletoAlumno } from "./alumnos";

export type { AlumnoEstrella };

function celdaStatus(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

/**
 * Mejores alumnos según promedios en ETIQUETAS (STATUS).
 *
 * FASE 10 — reducción de payload medida: antes se descargaba el roster
 * COMPLETO de ALUMNOS (471 filas ≈ 54 KB) en CADA visita a la página de
 * inicio (`actionAlumnosEstrella`) para después cruzarlo con ESTATUS. Ahora se
 * parte de ESTATUS (fuente del promedio), se toman los top-N CURP y se
 * consultan SOLO esos alumnos en ALUMNOS con `in()`.
 *
 * Nota de comportamiento: si un CURP de ESTATUS no existiera en ALUMNOS, el
 * resultado puede quedar con menos de `limite` elementos (antes se rellenaba
 * con el siguiente puesto). En datos reales los CURP de ESTATUS provienen de
 * ALUMNOS, así que el resultado es equivalente.
 */
export async function obtenerAlumnosEstrella(
  supabase: SupabaseClient,
  limite = 4,
): Promise<AlumnoEstrella[]> {
  const filasStatus = await listarEtiquetasStatus(supabase);

  const conPromedio: { curp: string; promedio: number }[] = [];
  for (const fila of filasStatus) {
    const curp = celdaStatus(fila[STATUS_COL_CURP] ?? fila.curp).toUpperCase();
    if (!curp) continue;
    const promedio = promedioDesdeFilaStatus(fila);
    if (promedio <= 0) continue;
    conPromedio.push({ curp, promedio });
  }

  conPromedio.sort((a, b) => b.promedio - a.promedio);
  const top = conPromedio.slice(0, limite);
  if (top.length === 0) return [];

  const { data, error } = await supabase
    .from(TABLA_ALUMNOS)
    .select("CURP, P_APELLIDO, S_APELLIDO, NOMBRE, CLAVE")
    .in("CURP", top.map((t) => t.curp));

  if (error || !data?.length) return [];

  const porCurp = new Map<string, AlumnoRow>();
  for (const a of data as AlumnoRow[]) {
    porCurp.set(a.CURP.trim().toUpperCase(), a);
  }

  const resultado: AlumnoEstrella[] = [];
  for (const t of top) {
    const alumno = porCurp.get(t.curp);
    if (!alumno) continue;
    resultado.push({
      alumno,
      promedio: t.promedio,
      nombre: nombreCompletoAlumno(alumno),
    });
  }
  return resultado;
}
