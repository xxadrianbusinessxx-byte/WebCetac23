import { parseGrupoDesdeNombreTabla } from "./grupo-parse";

/** Materias que coinciden con grado, grupo y carrera del alumno. Sin grupo → ninguna. */
export function filtrarMateriasPorGrupo(
  materias: readonly string[],
  grado: string,
  grupo: string,
  carrera: string,
): string[] {
  const g = grado.trim().toUpperCase();
  const gr = grupo.trim().toUpperCase();
  if (!g || !gr) return [];

  const c = carrera.trim().toUpperCase();

  return materias.filter((nombre) => {
    const parsed = parseGrupoDesdeNombreTabla(nombre);
    if (!parsed) return false;
    if (parsed.grado !== g || parsed.grupo !== gr) return false;
    if (c && parsed.carrera && parsed.carrera !== c) return false;
    return true;
  });
}

export function alumnoTieneGrupoAsignado(
  grado: string,
  grupo: string,
): boolean {
  return Boolean(grado.trim() && grupo.trim());
}
