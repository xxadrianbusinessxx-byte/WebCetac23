/**
 * constancia.ts — lecturas para emitir la constancia de estudios (2026-09-25).
 *
 * Dirección la genera DIRECTAMENTE con la CURP de un alumno, sin pasar por una
 * solicitud. Para eso el servidor necesita lo mismo que Administración escolar
 * ya tiene en su expediente: nombre, número de control, grado y carrera del grupo
 * en que está inscrito, y las fechas del ciclo. Todo sale de lecturas que ya
 * existen; aquí solo se juntan.
 *
 * No autoriza: quien llama ya pasó `exigir()` y `resolverAccesoAlumno`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { buscarAlumnoPorCurp, nombreCompletoAlumno } from "../alumno/alumnos.ts";
import { leerNumeroControl } from "../alumno/numero-control.ts";
import { resolverGrupoAlumno } from "../catalogo/catalogo-academico-resolucion.ts";
import { obtenerCicloOperativoGlobal } from "../ciclo/ciclo-estado.ts";
import { TABLA_ALUMNOS } from "../tables.ts";
import type { AlumnoRow } from "../types.ts";
import type { DatosConstancia } from "./constancia-puro.ts";

export type DatosConstanciaSinFecha = Omit<DatosConstancia, "fecha">;

export async function datosConstanciaPorCurp(
  supabase: SupabaseClient,
  curp: string,
): Promise<{ ok: true; datos: DatosConstanciaSinFecha } | { ok: false; error: string }> {
  const alumno = await buscarAlumnoPorCurp(supabase, curp);
  if (!alumno) return { ok: false, error: "No hay ningún alumno con esa CURP." };

  const [grupo, numeroControl, ciclo] = await Promise.all([
    resolverGrupoAlumno(supabase, alumno.CURP),
    leerNumeroControl(supabase, alumno.CURP),
    obtenerCicloOperativoGlobal(supabase),
  ]);

  return {
    ok: true,
    datos: {
      nombre: nombreCompletoAlumno(alumno),
      curp: alumno.CURP,
      numeroControl,
      grado: grupo?.grupo.grado ?? "",
      carrera: grupo?.carrera?.clave ?? "",
      inicioSemestre: ciclo.ok ? (ciclo.periodo?.fecha_inicio ?? null) : null,
      finSemestre: ciclo.ok ? (ciclo.periodo?.fecha_fin ?? null) : null,
    },
  };
}

/** CURP → nombre completo, en UNA consulta. Para que las listas digan a quién. */
export async function nombresDeAlumnos(
  supabase: SupabaseClient,
  curps: readonly string[],
): Promise<Map<string, string>> {
  const unicas = [...new Set(curps)];
  if (unicas.length === 0) return new Map();
  const { data, error } = await supabase
    .from(TABLA_ALUMNOS)
    .select("CURP, P_APELLIDO, S_APELLIDO, NOMBRE, CLAVE")
    .in("CURP", unicas);
  if (error || !data) return new Map();
  return new Map(data.map((a) => [String(a.CURP), nombreCompletoAlumno(a as AlumnoRow)]));
}
