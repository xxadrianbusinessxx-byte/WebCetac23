import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { obtenerCicloOperativoGlobal } from "../ciclo/ciclo-estado.ts";
import { matrizAXlsxBase64 } from "../exportar-xlsx.ts";
import { TABLA_ALUMNOS, TABLA_INSCRIPCIONES_ALUMNO } from "../tables.ts";
import type { AlumnoRow } from "../types.ts";
import { ENCABEZADOS_PLANTILLA_ROSTER, filaPlantillaRoster } from "./plantilla-roster-puro.ts";

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
 * Arma la hoja con el roster activo del ciclo operativo. Dos viajes: las
 * inscripciones activas con su grupo y carrera, y los ALUMNOS por lotes.
 */
export async function generarPlantillaRoster(
  supabase: SupabaseClient,
): Promise<PlantillaRoster | ErrorPlantillaRoster> {
  const ciclo = await obtenerCicloOperativoGlobal(supabase);
  if (!ciclo.ok || !ciclo.periodo) {
    return { ok: false, error: "No hay ciclo operativo del que bajar el roster." };
  }
  const idPeriodo = String(ciclo.periodo.id);
  const nombreCiclo = String(ciclo.periodo.nombre ?? "").trim() || null;

  const { data: inscripciones, error } = await supabase
    .from(TABLA_INSCRIPCIONES_ALUMNO)
    .select("curp, grupos(grado, nombre, periodo_id, carreras(clave))")
    .eq("activo", true);
  if (error) return { ok: false, error: `No se pudo leer el roster: ${error.message}` };

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

  const filas: string[][] = [[...ENCABEZADOS_PLANTILLA_ROSTER]];
  let sinNumeroControl = 0;
  const TAMANO_LOTE = 100;
  const ordenadas: { nombre: string; fila: string[] }[] = [];

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
      const numeroControl = String(a.numero_control ?? "").trim();
      if (!numeroControl) sinNumeroControl++;
      ordenadas.push({
        nombre: [a.P_APELLIDO, a.S_APELLIDO, a.NOMBRE].filter(Boolean).join(" ").trim(),
        fila: filaPlantillaRoster({
          curp,
          pApellido: a.P_APELLIDO ?? "",
          sApellido: a.S_APELLIDO ?? "",
          nombre: a.NOMBRE ?? "",
          numeroControl,
          ...academico,
        }),
      });
    }
  }

  // Por apellido: es el orden en que se revisa una lista escolar en papel.
  ordenadas.sort((x, y) => x.nombre.localeCompare(y.nombre, "es"));
  for (const o of ordenadas) filas.push(o.fila);

  const base64 = matrizAXlsxBase64(filas, "Roster", [20, 20, 20, 24, 18, 10, 10, 14]);
  const sufijo = (nombreCiclo ?? "ciclo").replace(/[^\w-]+/g, "-");
  return {
    ok: true,
    base64,
    nombreArchivo: `roster-${sufijo}.xlsx`,
    alumnos: ordenadas.length,
    sinNumeroControl,
    ciclo: nombreCiclo,
  };
}
