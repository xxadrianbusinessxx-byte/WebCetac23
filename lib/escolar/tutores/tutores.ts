import "server-only";

/**
 * Dominio de TUTORES/PADRES (Bloque 6A) — FACHADA DE LA FAMILIA.
 *
 * El tutor es una entidad independiente del alumno. Su identidad de relación
 * es `tutor_id` (UUID) y su clave pública/amigable es `clave_tutor`
 * (formato `TUT-XXXXXXXX`). La relación con alumnos vive en `tutor_alumnos`.
 *
 * Reglas de negocio:
 *  - La contraseña se guarda SIEMPRE como hash scrypt (nunca en texto plano).
 *  - La contraseña inicial se deriva de los últimos 8 caracteres del CURP del
 *    alumno de referencia (regla distinta a `claveDesdeCurp` de alumnos, que
 *    usa 6). Por eso NO se reutiliza `claveDesdeCurp`.
 *  - La identidad de la cuenta NO depende del valor de `usuario`; depende de
 *    `tutor_id` y de la relación en `tutor_alumnos`.
 *
 * ── PROMPT E · R-3 (partición por responsabilidad) ─────────────────────────
 * Este archivo tenía 1 065 líneas y hacía tres cosas a la vez. Se partió en:
 *
 *   · `./tutores-credenciales.ts` — hash scrypt, contraseña inicial (simple y
 *     multi-hijo), `tutor_credenciales_iniciales`, clave `TUT-XXXXXXXX`,
 *     usuario único y cambio de credenciales.
 *   · `./tutores-relacion.ts` — consultas por identidad y la relación
 *     tutor↔alumno (`tutor_alumnos`), tutor principal y consolidación
 *     (crear/reemplazar, desactivar relaciones y huérfanos).
 *   · `./tutores-generacion.ts` — generación masiva desde el roster (.xlsx de
 *     credenciales iniciales).
 *
 * Los re-exports se conservan: ningún import existente se rompe (§10).
 */

export {
  nombreCompletoTutor,
  type TutorAlumnoRow,
  type TutorRow,
} from "./tutores-types";

export * from "./tutores-credenciales";
export * from "./tutores-relacion";
export * from "./tutores-generacion";
