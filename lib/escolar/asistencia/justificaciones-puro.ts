/**
 * justificaciones-puro.ts — MÓDULO PURO de `justificaciones.ts`.
 *
 * Núcleo puro de justificación por clase: qué materia tiene clase ese día,
 * cuántas clases se justifican (derivado, con tope en el faltante), si un nombre
 * de archivo es seguro y la ruta del adjunto. Cero imports de I/O.
 *
 * Movido desde `justificaciones.ts` (PROMPT Q · Parte 1 · R-1);
 * `justificaciones.ts` re-exporta todo. `rutaStorageJustificacion` usa
 * `Date.now()` para el sufijo del archivo (es tiempo, no I/O): se conserva tal
 * cual.
 */

import type { MateriaDelDia } from "./asistencia-dia-materia.ts";

export const JUSTIFICACION_EXTENSIONES_PERMITIDAS = [
  "pdf",
  "png",
  "jpg",
  "jpeg",
] as const;
/**
 * JUSTIFICACIÓN POR CLASE — núcleo puro.
 *
 * - `bloquesPorMateria`: bloques del grupo ESE día agrupados por materia_clave
 *   (origen: horario_semanal oficial, no la configuración del profesor).
 * - `materias`: materias justificadas y APROBADAS del día (`null`/"" significa
 *   justificación de día completo, que conserva el comportamiento actual).
 * - El total NUNCA supera el faltante (esperadas − asistidas).
 */
export type ClasesJustificadasPorDiaInput = {
  bloquesPorMateria: Record<string, number>;
  materias: Array<string | null>;
  faltante: number;
};

/** ¿La materia tiene al menos un bloque programado ESE día? (validación server). */
export function materiaTieneClaseEnDia(
  bloquesPorMateria: Record<string, number>,
  materiaClave: string | null | undefined,
): boolean {
  const k = String(materiaClave ?? "").trim();
  if (!k) return false;
  return (Number(bloquesPorMateria[k]) || 0) > 0;
}

/**
 * Total de clases justificadas para un día (derivado, nunca almacenado).
 *  - día completo (alguna entrada null/"") → el faltante entero;
 *  - por clase → suma de bloques de cada materia aprobada, con tope en faltante;
 *  - una materia sin bloques ese día aporta 0 (se rechaza antes en el servidor).
 */
export function calcularClasesJustificadasPorDia(
  input: ClasesJustificadasPorDiaInput,
): number {
  const faltante = Math.max(Number(input.faltante) || 0, 0);
  const materias = Array.isArray(input.materias) ? input.materias : [];
  // Día completo (null/""): cualquier entrada de día completo domina y aplica
  // el faltante entero (comportamiento actual preservado).
  if (materias.some((m) => m == null || String(m).trim() === "")) {
    return faltante;
  }
  // Dedupe por materia: reaplicar la misma justificación NO acumula (idempotente).
  const claves = new Set<string>();
  for (const m of materias) {
    const k = String(m ?? "").trim();
    if (!k) continue;
    claves.add(k);
  }
  let total = 0;
  for (const k of claves) {
    total += Number(input.bloquesPorMateria[k]) || 0;
  }
  return Math.min(total, faltante);
}
/** ¿Nombre de archivo seguro (sin rutas, sin separadores, extensión permitida)? */
export function esNombreArchivoJustificacionSeguro(
  nombre: string,
): boolean {
  const n = nombre.trim();
  if (!n || n.length > 120) return false;
  if (/[\\/]/.test(n) || n.includes("..") || n.startsWith(".")) return false;
  const ext = n.split(".").pop()?.toLowerCase() ?? "";
  return (JUSTIFICACION_EXTENSIONES_PERMITIDAS as readonly string[]).includes(ext);
}

/** Ruta segura dentro del bucket: justificaciones/{curp}/{fecha}-{ts}.{ext} */
export function rutaStorageJustificacion(
  curp: string,
  fecha: string,
  nombreOriginal: string,
): string {
  const ext =
    nombreOriginal.split(".").pop()?.toLowerCase() || "pdf";
  const ts = Date.now();
  return `justificaciones/${curp}/${fecha}-${ts}.${ext}`;
}

/* ---------------------------------------------------------------------------
 * CIRCUITO PADRE → PROFESOR / DIRECTIVO (2026-10-01)
 * ---------------------------------------------------------------------------
 * El padre (o el directivo) envía UNA solicitud por día. El profesor la recibe
 * y justifica solo materias de ese día; el directivo la acepta y justifica el
 * día entero. Estas decisiones son puras: reciben el desglose del día que ya
 * calcula `resolverDiaMateria` y no consultan nada.
 */
/** Lo que una decisión de justificación necesita de una línea del día. */
export type LineaJustificable = Pick<
  MateriaDelDia,
  "grupoMateriaId" | "tipo" | "clases" | "asistidas" | "profesorId" | "clasesJustificadas"
>;

/** ¿La línea tiene falta registrada que aún no está cubierta? */
function faltaSinCubrir(m: LineaJustificable): boolean {
  if (m.tipo === "justificacion") return false;
  if (m.asistidas === null || m.clases <= 0) return false;
  return m.asistidas + (m.clasesJustificadas ?? 0) < m.clases;
}

/**
 * ¿Hay algo que justificar ese día? Una falta REGISTRADA (0 o parcial) en
 * alguna materia —o en el registro anterior sin materia— que ninguna
 * justificación aprobada cubra. Una materia pendiente (sin celda) no es falta.
 */
export function diaTieneFaltaJustificable(
  materias: readonly LineaJustificable[],
): boolean {
  return materias.some(faltaSinCubrir);
}

/**
 * Materias de ese día que ESTE profesor puede justificar.
 *
 * Regla del directivo (2026-10-01): si la falta tiene dueño —el `profesor_id`
 * que la registró— solo la ve y la justifica ese profesor; si no hay a quién
 * atribuirla, la ve cualquier profesor. El registro anterior sin materia no se
 * puede justificar por materia: solo el directivo, con el día completo.
 */
export function materiasJustificablesPorProfesor<T extends LineaJustificable>(
  materias: readonly T[],
  profesorId: number,
): T[] {
  return materias.filter(
    (m) =>
      m.tipo === "materia" &&
      m.grupoMateriaId !== null &&
      faltaSinCubrir(m) &&
      (m.profesorId === null || m.profesorId === profesorId),
  );
}

/**
 * Valida la selección del profesor contra lo que el servidor recalculó: cada
 * materia pedida tiene que estar entre las justificables. Sin selección, o con
 * una sola materia fuera de su alcance, no se escribe nada.
 */
export function validarSeleccionProfesor(
  justificables: readonly LineaJustificable[],
  seleccion: readonly string[],
): { ok: true; materias: string[] } | { ok: false; error: string } {
  const pedidas = [...new Set(seleccion.map((s) => s.trim()).filter(Boolean))];
  if (pedidas.length === 0) {
    return { ok: false, error: "Elige al menos una materia para justificar." };
  }
  const permitidas = new Set(
    justificables.map((m) => m.grupoMateriaId).filter((g): g is string => g !== null),
  );
  const fuera = pedidas.filter((g) => !permitidas.has(g));
  if (fuera.length > 0) {
    return {
      ok: false,
      error:
        "Alguna materia elegida ya no tiene falta que justificar o no te corresponde. Recarga la lista.",
    };
  }
  return { ok: true, materias: pedidas };
}
