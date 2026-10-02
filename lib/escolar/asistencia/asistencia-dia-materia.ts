import type { TipoDiaCalendario } from "../tables.ts";

/**
 * asistencia-dia-materia.ts — MÓDULO PURO (PROMPT S · Parte B).
 *
 * Decide, por DÍA, qué materias hubo, cuántas clases de cada una y a cuáles
 * asistió el alumno, y pinta el día con un color. Sin I/O ni Supabase: recibe
 * las filas ya cargadas (`clases_impartidas` y `asistencia_alumnos`, con su
 * `grupo_materia_id` y `profesor_clave`) más el mapa de nombres visibles.
 *
 * Reglas (DECISIONES 2/3/5/6/7 del prompt, congeladas):
 *   - el día se mide en CLASES, no en materias (2/2 Mat + 0/1 Fís = 2/3);
 *   - pendiente nunca es falta: una materia sin celda sale del numerador y del
 *     denominador;
 *   - umbral de naranja = 1/2 EXACTO o más (1 de 2 es naranja); menos → rojo;
 *   - filas legacy (sin `grupo_materia_id` y sin marcador) se agrupan en una
 *     línea «Registro anterior (sin materia)»; la justificación es su línea
 *     propia y suma al numerador con tope en el faltante del día.
 */

/** Umbral de naranja (decisión 5): la MITAD EXACTA o más es naranja. */
export const UMBRAL_NARANJA = 0.5;

/** Marcador de justificación en `asistencia_alumnos.profesor_clave`. */
export const MARCADOR_JUSTIFICACION = "__JUSTIFICACION__";

/** Nombre visible de las filas legacy agrupadas (decisión 6). */
export const NOMBRE_LEGACY = "Registro anterior (sin materia)";

/** Nombre de una materia cuyo `grupo_materia_id` no está en el roster. */
export const NOMBRE_FUERA_GRUPO = "Materia fuera del grupo";

export type EstadoMateria = "completa" | "parcial" | "falta" | "pendiente";

export type ColorDia = "verde" | "naranja" | "rojo" | "pendiente" | "sin_clase";

/** Discrimina el tipo de línea para que la UI sepa cómo renderizarla. */
export type TipoLineaDia = "materia" | "legacy" | "justificacion";

export type MateriaDelDia = {
  /** null = legacy o justificación. */
  grupoMateriaId: string | null;
  nombre: string;
  /** Clases impartidas ese día de esta materia (suma de `clases_impartidas`). */
  clases: number;
  /** Clases asistidas (null = sin celda = pendiente). */
  asistidas: number | null;
  estado: EstadoMateria;
  tipo: TipoLineaDia;
  /** Dueño de la falta: el `profesor_id` que registró la fila. null = no hay
   *  a quién atribuirla (legacy, o filas de varios profesores). Decide qué
   *  profesor puede justificar esta materia (justificaciones-puro.ts). */
  profesorId: number | null;
  /** Clases de esta línea que una justificación APROBADA cubre (derivado,
   *  nunca almacenado): el faltante de la materia si está justificada. */
  clasesJustificadas: number;
};

/**
 * Justificaciones APROBADAS de un día, ya agrupadas: el día completo (la
 * resolvió el directivo) o materias concretas (las resolvió su profesor).
 */
export type JustificacionDia = {
  diaCompleto: boolean;
  materias: ReadonlySet<string>;
};

/** Agrupa por fecha las justificaciones APROBADAS (`grupo_materia_id` null =
 *  día completo). Las pendientes y rechazadas no justifican nada. */
export function justificacionesPorFecha(
  filas: readonly { fecha: string; grupo_materia_id: string | null; estado: string }[],
): Map<string, JustificacionDia> {
  const mapa = new Map<string, { diaCompleto: boolean; materias: Set<string> }>();
  for (const f of filas) {
    if (f.estado !== "aprobada") continue;
    const dia = mapa.get(f.fecha) ?? { diaCompleto: false, materias: new Set<string>() };
    if (f.grupo_materia_id) dia.materias.add(f.grupo_materia_id);
    else dia.diaCompleto = true;
    mapa.set(f.fecha, dia);
  }
  return mapa;
}

export type FilaClaseDia = {
  grupo_materia_id: string | null;
  clases: number;
};

export type FilaAsistenciaDia = {
  grupo_materia_id: string | null;
  clases_asistidas: number;
  profesor_clave: string | null;
  /** Quién registró la fila (`PROFESORES.ID`); null en filas legacy. */
  profesor_id?: number | null;
};

const CLAVE_LEGACY = "__legacy__";

/** Estado de UNA materia a partir de sus clases y asistidas. */
export function estadoMateria(
  clases: number,
  asistidas: number | null,
): EstadoMateria {
  if (asistidas === null) return "pendiente";
  if (clases <= 0) return "pendiente";
  if (asistidas <= 0) return "falta";
  if (asistidas >= clases) return "completa";
  return "parcial";
}

/**
 * Agrupa las filas de un día por materia y pinta el día.
 * `nombres` es `Map<grupoMateriaId, nombreVisible>` (alias ?? nombre).
 * `justificacion`: lo aprobado ese día. Una materia justificada cuenta su
 * faltante como asistido; el día completo justifica todas las líneas con celda.
 */
export function resolverDiaMateria(
  tipo: TipoDiaCalendario,
  clases: FilaClaseDia[],
  asistencias: FilaAsistenciaDia[],
  nombres: Map<string, string>,
  justificacion?: JustificacionDia,
): { materias: MateriaDelDia[]; color: ColorDia } {
  if (tipo !== "clase") return { materias: [], color: "sin_clase" };

  const clasesPorClave = new Map<string, number>();
  for (const c of clases) {
    const clave = c.grupo_materia_id ?? CLAVE_LEGACY;
    clasesPorClave.set(clave, (clasesPorClave.get(clave) ?? 0) + c.clases);
  }

  const asistPorClave = new Map<string, number>();
  // Dueños por línea: los `profesor_id` distintos que registraron filas.
  const duenosPorClave = new Map<string, Set<number>>();
  let marcadorJustificacion = 0;
  for (const a of asistencias) {
    if (
      a.grupo_materia_id == null &&
      a.profesor_clave === MARCADOR_JUSTIFICACION
    ) {
      marcadorJustificacion += a.clases_asistidas;
      continue;
    }
    const clave = a.grupo_materia_id ?? CLAVE_LEGACY;
    asistPorClave.set(clave, (asistPorClave.get(clave) ?? 0) + a.clases_asistidas);
    const duenos = duenosPorClave.get(clave) ?? new Set<number>();
    if (a.profesor_id != null) duenos.add(Number(a.profesor_id));
    duenosPorClave.set(clave, duenos);
  }

  const claves = new Set([...clasesPorClave.keys(), ...asistPorClave.keys()]);
  const materias: MateriaDelDia[] = [];
  let totalClases = 0;
  let totalAsistidas = 0;
  let hayCelda = false;

  for (const clave of claves) {
    const clasesM = clasesPorClave.get(clave) ?? 0;
    const tieneCelda = asistPorClave.has(clave);
    const asistidas = tieneCelda ? (asistPorClave.get(clave) ?? 0) : null;
    const esLegacy = clave === CLAVE_LEGACY;
    const grupoMateriaId = esLegacy ? null : clave;
    const nombre = esLegacy
      ? NOMBRE_LEGACY
      : (nombres.get(clave) ?? NOMBRE_FUERA_GRUPO);
    const duenos = duenosPorClave.get(clave);
    const justificada =
      justificacion !== undefined &&
      (justificacion.diaCompleto ||
        (grupoMateriaId !== null && justificacion.materias.has(grupoMateriaId)));
    // Solo se justifica lo que de verdad faltó: una materia pendiente (sin
    // celda) o completa no gana clases.
    const clasesJustificadas =
      justificada && asistidas !== null && clasesM > asistidas
        ? clasesM - asistidas
        : 0;
    materias.push({
      grupoMateriaId,
      nombre,
      clases: clasesM,
      asistidas,
      estado: estadoMateria(clasesM, asistidas),
      tipo: esLegacy ? "legacy" : "materia",
      profesorId: duenos && duenos.size === 1 ? [...duenos][0]! : null,
      clasesJustificadas,
    });
    if (tieneCelda && clasesM > 0) {
      hayCelda = true;
      totalClases += clasesM;
      totalAsistidas += (asistidas ?? 0) + clasesJustificadas;
    }
  }

  // Marcador legacy `__JUSTIFICACION__` (hoy 0 filas; las aprobaciones nuevas
  // ya no lo escriben): línea propia, con tope en el faltante que quede.
  const justificacionMarcador = marcadorJustificacion;
  if (justificacionMarcador > 0) {
    const faltante = Math.max(0, totalClases - totalAsistidas);
    const cap = Math.min(justificacionMarcador, faltante);
    if (cap > 0) {
      materias.push({
        grupoMateriaId: null,
        nombre: `Justificado: ${cap} clases`,
        clases: 0,
        asistidas: cap,
        estado: "completa",
        tipo: "justificacion",
        profesorId: null,
        clasesJustificadas: 0,
      });
      totalAsistidas += cap;
      hayCelda = true;
    }
  }

  const color = colorDesdeTotales(totalClases, totalAsistidas, hayCelda);
  return { materias, color };
}

/** Color a partir de los totales del día (comparación entera, sin flotantes). */
export function colorDesdeTotales(
  totalClases: number,
  totalAsistidas: number,
  hayCelda: boolean,
): ColorDia {
  if (totalClases <= 0) return "pendiente";
  if (!hayCelda) return "pendiente";
  if (totalAsistidas >= totalClases) return "verde";
  // `UMBRAL_NARANJA` es la ÚNICA fuente del umbral (decisión 5): con 0.5 la
  // comparación es exacta en coma flotante (1 de 2 → 1 >= 1).
  if (totalAsistidas >= totalClases * UMBRAL_NARANJA) return "naranja";
  return "rojo";
}

/** Lo mínimo de una línea del día que necesita el conteo en clases. Lo
 *  cumplen `MateriaDelDia` y `AporteMateriaDia` (asistencia-parcial.ts). */
export type LineaConteoClases = {
  clases: number;
  asistidas: number | null;
  tipo: TipoLineaDia;
  /** Faltante cubierto por una justificación aprobada (cuenta como asistido). */
  clasesJustificadas?: number;
};

/**
 * Σ clases registradas y asistidas de las líneas de un día (PROMPT S · B).
 *
 * ÚNICA implementación de la regla: la usan el color del día (vía
 * `resolverDiaMateria`), el resumen por parcial, el porcentaje del calendario
 * y la UI. Solo las líneas con celda y clases entran al denominador; la
 * justificación —y SOLO ella— suma al numerador sin clases propias (ya viene
 * con el tope en el faltante). Una línea de materia sin clases nunca suma: si
 * sumara, el porcentaje podría pasar de 100 %.
 */
export function totalesEnClases(
  lineas: readonly LineaConteoClases[],
): { clases: number; asistidas: number } {
  let clases = 0;
  let asistidas = 0;
  for (const m of lineas) {
    if (m.asistidas === null) continue;
    if (m.tipo === "justificacion") {
      asistidas += m.asistidas;
    } else if (m.clases > 0) {
      clases += m.clases;
      asistidas += m.asistidas + (m.clasesJustificadas ?? 0);
    }
  }
  return { clases, asistidas };
}
