/**
 * numero-control-puro.ts — MÓDULO PURO. Normaliza y valida el número de control
 * (matrícula) del alumno. 2026-09-24.
 *
 * Es el que se imprime en la constancia de estudios: «con el número de control
 * 23222040230009». Se guarda en `ALUMNOS.numero_control`, único cuando existe
 * (supabase/agregar-numero-control-alumno.sql). Las reglas de aquí son las MISMAS
 * que el CHECK de la base, para que un valor que la app acepta nunca lo rechace
 * Postgres con un error críptico.
 */

/** Igual que el CHECK `alumnos_numero_control_formato`. */
export const FORMATO_NUMERO_CONTROL = /^[A-Z0-9-]{4,20}$/;

/** Quita espacios (también los de en medio: se dictan en grupos) y pasa a mayúsculas. */
export function normalizarNumeroControl(valor: string): string {
  return valor.replace(/\s+/g, "").toUpperCase();
}

/**
 * Valor listo para guardar. Vacío = quitar el número (null). Si no cumple el
 * formato, el mensaje dice por qué, en palabras de quien lo captura.
 */
export function validarNumeroControl(
  valor: string,
): { ok: true; valor: string | null } | { ok: false; error: string } {
  const v = normalizarNumeroControl(valor);
  if (!v) return { ok: true, valor: null };
  if (v.length < 4) return { ok: false, error: "El número de control debe tener al menos 4 caracteres." };
  if (v.length > 20) return { ok: false, error: "El número de control no puede pasar de 20 caracteres." };
  if (!FORMATO_NUMERO_CONTROL.test(v)) {
    return { ok: false, error: "El número de control solo lleva letras, números y guiones." };
  }
  return { ok: true, valor: v };
}
