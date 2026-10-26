import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { obtenerCicloOperativoGlobal } from "../ciclo/ciclo-estado.ts";
import { TABLA_ALUMNOS, TABLA_INSCRIPCIONES_ALUMNO } from "../tables.ts";
import type { AlumnoRow } from "../types.ts";
import type { FilaRoster } from "./roster-ciclo-puro.ts";

/**
 * roster-ciclo.ts — LA lectura del padrón del ciclo operativo. 2026-10-25.
 *
 * Existe porque ya hay dos consumidores y no puede haber dos consultas: la
 * plantilla `.xlsx` que se baja para rellenar (`plantilla-roster.ts`) y la
 * pantalla del rol Servicio Escolar, que mira el mismo padrón. Si cada uno
 * leyera por su cuenta, en el momento en que una cambiara de criterio —el
 * periodo, qué cuenta como activo— las dos dirían cosas distintas del mismo
 * ciclo (R6).
 *
 * Solo lectura.
 */

export type RosterDelCiclo =
  | { ok: true; ciclo: string | null; filas: FilaRoster[] }
  | { ok: false; error: string };

type GrupoDeInscripcion = {
  grado: string | null;
  nombre: string | null;
  periodo_id: string | null;
  carreras: { clave: string | null } | { clave: string | null }[] | null;
};

type FilaInscripcion = { curp: string; grupos: GrupoDeInscripcion | GrupoDeInscripcion[] | null };

/** PostgREST devuelve la relación incrustada como objeto o como arreglo de uno. */
function unico<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/**
 * El padrón ACTIVO del ciclo operativo: identidad del alumno más su grado,
 * grupo y carrera. Dos viajes (inscripciones con su grupo, y ALUMNOS por
 * lotes), sin N+1.
 */
export async function leerRosterDelCiclo(supabase: SupabaseClient): Promise<RosterDelCiclo> {
  const ciclo = await obtenerCicloOperativoGlobal(supabase, { cache: true });
  if (!ciclo.ok || !ciclo.periodo) {
    return { ok: false, error: "No hay ciclo operativo del que leer el padrón." };
  }
  const idPeriodo = String(ciclo.periodo.id);
  const nombreCiclo = String(ciclo.periodo.nombre ?? "").trim() || null;

  const { data: inscripciones, error } = await supabase
    .from(TABLA_INSCRIPCIONES_ALUMNO)
    .select("curp, grupos(grado, nombre, periodo_id, carreras(clave))")
    .eq("activo", true);
  if (error) return { ok: false, error: `No se pudo leer el padrón: ${error.message}` };

  // Solo el ciclo OPERATIVO, por `periodos.id` y nunca por el nombre (R5).
  const academicoPorCurp = new Map<string, { grado: string; grupo: string; carrera: string }>();
  for (const fila of (inscripciones ?? []) as FilaInscripcion[]) {
    const curp = String(fila.curp ?? "").trim().toUpperCase();
    if (!curp || academicoPorCurp.has(curp)) continue;
    const g = unico(fila.grupos);
    if (!g || String(g.periodo_id ?? "") !== idPeriodo) continue;
    academicoPorCurp.set(curp, {
      grado: String(g.grado ?? "").trim(),
      grupo: String(g.nombre ?? "").trim(),
      carrera: String(unico(g.carreras)?.clave ?? "").trim(),
    });
  }

  const curps = [...academicoPorCurp.keys()];
  if (curps.length === 0) {
    return { ok: false, error: "El ciclo operativo no tiene ningún alumno inscrito." };
  }

  const filas: FilaRoster[] = [];
  const TAMANO_LOTE = 100;
  for (let i = 0; i < curps.length; i += TAMANO_LOTE) {
    const lote = curps.slice(i, i + TAMANO_LOTE);
    const { data, error: errAlumnos } = await supabase
      .from(TABLA_ALUMNOS)
      .select("CURP, NOMBRE, P_APELLIDO, S_APELLIDO, numero_control")
      .in("CURP", lote);
    if (errAlumnos) return { ok: false, error: `No se pudo leer ALUMNOS: ${errAlumnos.message}` };

    for (const a of (data ?? []) as (AlumnoRow & { numero_control?: string | null })[]) {
      const curp = String(a.CURP ?? "").trim().toUpperCase();
      const academico = academicoPorCurp.get(curp);
      if (!academico) continue;
      filas.push({
        curp,
        pApellido: String(a.P_APELLIDO ?? "").trim(),
        sApellido: String(a.S_APELLIDO ?? "").trim(),
        nombre: String(a.NOMBRE ?? "").trim(),
        numeroControl: String(a.numero_control ?? "").trim(),
        ...academico,
      });
    }
  }

  return { ok: true, ciclo: nombreCiclo, filas };
}
