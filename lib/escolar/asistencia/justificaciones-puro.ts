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
