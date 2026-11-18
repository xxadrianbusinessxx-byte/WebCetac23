/**
 * asignacion-materia-puro.ts — MÓDULO PURO. ¿Qué hay que escribir para que una
 * materia de grupo quede asignada a ESTE profesor? 2026-11-17.
 *
 * Desde 2026-11-17 la propiedad de una materia vive SOLO en
 * `asignaciones_profesor` y la asigna el técnico (subir asistencia ya no la
 * da). Una materia tiene **un dueño activo**: asignarla a otro profesor lo
 * REEMPLAZA —el anterior pasa a inactivo, con su `hasta`, nunca se borra—. La
 * base lo impone con la UNIQUE parcial de
 * `supabase/agregar-unicidad-dueno-materia.sql`; este plan lo cumple antes de
 * escribir para que el técnico vea un mensaje claro y no un error de índice.
 *
 * El plan conserva la reconciliación C4.28 que ya hacía `crearAsignacion`:
 *   a) fila ESTRUCTURAL del mismo profesor: activa → nada que hacer;
 *      inactiva → reactivar (conserva historial);
 *   b) fila LEGACY (profesor_id NULL) con la CLAVE del profesor → reconciliar
 *      (la CLAVE solo es match histórico, nunca identidad);
 *   c) ninguna → insertar.
 * Y añade: cualquier OTRA fila activa de esa materia se desactiva.
 *
 * Sin I/O: lo prueba `scripts/test-asignacion-materia.mjs`.
 */

/** Lo que el plan necesita de cada fila de `asignaciones_profesor` de ESA materia. */
export type FilaAsignacionDeMateria = {
  id: string;
  profesor_id: number | null;
  profesor_clave: string | null;
  activo: boolean;
};

export type AccionAsignacion =
  | { tipo: "ya_activa"; filaId: string }
  | { tipo: "reactivar"; filaId: string }
  | { tipo: "reconciliar"; filaId: string }
  | { tipo: "insertar" };

export type PlanAsignacionMateria = {
  accion: AccionAsignacion;
  /** Filas ACTIVAS de otros dueños: se desactivan (UPDATE), nunca se borran. */
  desactivar: string[];
  /** `PROFESORES.ID` de los dueños que se reemplazan (para el mensaje). */
  reemplazados: number[];
};

/**
 * Plan para dejar la materia con `profesorId` como ÚNICO dueño activo.
 * `claveProfesor` solo sirve para reconocer filas legacy (profesor_id NULL).
 */
export function planAsignarMateria(
  filas: readonly FilaAsignacionDeMateria[],
  profesorId: number,
  claveProfesor: string,
): PlanAsignacionMateria {
  const clave = claveProfesor.trim().toUpperCase();

  const estructural = filas.find(
    (f) => typeof f.profesor_id === "number" && f.profesor_id === profesorId,
  );
  const legacy = estructural
    ? undefined
    : filas.find(
        (f) =>
          f.profesor_id === null &&
          clave !== "" &&
          String(f.profesor_clave ?? "").trim().toUpperCase() === clave,
      );

  let accion: AccionAsignacion;
  if (estructural) {
    accion = estructural.activo
      ? { tipo: "ya_activa", filaId: estructural.id }
      : { tipo: "reactivar", filaId: estructural.id };
  } else if (legacy) {
    accion = { tipo: "reconciliar", filaId: legacy.id };
  } else {
    accion = { tipo: "insertar" };
  }

  const destinoId = "filaId" in accion ? accion.filaId : null;
  const otrasActivas = filas.filter((f) => f.activo && f.id !== destinoId);
  return {
    accion,
    desactivar: otrasActivas.map((f) => f.id),
    reemplazados: [
      ...new Set(
        otrasActivas
          .map((f) => f.profesor_id)
          .filter((x): x is number => typeof x === "number"),
      ),
    ],
  };
}

/**
 * Mensaje cuando la materia ya tiene OTRO dueño y no se pidió reemplazarlo.
 * La UI del lote lo reconoce por «ya tiene profesor».
 */
export function errorMateriaConOtroDueno(reemplazados: readonly number[]): string {
  return (
    `La materia ya tiene profesor asignado (PROFESORES.ID ${reemplazados.join(", ")}). ` +
    "Para cambiarlo, asígnala de forma individual: el anterior queda inactivo, con historial."
  );
}

/**
 * ¿Hay que detenerse? Solo cuando la materia tiene otro dueño activo y quien
 * asigna NO pidió reemplazarlo. El alta individual lo pide (el técnico ve al
 * dueño actual en el selector); el alta en lote no, para no barrer a los demás
 * profesores del grupo.
 */
export function bloqueaPorOtroDueno(
  plan: PlanAsignacionMateria,
  reemplazar: boolean,
): boolean {
  return plan.reemplazados.length > 0 && !reemplazar;
}
