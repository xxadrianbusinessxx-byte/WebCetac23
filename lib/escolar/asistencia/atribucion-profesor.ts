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
 * Reglas congeladas (R-3 del prompt C; 3 y 4 reescritas el 2026-11-17):
 *   1. La identidad de la escritura es `profesor_id` (PROFESORES.ID) que sale
 *      SIEMPRE de la sesión; NUNCA del cliente. Sin `profesorId` NO se escribe
 *      nada (ni siquiera con `profesor_clave`).
 *   2. Cada materia subida se guarda como filas DISTINTAS del mismo grupo/día
 *      (`grupo_materia_id` forma parte de la clave de conflicto del UPSERT).
 *   3. La clave de conflicto es la NATURAL del dato —alumno + materia + día
 *      (asistencia) y materia + día (clases)— y NO lleva `profesor_id`: si
 *      otra persona captura la misma materia el mismo día, actualiza la misma
 *      fila en vez de duplicarla. `profesor_id` queda como AUTORÍA: quién
 *      capturó la fila por última vez.
 *   4. Subir asistencia NO da la propiedad de la materia. La propiedad vive
 *      SOLO en `asignaciones_profesor` y la asigna el técnico
 *      (`lib/escolar/catalogo/asignaciones-profesor.ts`). Antes la subida
 *      llamaba a `traspasar_materia_a_profesor` y se quedaba con la materia;
 *      eso hacía que Servicio Escolar o el directivo se la quitaran a su
 *      profesor (retirado 2026-11-17).
 *   5. `profesor_clave` se conserva como columna LEGACY (el SQL R-1 la relaja
 *      a nullable): las filas NUEVAS NO escriben la contraseña
 *      (`profesor_clave = NULL`) y su identidad es `profesor_id`.
 */

export const UUID_CERO = "00000000-0000-0000-0000-000000000000";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Claves de conflicto (`onConflict` de supabase-js) para cada tabla.
 * Con materia, la clave es la NATURAL del dato y no lleva `profesor_id`: dos
 * materias del mismo grupo y día NO colisionan, y re-subir la misma materia
 * —la suba quien la suba— actualiza la misma fila, NO duplica.
 *   · asistencia: UNIQUE `asistencia_alumnos_curp_gm_fecha_uidx`
 *     (supabase/agregar-indices-asistencia.sql), aplicada.
 *   · clases: UNIQUE `clases_impartidas_gm_fecha_uidx`
 *     (supabase/agregar-unicidad-clases-por-materia.sql).
 */
export const CLAVES_CONFLICTO_CLASES_SIN_MATERIA =
  "profesor_clave,grado,grupo,fecha";
export const CLAVES_CONFLICTO_CLASES_CON_MATERIA = "grupo_materia_id,fecha";
export const CLAVES_CONFLICTO_ASISTENCIA_SIN_MATERIA =
  "profesor_clave,curp,grado,grupo,fecha";
export const CLAVES_CONFLICTO_ASISTENCIA_CON_MATERIA = "curp,grupo_materia_id,fecha";

export const ERROR_ATRIBUCION_SIN_PROFESOR_ID =
  "Tu sesión no incluye la identidad de profesor (PROFESORES.ID). Vuelve a iniciar sesión para guardar asistencias; no se escribirá nada usando la contraseña como identidad.";

export const ERROR_ATRIBUCION_MATERIA_NO_RESUELTA =
  "No se pudo atribuir la materia: no existe un grupo_materias ACTIVO (grupo + materia del catálogo) para este grupo. Revisa la carga académica del grupo antes de subir la plantilla.";

export const ERROR_ATRIBUCION_SIN_PERIODO_ID =
  "Falta el periodo (ciclo operativo) para esta subida. Vuelve a iniciar el flujo de asistencias; no se escribirá nada sin periodo.";

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
  periodo_id: string;
};

export type FilaAsistenciaAtribuida = FilaAsistenciaCandidata & {
  profesor_id: number;
  grupo_materia_id: string;
  periodo_id: string;
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
  /** PROMPT S (A4) — id del periodo OPERATIVO (`periodos.id`). Sin él NO se
   *  escribe: las filas nuevas llevan `periodo_id` para no crecer sin índice. */
  periodoId: string | null;
};

export type PlanSubida = {
  clasesImpartidas: FilaClasesCandidata[];
  asistencias: FilaAsistenciaCandidata[];
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
    }
  | { ok: false; error: string };

/**
 * Aplica la atribución a un plan de subida:
 *   - rechaza sin `profesorId` (nunca escribe con la contraseña);
 *   - rechaza sin materia resuelta (sin ella no existe atribución posible);
 *   - rechaza sin `periodoId` (las filas nuevas llevan `periodo_id`);
 *   - devuelve las filas enriquecidas con `profesor_id` (autoría),
 *     `grupo_materia_id` y `periodo_id`, y las claves de conflicto que
 *     garantizan «2 materias ≠ colisión» e «idempotencia por materia».
 *   - NO devuelve asignación: subir no da la propiedad de la materia (regla 4).
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
  // PROMPT S (A4) — sin periodo operativo no se escribe (mismo patrón que sin
  // profesorId): las filas nuevas llevan `periodo_id`.
  if (!atribucion.periodoId || !atribucion.periodoId.trim()) {
    return { ok: false, error: ERROR_ATRIBUCION_SIN_PERIODO_ID };
  }
  const profesorId = Number(atribucion.profesorId);
  const grupoMateriaId = atribucion.grupoMateriaId.trim();
  const periodoId = atribucion.periodoId.trim();

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
    periodo_id: periodoId,
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
    periodo_id: periodoId,
  }));

  return {
    ok: true,
    clasesImpartidas,
    asistencias,
    conflictoClases: claveConflictoClases(true),
    conflictoAsistencia: claveConflictoAsistencia(true),
  };
}
