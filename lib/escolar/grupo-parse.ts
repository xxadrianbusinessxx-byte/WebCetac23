import { normalizarNombre } from "./nombres";
import { listarRegistrosCompletos } from "./tablas-supabase";

const SUFIJO_REGISTRO = " REGISTRO DE CALIFICACIONES FINALES";

/** Grado, grupo y carrera desde nombre de tabla de registro o materia. */
export function parseGrupoDesdeNombreTabla(nombreTabla: string): {
  grado: string;
  grupo: string;
  carrera: string;
} | null {
  let base = nombreTabla.trim();
  const idx = base.toUpperCase().indexOf(" REGISTRO DE CALIFICACIONES");
  if (idx >= 0) base = base.slice(0, idx).trim();

  const partes = base.split(/\s+/).filter(Boolean);
  if (partes.length < 2) return null;

  const grado = partes[0]!.toUpperCase();
  const grupo = partes[1]!.toUpperCase();
  const carrera = partes.length > 2 ? partes.slice(2).join(" ").toUpperCase() : "";

  return { grado, grupo, carrera };
}

function carreraCoincideConTabla(
  carreraEtiqueta: string,
  parsedCarrera: string,
  nombreTabla: string,
): boolean {
  const c = carreraEtiqueta.trim().toUpperCase();
  if (!c) return true;

  const p = parsedCarrera.toUpperCase();
  const tabla = nombreTabla.toUpperCase();

  if (p && (p === c || p.includes(c) || c.includes(p))) return true;
  if (tabla.includes(c)) return true;

  const tokens = c.split(/\s+/).filter((t) => t.length > 2);
  if (tokens.length >= 2 && tokens.every((t) => tabla.includes(t))) return true;

  return false;
}

/**
 * Nombre exacto de la tabla REGISTRO en Supabase.
 * Usa lista generada + OpenAPI (Vercel a veces no devuelve OpenAPI).
 */
export async function nombreTablaRegistroDesdeGrupo(
  grado: string,
  grupo: string,
  carrera: string,
): Promise<string | null> {
  const registros = await listarRegistrosCompletos();
  const g = grado.trim().toUpperCase();
  const gr = grupo.trim().toUpperCase();
  const c = carrera.trim().toUpperCase();
  if (!g || !gr || !registros.length) return null;

  const candidatos = c
    ? [`${g} ${gr} ${c}${SUFIJO_REGISTRO}`, `${g} ${gr}${SUFIJO_REGISTRO}`]
    : [`${g} ${gr}${SUFIJO_REGISTRO}`];

  for (const candidato of candidatos) {
    const exacta = registros.find((r) => r === candidato);
    if (exacta) return exacta;
    const norm = normalizarNombre(candidato);
    const porNorm = registros.find((r) => normalizarNombre(r) === norm);
    if (porNorm) return porNorm;
  }

  const flexibles = registros.filter((nombreTabla) => {
    const parsed = parseGrupoDesdeNombreTabla(nombreTabla);
    if (!parsed || parsed.grado !== g || parsed.grupo !== gr) return false;
    return carreraCoincideConTabla(c, parsed.carrera, nombreTabla);
  });

  if (flexibles.length === 1) return flexibles[0]!;
  if (flexibles.length > 1 && c) {
    const conCarreraEnNombre = flexibles.find((t) =>
      t.toUpperCase().includes(c),
    );
    if (conCarreraEnNombre) return conCarreraEnNombre;
  }
  return flexibles[0] ?? null;
}
