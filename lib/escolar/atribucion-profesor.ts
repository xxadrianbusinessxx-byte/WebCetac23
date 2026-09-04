/**
 * PROMPT C (R-3) — ATRIBUCIÓN AUTOMÁTICA DE MATERIA AL PROFESOR EN LA SUBIDA
 * DE ASISTENCIAS. Núcleo PURO (sin I/O ni Supabase).
 *
 * Por qué este módulo es puro:
 *   - las decisiones de escritura (qué filas se guardan, contra qué conflicto
 *     se hace el UPSERT, cuál es la asignación idempotente) son el CORAZÓN de
 *     R-3 y deben poder probarse con `scripts/test-atribucion-profesor.mjs`
 *     sin tocar la base de datos;
 *   - el acceso a Supabase queda en la capa que ya conoce el catálogo
 *     (`lib/escolar/asistencias.ts` / `app/actions/asistencias.ts`).
 *
 * Reglas congeladas (R-3 del prompt C):
 *   1. La identidad de la escritura es `profesor_id` (PROFESORES.ID) que sale
 *      SIEMPRE de la sesión; NUNCA del cliente. Sin `profesorId` NO se escribe
 *      nada (ni siquiera con `profesor_clave`).
 *   2. Cada materia subida se guarda como filas DISTINTAS del mismo grupo/día
 *      (`grupo_materia_id` forma parte de la clave de conflicto del UPSERT).
 *   3. Volver a subir la MISMA materia del MISMO grupo/día actualiza la misma
 *      fila (idempotencia): la clave de conflicto depende de la materia.
 *   4. La atribución en `asignaciones_profesor` es un UPSERT idempotente de
 *      `(profesor_id, grupo_materia_id)` con `activo=true`. Desactivar una
 *      asignación NUNCA borra la otra (2+ materias = 2+ filas activas).
 *   5. `profesor_clave` se conserva como columna LEGACY (el SQL R-1 la relaja
 *      a nullable): las filas NUEVAS NO escriben la contraseña
 *      (`profesor_clave = NULL`) y su identidad es `profesor_id`. La clave de
 *      la sesión solo se copia como dato histórico en `asignaciones_profesor`
 *      (columna legacy NOT NULL de esa tabla).
 */

export const UUID_CERO = "00000000-0000-0000-0000-000000000000";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Claves de conflicto (`onConflict` de supabase-js) para cada tabla.
 * Con materia, la materia forma parte de la clave natural: dos materias del
 * mismo grupo y día NO colisionan y re-subir la misma materia NO duplica.
 */
export const CLAVES_CONFLICTO_CLASES_SIN_MATERIA =
  "profesor_clave,grado,grupo,fecha";
export const CLAVES_CONFLICTO_CLASES_CON_MATERIA =
  "profesor_id,grupo_materia_id,grado,grupo,fecha";
export const CLAVES_CONFLICTO_ASISTENCIA_SIN_MATERIA =
  "profesor_clave,curp,grado,grupo,fecha";
export const CLAVES_CONFLICTO_ASISTENCIA_CON_MATERIA =
  "profesor_id,grupo_materia_id,curp,grado,grupo,fecha";

export const ERROR_ATRIBUCION_SIN_PROFESOR_ID =
  "Tu sesión no incluye la identidad de profesor (PROFESORES.ID). Vuelve a iniciar sesión para guardar asistencias; no se escribirá nada usando la contraseña como identidad.";

export const ERROR_ATRIBUCION_MATERIA_NO_RESUELTA =
  "No se pudo atribuir la materia: no existe un grupo_materias ACTIVO (grupo + materia del catálogo) para este grupo. Revisa la carga académica del grupo antes de subir la plantilla.";

export type FilaClasesCandidata = {
  grado: string;
  grupo: string;
  carrera: string;
  fecha: string;
  clases: number;
};

export type FilaAsistenciaCandidata = {
  curp: string;
  grado: string;
  grupo: string;
  carrera: string;
  nombre: string;
  fecha: string;
  clases_asistidas: number;
};

export type FilaClasesAtribuida = FilaClasesCandidata & {
  profesor_id: number;
  grupo_materia_id: string;
};

export type FilaAsistenciaAtribuida = FilaAsistenciaCandidata & {
  profesor_id: number;
  grupo_materia_id: string;
};

/** ¿El valor es un UUID con formato canónico? */
export function esUuid(raw: unknown): raw is string {
  return typeof raw === "string" && UUID_RE.test(raw.trim());
}

/** ¿El profesor puede ser identificado por PROFESORES.ID? */
export function profesorIdValido(raw: unknown): raw is number {
  if (raw === null || raw === undefined || raw === "") return false;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0;
}

/** ¿La subida lleva materia resuelta (UUID de grupo_materias)? */
export function materiaResuelta(raw: unknown): raw is string {
  return esUuid(raw);
}


export function claveConflictoClases(conMateria: boolean): string {
  return conMateria
    ? CLAVES_CONFLICTO_CLASES_CON_MATERIA
    : CLAVES_CONFLICTO_CLASES_SIN_MATERIA;
}

export function claveConflictoAsistencia(conMateria: boolean): string {
  return conMateria
    ? CLAVES_CONFLICTO_ASISTENCIA_CON_MATERIA
    : CLAVES_CONFLICTO_ASISTENCIA_SIN_MATERIA;
}

export type AtribucionSubida = {
  /** Identidad ESTRUCTURAL del profesor (PROFESORES.ID). Nunca el cliente. */
  profesorId: number | null;
  /** UUID del grupo_materias ACTIVO resuelto en el servidor. */
  grupoMateriaId: string | null;
  /** CLAVE legacy de la sesión: solo para el dato histórico de
   *  asignaciones_profesor (NOT NULL legacy). No se escribe en asistencia. */
  profesorClave?: string | null;
};

export type PlanSubida = {
  clasesImpartidas: FilaClasesCandidata[];
  asistencias: FilaAsistenciaCandidata[];
};

export type FilaAsignacionActiva = {
  profesor_id: number;
  profesor_clave: string;
  grupo_materia_id: string;
  activo: true;
  desde: string;
  hasta: null;
};

export type ResultadoAtribucion =
  | {
      ok: true;
      clasesImpartidas: FilaClasesAtribuida[];
      asistencias: FilaAsistenciaAtribuida[];
      /** Clave de conflicto del UPSERT de clases_impartidas (con materia). */
      conflictoClases: string;
      /** Clave de conflicto del UPSERT de asistencia_alumnos (con materia). */
      conflictoAsistencia: string;
      /** Fila idempotente para asignaciones_profesor (activo=true). */
      asignacionActiva: FilaAsignacionActiva;
      /** Identidad natural de la asignación (profesorId | grupoMateriaId). */
      claveAsignacion: string;
    }
  | { ok: false; error: string };

/**
 * Aplica la atribución a un plan de subida:
 *   - rechaza sin `profesorId` (nunca escribe con la contraseña);
 *   - rechaza sin materia resuelta (sin ella no existe atribución posible);
 *   - devuelve las filas enriquecidas con `profesor_id` y `grupo_materia_id`
 *     y las claves de conflicto que garantizan «2 materias ≠ colisión» e
 *     «idempotencia por materia».
 */
export function atribuirMateriaAlPlan(
  plan: PlanSubida,
  atribucion: AtribucionSubida,
): ResultadoAtribucion {
  if (!profesorIdValido(atribucion.profesorId)) {
    return { ok: false, error: ERROR_ATRIBUCION_SIN_PROFESOR_ID };
  }
  if (!materiaResuelta(atribucion.grupoMateriaId)) {
    return { ok: false, error: ERROR_ATRIBUCION_MATERIA_NO_RESUELTA };
  }
  const profesorId = Number(atribucion.profesorId);
  const grupoMateriaId = atribucion.grupoMateriaId.trim();

  // Las filas NUEVAS NO escriben `profesor_clave` (pasa a NULL): la identidad
  // es `profesor_id`. Se construyen explícitamente (sin heredar la clave).
  const clasesImpartidas = plan.clasesImpartidas.map((f) => ({
    grado: f.grado,
    grupo: f.grupo,
    carrera: f.carrera,
    fecha: f.fecha,
    clases: f.clases,
    profesor_id: profesorId,
    grupo_materia_id: grupoMateriaId,
  }));
  const asistencias = plan.asistencias.map((f) => ({
    curp: f.curp,
    grado: f.grado,
    grupo: f.grupo,
    carrera: f.carrera,
    nombre: f.nombre,
    fecha: f.fecha,
    clases_asistidas: f.clases_asistidas,
    profesor_id: profesorId,
    grupo_materia_id: grupoMateriaId,
  }));

  const ahora = new Date().toISOString();
  return {
    ok: true,
    clasesImpartidas,
    asistencias,
    conflictoClases: claveConflictoClases(true),
    conflictoAsistencia: claveConflictoAsistencia(true),
    asignacionActiva: {
      profesor_id: profesorId,
      profesor_clave: (atribucion.profesorClave ?? "").trim(),
      grupo_materia_id: grupoMateriaId,
      activo: true,
      desde: ahora,
      hasta: null,
    },
    claveAsignacion: claveAsignacionProfesorMateria(profesorId, grupoMateriaId),
  };
}

/**
 * Identidad natural de UNA asignación: `(profesor_id, grupo_materia_id)`.
 * Subir la misma materia dos veces produce la MISMA clave (idempotente);
 * dos materias del mismo profesor producen claves DISTINTAS.
 */
export function claveAsignacionProfesorMateria(
  profesorId: number,
  grupoMateriaId: string,
): string {
  return `${Number(profesorId)}|${grupoMateriaId.trim().toLowerCase()}`;
}

/** Estado inactivo de una asignación (UPDATE, nunca DELETE). */
export function asignacionInactiva(
  activa: FilaAsignacionActiva,
  hastaIso: string,
): {
  activo: false;
  hasta: string;
  profesor_id: number;
  grupo_materia_id: string;
} {
  return {
    profesor_id: activa.profesor_id,
    grupo_materia_id: activa.grupo_materia_id,
    activo: false,
    hasta: hastaIso,
  };
}
