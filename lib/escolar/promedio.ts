import type { SupabaseClient } from "@supabase/supabase-js";
import { nombreCompletoAlumno } from "./alumnos";
import type { AlumnoRow } from "./types";
import { CURP_ALUMNO_RE, filaCoincideAlumno } from "./buscar-en-filas";
import { obtenerVistaMateria } from "./materias";
import { MATERIAS_ESCOLAR } from "./materias-list";

function numerosDeFila(fila: string[]): number[] {
  const nums: number[] = [];
  for (const celda of fila) {
    const t = String(celda ?? "").trim().replace(",", ".");
    if (!t || CURP_ALUMNO_RE.test(t)) continue;
    const n = Number.parseFloat(t);
    if (!Number.isNaN(n) && n >= 0 && n <= 10) nums.push(n);
  }
  return nums;
}

/** Promedio a partir de calificaciones en tablas de materias (0 si no hay datos). */
export async function calcularPromedioAlumno(
  supabase: SupabaseClient,
  alumno: AlumnoRow,
): Promise<number> {
  const criterio = {
    curp: alumno.CURP,
    nombreCompleto: nombreCompletoAlumno(alumno),
  };
  const muestra = MATERIAS_ESCOLAR.slice(0, 40);
  let suma = 0;
  let cuenta = 0;

  for (const materia of muestra) {
    const vista = await obtenerVistaMateria(supabase, materia);
    if (!vista?.filas.length) continue;

    for (const fila of vista.filas) {
      if (!filaCoincideAlumno(fila, criterio)) continue;
      const nums = numerosDeFila(fila);
      for (const n of nums) {
        suma += n;
        cuenta += 1;
      }
    }
  }

  if (cuenta === 0) return 0;
  return Math.round((suma / cuenta) * 100) / 100;
}

export type AlumnoEstrella = {
  alumno: AlumnoRow;
  promedio: number;
  nombre: string;
};

export async function listarAlumnosEstrella(
  supabase: SupabaseClient,
  alumnos: AlumnoRow[],
  limite = 4,
): Promise<AlumnoEstrella[]> {
  const conPromedio: AlumnoEstrella[] = [];

  for (const alumno of alumnos) {
    const promedio = await calcularPromedioAlumno(supabase, alumno);
    conPromedio.push({
      alumno,
      promedio,
      nombre: nombreCompletoAlumno(alumno),
    });
  }

  conPromedio.sort((a, b) => b.promedio - a.promedio);
  return conPromedio.slice(0, limite);
}
