import type { SupabaseClient } from "@supabase/supabase-js";
import { type DiaSemana } from "../ciclo/calendario";
import { type ParcialAsistencia } from "./asistencia-parcial";

/**
 * @deprecated TransiciÃ³n legacy â†’ catÃ¡logo acadÃ©mico.
 * Mientras sea `true`, los listados de asistencia pueden caer al fallback de
 * ETIQUETAS PERSONALES (GRADO/GRUPO/CARRERA) cuando el grupo no se resuelve en
 * el catÃ¡logo o aÃºn no tiene inscripciones. La ruta PRINCIPAL ya usa el
 * catÃ¡logo (inscripciones_alumno â†’ grupos â†’ carreras).
 * Cambiar a `false` solo cuando la migraciÃ³n de inscripciones estÃ© verificada.
 */
export const FALLBACK_LEGACY_ETIQUETAS_ACTIVO = true;

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
export async function columnaExiste(
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
  /** `PATERNO|MATERNO|NOMBRE` normalizado. El estandar escolar ordena
   *  por apellido paterno, y `nombre` empieza por el nombre de pila. */
  claveOrden?: string;
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

export const TAMANO_PAGINA = 1000;
export const TAMANO_LOTE = 100;

/** Normaliza grado/grupo/carrera a mayÃºsculas y sin espacios. */
export function norm(texto: string): string {
  return texto.trim().toUpperCase();
}

/** Â¿El texto es un entero no negativo? */
export function esEnteroNoNegativo(texto: string): boolean {
  return /^\d+$/.test(texto.trim());
}


/** Convierte una celda (string | number) a texto recortado. */
export function celdaTexto(celda: string | number | null | undefined): string {
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
export const CLAVE_DIA_A_COLUMNA: Record<DiaSemana, keyof ConfiguracionClasesProfesor> = {
  lunes: "lunes",
  martes: "martes",
  miercoles: "miercoles",
  jueves: "jueves",
  viernes: "viernes",
  sabado: "lunes", // no aplica (no es dÃ­a escolar)
  domingo: "lunes", // no aplica (no es dÃ­a escolar)
};

