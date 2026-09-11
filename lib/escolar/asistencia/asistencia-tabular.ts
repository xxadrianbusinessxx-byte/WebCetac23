/**
 * asistencia-tabular.ts — MÓDULO PURO. Convierte el resumen de asistencia por
 * parcial en la misma forma tabular que usa la boleta de calificaciones.
 *
 * Rediseño Océano, apartado «Calendario › Asistencia»: el alumno ve sus
 * asistencias como las ve la boleta — encabezados y su fila destacada — en vez
 * de como una rejilla mensual. Es la MISMA información que ya muestra
 * `CalendarioAsistenciaAlumno`, presentada de otra forma.
 *
 * DIFERENCIA IMPORTANTE con las calificaciones: la boleta de calificaciones sale
 * de una hoja REAL que subió el profesor. Esta tabla NO existe en ninguna parte:
 * se sintetiza aquí a partir de `resumenPorParcial`, que a su vez es derivado en
 * memoria y no se almacena. Se parece a un Excel; no lo es. Si alguien espera
 * descargarlo, no hay archivo que descargar.
 *
 * NO hace I/O. Consume lo que ya devolvió `actionObtenerEstadosAsistenciaAlumno`
 * — la MISMA action que alimenta el calendario visual. No abrir una segunda vía
 * de lectura de asistencia (R6).
 */
import type { ResumenPorParcial } from "./asistencia-parcial";

/** Misma forma que `MateriaTablaVista`, sin importar `types.ts` para no arrastrar
 *  dependencias de calificaciones a un módulo de asistencia. */
export type VistaTabularAsistencia = {
  encabezados: string[];
  filas: string[][];
  /** Índice de la fila del alumno. Siempre 0: la vista contiene solo su fila. */
  filaDestacada: number;
};

export type OpcionesVistaAsistencia = {
  /** Nombre completo del alumno, tal como se muestra en la primera columna. */
  nombreAlumno: string;
  /**
   * Parciales sin ninguna clase registrada. `false` (por defecto) los omite,
   * como hace el resumen del calendario. `true` los muestra con guion, que es
   * lo correcto cuando la tabla debe tener una columna por parcial del ciclo
   * aunque alguno esté vacío.
   */
  incluirParcialesVacios?: boolean;
};

/** Un parcial sin asistencias ni faltas registradas no aporta porcentaje: su
 *  denominador es cero y mostrar «0 %» mentiría (no es que faltara, es que no
 *  hubo clase registrada). */
export function parcialTieneRegistro(r: ResumenPorParcial): boolean {
  return r.asistencias + r.faltas > 0;
}

/** Porcentaje global sobre TODOS los parciales: se recalcula desde los conteos,
 *  no se promedian los porcentajes de cada parcial. Promediar porcentajes de
 *  denominadores distintos da un número que no significa nada. */
export function porcentajeGlobal(resumen: readonly ResumenPorParcial[]): number {
  let asistencias = 0;
  let registradas = 0;
  for (const r of resumen) {
    asistencias += r.asistencias;
    registradas += r.asistencias + r.faltas;
  }
  return registradas === 0 ? 0 : Math.round((asistencias / registradas) * 100);
}

const GUION = "—";

/**
 * Construye la tabla. Una columna por parcial más el resultado final, para que
 * se lea igual que la boleta: identidad a la izquierda, desglose en medio,
 * resultado a la derecha.
 */
export function vistaTabularAsistencia(
  resumen: readonly ResumenPorParcial[],
  opciones: OpcionesVistaAsistencia,
): VistaTabularAsistencia {
  const incluirVacios = opciones.incluirParcialesVacios ?? false;

  const visibles = [...resumen]
    .filter((r) => incluirVacios || parcialTieneRegistro(r))
    .sort((a, b) => a.parcial.numero - b.parcial.numero);

  const encabezados = ["Alumno", ...visibles.map((r) => r.parcial.nombre), "Asistencia final"];

  const celdas = visibles.map((r) =>
    parcialTieneRegistro(r) ? `${r.porcentaje}%` : GUION,
  );

  // El global se calcula sobre las columnas VISIBLES, para que la fila cuadre
  // con lo que el alumno tiene delante.
  const global = porcentajeGlobal(visibles);
  const hayAlgo = visibles.some(parcialTieneRegistro);

  return {
    encabezados,
    filas: [[opciones.nombreAlumno, ...celdas, hayAlgo ? `${global}%` : GUION]],
    filaDestacada: 0,
  };
}

/** Desglose por parcial para la tarjeta de detalle: asistencias, faltas y
 *  porcentaje. Mismo dato que la tabla, en la forma de lista que usa
 *  `MateriaCalificacionesAlumno` para agrupar. */
export type DetalleParcialAsistencia = {
  etiqueta: string;
  asistencias: number;
  faltas: number;
  pendientes: number;
  porcentaje: number | null;
};

export function detallePorParcial(
  resumen: readonly ResumenPorParcial[],
): DetalleParcialAsistencia[] {
  return [...resumen]
    .sort((a, b) => a.parcial.numero - b.parcial.numero)
    .map((r) => ({
      etiqueta: r.parcial.nombre,
      asistencias: r.asistencias,
      faltas: r.faltas,
      pendientes: r.pendientes,
      porcentaje: parcialTieneRegistro(r) ? r.porcentaje : null,
    }));
}
