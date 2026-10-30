import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { nombreCompletoAlumno } from "./alumnos.ts";
import { obtenerCicloOperativoGlobal } from "../ciclo/ciclo-estado.ts";
import { TABLA_ALUMNO_ETIQUETAS, TABLA_ALUMNOS, TABLA_INSCRIPCIONES_ALUMNO } from "../tables.ts";
import type { AlumnoRow } from "../types.ts";
import {
  curpsARevisar,
  debeListarse,
  faltantesDeAlumno,
  notasDePendientes,
  resumenDatosIncompletos,
  TITULO_ETIQUETA_PENDIENTE,
  type AlumnoIncompleto,
  type EtiquetaDeAlumno,
  type ResumenDatosIncompletos,
} from "./datos-incompletos-puro.ts";

/**
 * datos-incompletos.ts — qué alumnos del ciclo operativo no tienen la
 * información primordial (CURP, nombre completo y número de control).
 * 2026-10-25.
 *
 * Es la lectura que alimenta Notificaciones de Administración escolar: ese rol
 * es el que emite constancias, y la constancia no sale sin número de control.
 *
 * Alcance: el ROSTER ACTIVO del ciclo operativo, no la tabla ALUMNOS entera.
 * Un alumno que ya no cursa no es un pendiente administrativo, y mezclarlo
 * convertiría el aviso en una lista que nadie puede cerrar.
 * Excepción (PROMPT AB, 2026-10-29): los alumnos marcados con la etiqueta
 * «Pendiente de administración» entran aunque no estén inscritos — es
 * justamente lo que les falta —, y salen cuando Administración quita la marca.
 *
 * Solo lectura: este módulo no escribe nada. Corregir el dato se hace donde ya
 * se hacía (el expediente del alumno), que es la única fuente de esa escritura.
 */

export type DatosIncompletosDelCiclo = {
  ok: boolean;
  /** Nombre del ciclo operativo, para que el aviso diga de qué ciclo habla. */
  ciclo: string | null;
  resumen: ResumenDatosIncompletos;
  alumnos: AlumnoIncompleto[];
  error?: string;
};

const VACIO: ResumenDatosIncompletos = {
  revisados: 0,
  incompletos: 0,
  porConfirmar: 0,
  porCampo: { curp: 0, nombre: 0, grupo: 0, numero_control: 0 },
};

type GrupoDeInscripcion = { grado: string | null; nombre: string | null; periodo_id: string | null };
type FilaInscripcion = {
  curp: string;
  grupos: GrupoDeInscripcion | GrupoDeInscripcion[] | null;
};

/** PostgREST devuelve la relación incrustada como objeto o como arreglo de uno. */
function grupoDe(fila: FilaInscripcion): GrupoDeInscripcion | null {
  return Array.isArray(fila.grupos) ? (fila.grupos[0] ?? null) : fila.grupos;
}

/** Descripción corta del grupo («5TO A»), o `null` si la inscripción no lo trae. */
function descripcionGrupo(g: GrupoDeInscripcion | null): string | null {
  if (!g) return null;
  const texto = [g.grado, g.nombre].filter(Boolean).join(" ").trim();
  return texto || null;
}

/**
 * Revisa el roster activo del ciclo operativo, más los marcados como
 * pendientes, y devuelve a quién le falta qué. Tres viajes: las inscripciones
 * activas con su grupo, las marcas, y los ALUMNOS de esas CURP por lotes (sin N+1).
 */
export async function leerDatosIncompletosDelCiclo(
  supabase: SupabaseClient,
): Promise<DatosIncompletosDelCiclo> {
  const ciclo = await obtenerCicloOperativoGlobal(supabase, { cache: true });
  if (!ciclo.ok || !ciclo.periodo) {
    return { ok: false, ciclo: null, resumen: VACIO, alumnos: [], error: "No hay ciclo operativo." };
  }
  const nombreCiclo = String(ciclo.periodo.nombre ?? "").trim() || null;

  const { data: inscripciones, error } = await supabase
    .from(TABLA_INSCRIPCIONES_ALUMNO)
    .select("curp, grupos(grado, nombre, periodo_id)")
    .eq("activo", true);
  if (error) {
    return { ok: false, ciclo: nombreCiclo, resumen: VACIO, alumnos: [], error: error.message };
  }

  // Solo el ciclo OPERATIVO, por `periodos.id` y nunca por el nombre (R5): una
  // inscripción activa de otro ciclo no es un pendiente administrativo de hoy.
  // Una CURP puede repetirse si hubiera más de una inscripción activa (es un
  // error conocido del catálogo): se queda con la primera y no se cuenta dos veces.
  const idPeriodo = String(ciclo.periodo.id);
  const grupoPorCurp = new Map<string, string | null>();
  for (const fila of (inscripciones ?? []) as FilaInscripcion[]) {
    const curp = String(fila.curp ?? "").trim().toUpperCase();
    if (!curp || grupoPorCurp.has(curp)) continue;
    const g = grupoDe(fila);
    if (!g || String(g.periodo_id ?? "") !== idPeriodo) continue;
    grupoPorCurp.set(curp, descripcionGrupo(g));
  }

  // Las marcas: `ilike` acota en la base con un patrón holgado (mayúsculas y
  // espacios de más pasan) y el puro decide del todo.
  const { data: etiquetas, error: errEtiquetas } = await supabase
    .from(TABLA_ALUMNO_ETIQUETAS)
    .select("curp, titulo, valor")
    .ilike("titulo", `%${TITULO_ETIQUETA_PENDIENTE.split(" ").join("%")}%`);
  if (errEtiquetas) {
    return { ok: false, ciclo: nombreCiclo, resumen: VACIO, alumnos: [], error: errEtiquetas.message };
  }
  const notaPorCurp = notasDePendientes((etiquetas ?? []) as EtiquetaDeAlumno[]);

  const curps = curpsARevisar([...grupoPorCurp.keys()], notaPorCurp.keys());
  if (curps.length === 0) {
    return { ok: true, ciclo: nombreCiclo, resumen: VACIO, alumnos: [] };
  }

  const incompletos: AlumnoIncompleto[] = [];
  const TAMANO_LOTE = 100;
  for (let i = 0; i < curps.length; i += TAMANO_LOTE) {
    const lote = curps.slice(i, i + TAMANO_LOTE);
    const { data: filas, error: errAlumnos } = await supabase
      .from(TABLA_ALUMNOS)
      .select("CURP, NOMBRE, P_APELLIDO, S_APELLIDO, numero_control")
      .in("CURP", lote);
    if (errAlumnos) {
      return { ok: false, ciclo: nombreCiclo, resumen: VACIO, alumnos: [], error: errAlumnos.message };
    }
    for (const f of (filas ?? []) as (AlumnoRow & { numero_control?: string | null })[]) {
      const curp = String(f.CURP ?? "").trim().toUpperCase();
      const faltantes = faltantesDeAlumno({
        curp,
        nombre: f.NOMBRE,
        pApellido: f.P_APELLIDO,
        sApellido: f.S_APELLIDO,
        numeroControl: f.numero_control ?? null,
        tieneGrupo: grupoPorCurp.has(curp),
      });
      const nota = notaPorCurp.get(curp) ?? null;
      if (!debeListarse(faltantes, nota)) continue;
      incompletos.push({
        curp,
        nombre: nombreCompletoAlumno(f) || curp,
        grupo: grupoPorCurp.get(curp) ?? null,
        faltantes,
        nota,
      });
    }
  }

  incompletos.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return {
    ok: true,
    ciclo: nombreCiclo,
    resumen: resumenDatosIncompletos(curps.length, incompletos),
    alumnos: incompletos,
  };
}
