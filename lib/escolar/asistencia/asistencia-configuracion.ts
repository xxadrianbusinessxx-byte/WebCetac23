import type { SupabaseClient } from "@supabase/supabase-js";
import {
  obtenerCicloOperativoGlobal,
} from "../ciclo/ciclo-estado.ts";
import {
  diaSemanaDesdeFecha,
} from "../ciclo/calendario.ts";
import {
  normalizarCarreraCatalogo,
  normalizarGradoCatalogo,
  normalizarGrupoCatalogo,
  type CarreraRow,
  type GrupoRow,
  type PeriodoRow,
} from "../catalogo/catalogo-academico.ts";
import {
  nombreCompletoAlumno,
} from "../alumno/alumnos.ts";
import {
  claveOrdenAlumno,
  compararPorClaveOrden,
} from "../alumno/orden-alumnos.ts";
import {
  TABLA_ALUMNOS,
  TABLA_CARRERAS,
  TABLA_CONFIGURACION_CLASES_PROFESOR,
  TABLA_GRUPOS,
  TABLA_INSCRIPCIONES_ALUMNO,
} from "../tables.ts";
import type {
  AlumnoRow,
} from "../types.ts";
import {
  CLAVE_DIA_A_COLUMNA,
  TAMANO_PAGINA,
  norm,
} from "./asistencia-comun.ts";
import type {
  AlumnoPlantilla,
  ConfiguracionClasesProfesor,
} from "./asistencia-comun.ts";
/** ConfiguraciÃ³n vacÃ­a por defecto (todas las clases en 0). */
export function configuracionVacia(profesorClave: string): ConfiguracionClasesProfesor {
  return {
    profesor_clave: profesorClave,
    lunes: 0,
    martes: 0,
    miercoles: 0,
    jueves: 0,
    viernes: 0,
  };
}

/** Obtiene la configuraciÃ³n semanal de clases de un profesor (o null si no existe). */
export async function obtenerConfiguracionClasesProfesor(
  supabase: SupabaseClient,
  profesorClave: string,
): Promise<ConfiguracionClasesProfesor | null> {
  const clave = norm(profesorClave);
  if (!clave) return null;

  const { data, error } = await supabase
    .from(TABLA_CONFIGURACION_CLASES_PROFESOR)
    .select("profesor_clave, lunes, martes, miercoles, jueves, viernes")
    .eq("profesor_clave", clave)
    .maybeSingle();

  if (error || !data) return null;
  return data as ConfiguracionClasesProfesor;
}

/**
 * Guarda (UPSERT) la configuraciÃ³n semanal de clases de un profesor.
 * La identidad es `profesor_clave` (de la sesiÃ³n). Re-guardar actualiza, no
 * duplica. Valida que cada dÃ­a sea un entero >= 0.
 */
export async function guardarConfiguracionClasesProfesor(
  supabase: SupabaseClient,
  input: {
    profesorClave: string;
    lunes: number;
    martes: number;
    miercoles: number;
    jueves: number;
    viernes: number;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const clave = norm(input.profesorClave);
  if (!clave) return { ok: false, error: "No se pudo identificar al profesor." };

  const dias: [keyof ConfiguracionClasesProfesor, number][] = [
    ["lunes", input.lunes],
    ["martes", input.martes],
    ["miercoles", input.miercoles],
    ["jueves", input.jueves],
    ["viernes", input.viernes],
  ];
  for (const [dia, valor] of dias) {
    if (!Number.isInteger(valor) || valor < 0) {
      return { ok: false, error: `El valor de ${dia} debe ser un entero >= 0.` };
    }
  }

  const { error } = await supabase
    .from(TABLA_CONFIGURACION_CLASES_PROFESOR)
    .upsert(
      {
        profesor_clave: clave,
        lunes: input.lunes,
        martes: input.martes,
        miercoles: input.miercoles,
        jueves: input.jueves,
        viernes: input.viernes,
      },
      { onConflict: "profesor_clave" },
    );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** NÃºmero de clases que el profesor imparte en una fecha segÃºn su configuraciÃ³n. */
export function clasesDelProfesorParaFecha(
  config: ConfiguracionClasesProfesor | null,
  fecha: string,
): number {
  if (!config) return 0;
  const dia = diaSemanaDesdeFecha(fecha);
  const columna = CLAVE_DIA_A_COLUMNA[dia];
  const valor = config[columna];
  return typeof valor === "number" ? valor : 0;
}


export type GrupoAsistencia = { grado: string; grupo: string; carrera: string };

type ContextoCatalogoAsistencia = {
  periodoNombre: string;
  periodoId: string;
  indice: Map<string, { id: string; grado: string; grupo: string; carreraClave: string }>;
};

/**
 * C4.3 â€” Carga los grupos activos del PERIODO ACTIVO del catÃ¡logo, indexados
 * por identidad normalizada (G2). `periodos` es la autoridad del periodo;
 * `calendario_escolar` permanece responsable de fechas/clases.
 */
export async function cargarContextoCatalogoAsistencia(
  supabase: SupabaseClient,
): Promise<ContextoCatalogoAsistencia | null> {
  const r = await obtenerCicloOperativoGlobal(supabase);
  if (!r.ok || !r.periodo) return null;
  const periodo = r.periodo as unknown as PeriodoRow;

  const { data: grupos } = await supabase
    .from(TABLA_GRUPOS)
    .select("*")
    .eq("periodo_id", periodo.id)
    .eq("activo", true);
  const filasGrupos = (grupos ?? []) as GrupoRow[];

  const carreraIds = [
    ...new Set(filasGrupos.map((g) => g.carrera_id).filter((x): x is string => Boolean(x))),
  ];
  const claveCarreraPorId = new Map<string, string>();
  if (carreraIds.length) {
    const { data: carreras } = await supabase
      .from(TABLA_CARRERAS)
      .select("*")
      .in("id", carreraIds);
    for (const c of (carreras ?? []) as CarreraRow[]) {
      claveCarreraPorId.set(c.id, normalizarCarreraCatalogo(c.clave));
    }
  }

  const indice = new Map<string, { id: string; grado: string; grupo: string; carreraClave: string }>();
  for (const g of filasGrupos) {
    const carreraClave = g.carrera_id ? (claveCarreraPorId.get(g.carrera_id) ?? "") : "";
    const key = `${normalizarGradoCatalogo(g.grado)}|${normalizarGrupoCatalogo(g.nombre)}|${carreraClave}`;
    indice.set(key, { id: g.id, grado: g.grado, grupo: g.nombre, carreraClave });
  }
  return { periodoNombre: periodo.nombre, periodoId: periodo.id, indice };
}

/** CURPs con inscripciÃ³n ACTIVA en un grupo del catÃ¡logo (paginado). */
export async function obtenerCurpsInscritasGrupo(
  supabase: SupabaseClient,
  grupoId: string,
): Promise<Set<string>> {
  const curps = new Set<string>();
  let desde = 0;
  while (true) {
    const { data, error } = await supabase
      .from(TABLA_INSCRIPCIONES_ALUMNO)
      .select("curp")
      .eq("grupo_id", grupoId)
      .eq("activo", true)
      .range(desde, desde + TAMANO_PAGINA - 1);
    if (error || !data || data.length === 0) break;
    for (const r of data as Array<{ curp: string }>) {
      const c = norm(String(r.curp ?? ""));
      if (c) curps.add(c);
    }
    if (data.length < TAMANO_PAGINA) break;
    desde += TAMANO_PAGINA;
  }
  return curps;
}

/** Nombres completos desde ALUMNOS para un set de CURPs (paginado, sin N+1). */
export async function completarNombresAlumnos(
  supabase: SupabaseClient,
  curps: Set<string>,
): Promise<AlumnoPlantilla[]> {
  const porCurp = new Map<string, { nombre: string; claveOrden: string }>();
  let desde = 0;
  while (true) {
    const { data, error } = await supabase
      .from(TABLA_ALUMNOS)
      .select("CURP, NOMBRE, P_APELLIDO, S_APELLIDO")
      .range(desde, desde + TAMANO_PAGINA - 1);
    if (error || !data || data.length === 0) break;
    for (const r of data as AlumnoRow[]) {
      const c = norm(String(r.CURP ?? ""));
      if (c && curps.has(c)) {
        porCurp.set(c, {
          nombre: nombreCompletoAlumno(r),
          claveOrden: claveOrdenAlumno(r),
        });
      }
    }
    if (data.length < TAMANO_PAGINA) break;
    desde += TAMANO_PAGINA;
  }
  const alumnos: AlumnoPlantilla[] = [];
  for (const curp of curps) {
    const datos = porCurp.get(curp);
    alumnos.push({
      curp,
      nombre: datos?.nombre ?? "",
      claveOrden: datos?.claveOrden ?? "",
    });
  }
  // Estandar escolar: apellido paterno A->Z, no por nombre de pila.
  alumnos.sort(compararPorClaveOrden);
  return alumnos;
}

