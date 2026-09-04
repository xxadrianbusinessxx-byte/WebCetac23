import { obtenerCicloOperativoGlobal } from "./ciclo-estado";

﻿import type { SupabaseClient } from "@supabase/supabase-js";
import { archivoCsvAFilasConValores } from "./csv";
import { matrizAXlsxBase64 } from "./exportar-xlsx";
import { CURP_ALUMNO_RE } from "./buscar-en-filas";
import {
  diaSemanaDesdeFecha,
  obtenerCalendarioDePeriodo,
  obtenerCalendarioEscolar,
  type DiaCalendarioRow,
  type DiaSemana,
} from "./calendario";
import { detectarColumnasFechaAsistencia } from "./fechas";
import {
  filtrarDiasDeParcial,
  type ParcialAsistencia,
} from "./asistencia-parcial";

import {
  normalizarCarreraCatalogo,
  normalizarGradoCatalogo,
  normalizarGrupoCatalogo,
  type CarreraRow,
  type GrupoRow,
  type PeriodoRow,
} from "./catalogo-academico";
import { carreraEscolarDesdeEtiquetas } from "./informacion-personal";
import { nombreCompletoAlumno } from "./alumnos";
import {
  TABLA_ALUMNOS,
  TABLA_ASISTENCIA_ALUMNOS,
  TABLA_CARRERAS,
  TABLA_CLASES_IMPARTIDAS,
  TABLA_CONFIGURACION_CLASES_PROFESOR,
  TABLA_ETIQUETAS_PERSONALES,
  TABLA_GRUPO_MATERIAS,
  TABLA_GRUPOS,
  TABLA_INSCRIPCIONES_ALUMNO,
  type TipoDiaCalendario,
} from "./tables";

import {
  buscarGrupoEnLista,
  clavesEquivalenciaMateria,
  materiaClaveHorario,
  obtenerBloquesHorario,
  obtenerConteosHorarioMateria,
  obtenerGruposConCarreraDePeriodo,
  obtenerPeriodoPorNombre,
} from "./horario-semanal";

import {
  ERROR_ATRIBUCION_MATERIA_NO_RESUELTA,
  ERROR_ATRIBUCION_SIN_PROFESOR_ID,
  atribuirMateriaAlPlan,
} from "./atribucion-profesor";
import { traspasarMateriaAProfesor } from "./traspaso-materia";

import type { AlumnoRow, EtiquetasPersonalesRow } from "./types";

/**
 * @deprecated TransiciÃ³n legacy â†’ catÃ¡logo acadÃ©mico.
 * Mientras sea `true`, los listados de asistencia pueden caer al fallback de
 * ETIQUETAS PERSONALES (GRADO/GRUPO/CARRERA) cuando el grupo no se resuelve en
 * el catÃ¡logo o aÃºn no tiene inscripciones. La ruta PRINCIPAL ya usa el
 * catÃ¡logo (inscripciones_alumno â†’ grupos â†’ carreras).
 * Cambiar a `false` solo cuando la migraciÃ³n de inscripciones estÃ© verificada.
 */
const FALLBACK_LEGACY_ETIQUETAS_ACTIVO = true;

/**
 * FASE HORARIO — Control de compatibilidad (LEGACY).
 *
 * `configuracion_clases_profesor` perdió su autoridad como fuente de la
 * cantidad de clases por día: ahora el HORARIO SEMANAL OFICIAL
 * (`horario_semanal`, módulo lib/escolar/horario-semanal.ts) determina los
 * bloques programados. Mientras sea `true`, si el grupo/periodo NO tiene
 * horario cargado se conserva el comportamiento anterior (configuración
 * manual) para no romper flujos en curso. Marcar a `false` solo cuando la
 * migración de todos los grupos activos a horario esté verificada.
 * La tabla NO se elimina físicamente (ver supabase/crear-horario-semanal.sql).
 */
export const FALLBACK_LEGACY_CONFIG_CLASES_ACTIVO = false;

/**
 * PROMPT C (R-1/R-3) — esquema de atribución pendiente.
 * Se requiere la columna `grupo_materia_id` (+ `profesor_id` compatible) en
 * clases_impartidas y asistencia_alumnos (supabase/agregar-atribucion-
 * profesor-asistencia.sql). Mientras no exista, NO se escribe nada usando la
 * contraseña como identidad (seguridad R-2/R-3).
 */
export const ERROR_DDL_ATRIBUCION_PENDIENTE =
  "Esquema de atribución pendiente: aplica supabase/agregar-atribucion-profesor-asistencia.sql (columnas profesor_id / grupo_materia_id) en Supabase antes de guardar asistencias. No se escribirá nada con la contraseña.";

/** ¿La columna existe en la tabla? (probe de esquema, 1 consulta). */
async function columnaExiste(
  supabase: SupabaseClient,
  tabla: string,
  columna: string,
): Promise<boolean> {
  const { error } = await supabase
    .from(tabla)
    .select(columna)
    .limit(1);
  return !error;
}



/**
 * Dominio de ASISTENCIAS DEL PROFESOR (Bloque 5B).
 *
 * Cada fila de `asistencia_alumnos` representa el aporte INDEPENDIENTE de UN
 * profesor:
 *
 *   (profesor_clave, curp, grado, grupo, fecha) â†’ clases_asistidas
 *
 * Esto permite que varios profesores actualicen su propio aporte mediante
 * UPSERT sin acumular ni sobrescribir el aporte de otro profesor. El total real
 * del alumno se calcula con SUM(clases_asistidas) y NUNCA se almacena.
 *
 * La identidad del profesor SIEMPRE es `profesor_clave` (matrÃ­cula de la
 * sesiÃ³n), nunca un valor del archivo ni del navegador.
 */

export type ContextoAsistencia = {
  grado: string;
  grupo: string;
  carrera: string;
  ciclo: string;
  /**
   * CICLO GLOBAL — id del periodo OPERATIVO cuando el contexto viene resuelto
   * en el servidor (obtenerCicloOperativoGlobal). Con `periodoId` el
   * calendario se lee POR PERIODO (obtenerCalendarioDePeriodo); sin él se
   * conserva la lectura legacy por texto (`ciclo_escolar`).
   */
  periodoId?: string;
  /** Parcial (`periodos_evaluacion`) elegido por el profesor para la plantilla. */
  evaluacionId?: string | null;
  /** Parciales activos del periodo operativo (para acotar fechas por rango). */
  evaluaciones?: ParcialAsistencia[];
  profesorClave: string;
  /** Prompt B — PROFESORES.ID (identidad estructural) para escrituras nuevas. */
  profesorId?: number | null;
  profesorNombre: string;
  /** FASE HORARIO — materia del horario oficial (clave normalizada) para
   *  derivar la fila CLASES contando sus bloques por día. */
  materiaClave?: string;
};

export type AlumnoPlantilla = {
  curp: string;
  nombre: string;
};

export type PlantillaAsistencia = {
  fechas: string[];
  alumnos: AlumnoPlantilla[];
  /** Contenido binario del .xlsx en base64 (para descargar en el cliente). */
  base64: string;
  nombreArchivo: string;
  /** FASE HORARIO — true cuando la fila CLASES se derivó del horario oficial. */
  usaHorario: boolean;
  /** Aviso de la derivación (p. ej. sin asignación en el grupo). */
  aviso?: string | null;
};

export type ResumenAsistencia = {
  procesados: number;
  actualizados: number;
  sinCambios: number;
  omitidos: number;
  errores: number;
  /** DÃ­as de clase del ciclo en los que el profesor tiene clases segÃºn su
   *  configuraciÃ³n pero que NO vienen en el archivo. Quedan PENDIENTES (no se
   *  marcan como falta). */
  pendientes: number;
  /** Discrepancias entre la fila CLASES del archivo y la configuraciÃ³n semanal
   *  del profesor (fuente de verdad). Son informativas: NO alteran la config. */
  discrepancias: number;
  omitidosDetalle: string[];
  erroresDetalle: string[];
  pendientesDetalle: string[];
  discrepanciasDetalle: string[];
  /** FASE HORARIO — 'horario' (oficial) | 'configuracion' (legacy). */
  fuenteClases: "horario" | "configuracion";
  /** true = la fila CLASES se derivó del horario oficial del grupo. */
  usaHorario: boolean;
  /** Aviso de la derivación (p. ej. sin asignación en el grupo). */
  aviso?: string | null;
};


export type PlanAsistencia = {
  clasesImpartidas: {
    profesor_clave: string;
    grado: string;
    grupo: string;
    carrera: string;
    fecha: string;
    clases: number;
  }[];
  asistencias: {
    profesor_clave: string;
    curp: string;
    grado: string;
    grupo: string;
    carrera: string;
    nombre: string;
    fecha: string;
    clases_asistidas: number;
  }[];
  resumen: ResumenAsistencia;
};

export type ResultadoPlantilla =
  | { ok: true; plantilla: PlantillaAsistencia }
  | { ok: false; error: string };

export type ResultadoAnalisis =
  | { ok: true; plan: PlanAsistencia }
  | { ok: false; error: string };

const TAMANO_PAGINA = 1000;
const TAMANO_LOTE = 100;

/** Normaliza grado/grupo/carrera a mayÃºsculas y sin espacios. */
function norm(texto: string): string {
  return texto.trim().toUpperCase();
}

/** Â¿El texto es un entero no negativo? */
function esEnteroNoNegativo(texto: string): boolean {
  return /^\d+$/.test(texto.trim());
}


/** Convierte una celda (string | number) a texto recortado. */
function celdaTexto(celda: string | number | null | undefined): string {
  if (celda == null) return "";
  return String(celda).trim();
}


/** ConfiguraciÃ³n semanal de clases de un profesor (Bloque 5C). */
export type ConfiguracionClasesProfesor = {
  profesor_clave: string;
  lunes: number;
  martes: number;
  miercoles: number;
  jueves: number;
  viernes: number;
};

/** Claves de dÃ­a de semana â†’ columna de la configuraciÃ³n. */
const CLAVE_DIA_A_COLUMNA: Record<DiaSemana, keyof ConfiguracionClasesProfesor> = {
  lunes: "lunes",
  martes: "martes",
  miercoles: "miercoles",
  jueves: "jueves",
  viernes: "viernes",
  sabado: "lunes", // no aplica (no es dÃ­a escolar)
  domingo: "lunes", // no aplica (no es dÃ­a escolar)
};

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


type GrupoAsistencia = { grado: string; grupo: string; carrera: string };

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
async function cargarContextoCatalogoAsistencia(
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
async function obtenerCurpsInscritasGrupo(
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
async function completarNombresAlumnos(
  supabase: SupabaseClient,
  curps: Set<string>,
): Promise<AlumnoPlantilla[]> {
  const porCurp = new Map<string, string>();
  let desde = 0;
  while (true) {
    const { data, error } = await supabase
      .from(TABLA_ALUMNOS)
      .select("CURP, NOMBRE, P_APELLIDO, S_APELLIDO")
      .range(desde, desde + TAMANO_PAGINA - 1);
    if (error || !data || data.length === 0) break;
    for (const r of data as AlumnoRow[]) {
      const c = norm(String(r.CURP ?? ""));
      if (c && curps.has(c)) porCurp.set(c, nombreCompletoAlumno(r));
    }
    if (data.length < TAMANO_PAGINA) break;
    desde += TAMANO_PAGINA;
  }
  const alumnos: AlumnoPlantilla[] = [];
  for (const curp of curps) alumnos.push({ curp, nombre: porCurp.get(curp) ?? "" });
  alumnos.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return alumnos;
}

/**
 * C4.3 â€” Lista los grupos (grado + grupo + carrera) para asistencia.
 * Fuente primaria: catÃ¡logo (periodos â†’ grupos â†’ carreras).
 * Fallback LEGACY temporal (ETIQUETAS PERSONALES) solo si no hay periodo
 * activo o el catÃ¡logo no tiene grupos.
 */
export async function listarGruposAsistencia(
  supabase: SupabaseClient,
): Promise<GrupoAsistencia[]> {
  const catalogo = await cargarContextoCatalogoAsistencia(supabase);
  if (catalogo && catalogo.indice.size > 0) {
    const grupos = new Map<string, GrupoAsistencia>();
    for (const item of catalogo.indice.values()) {
      grupos.set(`${item.grado}|${item.grupo}|${item.carreraClave}`, {
        grado: item.grado,
        grupo: item.grupo,
        carrera: item.carreraClave,
      });
    }
    return [...grupos.values()].sort((a, b) =>
      `${a.grado} ${a.grupo} ${a.carrera}`.localeCompare(
        `${b.grado} ${b.grupo} ${b.carrera}`,
        "es",
      ),
    );
  }
  // Fallback LEGACY temporal (sin periodo activo / catÃ¡logo sin grupos).
  if (FALLBACK_LEGACY_ETIQUETAS_ACTIVO) {
    return listarGruposAsistenciaLegacy(supabase);
  }
  return [];
}

/**
 * @deprecated Fallback LEGACY temporal: grupos derivados de ETIQUETAS
 * PERSONALES (GRADO/GRUPO/CARRERA). Se eliminarÃ¡ cuando la migraciÃ³n de
 * inscripciones estÃ© verificada (ver FALLBACK_LEGACY_ETIQUETAS_ACTIVO).
 */
async function listarGruposAsistenciaLegacy(
  supabase: SupabaseClient,
): Promise<GrupoAsistencia[]> {
  const grupos = new Map<string, GrupoAsistencia>();
  let desde = 0;
  while (true) {
    const { data, error } = await supabase
      .from(TABLA_ETIQUETAS_PERSONALES)
      .select("GRADO, GRUPO, CARRERA")
      .range(desde, desde + TAMANO_PAGINA - 1);

    if (error || !data || data.length === 0) break;

    for (const r of data as EtiquetasPersonalesRow[]) {
      const grado = norm(String(r.GRADO ?? ""));
      const grupo = norm(String(r.GRUPO ?? ""));
      if (!grado || !grupo) continue;
      const carrera = norm(carreraEscolarDesdeEtiquetas(r));
      const key = `${grado}|${grupo}|${carrera}`;
      if (!grupos.has(key)) grupos.set(key, { grado, grupo, carrera });
    }

    if (data.length < TAMANO_PAGINA) break;
    desde += TAMANO_PAGINA;
  }

  return [...grupos.values()].sort((a, b) =>
    `${a.grado} ${a.grupo} ${a.carrera}`.localeCompare(
      `${b.grado} ${b.grupo} ${b.carrera}`,
      "es",
    ),
  );
}

/**
 * C4.3 â€” Obtiene los alumnos de un grado/grupo/carrera.
 * Fuente primaria: inscripciones_alumno (activas) del grupo del catÃ¡logo,
 * completando el nombre desde ALUMNOS.
 * Fallback LEGACY temporal (ETIQUETAS PERSONALES) solo si el grupo no se
 * resuelve en el catÃ¡logo o aÃºn no tiene inscripciones.
 */
export async function obtenerAlumnosDelGrupo(
  supabase: SupabaseClient,
  grado: string,
  grupo: string,
  carrera: string,
): Promise<AlumnoPlantilla[]> {
  const g = norm(grado);
  const gr = norm(grupo);
  const c = norm(carrera);
  if (!g || !gr) return [];

  // Fuente primaria: catÃ¡logo.
  const catalogo = await cargarContextoCatalogoAsistencia(supabase);
  if (catalogo) {
    const key = `${normalizarGradoCatalogo(g)}|${normalizarGrupoCatalogo(gr)}|${normalizarCarreraCatalogo(c)}`;
    const item = catalogo.indice.get(key);
    if (item) {
      const curps = await obtenerCurpsInscritasGrupo(supabase, item.id);
      if (curps.size > 0) return completarNombresAlumnos(supabase, curps);
      // El grupo existe en el catÃ¡logo pero aÃºn sin inscripciones â†’ se permite
      // el fallback legacy temporal para no perder alumnos pendientes.
    }
  }

  // Fallback LEGACY temporal (grupo no resuelto o sin inscripciones).
  if (FALLBACK_LEGACY_ETIQUETAS_ACTIVO) {
    return obtenerAlumnosDelGrupoLegacy(supabase, g, gr, c);
  }
  return [];
}

/**
 * @deprecated Fallback LEGACY: CURPs del grupo desde ETIQUETAS PERSONALES
 * (GRADO/GRUPO/CARRERA). Se eliminarÃ¡ cuando la migraciÃ³n de inscripciones
 * estÃ© verificada (ver FALLBACK_LEGACY_ETIQUETAS_ACTIVO).
 */
async function obtenerAlumnosDelGrupoLegacy(
  supabase: SupabaseClient,
  g: string,
  gr: string,
  c: string,
): Promise<AlumnoPlantilla[]> {
  const curps = new Set<string>();
  let desde = 0;
  while (true) {
    const { data, error } = await supabase
      .from(TABLA_ETIQUETAS_PERSONALES)
      .select("CURP, GRADO, GRUPO, CARRERA")
      .eq("GRADO", g)
      .eq("GRUPO", gr)
      .range(desde, desde + TAMANO_PAGINA - 1);

    if (error || !data || data.length === 0) break;

    for (const r of data as EtiquetasPersonalesRow[]) {
      const curp = norm(String(r.CURP ?? ""));
      if (!curp) continue;
      // Filtrar por carrera en memoria (CARRERA puede contener URLs de foto).
      const carreraFila = norm(carreraEscolarDesdeEtiquetas(r));
      if (c && carreraFila !== c) continue;
      curps.add(curp);
    }

    if (data.length < TAMANO_PAGINA) break;
    desde += TAMANO_PAGINA;
  }

  if (curps.size === 0) return [];
  return completarNombresAlumnos(supabase, curps);
}

/**
 * FASE HORARIO — Clases oficiales por fecha para la fila CLASES de una materia.
 *
 * Fuente: HORARIO SEMANAL OFICIAL (bloques de la materia seleccionada en el
 * grupo). Cualquier profesor puede generar la plantilla de una materia; el
 * sistema calcula automáticamente cuántas clases tiene esa materia cada día.
 */
async function resolverClasesOficialesParaPlantilla(
  supabase: SupabaseClient,
  ctx: ContextoAsistencia,
  fechas: string[],
): Promise<
  | {
      ok: true;
      usaHorario: boolean;
      aviso: string | null;
      porFecha: Map<string, number>;
    }
  | { ok: false; error: string }
> {
  // FASE HORARIO — la cantidad de clases por día sale del HORARIO OFICIAL de
  // la materia seleccionada (bloques por día). No depende de asignaciones ni
  // de configuración manual del profesor.
  if (!ctx.materiaClave) {
    return { ok: false, error: "Selecciona la materia para generar la plantilla." };
  }
  const materia = await obtenerConteosHorarioMateria(supabase, {
    ciclo: ctx.ciclo,
    grado: ctx.grado,
    grupo: ctx.grupo,
    carrera: ctx.carrera,
    materiaClave: ctx.materiaClave,
    fechas,
  });
  if (!materia.usaHorario) {
    return {
      ok: false,
      error:
        materia.aviso ??
        "El grupo no tiene horario oficial cargado para este periodo.",
    };
  }
  if (!materia.materiaEncontrada) {
    return { ok: false, error: materia.aviso ?? "La materia no se encontró." };
  }
  return {
    ok: true,
    usaHorario: true,
    aviso: null,
    porFecha: materia.conteosPorFecha,
  };
}

/**
 * Genera la plantilla de asistencias para un grado/grupo/carrera y ciclo.
 * Solo usa dÃ­as `tipo = 'clase'` del calendario. La plantilla incluye una fila
 * especial `CLASES` (clases impartidas por el profesor por dÃ­a) y una fila por
 * alumno (asistencia por dÃ­a).
 */
export async function generarPlantillaAsistencia(
  supabase: SupabaseClient,
  ctx: ContextoAsistencia,
): Promise<ResultadoPlantilla> {
  const ciclo = norm(ctx.ciclo);
  if (!ciclo) return { ok: false, error: "Indica un ciclo escolar." };

  const cargaCal = await cargarCalendarioAsistenciaContexto(supabase, ctx, {
    acotarAlParcial: true,
  });
  if (!cargaCal.ok) return { ok: false, error: cargaCal.error };
  const calendario = cargaCal.dias;
  const fechas = calendario
    .filter((d) => d.tipo === "clase")
    .map((d) => d.fecha)
    .sort();

  if (cargaCal.parcial && fechas.length === 0) {
    return {
      ok: false,
      error: `El parcial ${cargaCal.parcial.nombre} no tiene dias de clase en su rango (${cargaCal.parcial.fecha_inicio} a ${cargaCal.parcial.fecha_fin}) para el ciclo ${ciclo}. Verifica el calendario del periodo o el rango del parcial en Configuracion.`,
    };
  }
  if (fechas.length === 0) {
    return {
      ok: false,
      error: `El ciclo ${ciclo} no tiene dÃ­as de clase configurados en el calendario.`,
    };
  }

  const alumnos = await obtenerAlumnosDelGrupo(
    supabase,
    ctx.grado,
    ctx.grupo,
    ctx.carrera,
  );
  if (alumnos.length === 0) {
    return {
      ok: false,
      error: `No hay alumnos en ${ctx.grado} Â· grupo ${ctx.grupo}${ctx.carrera ? ` Â· ${ctx.carrera}` : ""}.`,
    };
  }

  // FASE HORARIO — la fila CLASES se deriva del horario oficial del grupo
  // (bloques programados del profesor); la configuracion legacy solo se usa
  // como respaldo temporal mientras el grupo no tenga horario cargado.
  const clases = await resolverClasesOficialesParaPlantilla(
    supabase,
    ctx,
    fechas,
  );
  if (!clases.ok) return { ok: false, error: clases.error };

  const filas: string[][] = [];
  filas.push(["CURP", "NOMBRE", ...fechas]);
  filas.push([
    "CLASES",
    ctx.profesorNombre,
    ...fechas.map((f) => String(clases.porFecha.get(f) ?? 0)),
  ]);
  for (const a of alumnos) {
    filas.push([a.curp, a.nombre, ...fechas.map(() => "")]);
  }

  const nombreBase = [ctx.grado, ctx.grupo, ctx.carrera]
    .filter(Boolean)
    .join("_")
    .replace(/\s+/g, "_");

  return {
    ok: true,
    plantilla: {
      fechas,
      alumnos,
      // Entregable SIEMPRE en .xlsx (el CSV corrompe CURP, nombres y fechas).
      base64: matrizAXlsxBase64(
        filas,
        "Asistencias",
        [20, 50, ...fechas.map(() => 11)],
      ),
      nombreArchivo: `asistencias_${nombreBase || "grupo"}_${ctx.ciclo}${cargaCal.parcial ? `_parcial${cargaCal.parcial.numero}` : ""}.xlsx`,
      usaHorario: clases.usaHorario,
      aviso: clases.aviso,
    },
  };
}


/**
 * Analiza una plantilla subida: parsea, detecta columnas, valida contra el
 * calendario, los alumnos del grupo y las clases impartidas por el profesor.
 * NO escribe en Supabase. Devuelve el plan de cambios y un resumen.
 */
export async function analizarPlantillaAsistencia(
  supabase: SupabaseClient,
  file: File,
  ctx: ContextoAsistencia,
): Promise<ResultadoAnalisis> {
  const g = norm(ctx.grado);
  const gr = norm(ctx.grupo);
  const c = norm(ctx.carrera);
  const ciclo = norm(ctx.ciclo);
  if (!g || !gr) return { ok: false, error: "Indica grado y grupo." };
  if (!ciclo) return { ok: false, error: "Indica un ciclo escolar." };

  // 1) Parsear archivo conservando los valores crudos (para que las fechas de
  //    Excel lleguen como serial numÃ©rico y no como texto regional).
  let filas: (string | number)[][];
  try {
    const parsed = await archivoCsvAFilasConValores(file);
    filas = parsed.filas;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo leer el archivo.";
    return { ok: false, error: msg };
  }

  const noVacias = filas.filter((fila) =>
    fila.some((cel) => (cel == null ? "" : String(cel)).trim() !== ""),
  );
  if (noVacias.length < 2) {
    return { ok: false, error: "El archivo estÃ¡ vacÃ­o o solo tiene encabezados." };
  }

  const [rawHead, ...rawDatos] = noVacias;
  const encabezados = rawHead!.map((h, i) =>
    (h == null ? "" : String(h)).trim() || `Col ${i + 1}`,
  );

  // 2) Detectar columnas CURP y NOMBRE (reutiliza el detector del roster).
  const idxCurp = encabezados.findIndex((h) => /^CURP$/i.test(h));
  const idxNombre = encabezados.findIndex((h) => /^NOMBRE$/i.test(h));
  if (idxCurp < 0) {
    return { ok: false, error: "La plantilla debe incluir una columna Â«CURPÂ»." };
  }
  if (idxNombre < 0) {
    return { ok: false, error: "La plantilla debe incluir una columna Â«NOMBREÂ»." };
  }

  // 3) Calendario: dÃ­as vÃ¡lidos de clase del ciclo (fuente de verdad).
  const cargaCal = await cargarCalendarioAsistenciaContexto(supabase, ctx, {
    acotarAlParcial: false,
  });
  if (!cargaCal.ok) return { ok: false, error: cargaCal.error };
  const calendario = cargaCal.dias;
  const diasClase = new Set(
    calendario.filter((d) => d.tipo === "clase").map((d) => d.fecha),
  );
  const diasNoClase = new Map(
    calendario.filter((d) => d.tipo !== "clase").map((d) => [d.fecha, d.tipo]),
  );

  // 4) Detectar columnas de fecha usando la capa canÃ³nica de fechas. Cada
  //    encabezado se normaliza UNA SOLA VEZ a YYYY-MM-DD y se valida contra el
  //    calendario. El CONTRATO INTERNO es: `columna.fecha` (canÃ³nica) es la
  //    ÃšNICA representaciÃ³n de la fecha; `columna.indice` localiza la celda del
  //    alumno. El encabezado original (p.ej. serial Excel "46259") NUNCA vuelve
  //    a usarse para identificar la fecha.
  const deteccion = detectarColumnasFechaAsistencia(
    encabezados,
    calendario,
    [idxCurp, idxNombre],
  );
  // Columnas reconocidas como dÃ­as de clase: { indice, fecha }.
  const columnasFecha = deteccion.columnas.map((c) => ({
    indice: c.indice,
    fecha: c.fecha!,
  }));
  // El parcial acota el rango: fechas de otro parcial en el archivo = error
  // (no se escribe nada). El mensaje indica ejemplos y a qué rango pertenece.
  if (cargaCal.parcial) {
    const fueraDeRango = columnasFecha.filter(
      (c) =>
        !(
          c.fecha >= cargaCal.parcial!.fecha_inicio &&
          c.fecha <= cargaCal.parcial!.fecha_fin
        ),
    );
    if (fueraDeRango.length > 0) {
      const ejemplos = fueraDeRango
        .slice(0, 3)
        .map((c) => c.fecha)
        .join(", ");
      return {
        ok: false,
        error: `La plantilla tiene fechas fuera del parcial «${cargaCal.parcial.nombre}» (${cargaCal.parcial.fecha_inicio} a ${cargaCal.parcial.fecha_fin}). Fuera de rango: ${ejemplos}. Descarga la plantilla del parcial correcto.`,
      };
    }
  }
  if (columnasFecha.length === 0) {

    // Mensaje de error mÃ¡s Ãºtil segÃºn quÃ© fallÃ³.
    if (deteccion.ambiguas > 0) {
      const ejemplos = deteccion.todas
        .filter((c) => c.estado === "ambigua")
        .slice(0, 3)
        .map((c) => `Â«${c.encabezadoOriginal}Â» (Â¿${c.candidatos.join(" o ")}?)`)
        .join(", ");
      return {
        ok: false,
        error: `No se pudieron reconocer las fechas del archivo. ${ejemplos ? `Columnas ambiguas: ${ejemplos}. ` : ""}AsegÃºrate de que las fechas coincidan con dÃ­as de clase del ciclo ${ciclo} (formato YYYY-MM-DD).`,
      };
    }
    if (deteccion.noDiaClase > 0) {
      const ejemplos = deteccion.todas
        .filter((c) => c.estado === "no_es_dia_clase")
        .slice(0, 3)
        .map((c) => `Â«${c.encabezadoOriginal}Â» â†’ ${c.fecha}`)
        .join(", ");
      return {
        ok: false,
        error: `Las fechas del archivo no son dÃ­as de clase del ciclo ${ciclo}. ${ejemplos ? `Ejemplos: ${ejemplos}. ` : ""}Revisa el calendario escolar o descarga una plantilla nueva.`,
      };
    }
    return {
      ok: false,
      error: `La plantilla no tiene columnas de fecha reconocibles. AsegÃºrate de que las fechas coincidan con dÃ­as de clase del ciclo ${ciclo} (formato YYYY-MM-DD).`,
    };
  }
  // `columnasFecha` es el CONTRATO INTERNO: cada elemento es
  //   { indice, fecha } donde `fecha` es YYYY-MM-DD (canÃ³nica) y `indice`
  //   localiza la celda del alumno en la fila. El encabezado original
  //   (p.ej. serial Excel "46259") ya NO se usa para identificar la fecha.


  // 5) Alumnos del grupo (CURP â†’ nombre).

  const alumnos = await obtenerAlumnosDelGrupo(supabase, g, gr, c);
  const alumnosPorCurp = new Map(alumnos.map((a) => [a.curp, a.nombre]));

  // 6/7) Registros previos de ESTE profesor en este grupo (para detectar
  //      "sin cambios" y como respaldo del máximo). PROMPT C/D: el alcance es
  //      SIEMPRE `profesor_id` (nunca la contraseña). Sin profesorId o sin la
  //      columna (esquema pendiente) no se comparan previos (todo pasa a
  //      "actualizado"), lo cual es seguro y nunca mezcla aportes ajenos.
  const pidPrevio =
    ctx.profesorId != null &&
    Number.isInteger(Number(ctx.profesorId)) &&
    Number(ctx.profesorId) > 0
      ? Number(ctx.profesorId)
      : null;
  let previoPorId = false;
  if (pidPrevio) {
    const probe = await supabase
      .from(TABLA_CLASES_IMPARTIDAS)
      .select("profesor_id")
      .limit(1);
    previoPorId = !probe.error;
  }
  const clasesPreviasPorFecha = new Map<string, number>();
  const asistenciasPreviasPorClave = new Map<string, number>();
  if (previoPorId && pidPrevio) {
    const { data: clasesPrevias } = await supabase
      .from(TABLA_CLASES_IMPARTIDAS)
      .select("fecha, clases")
      .eq("profesor_id", pidPrevio)
      .eq("grado", g)
      .eq("grupo", gr);
    for (const r of (clasesPrevias ?? []) as { fecha: string; clases: number }[]) {
      clasesPreviasPorFecha.set(r.fecha, r.clases);
    }

    const { data: asistenciasPrevias } = await supabase
      .from(TABLA_ASISTENCIA_ALUMNOS)
      .select("curp, fecha, clases_asistidas")
      .eq("profesor_id", pidPrevio)
      .eq("grado", g)
      .eq("grupo", gr);
    for (const r of (asistenciasPrevias ?? []) as {
      curp: string;
      fecha: string;
      clases_asistidas: number;
    }[]) {
      asistenciasPreviasPorClave.set(`${r.curp}|${r.fecha}`, r.clases_asistidas);
    }
  }

  // 8) Clases oficiales por fecha. Fuente: HORARIO OFICIAL (bloques del
  //    profesor); respaldo legacy temporal = configuracion_clases_profesor.
  //    La fila CLASES del archivo es solo informativa.
  const fechasCiclo = [...diasClase].sort();
  const oficialesPlantilla = await resolverClasesOficialesParaPlantilla(
    supabase,
    ctx,
    fechasCiclo,
  );
  if (!oficialesPlantilla.ok) {
    return { ok: false, error: oficialesPlantilla.error };
  }
  const usaHorario = oficialesPlantilla.usaHorario;
  const avisoClases = oficialesPlantilla.aviso;
  const fuenteClases: "horario" | "configuracion" = usaHorario
    ? "horario"
    : "configuracion";

  // 9) Recorrer filas.
  const clasesImpartidas: PlanAsistencia["clasesImpartidas"] = [];
  const asistencias: PlanAsistencia["asistencias"] = [];
  const omitidosDetalle: string[] = [];
  const erroresDetalle: string[] = [];
  const discrepanciasDetalle: string[] = [];
  const curpsVistos = new Set<string>();
  let procesados = 0;
  let actualizados = 0;
  let sinCambios = 0;
  let omitidos = 0;
  let errores = 0;
  let discrepancias = 0;

  // 10) Fila CLASES del archivo: se compara contra la fuente oficial
  //     (horario o configuracion legacy). Las discrepancias son informativas
  //     y NO alteran la fuente. El valor oficial de `clases_impartidas` es el
  //     de la fuente oficial.
  const clasesArchivoPorFecha = new Map<string, number>();
  for (const fila of rawDatos) {
    const curpCelda = celdaTexto(fila[idxCurp]).toUpperCase();
    if (curpCelda !== "CLASES") continue;

    for (const columna of columnasFecha) {
      const fecha = columna.fecha;
      const valor = celdaTexto(fila[columna.indice]);
      if (valor === "") continue; // celda vacÃ­a: no aporta informaciÃ³n
      if (!esEnteroNoNegativo(valor)) {
        erroresDetalle.push(`Fila CLASES: Â«${valor}Â» no es un nÃºmero vÃ¡lido para ${fecha}.`);
        errores++;
        continue;
      }
      clasesArchivoPorFecha.set(fecha, Number(valor));
    }

  }


  // 11) Clases oficiales por fecha (fuente: horario oficial o config legacy).
  //     Solo para las fechas presentes en el archivo que sean dÃ­as de clase.
  const clasesOficialesPorFecha = new Map<string, number>();
  for (const columna of columnasFecha) {
    const fecha = columna.fecha;
    if (!diasClase.has(fecha)) continue;
    const oficial = oficialesPlantilla.porFecha.get(fecha) ?? 0;
    clasesOficialesPorFecha.set(fecha, oficial);

    const delArchivo = clasesArchivoPorFecha.get(fecha);
    if (delArchivo !== undefined && delArchivo !== oficial) {
      discrepanciasDetalle.push(
        `Fila CLASES: el archivo dice ${delArchivo} clases el ${fecha}, pero la fuente oficial (${fuenteClases}) indica ${oficial}. Se usarÃ¡ ${oficial}.`,
      );
      discrepancias++;
    }

    // `clases_impartidas` registra el dato efectivo (fuente oficial).
    clasesImpartidas.push({
      profesor_clave: ctx.profesorClave,
      grado: g,
      grupo: gr,
      carrera: c,
      fecha,
      clases: oficial,
    });
  }

  // 12) DÃ­as PENDIENTES: dÃ­as de clase del ciclo en los que el profesor tiene
  //     clases segÃºn la fuente oficial (oficial > 0) pero que NO vienen en el
  //     archivo. Quedan pendientes (sin registro), NO se marcan como falta.
  const fechasEnArchivo = new Set(columnasFecha.map((c) => c.fecha));

  const pendientesDetalle: string[] = [];
  const diasClaseOrdenados = [...diasClase].sort();
  for (const fecha of diasClaseOrdenados) {
    if (fechasEnArchivo.has(fecha)) continue;
    // CICLO GLOBAL + PARCIAL — los PENDIENTES se calculan solo dentro del
    // rango del parcial elegido (no del ciclo entero).
    if (
      cargaCal.parcial &&
      !(
        fecha >= cargaCal.parcial.fecha_inicio &&
        fecha <= cargaCal.parcial.fecha_fin
      )
    ) {
      continue;
    }
    const oficial = oficialesPlantilla.porFecha.get(fecha) ?? 0;
    if (oficial > 0) {
      pendientesDetalle.push(
        `${fecha} (${oficial} clases segÃºn ${fuenteClases === "horario" ? "el horario oficial" : "tu configuraciÃ³n"})`,
      );
    }
  }

  // 13) Filas de alumnos.
  for (const fila of rawDatos) {
    const curp = celdaTexto(fila[idxCurp]).toUpperCase();
    if (!curp || curp === "CLASES") continue;


    // CURP vÃ¡lido.
    if (!CURP_ALUMNO_RE.test(curp)) {
      omitidosDetalle.push(`CURP invÃ¡lido: Â«${curp}Â»`);
      omitidos++;
      continue;
    }

    // Evitar duplicados dentro del archivo.
    if (curpsVistos.has(curp)) {
      omitidosDetalle.push(`CURP duplicado en el archivo: Â«${curp}Â»`);
      omitidos++;
      continue;
    }
    curpsVistos.add(curp);

    // Alumno debe pertenecer al grado/grupo seleccionado.
    const nombreEsperado = alumnosPorCurp.get(curp);
    if (nombreEsperado === undefined) {
      omitidosDetalle.push(`CURP no pertenece a ${g} Â· grupo ${gr}: Â«${curp}Â»`);
      omitidos++;
      continue;
    }

    const nombre = celdaTexto(fila[idxNombre]) || nombreEsperado;
    procesados++;

    for (const columna of columnasFecha) {
      const fecha = columna.fecha;
      const valor = celdaTexto(fila[columna.indice]);


      // Fecha debe ser dÃ­a de clase. `fecha` es SIEMPRE la canÃ³nica YYYY-MM-DD
      // (nunca el encabezado original, p.ej. serial Excel "46259").
      if (!diasClase.has(fecha)) {
        const tipo = diasNoClase.get(fecha);
        erroresDetalle.push(
          tipo
            ? `${curp}: ${fecha} no es dÃ­a de clase (${tipo}).`
            : `${curp}: ${fecha} no estÃ¡ en el calendario del ciclo.`,
        );
        errores++;
        continue;
      }


      // Celda VACÃA â‰  0. VacÃ­o = sin registro = PENDIENTE (no se escribe nada).
      if (valor === "") continue;

      if (!esEnteroNoNegativo(valor)) {
        erroresDetalle.push(`${curp}: Â«${valor}Â» no es un nÃºmero vÃ¡lido para ${fecha}.`);
        errores++;
        continue;
      }
      const asistencia = Number(valor);

      // No puede superar las clases oficiales del profesor ese dÃ­a.
      const maxClases = clasesOficialesPorFecha.get(fecha) ?? 0;
      if (asistencia > maxClases) {
        erroresDetalle.push(
          `${curp}: asistencia ${asistencia} supera las ${maxClases} clases del ${fecha} segÃºn la fuente oficial (${fuenteClases}).`,
        );
        errores++;
        continue;
      }

      asistencias.push({
        profesor_clave: ctx.profesorClave,
        curp,
        grado: g,
        grupo: gr,
        carrera: c,
        nombre,
        fecha,
        clases_asistidas: asistencia,
      });

      const previo = asistenciasPreviasPorClave.get(`${curp}|${fecha}`);
      if (previo === asistencia) sinCambios++;
      else actualizados++;
    }
  }

  return {
    ok: true,
    plan: {
      clasesImpartidas,
      asistencias,
      resumen: {
        procesados,
        actualizados,
        sinCambios,
        omitidos,
        errores,
        pendientes: pendientesDetalle.length,
        discrepancias,
        omitidosDetalle,
        erroresDetalle,
        pendientesDetalle,
        discrepanciasDetalle,
        fuenteClases,
        usaHorario,
        aviso: avisoClases,
      },
    },
  };
}


/** Previsualiza la plantilla SIN escribir. Devuelve el resumen. */
export async function previsualizarAsistencias(
  supabase: SupabaseClient,
  file: File,
  ctx: ContextoAsistencia,
): Promise<ResultadoAnalisis> {
  return analizarPlantillaAsistencia(supabase, file, ctx);
}

// ============================================================================
// PROMPT C (R-3) — ATRIBUCIÓN DE MATERIA AL PROFESOR EN LA SUBIDA
// ----------------------------------------------------------------------------
// Al confirmar una plantilla se resuelve el grupo_materia_id (UNA resolución
// por subida, nunca por fila de alumno), se activa/crea la asignación
// (profesor_id, grupo_materia_id) y se guardan las filas nuevas con
// profesor_id + grupo_materia_id. Las decisiones de escritura (claves de
// conflicto, idempotencia) viven en lib/escolar/atribucion-profesor.ts (puro).
// ============================================================================

/**
 * Verifica que el esquema de atribución exista (profesor_id + grupo_materia_id
 * en ambas tablas). Sin él, confirmarAsistencias NO escribe (R-2/R-3).
 */
async function verificarEsquemaAtribucion(
  supabase: SupabaseClient,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [p1, p2, g1, g2] = await Promise.all([
    columnaExiste(supabase, TABLA_CLASES_IMPARTIDAS, "profesor_id"),
    columnaExiste(supabase, TABLA_ASISTENCIA_ALUMNOS, "profesor_id"),
    columnaExiste(supabase, TABLA_CLASES_IMPARTIDAS, "grupo_materia_id"),
    columnaExiste(supabase, TABLA_ASISTENCIA_ALUMNOS, "grupo_materia_id"),
  ]);
  if (!p1 || !p2 || !g1 || !g2) {
    return { ok: false, error: ERROR_DDL_ATRIBUCION_PENDIENTE };
  }
  return { ok: true };
}

/**
 * Resuelve el `grupo_materias.id` (ACTIVO) del grupo del periodo operativo +
 * la materia elegida (`ctx.materiaClave`, la misma clave del horario con la
 * que se generó la plantilla). Consultas FIJAS (sin N+1 por alumno/fila).
 *
 * Puente preferido: `horario_semanal.materia_id` (vínculo best-effort al
 * catálogo). Respaldo: equivalencia de claves (materias.clave/nombre) contra
 * el grupo_materias del grupo.
 */
async function resolverGrupoMateriaIdSubida(
  supabase: SupabaseClient,
  ctx: ContextoAsistencia,
): Promise<
  { ok: true; grupoMateriaId: string | null } | { ok: false; error: string }
> {
  const claveBuscada = materiaClaveHorario(ctx.materiaClave ?? "");
  if (!claveBuscada) return { ok: true, grupoMateriaId: null };

  // 1) Periodo (el contexto trae el id del operativo cuando es posible).
  let periodoId = ctx.periodoId ?? null;
  if (!periodoId) {
    const periodo = await obtenerPeriodoPorNombre(supabase, ctx.ciclo);
    if (!periodo) return { ok: true, grupoMateriaId: null };
    periodoId = periodo.id;
  }

  // 2) Grupo por identidad académica (mismas normalizaciones del horario).
  const grupos = await obtenerGruposConCarreraDePeriodo(supabase, periodoId);
  const grupo = buscarGrupoEnLista(grupos, ctx.grado, ctx.grupo, ctx.carrera);
  if (!grupo) return { ok: true, grupoMateriaId: null };

  // 3) materia_id del catálogo desde el HORARIO oficial (puente preferido).
  const bloques = await obtenerBloquesHorario(supabase, {
    periodoId,
    grupoId: grupo.id,
  });
  const materiaIds = new Set<string>();
  for (const b of bloques) {
    const claveBloque =
      b.materia_clave || materiaClaveHorario(b.materia_nombre);
    if (claveBloque === claveBuscada && b.materia_id) materiaIds.add(b.materia_id);
  }

  // 4) grupo_materias ACTIVO del grupo: primero el vinculado por el horario,
  //    después cualquier materia del grupo equivalente por clave.
  const { data: gms, error } = await supabase
    .from(TABLA_GRUPO_MATERIAS)
    .select("id, activo, materia_id, materias!inner(id, clave, nombre)")
    .eq("grupo_id", grupo.id);
  if (error) return { ok: false, error: error.message };

  const filas = (gms ?? []) as Array<{
    id: string;
    activo: boolean;
    materia_id: string | null;
    materias:
      | { id: string; clave: string; nombre: string }
      | { id: string; clave: string; nombre: string }[]
      | null;
  }>;
  const activas = filas.filter((g) => g.activo !== false);
  const materiaDe = (g: (typeof activas)[number]) =>
    Array.isArray(g.materias) ? g.materias[0] : g.materias;

  const porHorario = activas.find((g) => g.materia_id && materiaIds.has(g.materia_id));
  if (porHorario) return { ok: true, grupoMateriaId: porHorario.id };

  const porClave = activas.find((g) => {
    const m = materiaDe(g);
    if (!m) return false;
    return (
      materiaClaveHorario(m.nombre ?? "") === claveBuscada ||
      materiaClaveHorario(m.clave ?? "") === claveBuscada ||
      clavesEquivalenciaMateria(m.nombre ?? "").includes(claveBuscada) ||
      clavesEquivalenciaMateria(m.clave ?? "").includes(claveBuscada)
    );
  });
  if (porClave) return { ok: true, grupoMateriaId: porClave.id };

  return { ok: true, grupoMateriaId: null };
}


/**
 * Confirma la plantilla y ATRIBUYE la materia (Prompt C — R-3).
 *
 *  1. La identidad SIEMPRE es `profesor_id` (sesion.profesorId); sin ella se
 *     rechaza y NO se escribe con la contraseña (sesión vieja → re-login).
 *  2. Requiere el esquema R-1 (grupo_materia_id); sin él responde error
 *     controlado y NO escribe con la contraseña.
 *  3. Resuelve el grupo_materia_id (UNA resolución por subida) y rechaza si la
 *     materia no es atribuible al grupo en el catálogo.
 *  4. LLAMA la RPC `traspasar_materia_a_profesor` (Prompt D) ANTES de escribir:
 *     el que sube la plantilla se convierte en dueño de la materia (asignación
 *     y registros previos se traspasan) en una sola transacción. Si la RPC no
 *     está desplegada, NO se escribe nada.
 *  5. UPSERT de clases_impartidas / asistencia_alumnos con `profesor_id` +
 *     `grupo_materia_id` y la clave de conflicto POR MATERIA (2 materias del
 *     mismo grupo y día = 2 filas; re-subir la misma = actualizar, no duplicar).
 */
export async function confirmarAsistencias(
  supabase: SupabaseClient,
  file: File,
  ctx: ContextoAsistencia,
): Promise<ResultadoAnalisis> {
  const analisis = await analizarPlantillaAsistencia(supabase, file, ctx);
  if (!analisis.ok) return analisis;

  const { plan } = analisis;

  // FASE HORARIO — si la fuente es el horario oficial pero el profesor no
  // puede atribuirse bloques (sin asignación en el grupo o sin materias
  // suyas), NO se escribe: evita sobrescribir registros previos con ceros.
  if (plan.resumen.usaHorario && plan.resumen.aviso) {
    return { ok: false, error: plan.resumen.aviso };
  }

  // R-2/R-3 — identidad estructural PROFESORES.ID (nunca la contraseña).
  const profesorId =
    ctx.profesorId != null &&
    Number.isInteger(Number(ctx.profesorId)) &&
    Number(ctx.profesorId) > 0
      ? Number(ctx.profesorId)
      : null;
  if (!profesorId) {
    return { ok: false, error: ERROR_ATRIBUCION_SIN_PROFESOR_ID };
  }

  // Esquema R-1 aplicado (columnas de atribución) — sin él, nada de escrituras.
  const esquema = await verificarEsquemaAtribucion(supabase);
  if (!esquema.ok) return { ok: false, error: esquema.error };

  // Resolución del grupo_materia_id (UNA consulta por subida, no por alumno).
  const resMateria = await resolverGrupoMateriaIdSubida(supabase, ctx);
  if (!resMateria.ok) return { ok: false, error: resMateria.error };
  if (!resMateria.grupoMateriaId) {
    return { ok: false, error: ERROR_ATRIBUCION_MATERIA_NO_RESUELTA };
  }

  // PROMPT D — TRASPASO antes de escribir: la RPC deja la materia completa a
  // este profesor (asignaciones de otros → inactivas; sus registros → su id).
  // Cero N+1: una sola llamada por subida. Si falla, NO se escribe nada.
  const traspaso = await traspasarMateriaAProfesor(
    supabase,
    resMateria.grupoMateriaId,
    profesorId,
  );
  if (!traspaso.ok) return { ok: false, error: traspaso.error };

  // Decisión pura de escritura (filas enriquecidas + claves de conflicto).
  const atribuido = atribuirMateriaAlPlan(
    { clasesImpartidas: plan.clasesImpartidas, asistencias: plan.asistencias },
    {
      profesorId,
      grupoMateriaId: resMateria.grupoMateriaId,
      profesorClave: ctx.profesorClave,
    },
  );
  if (!atribuido.ok) return atribuido;

  // UPSERT clases_impartidas (profesor_id + materia + grado + grupo + fecha).
  for (let i = 0; i < atribuido.clasesImpartidas.length; i += TAMANO_LOTE) {
    const lote = atribuido.clasesImpartidas.slice(i, i + TAMANO_LOTE);
    const { error } = await supabase
      .from(TABLA_CLASES_IMPARTIDAS)
      .upsert(lote, { onConflict: atribuido.conflictoClases });
    if (error) return { ok: false, error: `Error en clases impartidas: ${error.message}` };
  }

  // UPSERT asistencia_alumnos (profesor_id + materia + curp + grupo + fecha).
  for (let i = 0; i < atribuido.asistencias.length; i += TAMANO_LOTE) {
    const lote = atribuido.asistencias.slice(i, i + TAMANO_LOTE);
    const { error } = await supabase
      .from(TABLA_ASISTENCIA_ALUMNOS)
      .upsert(lote, { onConflict: atribuido.conflictoAsistencia });
    if (error) return { ok: false, error: `Error en asistencias: ${error.message}` };
  }

  return { ok: true, plan };
}


// ============================================================================
// ESTADOS DERIVADOS DE ASISTENCIA (Bloque 5D)
// ----------------------------------------------------------------------------
// Para la futura visualizaciÃ³n del alumno/padre (calendario visual) se derivan
// cuatro estados a partir de los datos existentes. NO se almacenan en ninguna
// tabla nueva:
//
//   asistio   â†’ existe registro y clases_asistidas > 0
//   falta     â†’ existe registro y clases_asistidas = 0 (0 EXPLÃCITO)
//   pendiente â†’ dÃ­a tipo='clase' + el profesor tiene clases ese dÃ­a (config)
//               + el alumno pertenece al grupo + NO existe registro
//   sin_clase â†’ el dÃ­a NO es tipo='clase' (festivo/mantenimiento/descanso) o
//               el profesor no tiene clases ese dÃ­a
//
// Reglas crÃ­ticas:
//   Â· VACÃO â‰  0. Sin registro = pendiente, nunca falta.
//   Â· Nunca convertir pendiente en falta.
//   Â· Nunca almacenar estados ni porcentajes (son derivados).
// ============================================================================

export type EstadoAsistencia = "asistio" | "falta" | "pendiente" | "sin_clase";

export type DiaEstadoAsistencia = {
  fecha: string;
  diaSemana: DiaSemana;
  tipo: TipoDiaCalendario;
  estado: EstadoAsistencia;
  /** Clases que el profesor deberÃ­a impartir ese dÃ­a (config semanal). */
  clasesEsperadas: number;
  /** Clases a las que asistiÃ³ el alumno (null si no hay registro). */
  clasesAsistidas: number | null;
};

/**
 * Deriva el estado de asistencia de un alumno para una fecha concreta.
 * Pura (sin I/O): recibe los datos ya cargados y resuelve el estado.
 */
export function estadoAsistenciaAlumno(input: {
  tipo: TipoDiaCalendario;
  clasesEsperadas: number;
  clasesAsistidas: number | null;
}): EstadoAsistencia {
  // DÃ­a no escolar (festivo/mantenimiento/descanso) â†’ sin_clase.
  if (input.tipo !== "clase") return "sin_clase";
  // DÃ­a de clase pero el profesor no tiene clases ese dÃ­a â†’ sin_clase.
  if (input.clasesEsperadas <= 0) return "sin_clase";
  // Sin registro â†’ pendiente (nunca falta).
  if (input.clasesAsistidas === null) return "pendiente";
  // 0 explÃ­cito â†’ falta.
  if (input.clasesAsistidas === 0) return "falta";
  // > 0 â†’ asistiÃ³.
  return "asistio";
}

/**
 * Â¿El profesor imparte clase en un grado/grupo?
 *
 * Se determina a partir de los registros existentes en `clases_impartidas`
 * (fuente real de datos): un profesor "imparte" en un grupo si ya registrÃ³
 * clases impartidas en Ã©l. NO se crea un mapeo nuevo profesorâ†’grupo; se
 * reutiliza el modelo actual. Ãštil para restringir a un `maestro` a consultar
 * Ãºnicamente los grupos donde realmente da clase.
 */
export async function profesorImparteEnGrupo(
  supabase: SupabaseClient,
  grado: string,
  grupo: string,
  profesorId?: number | null,
): Promise<boolean> {
  const g = norm(grado);
  const gr = norm(grupo);
  if (!g || !gr) return false;
  const pid = Number(profesorId);
  if (!Number.isInteger(pid) || pid <= 0) return false;

  const { data, error } = await supabase
    .from(TABLA_CLASES_IMPARTIDAS)
    .select("id")
    .eq("profesor_id", pid)
    .eq("grado", g)
    .eq("grupo", gr)
    .limit(1);

  if (error) return false;
  return (data?.length ?? 0) > 0;
}

/**
 * Obtiene el calendario de asistencia de un alumno (por CURP) para un ciclo.
 *
 * Realiza SOLO 3 consultas (calendario + clases_impartidas + asistencia_alumnos)

 * y resuelve los estados en memoria (sin N+1). Reutilizable para el perfil del
 * alumno, el perfil del padre y el calendario visual futuro.
 *
 * Si se pasa `profesorClave`, se limita a ese profesor (estado por profesor).
 * Si no, se agrega el aporte de todos los profesores del grupo (estado global).
 */
export async function obtenerEstadosAsistenciaAlumno(
  supabase: SupabaseClient,
  input: {
    curp: string;
    grado: string;
    grupo: string;
    carrera?: string;
    ciclo: string;
    /** CICLO GLOBAL — periodo operativo resuelto en el servidor. */
    periodoId?: string;
    profesorClave?: string;
    /** PROMPT C (R-2) — identidad estructural del profesor: se prefiere
     *  `profesor_id` cuando existe; `profesor_clave` solo si es NULL. */
    profesorId?: number | null;
  },
): Promise<DiaEstadoAsistencia[]> {
  const g = norm(input.grado);
  const gr = norm(input.grupo);
  const ciclo = norm(input.ciclo);
  if (!g || !gr || !ciclo) return [];

  // 1) Calendario del ciclo (fuente de verdad de días escolares). Si se conoce
  //    el periodo operativo se lee POR PERIODO; si no, se conserva la lectura
  //    legacy por texto (ciclo_escolar).
  const calendario = input.periodoId
    ? await obtenerCalendarioDePeriodo(supabase, input.periodoId, input.ciclo)
    : await obtenerCalendarioEscolar(supabase, ciclo);
  if (calendario.length === 0) return [];

  // PROMPT C/D — si se pide alcance por profesor, este es SIEMPRE `profesor_id`
  // (PROFESORES.ID). `profesor_clave` ya NO es criterio de búsqueda (regla D-4:
  // la comparten 16 profesores). Sin la columna (esquema C pendiente) no se
  // puede acotar de forma segura: se devuelve vacío (no se filtra el aporte
  // global de otros profesores).
  const profesorId =
    input.profesorId != null &&
    Number.isInteger(Number(input.profesorId)) &&
    Number(input.profesorId) > 0
      ? Number(input.profesorId)
      : null;
  let scopePorId = false;
  if (profesorId) {
    const [p1, p2] = await Promise.all([
      supabase.from(TABLA_CLASES_IMPARTIDAS).select("profesor_id").limit(1),
      supabase.from(TABLA_ASISTENCIA_ALUMNOS).select("profesor_id").limit(1),
    ]);
    scopePorId = !p1.error && !p2.error;
  }
  if (profesorId && !scopePorId) return [];

  // 2) Clases impartidas del grupo (SUM por fecha). Alcance por profesor si
  //    corresponde; si no, el total del grupo.
  let qClases = supabase
    .from(TABLA_CLASES_IMPARTIDAS)
    .select("fecha, clases")
    .eq("grado", g)
    .eq("grupo", gr);
  if (scopePorId && profesorId) qClases = qClases.eq("profesor_id", profesorId);
  const { data: clasesData } = await qClases;
  const clasesPorFecha = new Map<string, number>();
  for (const r of (clasesData ?? []) as { fecha: string; clases: number }[]) {
    clasesPorFecha.set(r.fecha, (clasesPorFecha.get(r.fecha) ?? 0) + r.clases);
  }

  // 3) Asistencia del alumno (SUM por fecha). Mismo filtro de profesor.
  let qAsist = supabase
    .from(TABLA_ASISTENCIA_ALUMNOS)
    .select("fecha, clases_asistidas")
    .eq("curp", input.curp)
    .eq("grado", g)
    .eq("grupo", gr);
  if (scopePorId && profesorId) qAsist = qAsist.eq("profesor_id", profesorId);
  const { data: asistData } = await qAsist;
  const asistPorFecha = new Map<string, number>();
  for (const r of (asistData ?? []) as { fecha: string; clases_asistidas: number }[]) {
    asistPorFecha.set(r.fecha, (asistPorFecha.get(r.fecha) ?? 0) + r.clases_asistidas);
  }

  // 4) Resolver estados en memoria.
  const dias: DiaEstadoAsistencia[] = [];
  for (const d of calendario) {
    const fecha = d.fecha;
    const clasesEsperadas = clasesPorFecha.get(fecha) ?? 0;
    const clasesAsistidas = asistPorFecha.has(fecha)
      ? asistPorFecha.get(fecha)!
      : null;
    dias.push({
      fecha,
      diaSemana: diaSemanaDesdeFecha(fecha),
      tipo: d.tipo,
      estado: estadoAsistenciaAlumno({
        tipo: d.tipo,
        clasesEsperadas,
        clasesAsistidas,
      }),
      clasesEsperadas,
      clasesAsistidas,
    });
  }

  dias.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return dias;
}

/**
 * Calcula el porcentaje de asistencia SOLO sobre las clases registradas
 * (asistencias + faltas). Los dÃ­as pendientes NO entran al denominador.
 *
 *   porcentaje = asistencias / (asistencias + faltas)
 *
 * Ejemplo: 18 asistencias + 2 faltas + 5 pendientes â†’ 18/20 = 90%.
 * Es un valor DERIVADO: NO se almacena.
 */
export function calcularPorcentajeAsistencia(
  dias: DiaEstadoAsistencia[],
): number {
  let asistencias = 0;
  let faltas = 0;
  for (const d of dias) {
    if (d.estado === "asistio") asistencias++;
    else if (d.estado === "falta") faltas++;
  }
  const total = asistencias + faltas;
  if (total === 0) return 0;
  return Math.round((asistencias / total) * 100);
}

// ============================================================================
// CICLO GLOBAL + PARCIALES — calendario del contexto de asistencias
// ----------------------------------------------------------------------------

type CalendarioContextoAsistencia =
  | { ok: true; dias: DiaCalendarioRow[]; parcial: ParcialAsistencia | null }
  | { ok: false; error: string };

/**
 * CICLO GLOBAL + PARCIAL — calendario para el flujo del profesor.
 *
 * - Con `ctx.periodoId` lee POR PERIODO (`obtenerCalendarioDePeriodo`, ruta F5
 *   con fallback al texto exacto del periodo); sin él conserva la lectura
 *   legacy por texto (`ciclo_escolar`).
 * - Si el profesor eligió un PARCIAL (`ctx.evaluacionId`), valida que exista
 *   entre `ctx.evaluaciones` (parciales activos del periodo operativo) y:
 *     · acotarAlParcial=true  → devuelve solo los días de su rango (plantilla);
 *     · acotarAlParcial=false → devuelve el calendario completo + el parcial,
 *       para que la SUBIDA rechace columnas fuera de rango con mensaje exacto.
 * - Un `evaluacionId` que no pertenezca al periodo operativo = error (nunca se
 *   usan parciales de otro periodo).
 */
async function cargarCalendarioAsistenciaContexto(
  supabase: SupabaseClient,
  ctx: ContextoAsistencia,
  opciones: { acotarAlParcial: boolean },
): Promise<CalendarioContextoAsistencia> {
  const ciclo = norm(ctx.ciclo);
  if (!ciclo) return { ok: false, error: "Indica un ciclo escolar." };

  const calendario = ctx.periodoId
    ? await obtenerCalendarioDePeriodo(supabase, ctx.periodoId, ctx.ciclo)
    : await obtenerCalendarioEscolar(supabase, ciclo);

  if (!ctx.evaluacionId) {
    return { ok: true, dias: calendario, parcial: null };
  }
  const parcial = (ctx.evaluaciones ?? []).find(
    (e) => e.id === ctx.evaluacionId && e.activo !== false,
  );
  if (!parcial) {
    return {
      ok: false,
      error:
        "El parcial seleccionado no pertenece al periodo operativo o esta inactivo. Recarga la pagina y vuelve a intentarlo.",
    };
  }
  if (!opciones.acotarAlParcial) {
    return { ok: true, dias: calendario, parcial };
  }
  return {
    ok: true,
    dias: filtrarDiasDeParcial(calendario, parcial),
    parcial,
  };
}

// Re-export de la función PURA por parcial (se implementa en
// asistencia-parcial.ts para que las pruebas compilen sin Supabase).
export {
  resumenAsistenciaPorParcial,
} from "./asistencia-parcial";
export type {
  ParcialAsistencia,
  ResumenPorParcial,
  ResultadoResumenPorParcial,
} from "./asistencia-parcial";


