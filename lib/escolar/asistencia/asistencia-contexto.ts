/**
 * F7 — VALIDACIONES DE CONTEXTO PARA ASISTENCIA (dominio puro).
 *
 * Objetivo: ninguna fila de asistencia ni plantilla puede cruzar ciclos.
 *  - clase → periodo;
 *  - asistencia → periodo;
 *  - plantilla de A nunca se carga contra B;
 *  - justificación de A nunca se aplica a B;
 *  - fecha fuera del periodo → rechazo.
 */
export type Verificacion = { ok: boolean; codigo?: string; mensaje?: string };

/** ¿La fecha pertenece al rango del periodo (inclusive)? Sin rango → true. */
export function fechaEnPeriodo(
  fecha: string,
  periodo: { fecha_inicio?: string | null; fecha_fin?: string | null },
): boolean {
  if (periodo.fecha_inicio && periodo.fecha_fin) {
    return fecha >= periodo.fecha_inicio && fecha <= periodo.fecha_fin;
  }
  return true; // sin rango definido no se puede rechazar por fecha
}

/** Plantilla/carga de asistencia: el ciclo del archivo debe ser el del contexto. */
export function validarContextoPlantilla(
  contexto: { periodoId: string; nombre?: string },
  origen: { periodoId?: string | null; nombreCiclo?: string | null },
): Verificacion {
  if (origen.periodoId && origen.periodoId !== contexto.periodoId) {
    return { ok: false, codigo: "plantilla_ciclo_incorrecto", mensaje: "La plantilla pertenece a otro periodo." };
  }
  if (!origen.periodoId && origen.nombreCiclo) {
    const iguales = (origen.nombreCiclo ?? "").trim().toUpperCase() === (contexto.nombre ?? "").trim().toUpperCase();
    if (!iguales) {
      return { ok: false, codigo: "plantilla_ciclo_incorrecto", mensaje: `La plantilla dice «${origen.nombreCiclo}» y el contexto es «${contexto.nombre ?? ""}».` };
    }
  }
  return { ok: true };
}

/** Clase de un periodo → ¿pertenece? (validación de `clases_impartidas`). */
export function clasePertenecePeriodo(
  fila: { fecha: string },
  periodo: { id: string; fecha_inicio?: string | null; fecha_fin?: string | null },
): Verificacion {
  if (!fechaEnPeriodo(fila.fecha, periodo)) {
    return { ok: false, codigo: "fecha_fuera_de_periodo", mensaje: `La fecha ${fila.fecha} está fuera del periodo ${periodo.id}.` };
  }
  return { ok: true };
}

/** Justificación cruzada: bloqueada si apunta a otro periodo. */
export function validarJustificacionContexto(
  contextoPeriodoId: string,
  fila: { periodo_id?: string | null; fecha: string },
  periodo: { id: string; fecha_inicio?: string | null; fecha_fin?: string | null },
): Verificacion {
  if (fila.periodo_id && fila.periodo_id !== contextoPeriodoId) {
    return { ok: false, codigo: "justificacion_ciclo_incorrecto", mensaje: "La justificación pertenece a otro periodo." };
  }
  return clasePertenecePeriodo(fila, periodo);
}
