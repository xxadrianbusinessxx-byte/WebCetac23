import { normalizarNombre } from "./nombres";
import { listarTablasRegistrosDesdeSupabase } from "./tablas-supabase";

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

export async function nombreTablaRegistroDesdeGrupo(
  grado: string,
  grupo: string,
  carrera: string,
): Promise<string | null> {
  const REGISTROS_ESCOLAR = await listarTablasRegistrosDesdeSupabase();
  const g = grado.trim().toUpperCase();
  const gr = grupo.trim().toUpperCase();
  const c = carrera.trim().toUpperCase();
  if (!g || !gr) return null;

  const candidatos = c
    ? [`${g} ${gr} ${c}${SUFIJO_REGISTRO}`, `${g} ${gr}${SUFIJO_REGISTRO}`]
    : [`${g} ${gr}${SUFIJO_REGISTRO}`];

  for (const candidato of candidatos) {
    const exacta = REGISTROS_ESCOLAR.find((r) => r === candidato);
    if (exacta) return exacta;
    const norm = normalizarNombre(candidato);
    const porNorm = REGISTROS_ESCOLAR.find((r) => normalizarNombre(r) === norm);
    if (porNorm) return porNorm;
  }
  return null;
}
